begin;

create table if not exists public.department_receiving_scoped_rules (
 dept_id uuid not null references public.master_departments(id) on delete cascade,
 scope_kind text not null check(scope_kind in ('form','usage')),
 scope_id uuid not null,
 cadence text not null check(cadence in ('weekly','monthly')),
 period_start date not null,
 enabled boolean not null,
 open_day integer not null,
 open_time time not null,
 cutoff_day integer,
 cutoff_time time not null,
 message text not null default '' check(length(message)<=300),
 updated_at timestamptz not null default now(),
 updated_by uuid references public.profiles(id),
 primary key(dept_id,scope_kind,scope_id,cadence,period_start),
 check((cadence='weekly' and extract(isodow from period_start)=1
   and open_day between 1 and 7 and cutoff_day is not null and cutoff_day between 1 and 7)
  or (cadence='monthly' and extract(day from period_start)=1 and open_day between 1 and 28
   and ((cutoff_day is not null and cutoff_day between 1 and 31) or (cutoff_day is null and not enabled)))),
 check(cutoff_day is null or (cutoff_day,cutoff_time)>(open_day,open_time))
);

create or replace function public.is_department_sla_admin()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=(select auth.uid())
  and p.role::text='admin' and p.is_active is true and p.deleted_at is null)
$$;
revoke all on function public.is_department_sla_admin() from public,anon;
grant execute on function public.is_department_sla_admin() to authenticated,service_role;

drop policy if exists department_kpi_configs_admin_write on public.department_kpi_configs;
create policy department_kpi_configs_admin_write on public.department_kpi_configs for all to authenticated
 using((select public.is_department_sla_admin())) with check((select public.is_department_sla_admin()));

create or replace function public.get_department_receiving_scope_options(p_dept_id uuid)
returns table(kind text,id uuid,label text) language plpgsql stable security definer set search_path='' as $$
begin
 if not public.can_manage_department_sla(p_dept_id) then
  raise exception 'Akses pengaturan periode penerimaan tidak tersedia.' using errcode='42501';
 end if;
 return query
  select 'form'::text,f.id,concat_ws(' - ',nullif(f.nomor_form,''),f.nama_form)
  from public.master_forms f
  union all
  select 'usage'::text,u.id,concat_ws(' - ',nullif(f.nomor_form,''),u.name)
  from public.form_usages u join public.master_forms f on f.id=u.form_id where u.status='active'
  order by 3,2;
end $$;
revoke all on function public.get_department_receiving_scope_options(uuid) from public,anon;
grant execute on function public.get_department_receiving_scope_options(uuid) to authenticated,service_role;

alter table public.department_receiving_scoped_rules enable row level security;
revoke all on public.department_receiving_scoped_rules from public,anon,authenticated;
grant select,insert,update,delete on public.department_receiving_scoped_rules to authenticated,service_role;
drop policy if exists department_receiving_scoped_manage on public.department_receiving_scoped_rules;
create policy department_receiving_scoped_manage on public.department_receiving_scoped_rules for all to authenticated
 using(public.can_manage_department_sla(dept_id)) with check(public.can_manage_department_sla(dept_id));

create or replace function public.validate_department_receiving_scope()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not ((new.scope_kind='form' and exists(select 1 from public.master_forms f where f.id=new.scope_id))
  or (new.scope_kind='usage' and exists(select 1 from public.form_usages u where u.id=new.scope_id and u.status='active'))) then
  raise exception 'Form atau kegunaan tidak tersedia.' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function public.validate_department_receiving_scope() from public,anon,authenticated;
drop trigger if exists validate_department_receiving_scope on public.department_receiving_scoped_rules;
create trigger validate_department_receiving_scope before insert or update of scope_kind,scope_id
 on public.department_receiving_scoped_rules for each row execute function public.validate_department_receiving_scope();
drop trigger if exists stamp_department_policy_metadata on public.department_receiving_scoped_rules;
create trigger stamp_department_policy_metadata before insert or update on public.department_receiving_scoped_rules
 for each row execute function public.stamp_department_policy_metadata();
drop trigger if exists audit_department_policy on public.department_receiving_scoped_rules;
create trigger audit_department_policy after insert or update or delete on public.department_receiving_scoped_rules
 for each row execute function public.audit_department_policy();

create or replace function public.protect_department_signer_sla()
returns trigger language plpgsql security definer set search_path='' as $$
declare before_row jsonb;after_row jsonb;target_dept uuid;has_signer_override boolean;
begin
 if auth.uid() is null or public.is_department_sla_admin() then return coalesce(new,old);end if;
 if tg_op<>'INSERT' then before_row:=to_jsonb(old);end if;
 if tg_op<>'DELETE' then after_row:=to_jsonb(new);end if;
 target_dept:=(coalesce(before_row,after_row)->>'dept_id')::uuid;
 has_signer_override:=
  (tg_table_name<>'department_receiving_weekly_rules' and exists(select 1 from public.department_receiving_rules r
    where r.dept_id in(target_dept,(after_row->>'dept_id')::uuid) and r.sla_minutes is not null))
  or (tg_table_name<>'department_receiving_rules' and exists(select 1 from public.department_receiving_weekly_rules r
    where r.dept_id in(target_dept,(after_row->>'dept_id')::uuid) and r.sla_minutes is not null));
 if tg_table_name='department_receiving_settings' then
  if (before_row->>'enabled' is distinct from after_row->>'enabled'
    or before_row->>'dept_id' is distinct from after_row->>'dept_id')
   and has_signer_override then
   raise exception 'Kebijakan umum terkait SLA penandatangan hanya dapat diubah admin.' using errcode='42501';
  end if;
 elsif has_signer_override or before_row->>'sla_minutes' is distinct from after_row->>'sla_minutes' then
  raise exception 'SLA penandatangan hanya dapat diubah admin.' using errcode='42501';
 end if;
 return coalesce(new,old);
