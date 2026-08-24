-- SUR-13 follow-up: organization scope grants full document access.
--
-- Central-office users may read documents issued for their department. Branch
-- users may read documents issued by their exact KC/KCP office. Participant
-- and admin access remains available. Keep the organization predicate
-- independent from can_read_surat to avoid recursive RLS evaluation.

create or replace function public.can_monitor_surat_scope(p_surat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.surat_registrasi surat
    join public.master_offices surat_office on surat_office.id = surat.office_id
    join public.profiles actor_profile on actor_profile.id = auth.uid()
    join public.master_offices actor_office on actor_office.id = actor_profile.office_id
    where surat.id = p_surat_id
      and coalesce(actor_profile.is_active, true) = true
      and actor_profile.deleted_at is null
      and (
        lower(coalesce(actor_profile.role::text, '')) in ('admin', 'super_admin')
        or surat.created_by = auth.uid()
        or exists (
          select 1
          from public.surat_signatures signature
          where signature.surat_id = surat.id
            and (
              signature.user_id = auth.uid()
              or signature.verifier_snapshot @> jsonb_build_array(
                jsonb_build_object('user_id', auth.uid()::text)
              )
            )
        )
        or (
          actor_office.kedudukan = 'Pusat'
          and surat_office.kedudukan = 'Pusat'
          and actor_profile.department_id is not null
          and coalesce(surat.represented_department_id, surat.dept_id) = actor_profile.department_id
        )
        or (
          actor_office.kedudukan <> 'Pusat'
          and surat_office.kedudukan <> 'Pusat'
          and surat.office_id = actor_profile.office_id
        )
      )
  );
$$;

revoke all on function public.can_monitor_surat_scope(uuid) from public, anon;
grant execute on function public.can_monitor_surat_scope(uuid) to authenticated, service_role;

create or replace function public.can_read_surat(p_surat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_monitor_surat_scope(p_surat_id);
$$;

revoke all on function public.can_read_surat(uuid) from public, anon;
grant execute on function public.can_read_surat(uuid) to authenticated, service_role;
