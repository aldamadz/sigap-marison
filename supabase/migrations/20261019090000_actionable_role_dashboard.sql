-- DASH-03: read-only role dashboard and KC monitoring of descendant KCP offices.
begin;

create or replace function public.dashboard_organization_offices()
returns setof uuid language sql stable security definer set search_path = '' as $$
  with recursive actor as (
    select p.office_id, o.kedudukan from public.profiles p
    join public.master_offices o on o.id=p.office_id
    where p.id=auth.uid() and p.is_active is true and p.deleted_at is null
  ), tree as (
    select o.id, array[o.id] as path from public.master_offices o join actor a on a.office_id=o.id
    union all
    select o.id, t.path||o.id from public.master_offices o join tree t on o.parent_id=t.id
    cross join actor a where a.kedudukan='KC' and not o.id=any(t.path)
  ) select id from tree;
$$;
revoke all on function public.dashboard_organization_offices() from public,anon,service_role;
grant execute on function public.dashboard_organization_offices() to authenticated;

-- Keep participant access explicit: never call can_read_surat from its predicate.
create or replace function public.can_monitor_surat_scope(p_surat_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists (
  select 1 from public.surat_registrasi s
  join public.master_offices so on so.id=s.office_id
  join public.profiles a on a.id=auth.uid() and a.is_active is true and a.deleted_at is null
  join public.master_offices ao on ao.id=a.office_id
  where s.id=p_surat_id and (
   a.role::text in ('admin','super_admin') or s.created_by=a.id
   or exists(select 1 from public.surat_signatures ss where ss.surat_id=s.id and
    (ss.user_id=a.id or ss.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id',a.id::text))))
   or (ao.kedudukan='Pusat' and so.kedudukan='Pusat' and a.department_id is not null
    and coalesce(s.represented_department_id,s.dept_id)=a.department_id)
   or (ao.kedudukan<>'Pusat' and so.kedudukan<>'Pusat'
    and s.office_id in (select public.dashboard_organization_offices()))
  )
 );
$$;
revoke all on function public.can_monitor_surat_scope(uuid) from public,anon;
grant execute on function public.can_monitor_surat_scope(uuid) to authenticated,service_role;

create or replace function public.can_read_surat(p_surat_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select public.can_monitor_surat_scope(p_surat_id);
$$;
revoke all on function public.can_read_surat(uuid) from public,anon;
grant execute on function public.can_read_surat(uuid) to authenticated,service_role;

create or replace function public.get_actionable_dashboard(
 p_scope text default 'mine', p_bucket text default 'active',
 p_from timestamptz default null, p_to timestamptz default null,
 p_search text default null, p_limit integer default 12, p_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor public.profiles; v_result jsonb;
begin
 select * into v_actor from public.profiles where id=auth.uid() and is_active is true and deleted_at is null;
 if not found then raise exception 'Dashboard access denied' using errcode='42501';end if;
 if p_scope not in ('mine','signer','team') or p_bucket not in
  ('all','active','ready','blocked','upcoming','waiting','returned','completed','rejected','within_sla','overdue')
  or p_scope is null or p_bucket is null or (p_from is not null and p_to is not null and p_from>=p_to)
  or p_limit not between 1 and 50 or p_offset not between 0 and 100000
  or p_limit is null or p_offset is null or length(coalesce(p_search,''))>100 then
  raise exception 'Invalid dashboard filters' using errcode='22023';
 end if;
 with actor as (
  select p.*,o.kedudukan,o.name as office_name,d.name as department_name from public.profiles p
  left join public.master_offices o on o.id=p.office_id
  left join public.master_departments d on d.id=p.department_id where p.id=v_actor.id
 ), offices as materialized (select public.dashboard_organization_offices() as id),
 scoped as materialized (
  select s.*,a.office_name as actor_office_name,a.department_name as actor_department_name,
   a.kedudukan as actor_office_type,owner.full_name as requester_name,o.name as office_name,d.name as department_name,
   (s.created_by=a.id) as is_mine,
   (a.role::text in ('admin','super_admin') or
    (a.kedudukan='Pusat' and o.kedudukan='Pusat' and a.department_id is not null
     and coalesce(s.represented_department_id,s.dept_id)=a.department_id) or
    (a.kedudukan in ('KC','KCP') and o.kedudukan<>'Pusat' and s.office_id in(select id from offices))) as is_team,
   mine.id as my_signature_id,mine.step_order as my_step,mine.is_signed as my_signed,mine.status as my_status,
   mine.signed_at as my_signed_at,mine.user_id as my_user,mine.available_at as my_available_at,
   mine.signer_snapshot as my_snapshot,mine.role_name as my_role,
   current_sig.id as current_signature_id,current_sig.user_id as current_signer_id,
   current_sig.role_name as current_role,current_sig.available_at as current_available_at,current_sig.signed_at as current_signed_at,
   current_sig.signer_snapshot as current_snapshot,current_sig.verification_required,
   current_sig.verification_status,signer.full_name as current_signer_name,signer.department_id as current_signer_dept,
   stats.all_signed,stats.any_rejected,revision.reason as revision_reason,
   (current_sig.verification_required is true and current_sig.verification_status is distinct from 'verified') as needs_verification,
   exists(select 1 from public.surat_recommendation_tasks rt where rt.parent_surat_id=s.id
     and rt.required_before_step<=s.current_step and rt.status not in ('completed','cancelled')) as needs_recommendation,
   coalesce(previous.signed_at,s.created_at) as previous_finished_at
  from public.surat_registrasi s cross join actor a
  left join public.profiles owner on owner.id=s.created_by
  left join public.master_offices o on o.id=s.office_id
  left join public.master_departments d on d.id=coalesce(s.represented_department_id,s.dept_id)
  left join lateral (
   select ss.* from public.surat_signatures ss where ss.surat_id=s.id and ss.user_id=a.id
     and (ss.step_order>1 or s.created_by<>a.id)
   order by case when not coalesce(ss.is_signed,false) and ss.step_order=s.current_step then 0
     when not coalesce(ss.is_signed,false) and ss.step_order>s.current_step then 1
     when ss.is_signed then 2 else 3 end,ss.step_order,ss.id limit 1
  ) mine on true
  left join lateral (select ss.* from public.surat_signatures ss where ss.surat_id=s.id
   and (ss.step_order=s.current_step or (s.status in ('DONE','SELESAI','REJECTED','DITOLAK') and ss.is_signed))
   order by (ss.step_order=s.current_step) desc,ss.step_order desc,ss.id limit 1) current_sig on true
  left join public.profiles signer on signer.id=current_sig.user_id
  left join lateral (select bool_and(ss.is_signed) as all_signed,bool_or(ss.status='REJECTED') as any_rejected
   from public.surat_signatures ss where ss.surat_id=s.id) stats on true
  left join lateral (select e.reason from public.surat_revision_events e where e.surat_id=s.id
   and e.status in ('open','awaiting_requester') order by e.created_at desc,e.id limit 1) revision on true
  left join lateral (select max(ss.signed_at) as signed_at from public.surat_signatures ss
   where ss.surat_id=s.id and ss.is_signed and ss.step_order<
     case when p_scope='signer' then mine.step_order else current_sig.step_order end) previous on true
  where s.created_by=a.id or mine.id is not null or a.role::text in ('admin','super_admin')
   or (a.kedudukan='Pusat' and o.kedudukan='Pusat' and coalesce(s.represented_department_id,s.dept_id)=a.department_id)
   or (a.kedudukan in ('KC','KCP') and o.kedudukan<>'Pusat' and s.office_id in(select id from offices))
 ), selected as (
  select * from scoped where case p_scope when 'mine' then is_mine when 'signer' then my_signature_id is not null else is_team end
 ), classified as (
  select s.*,case
   when status='MENUNGGU_PERBAIKAN' then 'returned'
   when status in ('REJECTED','DITOLAK') or any_rejected then 'rejected'
   when p_scope='signer' and my_signed then 'completed'
   when status in ('DONE','SELESAI') or all_signed then 'completed'
   when p_scope='signer' and my_step>current_step then 'upcoming'
   when p_scope='signer' and my_step=current_step and status='PROSES' then
    case when needs_verification or needs_recommendation then 'blocked' else 'ready' end
   else 'waiting' end as bucket,
   coalesce(case when p_scope='signer' then my_signed_at else current_signed_at end,updated_at,created_at) as finished_at,
   case when p_scope='signer' then my_signed_at else current_signed_at end as measured_finished_at,
   case when p_scope='signer' then my_signature_id else current_signature_id end as measured_signature_id,
   case when p_scope='signer' then my_snapshot else current_snapshot end as measured_snapshot,
   case when p_scope='signer' then v_actor.department_id else current_signer_dept end as measured_dept,
   case when status='MENUNGGU_PERBAIKAN' or
     (case when p_scope='signer' then my_signature_id else current_signature_id end) is null then null
    when p_scope='signer' and my_signed then coalesce(my_available_at,previous_finished_at)
    when p_scope<>'signer' and status in ('DONE','SELESAI') then coalesce(current_available_at,previous_finished_at)
    when status='PROSES' and (p_scope<>'signer' or my_step=current_step) then
      greatest(coalesce(case when p_scope='signer' then my_available_at else current_available_at end,previous_finished_at),
       case when pg_input_is_valid(data_snapshot#>>'{applied_revision,accepted_at}', 'timestamptz') then
        (data_snapshot#>>'{applied_revision,accepted_at}')::timestamptz end)
    else null end as started_at
  from selected s
 ), measured as materialized (
  select c.*,coalesce(k.sla_minutes,120) as sla_minutes,
   case when c.started_at is not null and c.bucket not in ('upcoming','returned','rejected') then
    case when c.started_at>=coalesce(case when c.bucket='completed' then c.measured_finished_at end,now()) then 0 else
    public.calculate_business_minutes(c.started_at,coalesce(case when c.bucket='completed' then c.measured_finished_at end,now()),
     coalesce(k.work_days,array[1,2,3,4,5]),coalesce(k.work_start,time '08:00'),coalesce(k.work_end,time '17:00'),
     coalesce(k.break_start,time '12:00'),coalesce(k.break_end,time '13:00'),coalesce(k.timezone,'Asia/Jakarta')) end
   end as elapsed_minutes
  from classified c left join public.department_kpi_configs k on k.is_active is true and k.dept_id=coalesce(
   case when c.measured_snapshot->>'department_id' ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
    then (c.measured_snapshot->>'department_id')::uuid end,c.measured_dept)
  where c.bucket not in ('completed','rejected') or
   ((p_from is null or c.finished_at>=p_from) and (p_to is null or c.finished_at<p_to))
 ), filtered as materialized (
  select * from measured m where
   (p_bucket='all' or p_bucket=m.bucket
    or (p_bucket='active' and m.bucket not in ('completed','rejected'))
    or (p_bucket='within_sla' and m.bucket not in ('completed','rejected') and elapsed_minutes<=sla_minutes)
    or (p_bucket='overdue' and m.bucket not in ('completed','rejected') and elapsed_minutes>sla_minutes))
   and (nullif(btrim(p_search),'') is null or concat_ws(' ',no_surat,judul_surat,requester_name,office_name,
    department_name,current_signer_name,current_role) ilike '%'||btrim(p_search)||'%')
 ), page as (
  select * from filtered order by
   case when elapsed_minutes>sla_minutes then 0 when bucket='returned' then 1 when bucket='ready' then 2 else 3 end,
   coalesce(started_at,created_at),id limit p_limit offset p_offset
 )
 select jsonb_build_object(
  'scope',p_scope,'generated_at',now(),
  'team_label',(select case when role::text in ('admin','super_admin') then 'Seluruh kantor'
   when kedudukan='KC' then office_name||' dan KCP' when kedudukan='Pusat' then coalesce(department_name,'Departemen') else office_name end from actor),
  'has_signatures',exists(select 1 from scoped where my_signature_id is not null),
  'summary',(select jsonb_build_object(
   'active',count(*) filter(where bucket not in ('completed','rejected')),'ready',count(*) filter(where bucket='ready'),
   'blocked',count(*) filter(where bucket='blocked'),'upcoming',count(*) filter(where bucket='upcoming'),
   'returned',count(*) filter(where bucket='returned'),'completed',count(*) filter(where bucket='completed'),
   'rejected',count(*) filter(where bucket='rejected'),
   'within_sla',count(*) filter(where bucket not in ('completed','rejected') and elapsed_minutes<=sla_minutes),
   'overdue',count(*) filter(where bucket not in ('completed','rejected') and elapsed_minutes>sla_minutes),
   'completed_on_time',count(*) filter(where bucket='completed' and elapsed_minutes<=sla_minutes),
   'completed_measured',count(*) filter(where bucket='completed' and elapsed_minutes is not null)) from measured),
  'count',(select count(*) from filtered),
  'rows',coalesce((select jsonb_agg(jsonb_build_object(
   'id',id,'no_surat',no_surat,'title',judul_surat,'requester_name',requester_name,'office_name',office_name,
   'department_name',department_name,'bucket',bucket,'current_step',current_step,'my_step',my_step,
   'signature_id',my_signature_id,'current_signer_id',case when bucket='returned' then created_by else current_signer_id end,
   'current_signer_name',coalesce(current_snapshot->>'full_name',current_signer_name),
   'current_role',current_role,'needs_verification',needs_verification,'needs_recommendation',needs_recommendation,
   'revision_reason',revision_reason,'started_at',started_at,'elapsed_minutes',elapsed_minutes,'sla_minutes',sla_minutes
  ) order by case when elapsed_minutes>sla_minutes then 0 when bucket='returned' then 1 when bucket='ready' then 2 else 3 end,
   coalesce(started_at,created_at),id) from page),'[]'::jsonb),
  'groups',coalesce((select jsonb_agg(g order by g.active desc,g.name) from (
   select coalesce(office_name,'Kantor') as name,count(*) filter(where bucket not in ('completed','rejected')) as active,
    count(*) filter(where bucket not in ('completed','rejected') and elapsed_minutes>sla_minutes) as overdue
   from measured group by office_name) g),'[]'::jsonb)
 ) into v_result;
 return v_result;
end;
$$;
revoke all on function public.get_actionable_dashboard(text,text,timestamptz,timestamptz,text,integer,integer) from public,anon,service_role;
grant execute on function public.get_actionable_dashboard(text,text,timestamptz,timestamptz,text,integer,integer) to authenticated;

-- A reminder never approves a document or changes its current stage. Recipients
-- are resolved on the server; one reminder per task/recipient per six hours.
create or replace function public.remind_dashboard_request(p_surat_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.profiles; s public.surat_registrasi; ss public.surat_signatures;
 target uuid; context_id uuid; target_name text;
begin
 select * into a from public.profiles where id=auth.uid() and is_active is true and deleted_at is null;
 if not found or not public.can_monitor_surat_scope(p_surat_id) then
  raise exception 'Pengajuan tidak dapat diakses.' using errcode='42501';end if;
 select * into strict s from public.surat_registrasi where id=p_surat_id for share;
 if s.status='MENUNGGU_PERBAIKAN' then
  target:=s.created_by;
  select e.id into context_id from public.surat_revision_events e where e.surat_id=s.id
   and e.status in ('open','awaiting_requester') order by e.created_at desc,e.id limit 1;
  if context_id is null then raise exception 'Tugas perbaikan sudah tidak aktif.' using errcode='55000';end if;
 elsif s.status='PROSES' then
  select * into ss from public.surat_signatures where surat_id=s.id and step_order=s.current_step
   and not coalesce(is_signed,false) and status is distinct from 'REJECTED' order by id limit 1;
  if not found or (ss.verification_required is true and ss.verification_status is distinct from 'verified')
   or exists(select 1 from public.surat_recommendation_tasks rt where rt.parent_surat_id=s.id
    and rt.required_before_step<=s.current_step and rt.status not in ('completed','cancelled')) then
   raise exception 'Tahap ini masih menunggu pemeriksaan atau rekomendasi.' using errcode='55000';end if;
  target:=ss.user_id;context_id:=ss.id;
 else raise exception 'Pengajuan sudah tidak menunggu tindak lanjut.' using errcode='55000';end if;
 if target=a.id then raise exception 'Tugas ini perlu Anda tindak lanjuti sendiri.' using errcode='55000';end if;
 select full_name into target_name from public.profiles where id=target and is_active is true and deleted_at is null;
 if not found then raise exception 'Penanggung jawab aktif tidak ditemukan.' using errcode='55000';end if;
 perform pg_advisory_xact_lock(hashtextextended('dashboard-reminder:'||context_id::text,638));
 if exists(select 1 from public.notifications n where n.user_id=target
   and n.data->>'category'='dashboard_follow_up' and n.data->>'context_id'=context_id::text
   and n.created_at>now()-interval '6 hours') then
  return jsonb_build_object('sent',false,'recipient',target_name);end if;
 insert into public.notifications(user_id,type,title,message,data,link)
 values(target,'info','Pengingat tindak lanjut pengajuan',a.full_name||' mengingatkan pengajuan '||coalesce(s.no_surat,s.judul_surat),
  jsonb_build_object('category','dashboard_follow_up','context_id',context_id,'surat_id',s.id,'actor_id',a.id),
  case when s.status='MENUNGGU_PERBAIKAN' then '/surat/tindak-lanjut'
   else '/surat/inbox?task=approval:'||ss.id::text end);
 return jsonb_build_object('sent',true,'recipient',target_name);
end;
$$;
revoke all on function public.remind_dashboard_request(uuid) from public,anon,service_role;
grant execute on function public.remind_dashboard_request(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