end $$;
revoke all on function public.protect_department_signer_sla() from public,anon,authenticated;
do $$declare tab text;begin
 foreach tab in array array['department_receiving_settings','department_receiving_rules','department_receiving_weekly_rules'] loop
  execute format('drop trigger if exists protect_department_signer_sla on public.%I',tab);
  execute format('create trigger protect_department_signer_sla before insert or update or delete on public.%I for each row execute function public.protect_department_signer_sla()',tab);
 end loop;
end $$;

-- The selected workflow is part of the registered document, not a preference
-- a browser can change before the next signing stage becomes available.
create or replace function public.protect_receiving_document_target()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user in ('authenticated','anon') and
    (new.penggunaan_id,new.form_usage_id) is distinct from (old.penggunaan_id,old.form_usage_id) then
  raise exception 'Form dan kegunaan hanya dapat diubah melalui alur pengajuan.' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.protect_receiving_document_target() from public,anon,authenticated;
drop trigger if exists protect_receiving_document_target on public.surat_registrasi;
create trigger protect_receiving_document_target before update of penggunaan_id,form_usage_id on public.surat_registrasi
 for each row execute function public.protect_receiving_document_target();

create or replace function public.pick_department_receiving_window(
 p_dept uuid,p_form uuid,p_usage uuid,p_cadence text,p_period date,p_regular date)
returns public.department_receiving_scoped_rules language sql stable security invoker set search_path='' as $$
 select r.* from public.department_receiving_scoped_rules r where r.dept_id=p_dept and r.cadence=p_cadence
  and ((r.scope_kind='usage' and r.scope_id=p_usage) or (r.scope_kind='form' and r.scope_id=p_form))
  and r.period_start in(p_period,p_regular)
 order by (r.scope_kind='usage') desc,(r.period_start=p_period) desc limit 1
$$;
revoke all on function public.pick_department_receiving_window(uuid,uuid,uuid,text,date,date) from public,anon,authenticated;

