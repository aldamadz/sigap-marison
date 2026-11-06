begin;

create table if not exists public.department_receiving_settings (
 dept_id uuid primary key references public.master_departments(id) on delete cascade,
 enabled boolean not null default false,
 updated_at timestamptz not null default now(),updated_by uuid references public.profiles(id)
);
create table if not exists public.department_receiving_weekly_rules (
 dept_id uuid not null references public.master_departments(id) on delete cascade,
 week_start date not null default date '2000-01-03' check(extract(isodow from week_start)=1),
 enabled boolean not null default false,
 open_weekday integer not null default 1 check(open_weekday between 1 and 7),
 open_time time not null default time '08:00',
 cutoff_weekday integer not null default 4 check(cutoff_weekday between 1 and 7),
 cutoff_time time not null default time '16:00',
 sla_minutes integer check(sla_minutes between 1 and 525600),
 message text not null default '' check(length(message)<=300),
 updated_at timestamptz not null default now(),updated_by uuid references public.profiles(id),
 primary key(dept_id,week_start),
 check(cutoff_weekday>open_weekday or cutoff_weekday=open_weekday and cutoff_time>open_time)
);
create table if not exists public.department_sla_managers (
 dept_id uuid not null references public.master_departments(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 granted_at timestamptz not null default now(),granted_by uuid references public.profiles(id),
 primary key(dept_id,user_id)
);
create index if not exists department_sla_managers_user_idx on public.department_sla_managers(user_id,dept_id);
create table if not exists public.department_policy_events (
 id uuid primary key default gen_random_uuid(),dept_id uuid not null,entity text not null,
 action text not null,actor_id uuid,occurred_at timestamptz not null default now(),
 before_data jsonb,after_data jsonb
);
create index if not exists department_policy_events_dept_time_idx on public.department_policy_events(dept_id,occurred_at desc);

create or replace function public.can_manage_department_sla(p_dept_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=(select auth.uid())
  and p.is_active is true and p.deleted_at is null and (
   p.role::text='admin' or p.department_id=p_dept_id and exists(
    select 1 from public.department_sla_managers g where g.dept_id=p_dept_id and g.user_id=p.id)))
$$;
revoke all on function public.can_manage_department_sla(uuid) from public,anon;
grant execute on function public.can_manage_department_sla(uuid) to authenticated,service_role;

alter table public.department_receiving_settings enable row level security;
alter table public.department_receiving_weekly_rules enable row level security;
alter table public.department_sla_managers enable row level security;
alter table public.department_policy_events enable row level security;
revoke all on public.department_receiving_settings,public.department_receiving_weekly_rules,
 public.department_sla_managers,public.department_policy_events from public,anon,authenticated;
grant select,insert,update,delete on public.department_receiving_settings,public.department_receiving_weekly_rules to authenticated,service_role;
grant select,insert,update,delete on public.department_kpi_configs to authenticated,service_role;
grant select on public.department_sla_managers,public.department_policy_events to authenticated;
grant select,insert,update,delete on public.department_sla_managers to service_role;
grant select,insert on public.department_policy_events to service_role;

drop policy if exists department_receiving_settings_manage on public.department_receiving_settings;
create policy department_receiving_settings_manage on public.department_receiving_settings for all to authenticated
 using(public.can_manage_department_sla(dept_id)) with check(public.can_manage_department_sla(dept_id));
drop policy if exists department_receiving_weekly_manage on public.department_receiving_weekly_rules;
create policy department_receiving_weekly_manage on public.department_receiving_weekly_rules for all to authenticated
 using(public.can_manage_department_sla(dept_id)) with check(public.can_manage_department_sla(dept_id));
drop policy if exists department_sla_managers_read on public.department_sla_managers;
create policy department_sla_managers_read on public.department_sla_managers for select to authenticated
 using(public.can_manage_department_sla(dept_id));
drop policy if exists department_policy_events_read on public.department_policy_events;
create policy department_policy_events_read on public.department_policy_events for select to authenticated
 using(public.can_manage_department_sla(dept_id));
drop policy if exists department_receiving_admin on public.department_receiving_rules;
create policy department_receiving_admin on public.department_receiving_rules for all to authenticated
 using(public.can_manage_department_sla(dept_id)) with check(public.can_manage_department_sla(dept_id));
drop policy if exists department_receiving_audit_admin on public.department_receiving_rule_events;
create policy department_receiving_audit_admin on public.department_receiving_rule_events for select to authenticated
 using(public.can_manage_department_sla(dept_id));
drop policy if exists department_kpi_configs_admin_write on public.department_kpi_configs;
create policy department_kpi_configs_admin_write on public.department_kpi_configs for all to authenticated
 using(public.can_manage_department_sla(dept_id)) with check(public.can_manage_department_sla(dept_id));

create or replace function public.audit_department_policy()
returns trigger language plpgsql security definer set search_path='' as $$
declare old_data jsonb;new_data jsonb;
begin
 if tg_op<>'DELETE' then
  if tg_table_name in('department_receiving_settings','department_receiving_weekly_rules') then
   new.updated_at:=now();new.updated_by:=auth.uid();
  end if;
  new_data:=to_jsonb(new);
 end if;
 if tg_op<>'INSERT' then old_data:=to_jsonb(old);end if;
 insert into public.department_policy_events(dept_id,entity,action,actor_id,before_data,after_data)
 values((coalesce(new_data,old_data)->>'dept_id')::uuid,tg_table_name,tg_op,auth.uid(),old_data,new_data);
 return coalesce(new,old);
end $$;
revoke all on function public.audit_department_policy() from public,anon,authenticated;
do $$declare tab text;begin
 foreach tab in array array['department_receiving_settings','department_receiving_weekly_rules','department_sla_managers','department_kpi_configs'] loop
  execute format('drop trigger if exists audit_department_policy on public.%I',tab);
  execute format('create trigger audit_department_policy before insert or update or delete on public.%I for each row execute function public.audit_department_policy()',tab);
 end loop;
end $$;

create or replace function public.get_department_sla_scope()
returns table(dept_id uuid,name text) language sql stable security definer set search_path='' as $$
 select d.id,d.name from public.master_departments d where public.can_manage_department_sla(d.id) order by d.name,d.id
$$;
create or replace function public.get_department_sla_manager_candidates(p_dept_id uuid)
returns table(user_id uuid,full_name text,selected boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role::text='admin'
  and p.is_active is true and p.deleted_at is null) then raise exception 'Hanya admin dapat menunjuk pengelola SLA.' using errcode='42501';end if;
 return query select p.id,p.full_name,exists(select 1 from public.department_sla_managers g where g.dept_id=p_dept_id and g.user_id=p.id)
  from public.profiles p where p.department_id=p_dept_id and p.is_active is true and p.deleted_at is null order by p.full_name,p.id;
end $$;
create or replace function public.set_department_sla_managers(p_dept_id uuid,p_user_ids uuid[])
returns void language plpgsql security definer set search_path='' as $$
declare ids uuid[];
begin
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role::text='admin'
  and p.is_active is true and p.deleted_at is null) then raise exception 'Hanya admin dapat menunjuk pengelola SLA.' using errcode='42501';end if;
 if p_user_ids is null or cardinality(p_user_ids)>20 or array_position(p_user_ids,null) is not null then
  raise exception 'Pilih maksimal 20 pengelola aktif.' using errcode='22023';end if;
 perform 1 from public.master_departments where id=p_dept_id for update;
 if not found then raise exception 'Departemen tidak ditemukan.' using errcode='22023';end if;
 select coalesce(array_agg(distinct x),'{}') into ids from unnest(p_user_ids) x;
 if (select count(*) from public.profiles p where p.id=any(ids) and p.department_id=p_dept_id
  and p.is_active is true and p.deleted_at is null)<>cardinality(ids) then
  raise exception 'Pengelola harus anggota aktif departemen terkait.' using errcode='22023';end if;
 delete from public.department_sla_managers where dept_id=p_dept_id and not(user_id=any(ids));
 insert into public.department_sla_managers(dept_id,user_id,granted_by)
 select p_dept_id,x,auth.uid() from unnest(ids) x on conflict(dept_id,user_id) do nothing;
