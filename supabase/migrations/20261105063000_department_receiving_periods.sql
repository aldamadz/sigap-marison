begin;
create table if not exists public.department_receiving_rules (
 dept_id uuid not null references public.master_departments(id) on delete cascade,
 period_month date not null default date '2000-01-01',
 enabled boolean not null default false,
 cutoff_day integer check(cutoff_day between 1 and 31),
 cutoff_time time not null default time '17:00',
 reopen_day integer not null default 1 check(reopen_day between 1 and 28),
 reopen_time time not null default time '08:00',
 sla_minutes integer check(sla_minutes between 1 and 525600),
 message text not null default '' check(length(message)<=300),
 updated_at timestamptz not null default now(),updated_by uuid references public.profiles(id),
 primary key(dept_id,period_month),
 check(not enabled or cutoff_day is not null),
 check(extract(day from period_month)=1),
 check(cutoff_day is null or cutoff_day>reopen_day or cutoff_day=reopen_day and cutoff_time>reopen_time)
);
create table if not exists public.department_receiving_rule_events (
 id uuid primary key default gen_random_uuid(),dept_id uuid not null,period_month date not null,
 actor_id uuid,occurred_at timestamptz not null default now(),before_data jsonb,after_data jsonb
);
alter table public.department_receiving_rules enable row level security;
alter table public.department_receiving_rule_events enable row level security;
revoke all on public.department_receiving_rules,public.department_receiving_rule_events from public,anon,authenticated;
grant select,insert,update,delete on public.department_receiving_rules to authenticated,service_role;
grant select on public.department_receiving_rule_events to authenticated;
grant select,insert on public.department_receiving_rule_events to service_role;
drop policy if exists department_receiving_admin on public.department_receiving_rules;
create policy department_receiving_admin on public.department_receiving_rules for all to authenticated
 using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role::text='admin' and p.is_active is true and p.deleted_at is null))
 with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role::text='admin' and p.is_active is true and p.deleted_at is null));
drop policy if exists department_receiving_audit_admin on public.department_receiving_rule_events;
create policy department_receiving_audit_admin on public.department_receiving_rule_events for select to authenticated
 using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role::text='admin' and p.is_active is true and p.deleted_at is null));
