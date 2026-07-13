create or replace function public.complete_recommendation_task(
  p_task_id uuid,
  p_child_surat_id uuid
)
returns public.surat_recommendation_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
  v_task public.surat_recommendation_tasks;
  v_child public.surat_registrasi%rowtype;
  v_items jsonb := '[]'::jsonb;
  v_not_recommended_count integer := 0;
begin
  if v_actor is null then
    raise exception 'Sesi login tidak tersedia.';
  end if;

  select exists (
    select 1 from public.profiles profile
    where profile.id = v_actor
      and profile.role::text in ('admin', 'super_admin')
      and coalesce(profile.is_active, true) = true
  ) into v_is_admin;

  select *
  into v_task
  from public.surat_recommendation_tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'Tugas rekomendasi tidak ditemukan.';
  end if;

  if not (v_task.claimed_by = v_actor or v_is_admin) then
    raise exception 'Tugas rekomendasi dikunci user lain.';
  end if;

  select *
  into v_child
  from public.surat_registrasi child
  where child.id = p_child_surat_id
    and (child.created_by = v_actor or v_is_admin);

  if not found then
    raise exception 'Surat rekomendasi tidak valid.';
  end if;

  v_items := coalesce(v_child.form_input_data->'recommendation_items', '[]'::jsonb);
  if jsonb_typeof(v_items) <> 'array' then
    v_items := '[]'::jsonb;
  end if;

  select count(*)
  into v_not_recommended_count
  from jsonb_array_elements(v_items) item
  where item->>'recommendation_action' = 'tidak_direkomendasikan'
     or coalesce((nullif(item->>'is_recommended', ''))::boolean, true) = false;

  insert into public.surat_linked_documents (
    parent_surat_id,
    child_surat_id,
    link_type,
    required_before_step,
    created_by
  )
  values (
    v_task.parent_surat_id,
    p_child_surat_id,
    'recommendation',
    v_task.required_before_step,
    v_actor
  )
  on conflict (parent_surat_id, child_surat_id, link_type)
  do update set
    status = 'active',
    required_before_step = excluded.required_before_step,
    updated_at = now();

  update public.surat_reservations
  set status = 'USED',
      reserved_by = coalesce(reserved_by, v_actor)
  where id = v_task.reservation_id
    and status = 'PENDING';

  update public.surat_recommendation_tasks
  set status = 'submitted',
      submitted_surat_id = p_child_surat_id,
      submitted_at = now()
  where id = p_task_id
  returning * into v_task;

  update public.surat_registrasi
  set data_snapshot = jsonb_set(
        jsonb_set(
          coalesce(data_snapshot, '{}'::jsonb),
          '{recommendation}',
          jsonb_build_object(
            'task_id', p_task_id,
            'child_surat_id', p_child_surat_id,
            'items', v_items,
            'submitted_at', now(),
            'not_recommended_count', v_not_recommended_count
          ),
          true
        ),
        '{recommendation_decisions}',
        v_items,
        true
      ),
      updated_at = now()
  where id = v_task.parent_surat_id;

  return v_task;
end;
$$;

revoke all on function public.complete_recommendation_task(uuid, uuid) from public, anon;
grant execute on function public.complete_recommendation_task(uuid, uuid) to authenticated, service_role;