end $$;
revoke all on function public.get_department_sla_scope(),public.get_department_sla_manager_candidates(uuid),
 public.set_department_sla_managers(uuid,uuid[]) from public,anon;
grant execute on function public.get_department_sla_scope(),public.get_department_sla_manager_candidates(uuid),
 public.set_department_sla_managers(uuid,uuid[]) to authenticated,service_role;

-- Reception limits are opt-in; signer SLA and already captured policies are retained.
create or replace function public.department_receiving_policy(p_dept uuid,p_at timestamptz)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare config jsonb;base_config jsonb;monthly public.department_receiving_rules;weekly public.department_receiving_weekly_rules;
 enabled boolean;local_at timestamp;ready timestamp;month_start date;week_anchor date;
 month_open timestamp;month_close timestamp;week_open timestamp;week_close timestamp;
 work_days integer[];attempt integer;note text;
begin
 select to_jsonb(k) into config from public.department_kpi_configs k where k.dept_id=p_dept and k.is_active;
 base_config:=jsonb_build_object('sla_minutes',120,'work_days',jsonb_build_array(1,2,3,4,5),
  'work_start','08:00','work_end','17:00','break_start','12:00','break_end','13:00','timezone','Asia/Jakarta','is_active',false)||coalesce(config,'{}');
 local_at:=p_at at time zone (base_config->>'timezone');ready:=local_at;
 select s.enabled into enabled from public.department_receiving_settings s where s.dept_id=p_dept;
 enabled:=coalesce(enabled,false);config:=base_config;
 for attempt in 1..750 loop
  month_start:=date_trunc('month',ready)::date;week_anchor:=date_trunc('week',ready)::date;
  config:=base_config;month_close:=null;week_close:=null;note:='';
  if not enabled then exit;end if;
  select * into monthly from public.department_receiving_rules r where r.dept_id=p_dept
   and r.period_month in(month_start,date '2000-01-01') order by (r.period_month=month_start) desc limit 1;
  if monthly.sla_minutes is not null then config:=config||jsonb_build_object('sla_minutes',monthly.sla_minutes,'is_active',true);end if;
  if monthly.enabled and monthly.cutoff_day is not null then
   month_open:=month_start+(monthly.reopen_day-1)+monthly.reopen_time;
   month_close:=month_start+(least(monthly.cutoff_day,extract(day from month_start+interval '1 month'-interval '1 day')::integer)-1)+monthly.cutoff_time;
   ready:=greatest(ready,month_open);note:=monthly.message;
   if ready>=month_close then ready:=(month_start+interval '1 month')::date;continue;end if;
  end if;
  week_anchor:=date_trunc('week',ready)::date;
  select * into weekly from public.department_receiving_weekly_rules r where r.dept_id=p_dept
   and r.week_start in(week_anchor,date '2000-01-03') order by (r.week_start=week_anchor) desc limit 1;
  if weekly.sla_minutes is not null then config:=config||jsonb_build_object('sla_minutes',weekly.sla_minutes,'is_active',true);end if;
  if weekly.enabled then
   week_open:=week_anchor+(weekly.open_weekday-1)+weekly.open_time;
   week_close:=week_anchor+(weekly.cutoff_weekday-1)+weekly.cutoff_time;
   ready:=greatest(ready,week_open);note:=coalesce(nullif(weekly.message,''),note);
   if ready>=week_close then ready:=week_anchor+7;continue;end if;
  end if;
  if date_trunc('month',ready)::date<>month_start then continue;end if;
  if not coalesce(monthly.enabled,false) and not coalesce(weekly.enabled,false) then exit;end if;
  select array_agg(value::integer) into work_days from jsonb_array_elements_text(config->'work_days');
  if not(extract(isodow from ready)::integer=any(work_days)) or exists(select 1 from public.holidays h where h.holiday_date=ready::date)
   or ready::time>=(config->>'work_end')::time then ready:=(ready::date+1)+(config->>'work_start')::time;continue;end if;
  ready:=greatest(ready,ready::date+(config->>'work_start')::time);
  if ready::time>=(config->>'break_start')::time and ready::time<(config->>'break_end')::time then ready:=ready::date+(config->>'break_end')::time;end if;
  if ready>=month_close then ready:=(month_start+interval '1 month')::date;continue;end if;
  if ready>=week_close then ready:=week_anchor+7;continue;end if;
  exit;
 end loop;
 if attempt>=750 then raise exception 'Tidak ditemukan periode penerimaan yang valid.' using errcode='55000';end if;
 return config||jsonb_build_object('version',2,'department_id',p_dept,'captured_at',p_at,
  'receiving',jsonb_build_object('enabled',enabled,'available_at',ready at time zone (config->>'timezone'),
   'period_month',month_start,'period_week',week_anchor,'deferred',ready>local_at,'message',note,
   'rule_month',monthly.period_month,'rule_week',weekly.week_start));
