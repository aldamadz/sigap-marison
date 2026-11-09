-- SLA-03: only time owned by an actionable signer is charged. No approval policy changes.
begin;
create schema if not exists sla_clock_internal;
revoke all on schema sla_clock_internal from public,anon,authenticated,service_role;

create table if not exists sla_clock_internal.clocks (
 signature_id uuid primary key, surat_id uuid not null,
 tracked_at timestamptz not null, baseline_seconds numeric not null default 0 check(baseline_seconds>=0)
);
create table if not exists sla_clock_internal.periods (
 id bigint generated always as identity primary key,
 signature_id uuid not null references sla_clock_internal.clocks(signature_id),
 started_at timestamptz not null, ended_at timestamptz,
 phase text not null check(phase in ('ready','scheduled','waiting','upcoming','stopped')),
 reasons text[] not null default '{}', count_from timestamptz not null,
 calendar jsonb not null, actor_id uuid,
 check(ended_at is null or ended_at>=started_at)
);
create unique index if not exists signer_sla_open_period on sla_clock_internal.periods(signature_id) where ended_at is null;
create index if not exists signer_sla_period_lookup on sla_clock_internal.periods(signature_id,started_at);
alter table sla_clock_internal.clocks enable row level security;
alter table sla_clock_internal.periods enable row level security;
revoke all on all tables in schema sla_clock_internal from public,anon,authenticated,service_role;
revoke all on all sequences in schema sla_clock_internal from public,anon,authenticated,service_role;

-- Preserve the canonical calendar, but accumulate fractions across intervals before rounding.
do $seconds$
declare definition text;
begin
 definition:=replace(pg_get_functiondef('public.calculate_business_minutes(timestamptz,timestamptz,integer[],time,time,time,time,text)'::regprocedure),chr(13),'');
 if position('greatest(floor(v_minutes), 0)::integer' in definition)=0 then raise exception 'Unknown canonical business clock; audit SLA-03 first.';end if;
 definition:=replace(definition,'public.calculate_business_minutes(', 'sla_clock_internal.business_seconds(');
 definition:=replace(definition,'RETURNS integer','RETURNS numeric');
 definition:=replace(definition,'greatest(floor(v_minutes), 0)::integer','greatest(v_minutes * 60, 0)');
 execute definition;
end $seconds$;

create or replace function sla_clock_internal.state(p_signature uuid,p_at timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare sig public.surat_signatures; doc public.surat_registrasi; reasons text[]:='{}'; boundary integer;
begin
 select * into sig from public.surat_signatures where id=p_signature;
 if not found or sig.is_signed or sig.status='REJECTED' then return '{"phase":"stopped","reasons":[]}'::jsonb;end if;
 select * into doc from public.surat_registrasi where id=sig.surat_id;
 if not found or doc.status::text in ('DONE','SELESAI','COMPLETED','REJECTED','DITOLAK','VOID','CANCELLED') then
  return '{"phase":"stopped","reasons":[]}'::jsonb;
 end if;
 if sig.step_order<>doc.current_step then return '{"phase":"upcoming","reasons":[]}'::jsonb;end if;
 if doc.status::text<>'PROSES' or exists(select 1 from public.surat_revision_events e where e.surat_id=doc.id and e.status in ('open','awaiting_requester')) then
  reasons:=array_append(reasons,'Menunggu perbaikan pengajuan');
 end if;
 if not exists(select 1 from public.profiles p where p.id=sig.user_id and p.is_active is true and p.deleted_at is null) then
  reasons:=array_append(reasons,'Menunggu penandatangan aktif');
 end if;
 if sig.verification_required is true and sig.verification_status is distinct from 'verified' then
  reasons:=array_append(reasons,'Menunggu tim pemeriksa');
 end if;
 -- The deployed parent guard also checks the transition to the next stage.
 boundary:=sig.step_order+case when exists(select 1 from public.surat_signatures s where s.surat_id=doc.id and s.step_order>sig.step_order) then 1 else 0 end;
 if exists(select 1 from public.surat_recommendation_tasks t where t.parent_surat_id=doc.id and t.status<>'cancelled' and t.required_before_step<=boundary)
  and not exists(select 1 from public.surat_linked_documents l where l.parent_surat_id=doc.id and l.link_type='recommendation' and l.status='active' and public.recommendation_pdf_is_current(l.child_surat_id)) then
  reasons:=array_append(reasons,'Menunggu rekomendasi');
 end if;
 if cardinality(reasons)>0 then return jsonb_build_object('phase','waiting','reasons',reasons);end if;
 if sig.available_at>p_at then return jsonb_build_object('phase','scheduled','reasons',array['Menunggu periode penerimaan']);end if;
 return '{"phase":"ready","reasons":[]}'::jsonb;
end $$;

create or replace function sla_clock_internal.paused(p_signature uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select phase='waiting' or phase='scheduled' and count_from>now() from sla_clock_internal.periods where signature_id=p_signature and ended_at is null),
  sla_clock_internal.state(p_signature)->>'phase' in ('waiting','scheduled'),false);
