do $$
declare
  v_uai_id uuid;
begin
  select entity.id
  into v_uai_id
  from public.master_entities entity
  where upper(entity.code) = 'UAI'
  order by entity.id
  limit 1;

  if v_uai_id is null then
    raise exception 'Entitas UAI belum tersedia.';
  end if;

  update public.form_usages usage
  set recommendation_config = coalesce(usage.recommendation_config, '{}'::jsonb)
    || jsonb_build_object('entity_id', v_uai_id)
  where coalesce((usage.recommendation_config->>'enabled')::boolean, false) = true;
end;
$$;

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
    select 1 from public.profiles profile
    where profile.id = v_actor
      and profile.role::text in ('admin', 'super_admin')
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

  v_no_urut := public.generate_new_letter_number(
    v_entity_id,
    v_letter_type_id,
    v_office_id,
    null,
    null,
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
  order by reservation.created_at desc
  limit 1;

  if v_reservation_id is null then
    raise exception 'Reservation nomor rekomendasi gagal dibuat.';
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

create or replace function public.claim_recommendation_task(p_task_id uuid)
returns public.surat_registration_drafts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_task public.surat_recommendation_tasks;
  v_parent public.surat_registrasi;
  v_draft public.surat_registration_drafts;
  v_step record;
  v_user_id uuid;
  v_eligible jsonb;
  v_signers jsonb := '[]'::jsonb;
  v_payload jsonb;
  v_claimer_name text;
begin
  if v_actor is null then
    raise exception 'Sesi login tidak tersedia.';
  end if;

  select * into v_task
  from public.surat_recommendation_tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'Tugas rekomendasi tidak ditemukan.';
  end if;
  if v_task.status in ('submitted', 'cancelled') then
    raise exception 'Tugas rekomendasi sudah tidak aktif.';
  end if;
  if not public.is_recommendation_task_candidate(p_task_id, v_actor) then
    raise exception 'Anda bukan kandidat pembuat rekomendasi ini.';
  end if;
  if v_task.claimed_by is not null and v_task.claimed_by <> v_actor then
    select full_name into v_claimer_name from public.profiles where id = v_task.claimed_by;
    raise exception 'Tugas rekomendasi sedang dikerjakan oleh %.', coalesce(v_claimer_name, 'user lain');
  end if;

  update public.surat_recommendation_tasks
  set status = 'claimed', claimed_by = v_actor, claimed_at = coalesce(claimed_at, now())
  where id = p_task_id and (claimed_by is null or claimed_by = v_actor)
  returning * into v_task;

  if v_task.id is null then
    raise exception 'Tugas rekomendasi gagal dikunci.';
  end if;

  update public.surat_reservations
  set reserved_by = v_actor, expires_at = now() + interval '7 days'
  where id = v_task.reservation_id and status = 'PENDING';

  select * into v_parent
  from public.surat_registrasi
  where id = v_task.parent_surat_id;

  for v_step in
    select * from public.form_usage_steps
    where usage_id = v_task.usage_id
    order by step_order
  loop
    select coalesce(jsonb_agg(candidate.user_id::text order by profile.full_name), '[]'::jsonb)
    into v_eligible
    from public.form_usage_step_users candidate
    join public.profiles profile on profile.id = candidate.user_id
    where candidate.usage_step_id = v_step.id
      and coalesce(profile.is_active, true) = true;

    if v_step.step_order = 1 then
      v_user_id := v_actor;
    else
      select candidate.user_id into v_user_id
      from public.form_usage_step_users candidate
      join public.profiles profile on profile.id = candidate.user_id
      where candidate.usage_step_id = v_step.id
        and coalesce(profile.is_active, true) = true
      order by profile.full_name
      limit 1;
    end if;

    if v_user_id is null then
      raise exception 'Kandidat signer tahap % belum tersedia.', v_step.step_order;
    end if;

    v_signers := v_signers || jsonb_build_array(jsonb_build_object(
      'step_order', v_step.step_order,
      'role_name', v_step.role_name,
      'label_jabatan', coalesce(v_step.label, v_step.role_name),
      'user_id', v_user_id,
      'form_usage_step_id', v_step.id,
      'action_type', coalesce(v_step.action_type, 'approval'),
      'candidate_scope', coalesce(v_step.candidate_scope, 'head_office'),
      'eligible_user_ids', v_eligible,
      'verifier_user_ids', '[]'::jsonb,
      'attachment_requirements', '[]'::jsonb,
      'requires_unit_allocation', false
    ));
  end loop;

  v_payload := jsonb_build_object(
    'formData', jsonb_build_object(
      'entity_id', v_task.entity_id,
      'dept_id', v_task.department_id,
      'letter_type_id', v_task.letter_type_id,
      'office_id', v_task.office_id,
      'project_id', '',
      'judul_surat', 'Rekomendasi Peremajaan Alat',
      'penggunaan_id', '',
      'is_aset', true,
      'form_usage_id', v_task.usage_id,
      'request_place', coalesce(v_parent.request_place, ''),
      'request_date', to_char(current_date, 'YYYY-MM-DD'),
      'form_input_data', jsonb_build_object(
        'request_category', 'asset',
        'request_mode', 'barang',
        'linked_document_type', 'recommendation',
        'linked_parent_surat_id', v_task.parent_surat_id,
        'linked_parent_no_surat', coalesce(v_parent.no_surat, ''),
        'recommendation_parent_note', 'Rekomendasi untuk ' || coalesce(v_parent.no_surat, 'surat aset induk')
      )
    ),
    'selectedFormId', v_task.form_id,
    'selectedUsageId', v_task.usage_id,
    'linkedDocumentContext', jsonb_build_object(
      'type', 'recommendation',
      'parentSuratId', v_task.parent_surat_id,
      'parentNoSurat', coalesce(v_parent.no_surat, ''),
      'requiredBeforeStep', v_task.required_before_step,
      'formId', v_task.form_id,
      'usageId', v_task.usage_id,
      'departmentId', v_task.department_id,
      'letterTypeId', v_task.letter_type_id,
      'taskId', v_task.id
    )
  );

  insert into public.surat_registration_drafts (
    reservation_id, created_by, no_surat, payload, signer_assignments
  )
  values (v_task.reservation_id, v_actor, v_task.no_surat, v_payload, v_signers)
  on conflict (reservation_id) do update
  set created_by = excluded.created_by,
      no_surat = excluded.no_surat,
      payload = excluded.payload,
      signer_assignments = excluded.signer_assignments,
      status = 'DRAFT',
      expires_at = now() + interval '7 days',
      voided_at = null
  where public.surat_registration_drafts.created_by = v_actor
     or public.surat_registration_drafts.created_by is null
  returning * into v_draft;

  if v_draft.id is null then
    raise exception 'Draft rekomendasi sedang dikunci user lain.';
  end if;

  return v_draft;
end;
$$;

revoke all on function public.claim_recommendation_task(uuid) from public, anon;
grant execute on function public.claim_recommendation_task(uuid) to authenticated, service_role;

-- Repair the active recommendation that inherited MBN from its parent.
do $$
declare
  v_task public.surat_recommendation_tasks;
  v_uai_id uuid;
  v_new_number integer;
  v_new_reservation_id uuid;
  v_old_reservation_id uuid;
  v_type_index integer;
  v_dept_code text;
  v_month text;
  v_year integer := extract(year from now())::integer;
  v_new_no_surat text;
begin
  select entity.id into v_uai_id
  from public.master_entities entity
  where upper(entity.code) = 'UAI'
  order by entity.id
  limit 1;

  for v_task in
    select task.*
    from public.surat_recommendation_tasks task
    where task.status in ('waiting', 'claimed')
      and task.entity_id <> v_uai_id
    order by task.created_at, task.id
  loop
    v_old_reservation_id := v_task.reservation_id;
    v_new_number := public.generate_new_letter_number(
      v_uai_id, v_task.letter_type_id, v_task.office_id, null, null, v_task.department_id
    );

    select reservation.id into v_new_reservation_id
    from public.surat_reservations reservation
    where reservation.entity_id = v_uai_id
      and reservation.dept_id = v_task.department_id
      and reservation.project_id is null
      and reservation.year = v_year
      and reservation.no_urut = v_new_number
      and reservation.status = 'PENDING'
    order by reservation.created_at desc
    limit 1;

    select department.code into v_dept_code
    from public.master_departments department
    where department.id = v_task.department_id;

    select mapping.sort_index into v_type_index
    from public.master_dept_letter_types mapping
    where mapping.dept_id = v_task.department_id
      and mapping.letter_type_id = v_task.letter_type_id;

    v_month := (array['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'])[extract(month from now())::integer];
    v_new_no_surat := lpad(v_new_number::text, 3, '0') || '/UAI/'
      || coalesce(v_dept_code, 'PBO') || '.' || coalesce(v_type_index, 0)::text
      || '/' || v_month || '/' || v_year::text;

    update public.surat_reservations
    set reserved_by = v_task.claimed_by,
        expires_at = now() + interval '7 days'
    where id = v_new_reservation_id;

    update public.surat_registration_drafts draft
    set reservation_id = v_new_reservation_id,
        no_surat = v_new_no_surat,
        payload = jsonb_set(draft.payload, '{formData,entity_id}', to_jsonb(v_uai_id::text), true)
    where draft.reservation_id = v_old_reservation_id
      and draft.status = 'DRAFT';

    update public.surat_recommendation_tasks
    set reservation_id = v_new_reservation_id,
        entity_id = v_uai_id,
        no_urut = v_new_number,
        no_surat = v_new_no_surat
    where id = v_task.id;

    update public.surat_reservations
    set status = 'VOID'
    where id = v_old_reservation_id
      and status = 'PENDING';
  end loop;
end;
$$;

-- Rebuild only claimed drafts that were already emptied by the old identity-reset path.
do $$
declare
  v_task record;
begin
  for v_task in
    select task.id, task.claimed_by
    from public.surat_recommendation_tasks task
    join public.surat_registration_drafts draft on draft.reservation_id = task.reservation_id
    where task.status = 'claimed'
      and task.claimed_by is not null
      and draft.status = 'DRAFT'
      and (
        jsonb_array_length(coalesce(draft.signer_assignments, '[]'::jsonb)) = 0
        or coalesce(draft.payload->>'selectedUsageId', '') = ''
      )
  loop
    perform set_config('request.jwt.claim.sub', v_task.claimed_by::text, true);
    perform public.claim_recommendation_task(v_task.id);
  end loop;
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

-- Repair the latest affected request that the UI incorrectly normalized to false.
do $$
declare
  v_parent_id uuid := '66f587da-fe71-46cf-a0ea-a426850d9a21';
  v_creator_id uuid;
begin
  update public.surat_registrasi parent
  set form_input_data = jsonb_set(
        jsonb_set(parent.form_input_data, '{requires_recommendation}', 'true'::jsonb, true),
        '{recommendation_attachment_note}',
        to_jsonb('Pemohon membutuhkan lampiran rekomendasi untuk permohonan aset ini.'::text),
        true
      )
  where parent.id = v_parent_id
    and parent.form_input_data->>'request_category' = 'asset'
    and not exists (
      select 1 from public.surat_recommendation_tasks task where task.parent_surat_id = parent.id
    )
  returning parent.created_by into v_creator_id;

  if v_creator_id is not null then
    perform set_config('request.jwt.claim.sub', v_creator_id::text, true);
    perform public.create_recommendation_task_for_parent(v_parent_id);
    perform set_config('request.jwt.claim.sub', '', true);
  end if;
end;
$$;
