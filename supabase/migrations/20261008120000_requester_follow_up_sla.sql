begin;

-- Requester revision time is independent from the paused manager approval KPI.
create or replace function public.get_requester_follow_up_sla(p_event_id uuid)
returns table (
  event_id uuid,
  started_at timestamptz,
  measured_at timestamptz,
  elapsed_minutes integer,
  sla_minutes integer,
  department_name text,
  config_source text,
  timezone text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.is_active is true and p.deleted_at is null
  ) then
    raise exception 'Follow-up SLA access denied' using errcode = '42501';
  end if;

  -- Do not reuse participant/signer read permission for this requester-only RPC.
  if not exists (
    select 1 from public.surat_revision_events e
    join public.surat_registrasi s on s.id = e.surat_id
    where e.id = p_event_id and (s.created_by = v_actor or public.is_current_user_admin())
  ) then
    raise exception 'Follow-up SLA access denied' using errcode = '42501';
  end if;

  return query
  with request as (
    select e.id, e.created_at,
      coalesce(
        case when s.policy_snapshot->>'requester_department_id' ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
          then (s.policy_snapshot->>'requester_department_id')::uuid end,
        requester.department_id
      ) as dept_id
    from public.surat_revision_events e
    join public.surat_registrasi s on s.id = e.surat_id
    left join public.profiles requester on requester.id = s.created_by
    where e.id = p_event_id and e.target_type = 'requester' and e.status in ('open', 'awaiting_requester')
      and s.status = 'MENUNGGU_PERBAIKAN'
      and s.data_snapshot#>>'{revision,event_id}' = e.id::text
      and (s.created_by = v_actor or public.is_current_user_admin())
  )
  select r.id, r.created_at, now(),
    case when r.created_at >= now() then 0 else public.calculate_business_minutes(
      r.created_at, now(), coalesce(k.work_days, array[1,2,3,4,5]),
      coalesce(k.work_start, time '08:00'), coalesce(k.work_end, time '17:00'),
      coalesce(k.break_start, time '12:00'), coalesce(k.break_end, time '13:00'),
      coalesce(k.timezone, 'Asia/Jakarta')
    ) end,
    coalesce(k.sla_minutes, 120), d.name,
    case when k.dept_id is null then 'default'::text else 'department'::text end,
    coalesce(k.timezone, 'Asia/Jakarta')
  from request r
  left join public.master_departments d on d.id = r.dept_id
  left join public.department_kpi_configs k on k.dept_id = r.dept_id and k.is_active is true;
end;
$$;

revoke all on function public.get_requester_follow_up_sla(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_requester_follow_up_sla(uuid) to authenticated;

notify pgrst,'reload schema';

commit;