create or replace function public.department_receiving_policy(p_dept uuid,p_at timestamptz,p_form uuid,p_usage uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare config jsonb;base_config jsonb;monthly public.department_receiving_rules;weekly public.department_receiving_weekly_rules;
 scoped_month public.department_receiving_scoped_rules;scoped_week public.department_receiving_scoped_rules;
 general_enabled boolean;local_at timestamp;ready timestamp;month_start date;week_anchor date;
 month_open timestamp;month_close timestamp;week_open timestamp;week_close timestamp;
 work_days integer[];attempt integer;note text;resolved boolean:=false;
begin
 if not exists(select 1 from public.department_receiving_scoped_rules r where r.dept_id=p_dept and
   ((r.scope_kind='usage' and r.scope_id=p_usage) or (r.scope_kind='form' and r.scope_id=p_form))) then
  return public.department_receiving_policy(p_dept,p_at);
 end if;
 select to_jsonb(k) into config from public.department_kpi_configs k where k.dept_id=p_dept and k.is_active;
 base_config:=jsonb_build_object('sla_minutes',120,'work_days',jsonb_build_array(1,2,3,4,5),
  'work_start','08:00','work_end','17:00','break_start','12:00','break_end','13:00','timezone','Asia/Jakarta','is_active',false)||coalesce(config,'{}');
 local_at:=p_at at time zone (base_config->>'timezone');ready:=local_at;
 select s.enabled into general_enabled from public.department_receiving_settings s where s.dept_id=p_dept;
 for attempt in 1..750 loop
  month_start:=date_trunc('month',ready)::date;week_anchor:=date_trunc('week',ready)::date;
  config:=base_config;month_close:=null;week_close:=null;note:='';
  select * into monthly from public.department_receiving_rules r where general_enabled and r.dept_id=p_dept
   and r.period_month in(month_start,date '2000-01-01') order by (r.period_month=month_start) desc limit 1;
  if monthly.sla_minutes is not null then config:=config||jsonb_build_object('sla_minutes',monthly.sla_minutes,'is_active',true);end if;
  scoped_month:=public.pick_department_receiving_window(p_dept,p_form,p_usage,'monthly',month_start,date '2000-01-01');
  if scoped_month.scope_id is not null then
   monthly.enabled:=scoped_month.enabled;monthly.reopen_day:=scoped_month.open_day;monthly.reopen_time:=scoped_month.open_time;
   monthly.cutoff_day:=scoped_month.cutoff_day;monthly.cutoff_time:=scoped_month.cutoff_time;monthly.message:=scoped_month.message;
   monthly.period_month:=scoped_month.period_start;
  end if;
  if monthly.enabled and monthly.cutoff_day is not null then
   month_open:=month_start+(monthly.reopen_day-1)+monthly.reopen_time;
   month_close:=month_start+(least(monthly.cutoff_day,extract(day from month_start+interval '1 month'-interval '1 day')::integer)-1)+monthly.cutoff_time;
   ready:=greatest(ready,month_open);note:=monthly.message;
   if ready>=month_close then ready:=(month_start+interval '1 month')::date;continue;end if;
  end if;
  week_anchor:=date_trunc('week',ready)::date;
  select * into weekly from public.department_receiving_weekly_rules r where general_enabled and r.dept_id=p_dept
   and r.week_start in(week_anchor,date '2000-01-03') order by (r.week_start=week_anchor) desc limit 1;
  if weekly.sla_minutes is not null then config:=config||jsonb_build_object('sla_minutes',weekly.sla_minutes,'is_active',true);end if;
  scoped_week:=public.pick_department_receiving_window(p_dept,p_form,p_usage,'weekly',week_anchor,date '2000-01-03');
  if scoped_week.scope_id is not null then
   weekly.enabled:=scoped_week.enabled;weekly.open_weekday:=scoped_week.open_day;weekly.open_time:=scoped_week.open_time;
   weekly.cutoff_weekday:=scoped_week.cutoff_day;weekly.cutoff_time:=scoped_week.cutoff_time;weekly.message:=scoped_week.message;
   weekly.week_start:=scoped_week.period_start;
  end if;
  if weekly.enabled then
   week_open:=week_anchor+(weekly.open_weekday-1)+weekly.open_time;
   week_close:=week_anchor+(weekly.cutoff_weekday-1)+weekly.cutoff_time;
   ready:=greatest(ready,week_open);note:=coalesce(nullif(weekly.message,''),note);
   if ready>=week_close then ready:=week_anchor+7;continue;end if;
  end if;
  if date_trunc('month',ready)::date<>month_start then continue;end if;
  if not coalesce(monthly.enabled,false) and not coalesce(weekly.enabled,false) then resolved:=true;exit;end if;
  select array_agg(value::integer) into work_days from jsonb_array_elements_text(config->'work_days');
  if not(extract(isodow from ready)::integer=any(work_days)) or exists(select 1 from public.holidays h where h.holiday_date=ready::date)
   or ready::time>=(config->>'work_end')::time then ready:=(ready::date+1)+(config->>'work_start')::time;continue;end if;
  ready:=greatest(ready,ready::date+(config->>'work_start')::time);
  if ready::time>=(config->>'break_start')::time and ready::time<(config->>'break_end')::time then ready:=ready::date+(config->>'break_end')::time;end if;
  if ready>=month_close then ready:=(month_start+interval '1 month')::date;continue;end if;
  if ready>=week_close then ready:=week_anchor+7;continue;end if;
  resolved:=true;exit;
 end loop;
 if not resolved then raise exception 'Tidak ditemukan periode penerimaan yang valid. Periksa jadwal penerimaan dan jam kerja.' using errcode='55000';end if;
 return config||jsonb_build_object('version',2,'department_id',p_dept,'captured_at',p_at,
  'receiving',jsonb_build_object('enabled',coalesce(general_enabled,false) or coalesce(monthly.enabled,false) or coalesce(weekly.enabled,false),
   'available_at',ready at time zone (config->>'timezone'),'period_month',month_start,'period_week',week_anchor,
   'deferred',ready>local_at,'message',note,'rule_month',monthly.period_month,'rule_week',weekly.week_start,
   'month_scope',scoped_month.scope_kind,'week_scope',scoped_week.scope_kind));
end $$;
revoke all on function public.department_receiving_policy(uuid,timestamptz,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.freeze_signature_sla_policy()
returns trigger language plpgsql security definer set search_path='' as $$
declare dept uuid;form_id uuid;usage_id uuid;ready_at timestamptz;
begin
 if tg_op='UPDATE' then new.sla_policy_snapshot:=old.sla_policy_snapshot;else new.sla_policy_snapshot:=null;end if;
 if new.sla_policy_snapshot is null and (tg_op='INSERT' or old.available_at is null)
  and not coalesce(new.is_signed,false) and new.available_at is not null and new.step_order>1 then
  select d.id into dept from public.profiles p
   join public.master_departments d on d.id=p.department_id where p.id=new.user_id;
  if dept is not null then
   select f.id,u.id into form_id,usage_id from public.surat_registrasi s
    left join public.form_usages u on u.id=s.form_usage_id
    left join public.master_penggunaan_detail legacy on s.form_usage_id is null and legacy.id=s.penggunaan_id
    left join public.master_forms f on f.id=coalesce(u.form_id,legacy.form_id)
    where s.id=new.surat_id;
   new.sla_policy_snapshot:=public.department_receiving_policy(dept,now(),form_id,usage_id);
  end if;
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

notify pgrst,'reload schema';
commit;