end $$;
revoke all on function public.department_receiving_policy(uuid,timestamptz) from public,anon,authenticated,service_role;

create or replace function public.signature_sla_config(p_signature uuid,p_dept uuid)
returns table(sla_minutes integer,work_days integer[],work_start time,work_end time,break_start time,break_end time,timezone text,is_active boolean)
language plpgsql stable security definer set search_path='' as $$
declare saved jsonb;
begin
 select s.sla_policy_snapshot into saved from public.surat_signatures s where s.id=p_signature;
 if saved is null then
  return query select k.sla_minutes,k.work_days,k.work_start,k.work_end,k.break_start,k.break_end,k.timezone,k.is_active
   from public.department_kpi_configs k where k.dept_id=p_dept and k.is_active;return;
 end if;
 return query select (saved->>'sla_minutes')::integer,array(select value::integer from jsonb_array_elements_text(saved->'work_days')),
  (saved->>'work_start')::time,(saved->>'work_end')::time,(saved->>'break_start')::time,(saved->>'break_end')::time,saved->>'timezone',coalesce((saved->>'is_active')::boolean,true);
end $$;
revoke all on function public.signature_sla_config(uuid,uuid) from public,anon,authenticated;
grant execute on function public.signature_sla_config(uuid,uuid) to service_role,postgres;
do $$begin if exists(select 1 from pg_roles where rolname='supabase_admin') then grant execute on function public.signature_sla_config(uuid,uuid) to supabase_admin;end if;end$$;

notify pgrst,'reload schema';
commit;
