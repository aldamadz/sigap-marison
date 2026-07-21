create or replace function public.create_recommendation_task_for_parent(
  p_parent_surat_id uuid
)
returns public.surat_recommendation_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
  v_parent public.surat_registrasi;
  v_config jsonb;
  v_form_id uuid;
  v_usage_id uuid;
  v_department_id uuid;
  v_letter_type_id uuid;
  v_entity_id uuid;
  v_office_id uuid;
  v_no_urut integer;
  v_year integer := extract(year from now())::integer;
  v_reservation_id uuid;
  v_task public.surat_recommendation_tasks;
  v_entity_code text;
  v_dept_code text;
  v_type_index integer;
  v_month text;
  v_no_surat text;
  v_candidates jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    raise exception 'Sesi login tidak tersedia.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_parent_surat_id::text, 190001));

  select exists (
    select 1
    from public.profiles profile
    where profile.id = v_actor
      and profile.role::text = 'admin'
      and coalesce(profile.is_active, true) = true
  ) into v_is_admin;

  select *
  into v_parent
  from public.surat_registrasi
  where id = p_parent_surat_id
  for update;

  if not found then
    raise exception 'Surat induk tidak ditemukan.';
  end if;

  if not (
    v_parent.created_by = v_actor
    or v_parent.represented_by_admin = v_actor
    or v_is_admin
  ) then
    raise exception 'Anda tidak diizinkan membuat tugas rekomendasi.';
  end if;

  if lower(coalesce(v_parent.form_input_data->>'requires_recommendation', 'false')) <> 'true' then
    return null;
  end if;

  select *
  into v_task
  from public.surat_recommendation_tasks
  where parent_surat_id = p_parent_surat_id
    and status <> 'cancelled'
  limit 1;

  if found then
    return v_task;
  end if;

  v_config := coalesce(v_parent.policy_snapshot->'recommendation_config', '{}'::jsonb);
  v_form_id := nullif(v_config->>'form_id', '')::uuid;
  v_usage_id := nullif(v_config->>'usage_id', '')::uuid;
  v_department_id := nullif(v_config->>'department_id', '')::uuid;
  v_letter_type_id := nullif(v_config->>'letter_type_id', '')::uuid;
  v_entity_id := nullif(v_config->>'entity_id', '')::uuid;

  if v_entity_id is null then
    select entity.id
    into v_entity_id
    from public.master_entities entity
    where upper(entity.code) = 'UAI'
    order by entity.id
    limit 1;
  end if;

  if v_form_id is null or v_usage_id is null or v_department_id is null
    or v_letter_type_id is null or v_entity_id is null then
    raise exception 'Konfigurasi rekomendasi aset belum lengkap.';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user_id', profile.id::text,
      'full_name', profile.full_name,
      'job_title', profile.job_title
    )
    order by profile.full_name
  ), '[]'::jsonb)
  into v_candidates
  from public.form_usage_steps step
  join public.form_usage_step_users candidate on candidate.usage_step_id = step.id
  join public.profiles profile on profile.id = candidate.user_id
  where step.usage_id = v_usage_id
    and step.step_order = 1
    and coalesce(profile.is_active, true) = true;

  if jsonb_array_length(v_candidates) = 0 then
    raise exception 'Kandidat pembuat rekomendasi belum dikonfigurasi.';
  end if;

  select case
    when office.kedudukan = 'Pusat' then office.id
    else (
      select pusat.id
      from public.master_offices pusat
      where pusat.kedudukan = 'Pusat'
      order by pusat.code nulls last, pusat.name
      limit 1
    )
  end
  into v_office_id
  from public.master_offices office
  where office.id = v_parent.office_id;

  if v_office_id is null then
    raise exception 'Kantor pusat untuk rekomendasi belum tersedia.';
  end if;

  -- The parent requester owns the reservation until an eligible IT staff member
  -- claims the recommendation task. claim_recommendation_task then transfers it.
  v_no_urut := public.generate_new_letter_number(
    v_entity_id,
    v_letter_type_id,
    v_office_id,
    null,
    v_actor,
    v_department_id
  );

  select reservation.id
  into v_reservation_id
  from public.surat_reservations reservation
  where reservation.entity_id = v_entity_id
    and reservation.dept_id = v_department_id
    and reservation.project_id is null
    and reservation.year = v_year
    and reservation.no_urut = v_no_urut
    and reservation.status = 'PENDING'
    and reservation.reserved_by = v_actor
  order by reservation.created_at desc
  limit 1;

  if v_reservation_id is null then
    raise exception 'Reservasi nomor rekomendasi gagal dibuat.';
  end if;

  select entity.code into v_entity_code
  from public.master_entities entity
  where entity.id = v_entity_id;

  select department.code into v_dept_code
  from public.master_departments department
  where department.id = v_department_id;

  select sort_index into v_type_index
  from public.master_dept_letter_types
  where dept_id = v_department_id
    and letter_type_id = v_letter_type_id;

  v_month := (array['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'])[extract(month from now())::integer];
  v_no_surat := lpad(v_no_urut::text, 3, '0') || '/'
    || coalesce(v_entity_code, 'UAI') || '/'
    || coalesce(v_dept_code, 'PBO') || '.'
    || coalesce(v_type_index, 0)::text || '/'
    || v_month || '/'
    || v_year::text;

  insert into public.surat_recommendation_tasks (
    parent_surat_id, reservation_id, no_surat, no_urut, entity_id, office_id,
    department_id, letter_type_id, form_id, usage_id, required_before_step,
    candidate_snapshot, created_by
  )
  values (
    p_parent_surat_id, v_reservation_id, v_no_surat, v_no_urut, v_entity_id,
    v_office_id, v_department_id, v_letter_type_id, v_form_id, v_usage_id,
    greatest(1, coalesce(nullif(v_config->>'required_before_step', '')::integer, 3)),
    v_candidates, v_actor
  )
  returning * into v_task;

  return v_task;
end;
$$;

revoke all on function public.create_recommendation_task_for_parent(uuid) from public, anon;
grant execute on function public.create_recommendation_task_for_parent(uuid) to authenticated, service_role;