create or replace function public.audit_department_receiving_rule()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op<>'DELETE' then new.updated_at:=now();new.updated_by:=auth.uid();end if;
 insert into public.department_receiving_rule_events(dept_id,period_month,actor_id,before_data,after_data)
 values(coalesce(new.dept_id,old.dept_id),coalesce(new.period_month,old.period_month),auth.uid(),
  case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end $$;
revoke all on function public.audit_department_receiving_rule() from public,anon,authenticated;
drop trigger if exists audit_department_receiving_rule on public.department_receiving_rules;
create trigger audit_department_receiving_rule before insert or update or delete on public.department_receiving_rules
 for each row execute function public.audit_department_receiving_rule();

alter table public.surat_signatures add column if not exists sla_policy_snapshot jsonb;

-- Private clock injection supports deterministic PostgreSQL fixtures, never a client API.
create or replace function public.department_receiving_policy(p_dept uuid,p_at timestamptz)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare config jsonb;base_config jsonb;rule public.department_receiving_rules;local_at timestamp;month_start date;
 ready timestamp;opens timestamp;closes timestamp;deadline_day integer;attempt integer;work_days integer[];
begin
 select to_jsonb(k) into config from public.department_kpi_configs k where k.dept_id=p_dept and k.is_active;
 config:=jsonb_build_object('sla_minutes',120,'work_days',jsonb_build_array(1,2,3,4,5),
  'work_start','08:00','work_end','17:00','break_start','12:00','break_end','13:00','timezone','Asia/Jakarta')||coalesce(config,'{}');
 local_at:=p_at at time zone (config->>'timezone');ready:=local_at;
 month_start:=date_trunc('month',local_at)::date;
 base_config:=config;
 for attempt in 1..750 loop
  config:=base_config;
  select * into rule from public.department_receiving_rules r where r.dept_id=p_dept
   and r.period_month in(month_start,date '2000-01-01') order by (r.period_month=month_start) desc limit 1;
  if rule.sla_minutes is not null then config:=jsonb_set(config,'{sla_minutes}',to_jsonb(rule.sla_minutes));end if;
  if not found or not rule.enabled or rule.cutoff_day is null then exit;end if;
  opens:=month_start+(rule.reopen_day-1)+rule.reopen_time;
  deadline_day:=least(rule.cutoff_day,extract(day from month_start+interval '1 month'-interval '1 day')::integer);
  closes:=month_start+(deadline_day-1)+rule.cutoff_time;
  ready:=greatest(ready,opens);
  if ready>=closes then month_start:=(month_start+interval '1 month')::date;ready:=month_start;continue;end if;
  select array_agg(value::integer) into work_days from jsonb_array_elements_text(config->'work_days');
  if not(extract(isodow from ready)::integer=any(work_days)) or exists(select 1 from public.holidays h where h.holiday_date=ready::date)
   or ready::time>=(config->>'work_end')::time then ready:=(ready::date+1)+(config->>'work_start')::time;continue;end if;
  ready:=greatest(ready,ready::date+(config->>'work_start')::time);
  if ready::time>=(config->>'break_start')::time and ready::time<(config->>'break_end')::time then ready:=ready::date+(config->>'break_end')::time;end if;
  if ready>=closes then month_start:=(month_start+interval '1 month')::date;ready:=month_start;continue;end if;
  exit;
 end loop;
 if attempt>=750 then raise exception 'Tidak ditemukan periode penerimaan yang valid.' using errcode='55000';end if;
 return config||jsonb_build_object('version',1,'department_id',p_dept,'captured_at',p_at,
  'receiving',jsonb_build_object('available_at',ready at time zone (config->>'timezone'),'period_month',month_start,
   'deferred',ready>local_at,'message',coalesce(rule.message,''),'rule_month',rule.period_month));
end $$;
revoke all on function public.department_receiving_policy(uuid,timestamptz) from public,anon,authenticated,service_role;

create or replace function public.freeze_signature_sla_policy()
returns trigger language plpgsql security definer set search_path='' as $$
declare dept uuid;ready_at timestamptz;policy jsonb;
begin
 if tg_op='UPDATE' then new.sla_policy_snapshot:=old.sla_policy_snapshot;else new.sla_policy_snapshot:=null;end if;
 if new.sla_policy_snapshot is null and (tg_op='INSERT' or old.available_at is null)
  and not coalesce(new.is_signed,false) and new.available_at is not null and new.step_order>1 then
  select coalesce(case when coalesce(new.signer_snapshot->>'department_id','') ~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
   then (new.signer_snapshot->>'department_id')::uuid end,p.department_id) into dept from public.profiles p where p.id=new.user_id;
  policy:=public.department_receiving_policy(dept,now());new.sla_policy_snapshot:=policy;
 end if;
 if new.sla_policy_snapshot is not null then
  ready_at:=(new.sla_policy_snapshot#>>'{receiving,available_at}')::timestamptz;
  if ready_at>now() then
   new.available_at:=greatest(new.available_at,ready_at);
   if coalesce(new.is_signed,false) or new.verification_status='verified' then
    raise exception 'Permohonan masuk ke periode berikutnya. Dapat diproses mulai %.',ready_at using errcode='55000';
   end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.freeze_signature_sla_policy() from public,anon,authenticated;
drop trigger if exists ab_freeze_signature_sla_policy on public.surat_signatures;
create trigger ab_freeze_signature_sla_policy before insert or update on public.surat_signatures
 for each row execute function public.freeze_signature_sla_policy();

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
  (saved->>'work_start')::time,(saved->>'work_end')::time,(saved->>'break_start')::time,(saved->>'break_end')::time,saved->>'timezone',true;
end $$;
revoke all on function public.signature_sla_config(uuid,uuid) from public,anon,authenticated;
grant execute on function public.signature_sla_config(uuid,uuid) to service_role,postgres;
do $$begin if exists(select 1 from pg_roles where rolname='supabase_admin') then grant execute on function public.signature_sla_config(uuid,uuid) to supabase_admin;end if;end$$;

-- Guarded changes preserve deployed authorization and existing revision clocks.
do $patch$
declare name text;definition text;old_join text;new_join text;anchor text;
begin
 foreach name in array array['get_department_kpi_summary','get_department_kpi_details'] loop
  select pg_get_functiondef(p.oid) into strict definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=name;
  definition:=replace(definition,chr(13),'');
  if position('public.signature_sla_config(' in definition)>0 then continue;end if;
  old_join:=case when name='get_department_kpi_summary' then 'left join public.department_kpi_configs k on k.dept_id = s.responsible_dept_id and k.is_active = true'
   else E'left join public.department_kpi_configs k\n      on k.dept_id = s.responsible_dept_id\n     and k.is_active = true' end;
  new_join:='left join lateral public.signature_sla_config(s.'||case when name='get_department_kpi_summary' then 'id' else 'signature_id' end||',s.responsible_dept_id) k on true';
  if position(old_join in definition)=0 then raise exception 'Unknown SLA query shape: %',name;end if;
  definition:=replace(definition,old_join,new_join);
  definition:=replace(definition,'where started_at is not null','where started_at is not null and (is_signed or started_at<=now())');
  anchor:=E'public.calculate_business_minutes(\n        s.started_at,';
  if position(anchor in definition)=0 or position(') as elapsed_minutes,' in definition)=0 then raise exception 'Unknown SLA clock: %',name;end if;
  definition:=replace(definition,anchor,E'case when s.started_at>=coalesce(s.signed_at,now()) then 0 else public.calculate_business_minutes(\n        s.started_at,');
  execute replace(definition,') as elapsed_minutes,',') end as elapsed_minutes,');
 end loop;
 select pg_get_functiondef('public.get_user_active_sla_breach_count(uuid)'::regprocedure) into definition;
 definition:=replace(definition,chr(13),'');
 if position('public.signature_sla_config(' in definition)=0 then
  old_join:=E'left join public.department_kpi_configs config\n    on config.dept_id = active.responsible_dept_id\n   and config.is_active = true';
  definition:=regexp_replace(definition,'with active_signatures as \(\s+select\s+',E'with active_signatures as (\n    select signature.id as signature_id,');
  definition:=regexp_replace(definition,'left join public\.department_kpi_configs config\s+on config\.dept_id = active\.responsible_dept_id\s+and config\.is_active = true','left join lateral public.signature_sla_config(active.signature_id,active.responsible_dept_id) config on true');
  if position('public.signature_sla_config(active.signature_id' in definition)=0 or position('signature.id as signature_id' in definition)=0 then raise exception 'Unknown active SLA query';end if;
  execute replace(definition,'where active.started_at is not null','where active.started_at is not null and active.started_at<=now()');
 end if;
 select pg_get_functiondef('public.get_actionable_dashboard(text,text,timestamptz,timestamptz,text,integer,integer)'::regprocedure) into definition;
 definition:=replace(definition,chr(13),'');
 if position('public.signature_sla_config(' in definition)=0 then
  old_join:=E'from classified c left join public.department_kpi_configs k on k.is_active is true and k.dept_id=coalesce(';
  if position(old_join in definition)=0 or position('end,c.measured_dept)' in definition)=0 then raise exception 'Unknown dashboard SLA query';end if;
  definition:=replace(definition,old_join,'from classified c left join lateral public.signature_sla_config(c.measured_signature_id,coalesce(');
  definition:=replace(definition,'end,c.measured_dept)','end,c.measured_dept)) k on true');
  definition:=replace(definition,'case when c.started_at is not null and c.bucket','case when c.started_at is not null and c.started_at<=now() and c.bucket');
  anchor:='when p_scope=''signer'' and my_step=current_step and status=''PROSES'' then';
  if position(anchor in definition)=0 then raise exception 'Unknown dashboard intake bucket';end if;
  definition:=replace(definition,anchor,'when status=''PROSES'' and current_available_at>now() then ''waiting'' '||anchor);
  definition:=replace(definition,'current_sig.signer_snapshot as current_snapshot','current_sig.sla_policy_snapshot as current_sla_policy,current_sig.signer_snapshot as current_snapshot');
  definition:=replace(definition,'''started_at'',started_at,','''receiving_message'',current_sla_policy#>>''{receiving,message}'',''started_at'',started_at,');
  definition:=replace(definition,'''started_at'',started_at,','''receiving_at'',current_available_at,''started_at'',started_at,');
  execute definition;
 end if;
 foreach name in array array['is_inbox_task_active','get_compact_inbox','get_compact_inbox_count'] loop
  select pg_get_functiondef(p.oid) into strict definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=name;
  if position('ss.available_at is null or ss.available_at<=now()' in definition)>0 then continue;end if;
  anchor:=case when name='is_inbox_task_active' then 'where ss.id = p_signature_id' else 'where ss.user_id = p_user_id' end;
  if position(anchor in definition)=0 then raise exception 'Unknown inbox intake query: %',name;end if;
  definition:=replace(definition,anchor,anchor||' and (ss.available_at is null or ss.available_at<=now())');
  if name<>'is_inbox_task_active' then
   if position('where not coalesce(ss.is_signed, false)' in definition)=0 then raise exception 'Unknown verifier intake query: %',name;end if;
   definition:=replace(definition,'where not coalesce(ss.is_signed, false)','where (ss.available_at is null or ss.available_at<=now()) and not coalesce(ss.is_signed, false)');
  end if;
  execute definition;
 end loop;
 select pg_get_functiondef('public.remind_dashboard_request(uuid)'::regprocedure) into definition;
 if position('ss.available_at>now()' in definition)=0 then
  anchor:='if not found or (ss.verification_required';
  if position(anchor in definition)=0 then raise exception 'Unknown reminder intake guard';end if;
  execute replace(definition,anchor,'if not found or ss.available_at>now() or (ss.verification_required');
 end if;
 select pg_get_functiondef('public.get_surat_monitoring_detail(uuid)'::regprocedure) into definition;
 if position('''receiving_message'',signature.sla_policy_snapshot' in definition)=0 then
  anchor:='''catatan'',signature.catatan) end';
  if position(anchor in definition)=0 then raise exception 'Unknown limited monitoring signature shape';end if;
  execute replace(definition,anchor,'''catatan'',signature.catatan,''available_at'',signature.available_at,''receiving_message'',signature.sla_policy_snapshot#>>''{receiving,message}'') end');
 end if;
end $patch$;
notify pgrst,'reload schema';
commit;
