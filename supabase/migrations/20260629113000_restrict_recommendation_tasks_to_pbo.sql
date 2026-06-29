create or replace function public.get_my_recommendation_tasks()
returns table (
  id uuid,
  parent_surat_id uuid,
  submitted_surat_id uuid,
  no_surat text,
  status text,
  required_before_step integer,
  claimed_by uuid,
  claimed_by_name text,
  claimed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  candidate_snapshot jsonb,
  draft_id uuid,
  parent_no_surat text,
  parent_judul_surat text,
  parent_status text,
  parent_created_at timestamptz,
  parent_requester_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_pbo boolean := false;
begin
  if v_actor is null then
    raise exception 'Sesi login tidak tersedia.';
  end if;

  select exists (
    select 1
    from public.profiles profile
    left join public.master_departments department on department.id = profile.department_id
    where profile.id = v_actor
      and coalesce(profile.is_active, true) = true
      and (
        upper(coalesce(department.code, '')) = 'PBO'
        or lower(coalesce(department.name, '')) in ('pengembangan organisasi', 'po')
      )
  ) into v_is_pbo;

  if not v_is_pbo then
    return;
  end if;

  return query
  select
    task.id,
    task.parent_surat_id,
    task.submitted_surat_id,
    task.no_surat,
    task.status,
    task.required_before_step,
    task.claimed_by,
    claimer.full_name,
    task.claimed_at,
    task.created_at,
    task.updated_at,
    task.candidate_snapshot,
    draft.id,
    parent.no_surat,
    parent.judul_surat,
    parent.status,
    parent.created_at,
    creator.full_name
  from public.surat_recommendation_tasks task
  join public.surat_registrasi parent on parent.id = task.parent_surat_id
  left join public.profiles claimer on claimer.id = task.claimed_by
  left join public.profiles creator on creator.id = parent.created_by
  left join public.surat_registration_drafts draft
    on draft.reservation_id = task.reservation_id
   and draft.status = 'DRAFT'
  where task.status in ('waiting', 'claimed')
    and (
      task.claimed_by = v_actor
      or public.is_recommendation_task_candidate(task.id, v_actor)
    )
  order by task.created_at asc;
end;
$$;

revoke all on function public.get_my_recommendation_tasks() from public, anon;
grant execute on function public.get_my_recommendation_tasks() to authenticated, service_role;