$$;
create or replace function sla_clock_internal.reasons(p_signature uuid)
returns text[] language sql stable security definer set search_path='' as $$
 select coalesce((select case when phase='waiting' or phase='scheduled' and count_from>now() then reasons else '{}'::text[] end from sla_clock_internal.periods where signature_id=p_signature and ended_at is null),
  array(select jsonb_array_elements_text(sla_clock_internal.state(p_signature)->'reasons')));
$$;

create or replace function sla_clock_internal.calendar(p_signature uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('work_days',coalesce(k.work_days,array[1,2,3,4,5]),
  'work_start',coalesce(k.work_start,time '08:00'),'work_end',coalesce(k.work_end,time '17:00'),
  'break_start',coalesce(k.break_start,time '12:00'),'break_end',coalesce(k.break_end,time '13:00'),'timezone',coalesce(k.timezone,'Asia/Jakarta'))
 from public.surat_signatures s left join public.profiles p on p.id=s.user_id
 left join lateral public.signature_sla_config(s.id,coalesce(
  case when s.signer_snapshot->>'department_id' ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then (s.signer_snapshot->>'department_id')::uuid end,p.department_id)) k on true
 where s.id=p_signature;
$$;
create or replace function sla_clock_internal.seconds(p_from timestamptz,p_to timestamptz,p_calendar jsonb)
returns numeric language sql stable security definer set search_path='' as $$
 select case when p_from is null or p_to<=p_from then 0 else sla_clock_internal.business_seconds(p_from,p_to,
  array(select jsonb_array_elements_text(p_calendar->'work_days')::integer),
  (p_calendar->>'work_start')::time,(p_calendar->>'work_end')::time,
  (p_calendar->>'break_start')::time,(p_calendar->>'break_end')::time,p_calendar->>'timezone') end;
$$;

-- The injectable time is private to the DB owner for deterministic tests. Triggers always use now().
create or replace function sla_clock_internal.refresh(p_signature uuid,p_at timestamptz default clock_timestamp(),p_legacy boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare sig public.surat_signatures;doc public.surat_registrasi;clock sla_clock_internal.clocks;period sla_clock_internal.periods;
 state jsonb; policy jsonb;started timestamptz;baseline numeric:=0;phase text;why text[];count_from timestamptz;
begin
 select * into sig from public.surat_signatures where id=p_signature;
 if not found and not exists(select 1 from sla_clock_internal.clocks where signature_id=p_signature) then return;end if;
 policy:=sla_clock_internal.calendar(p_signature);
 if p_legacy and sig.id is not null then
  select * into doc from public.surat_registrasi where id=sig.surat_id;
  if doc.status::text='PROSES' and sig.step_order=doc.current_step and not sig.is_signed then
   started:=coalesce(greatest(sig.available_at,case when pg_input_is_valid(doc.data_snapshot#>>'{applied_revision,accepted_at}','timestamptz') then (doc.data_snapshot#>>'{applied_revision,accepted_at}')::timestamptz end),
    (select max(signed_at) from public.surat_signatures where surat_id=sig.surat_id and step_order=sig.step_order-1 and is_signed),doc.created_at);
   baseline:=sla_clock_internal.seconds(started,p_at,policy);
  end if;
 end if;
 if sig.id is not null then
  insert into sla_clock_internal.clocks(signature_id,surat_id,tracked_at,baseline_seconds)
  values(p_signature,sig.surat_id,p_at,coalesce(baseline,0)) on conflict do nothing;
 end if;
 select * into strict clock from sla_clock_internal.clocks where signature_id=p_signature for update;
 select * into period from sla_clock_internal.periods where signature_id=p_signature and ended_at is null for update;
 -- Concurrent transactions may have started before a newer clock event committed.
 p_at:=greatest(p_at,clock.tracked_at,period.started_at);
 policy:=sla_clock_internal.calendar(p_signature);
 state:=sla_clock_internal.state(p_signature,p_at);phase:=state->>'phase';
 why:=array(select jsonb_array_elements_text(state->'reasons'));
 count_from:=greatest(p_at,sig.available_at);
 if period.id is not null then
  if period.phase=phase and period.reasons=why and (phase not in ('ready','scheduled') or period.calendar=policy and period.count_from=greatest(period.started_at,sig.available_at)) then return;end if;
  update sla_clock_internal.periods set ended_at=p_at where id=period.id;
 end if;
 insert into sla_clock_internal.periods(signature_id,started_at,phase,reasons,count_from,calendar,actor_id)
 values(p_signature,p_at,phase,why,count_from,coalesce(policy,'{}'),auth.uid());
end $$;

create or replace function sla_clock_internal.elapsed(p_signature uuid,p_started_at timestamptz,p_finished_at timestamptz,
 p_work_days integer[],p_work_start time,p_work_end time,p_break_start time,p_break_end time,p_timezone text)
returns integer language plpgsql stable security definer set search_path='' as $$
declare clock sla_clock_internal.clocks;seconds numeric;
begin
 select * into clock from sla_clock_internal.clocks where signature_id=p_signature;
 if not found or p_finished_at<clock.tracked_at then
  return case when p_started_at is null or p_finished_at<=p_started_at then 0 else public.calculate_business_minutes(p_started_at,p_finished_at,p_work_days,p_work_start,p_work_end,p_break_start,p_break_end,p_timezone) end;
 end if;
 select clock.baseline_seconds+coalesce(sum(sla_clock_internal.seconds(greatest(p.started_at,p.count_from),least(coalesce(p.ended_at,p_finished_at),p_finished_at),p.calendar)),0)
 into seconds from sla_clock_internal.periods p where p.signature_id=p_signature and p.phase in ('ready','scheduled') and p.started_at<p_finished_at;
 return greatest(0,floor(seconds/60))::integer;
end $$;

create or replace function sla_clock_internal.refresh_document(p_document uuid)
returns void language plpgsql security definer set search_path='' as $$
declare signature_id uuid;
begin
 for signature_id in select s.id from public.surat_signatures s where s.surat_id=p_document order by s.id loop
  perform sla_clock_internal.refresh(signature_id);
 end loop;
end $$;
create or replace function sla_clock_internal.changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb;parent uuid;signature_id uuid;
begin
 row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 if tg_table_name='profiles' then
  for signature_id in select id from public.surat_signatures where user_id=(row_data->>'id')::uuid and not coalesce(is_signed,false) order by id loop
   perform sla_clock_internal.refresh(signature_id);
  end loop;
 elsif tg_table_name='surat_registrasi' then
  perform sla_clock_internal.refresh_document((row_data->>'id')::uuid);
  for parent in select distinct parent_surat_id from public.surat_linked_documents where child_surat_id=(row_data->>'id')::uuid order by parent_surat_id loop
   perform sla_clock_internal.refresh_document(parent);
  end loop;
 elsif tg_table_name in ('surat_recommendation_tasks','surat_linked_documents') then
  perform sla_clock_internal.refresh_document((row_data->>'parent_surat_id')::uuid);
  if tg_op='UPDATE' and old.parent_surat_id is distinct from new.parent_surat_id then perform sla_clock_internal.refresh_document(old.parent_surat_id);end if;
 else
  if tg_table_name='surat_signatures' and tg_op='DELETE' then perform sla_clock_internal.refresh((row_data->>'id')::uuid);end if;
  perform sla_clock_internal.refresh_document((row_data->>'surat_id')::uuid);
  for parent in select distinct parent_surat_id from public.surat_linked_documents where child_surat_id=(row_data->>'surat_id')::uuid order by parent_surat_id loop
   perform sla_clock_internal.refresh_document(parent);
  end loop;
 end if;
 return null;
end $$;

do $triggers$
declare name text;
begin
 foreach name in array array['surat_signatures','surat_registrasi','surat_recommendation_tasks','surat_linked_documents','surat_revision_events','profiles','document_pdf_jobs','surat_attachments'] loop
  if to_regclass('public.'||name) is null then continue;end if;
  execute format('drop trigger if exists signer_action_sla_changed on public.%I',name);
  execute format('create trigger signer_action_sla_changed after insert or update or delete on public.%I for each row execute function sla_clock_internal.changed()',name);
 end loop;
end $triggers$;

-- Existing measurements become a preserved baseline; no historical waiting time is invented.
do $baseline$ declare sig uuid;begin
 for sig in select id from public.surat_signatures where not coalesce(is_signed,false) and status is distinct from 'REJECTED' order by id loop
  perform sla_clock_internal.refresh(sig,now(),true);
 end loop;
end $baseline$;

-- Keep existing authorization and return contracts; patch only the measured clock.
do $patch$
declare name text;definition text;anchor text;sig text;
begin
 foreach name in array array['get_department_kpi_summary','get_department_kpi_details'] loop
  if name='get_department_kpi_details' and to_regprocedure('sla_clock_internal.department_kpi_details_base(timestamptz,timestamptz,uuid,uuid,uuid,text)') is not null then continue;end if;
  select pg_get_functiondef(p.oid) into strict definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=name;
  definition:=replace(definition,chr(13),'');
  if position('sla_clock_internal.elapsed(' in definition)>0 then continue;end if;
  sig:=case when name='get_department_kpi_summary' then 's.id' else 's.signature_id' end;
  anchor:=E'public.calculate_business_minutes(\n        s.started_at,';
  if position(anchor in definition)=0 or position('public.signature_sla_config(' in definition)=0 then raise exception 'Unknown frozen KPI clock: %',name;end if;
  definition:=replace(definition,anchor,'sla_clock_internal.elapsed('||sig||E',\n        s.started_at,');
  if name='get_department_kpi_summary' then
   definition:=replace(definition,'s.*,'||chr(10),'s.*,'||chr(10)||'      sla_clock_internal.paused(s.id) as sla_paused,'||chr(10));
   definition:=replace(definition,'kpi_status <> ''rejected'' and elapsed_minutes','kpi_status <> ''rejected'' and not sla_paused and elapsed_minutes');
   definition:=replace(definition,'kpi_status = ''pending''),','kpi_status = ''pending'' and not sla_paused),');
  end if;
  execute definition;
 end loop;
 select replace(pg_get_functiondef('public.get_user_active_sla_breach_count(uuid)'::regprocedure),chr(13),'') into definition;
 if position('sla_clock_internal.elapsed(' in definition)=0 then
  anchor:=E'public.calculate_business_minutes(\n      active.started_at,';
  if position(anchor in definition)=0 or position('active.signature_id' in definition)=0 then raise exception 'Unknown active breach clock';end if;
  definition:=replace(definition,anchor,E'sla_clock_internal.elapsed(active.signature_id,\n      active.started_at,');
  execute replace(definition,'where active.started_at is not null','where not sla_clock_internal.paused(active.signature_id) and active.started_at is not null');
 end if;
 select replace(pg_get_functiondef('public.get_actionable_dashboard(text,text,timestamptz,timestamptz,text,integer,integer)'::regprocedure),chr(13),'') into definition;
 if position('sla_clock_internal.elapsed(' in definition)=0 then
  anchor:='public.calculate_business_minutes(c.started_at,';
  if position(anchor in definition)=0 or position('select c.*,coalesce(k.sla_minutes,120)' in definition)=0 then raise exception 'Unknown dashboard clock';end if;
  definition:=replace(definition,anchor,'sla_clock_internal.elapsed(c.measured_signature_id,c.started_at,');
  definition:=replace(definition,'select c.*,coalesce(k.sla_minutes,120)','select c.*,sla_clock_internal.paused(c.measured_signature_id) as sla_paused,coalesce(k.sla_minutes,120)');
  definition:=replace(definition,'needs_verification or needs_recommendation then ''blocked''','needs_verification or needs_recommendation or sla_clock_internal.paused(case when p_scope=''signer'' then my_signature_id else current_signature_id end) then ''blocked''');
  definition:=replace(definition,'elapsed_minutes>sla_minutes','not sla_paused and elapsed_minutes>sla_minutes');
  definition:=replace(definition,'elapsed_minutes<=sla_minutes','not sla_paused and elapsed_minutes<=sla_minutes');
  definition:=replace(definition,'''started_at'',started_at,','''sla_paused'',sla_paused,''sla_pause_reasons'',sla_clock_internal.reasons(measured_signature_id),''started_at'',started_at,');
  execute definition;
 end if;
 select pg_get_functiondef('public.remind_dashboard_request(uuid)'::regprocedure) into definition;
 if position('sla_clock_internal.paused(ss.id)' in definition)=0 then
  anchor:='if not found or ss.available_at>now()';
  if position(anchor in definition)=0 then raise exception 'Unknown reminder readiness guard';end if;
  execute replace(definition,anchor,'if not found or sla_clock_internal.paused(ss.id) or ss.available_at>now()');
 end if;
end $patch$;

-- Add metadata through the existing RPC; the authorized base is private, not a new Data API entry point.
do $details$ begin
 if to_regprocedure('sla_clock_internal.department_kpi_details_base(timestamptz,timestamptz,uuid,uuid,uuid,text)') is null then
  alter function public.get_department_kpi_details(timestamptz,timestamptz,uuid,uuid,uuid,text) rename to department_kpi_details_base;
  alter function public.department_kpi_details_base(timestamptz,timestamptz,uuid,uuid,uuid,text) set schema sla_clock_internal;
 end if;
end $details$;
create or replace function public.get_department_kpi_details(p_from timestamptz default null,p_to timestamptz default null,p_dept_id uuid default null,p_letter_type_id uuid default null,p_form_id uuid default null,p_status text default null)
returns table(signature_id uuid,surat_id uuid,no_surat text,judul_surat text,signer_name text,role_name text,step_order integer,dept_id uuid,dept_name text,letter_type_name text,form_name text,started_at timestamptz,finished_at timestamptz,kpi_status text,elapsed_minutes integer,sla_minutes integer,is_late boolean,sla_paused boolean,sla_pause_reasons text[])
language sql stable security definer set search_path='' as $$
 select d.signature_id,d.surat_id,d.no_surat,d.judul_surat,d.signer_name,d.role_name,d.step_order,d.dept_id,d.dept_name,d.letter_type_name,d.form_name,d.started_at,d.finished_at,d.kpi_status,d.elapsed_minutes,d.sla_minutes,
  d.is_late and not sla_clock_internal.paused(d.signature_id),sla_clock_internal.paused(d.signature_id),sla_clock_internal.reasons(d.signature_id)
 from sla_clock_internal.department_kpi_details_base(p_from,p_to,p_dept_id,p_letter_type_id,p_form_id,p_status) d
 where p_status is distinct from 'late' or not sla_clock_internal.paused(d.signature_id);
$$;
do $details_acl$
declare base_owner text;grantee_name text;
begin
 select pg_get_userbyid(proowner) into base_owner from pg_proc where oid='sla_clock_internal.department_kpi_details_base(timestamptz,timestamptz,uuid,uuid,uuid,text)'::regprocedure;
 if base_owner in ('anon','authenticated','service_role') then raise exception 'Unexpected KPI owner';end if;
 -- On a repeat apply the private base has already been locked down; retain the public ACL.
 if not exists(select 1 from pg_proc where oid='public.get_department_kpi_details(timestamptz,timestamptz,uuid,uuid,uuid,text)'::regprocedure and obj_description(oid,'pg_proc')='SLA-03 existing caller grants retained') then
  revoke all on function public.get_department_kpi_details(timestamptz,timestamptz,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
  for grantee_name in select r.rolname from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl join pg_roles r on r.oid=acl.grantee
   where p.oid='sla_clock_internal.department_kpi_details_base(timestamptz,timestamptz,uuid,uuid,uuid,text)'::regprocedure and acl.privilege_type='EXECUTE' and r.rolname<>base_owner loop
   execute format('grant execute on function public.get_department_kpi_details(timestamptz,timestamptz,uuid,uuid,uuid,text) to %I',grantee_name);
  end loop;
  execute format('alter function public.get_department_kpi_details(timestamptz,timestamptz,uuid,uuid,uuid,text) owner to %I',base_owner);
  comment on function public.get_department_kpi_details(timestamptz,timestamptz,uuid,uuid,uuid,text) is 'SLA-03 existing caller grants retained';
 end if;
end $details_acl$;
revoke all on all functions in schema sla_clock_internal from public,anon,authenticated,service_role;
-- Trusted owners of the pre-existing SECURITY DEFINER RPCs need the private clock.
do $owners$ declare owner_name text;begin
 for owner_name in select distinct pg_get_userbyid(p.proowner) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','sla_clock_internal') and p.proname in ('get_department_kpi_summary','get_department_kpi_details','get_user_active_sla_breach_count','get_actionable_dashboard','remind_dashboard_request','department_kpi_details_base') loop
  if owner_name in ('anon','authenticated','service_role') then raise exception 'Unexpected SLA routine owner';end if;
  execute format('grant usage on schema sla_clock_internal to %I',owner_name);
  execute format('grant execute on all functions in schema sla_clock_internal to %I',owner_name);
 end loop;
end $owners$;
notify pgrst,'reload schema';
commit;
