-- SUR-10: lightweight active SLA breach signal for navigation color.
-- Historical completed approvals are intentionally excluded: once the active
-- overdue task is resolved, the navigation must immediately return to green.

create or replace function public.get_user_active_sla_breach_count(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  with active_signatures as (
    select
      coalesce(
        greatest(
          signature.available_at,
          nullif(surat.data_snapshot->'applied_revision'->>'accepted_at', '')::timestamptz
        ),
        signature.available_at,
        previous_signature.signed_at,
        surat.created_at
      ) as started_at,
      coalesce(
        case
          when (signature.signer_snapshot->>'department_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then (signature.signer_snapshot->>'department_id')::uuid
          else null
        end,
        signer_profile.department_id
      ) as responsible_dept_id
    from public.surat_signatures signature
    join public.surat_registrasi surat on surat.id = signature.surat_id
    left join lateral (
      select max(previous.signed_at) as signed_at
      from public.surat_signatures previous
      where previous.surat_id = signature.surat_id
        and previous.step_order = signature.step_order - 1
        and previous.is_signed = true
    ) previous_signature on true
    left join public.profiles signer_profile on signer_profile.id = signature.user_id
    where p_user_id is not null
      and signature.user_id = p_user_id
      and signature.is_signed = false
      and coalesce(signature.status, 'PENDING') <> 'REJECTED'
      and surat.status = 'PROSES'
      and signature.step_order = surat.current_step
  )
  select count(*)::bigint
  from active_signatures active
  left join public.department_kpi_configs config
    on config.dept_id = active.responsible_dept_id
   and config.is_active = true
  where active.started_at is not null
    and active.responsible_dept_id is not null
    and public.calculate_business_minutes(
      active.started_at,
      now(),
      coalesce(config.work_days, array[1,2,3,4,5]),
      coalesce(config.work_start, time '08:00'),
      coalesce(config.work_end, time '17:00'),
      coalesce(config.break_start, time '12:00'),
      coalesce(config.break_end, time '13:00'),
      coalesce(config.timezone, 'Asia/Jakarta')
    ) > coalesce(config.sla_minutes, 120);
$$;

revoke all on function public.get_user_active_sla_breach_count(uuid) from public, anon, authenticated;
grant execute on function public.get_user_active_sla_breach_count(uuid) to service_role;

