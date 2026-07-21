create or replace function public.create_surat_registrasi_core(
  p_payload jsonb,
  p_actor uuid
)
returns public.surat_registrasi
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := p_actor;
  v_actor_department_id uuid;
  v_legacy_workflow_id uuid := nullif(p_payload->>'penggunaan_id', '')::uuid;
  v_form_usage_id uuid := nullif(p_payload->>'form_usage_id', '')::uuid;
  v_request_category text := nullif(p_payload->'form_input_data'->>'request_category', '');
  v_usage_validation jsonb;
  v_requester_department_id uuid;
  v_letter_type_id uuid := nullif(p_payload->>'letter_type_id', '')::uuid;
  v_reservation_id uuid := nullif(p_payload->>'reservation_id', '')::uuid;
  v_draft_id uuid := nullif(p_payload->>'draft_id', '')::uuid;
  v_no_urut integer;
  v_reservation public.surat_reservations%rowtype;
  v_row public.surat_registrasi;
begin
  if v_actor is null then
    raise exception 'Sesi login tidak tersedia. Silakan login ulang.';
  end if;

  select profile.department_id
  into v_actor_department_id
  from public.profiles as profile
  where profile.id = v_actor
    and coalesce(profile.is_active, true) = true;

  if not found then
    raise exception 'Akun deaktif.';
  end if;

  if v_request_category not in ('asset', 'unit', 'non_unit', 'non_asset') then
    raise exception 'Klasifikasi dokumen tidak valid.';
  end if;

  if v_form_usage_id is not null then
    v_usage_validation := public.validate_form_usage_for_actor(
      v_form_usage_id,
      nullif(p_payload->>'dept_id', '')::uuid
    );

    if (v_usage_validation->>'request_category') is distinct from v_request_category then
      raise exception 'Klasifikasi dokumen tidak sesuai kegunaan form.';
    end if;
  elsif v_legacy_workflow_id is not null then
    if not exists (
      select 1
      from public.master_penggunaan_detail as workflow
      where workflow.id = v_legacy_workflow_id
        and workflow.request_categories @> array[v_request_category]::text[]
    ) then
      raise exception 'Matrix tidak mendukung klasifikasi dokumen yang dipilih.';
    end if;
  else
    raise exception 'Kegunaan form wajib dipilih.';
  end if;

  v_requester_department_id := case
    when v_form_usage_id is not null
      then nullif(v_usage_validation->>'requester_department_id', '')::uuid
    else nullif(p_payload->>'dept_id', '')::uuid
  end;

  if v_requester_department_id is null then
    raise exception 'Departemen pengaju wajib diisi.';
  end if;

  if v_letter_type_id is null then
    raise exception 'Jenis surat wajib diisi.';
  end if;

  if not exists (
    select 1
    from public.master_dept_letter_types as map
    where map.dept_id = v_requester_department_id
      and map.letter_type_id = v_letter_type_id
  ) then
    raise exception 'Jenis surat tidak tersedia untuk departemen pengaju.';
  end if;

  if v_reservation_id is not null then
    v_no_urut := nullif(split_part(coalesce(p_payload->>'no_surat', ''), '/', 1), '')::integer;
  elsif v_draft_id is not null then
    select draft.reservation_id
    into v_reservation_id
    from public.surat_registration_drafts as draft
    where draft.id = v_draft_id
      and draft.created_by = v_actor
      and draft.status = 'DRAFT';

    if v_reservation_id is null then
      raise exception 'Draft aktif tidak ditemukan untuk sesi login ini.';
    end if;

    v_no_urut := nullif(split_part(coalesce(p_payload->>'no_surat', ''), '/', 1), '')::integer;
  end if;

  if v_reservation_id is not null then
    select reservation.*
    into v_reservation
    from public.surat_reservations as reservation
    where reservation.id = v_reservation_id
    for update;

    if not found then
      raise exception 'Reservasi nomor tidak ditemukan.';
    end if;

    if v_reservation.reserved_by is distinct from v_actor then
      raise exception 'Draft ini bukan milik sesi login yang sedang aktif.';
    end if;

    if v_reservation.status <> 'PENDING' then
      raise exception 'Reservasi nomor sudah tidak aktif.';
    end if;

    if v_no_urut is null or v_reservation.no_urut <> v_no_urut then
      raise exception 'Nomor surat tidak sesuai dengan reservasi.';
    end if;

    if v_reservation.entity_id is distinct from nullif(p_payload->>'entity_id', '')::uuid
      or v_reservation.type_id is distinct from v_letter_type_id
      or v_reservation.office_id is distinct from nullif(p_payload->>'office_id', '')::uuid
      or (
        nullif(p_payload->>'project_id', '')::uuid is not null
        and v_reservation.project_id is distinct from nullif(p_payload->>'project_id', '')::uuid
      )
      or (
        v_reservation.dept_id is not null
        and v_reservation.dept_id is distinct from v_requester_department_id
      )
    then
      raise exception 'Data surat tidak sesuai dengan reservasi nomor.';
    end if;
  end if;

  insert into public.surat_registrasi (
    no_surat,
    entity_id,
    office_id,
    project_id,
    dept_id,
    letter_type_id,
    penggunaan_id,
    form_usage_id,
    judul_surat,
    file_path,
    lampiran_path,
    is_aset,
    status,
    current_step,
    created_by,
    requester_nik,
    request_place,
    request_date,
    form_input_data,
    requester_snapshot,
    location_snapshot,
    pdf_path,
    data_snapshot,
    policy_snapshot,
    represented_department_id,
    represented_by_admin
  )
  values (
    nullif(p_payload->>'no_surat', ''),
    nullif(p_payload->>'entity_id', '')::uuid,
    nullif(p_payload->>'office_id', '')::uuid,
    nullif(p_payload->>'project_id', '')::uuid,
    v_requester_department_id,
    v_letter_type_id,
    v_legacy_workflow_id,
    v_form_usage_id,
    coalesce(nullif(p_payload->>'judul_surat', ''), 'Tanpa Judul'),
    nullif(p_payload->>'file_path', ''),
    nullif(p_payload->>'lampiran_path', ''),
    coalesce(nullif(p_payload->>'is_aset', '')::boolean, false),
    coalesce(nullif(p_payload->>'status', ''), 'PROSES'),
    coalesce(nullif(p_payload->>'current_step', '')::integer, 1),
    v_actor,
    nullif(p_payload->>'requester_nik', ''),
    nullif(p_payload->>'request_place', ''),
    nullif(p_payload->>'request_date', '')::date,
    coalesce(p_payload->'form_input_data', '{}'::jsonb),
    coalesce(p_payload->'requester_snapshot', '{}'::jsonb),
    coalesce(p_payload->'location_snapshot', '{}'::jsonb),
    nullif(p_payload->>'pdf_path', ''),
    coalesce(p_payload->'data_snapshot', '{}'::jsonb),
    coalesce(p_payload->'policy_snapshot', '{}'::jsonb),
    coalesce(
      nullif(p_payload->>'represented_department_id', '')::uuid,
      nullif(v_usage_validation->>'requester_department_id', '')::uuid
    ),
    coalesce(
      nullif(p_payload->>'represented_by_admin', '')::uuid,
      nullif(v_usage_validation->>'represented_by_admin', '')::uuid
    )
  )
  returning * into v_row;

  if v_reservation_id is not null then
    update public.surat_reservations
    set status = 'USED'
    where id = v_reservation_id
      and reserved_by = v_actor
      and status = 'PENDING';
  end if;

  return v_row;
end;
$$;

create or replace function public.create_surat_registrasi(p_payload jsonb)
returns public.surat_registrasi
language sql
security definer
set search_path = public
as $$
  select public.create_surat_registrasi_core(p_payload, auth.uid());
$$;

create or replace function public.create_surat_registrasi_for_actor(
  p_payload jsonb,
  p_actor uuid
)
returns public.surat_registrasi
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.create_surat_registrasi_core(p_payload, p_actor);
end;
$$;

revoke all on function public.create_surat_registrasi_core(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.create_surat_registrasi(jsonb) from public, anon;
revoke all on function public.create_surat_registrasi_for_actor(jsonb, uuid) from public, anon, authenticated;

grant execute on function public.create_surat_registrasi(jsonb) to authenticated, service_role;
grant execute on function public.create_surat_registrasi_for_actor(jsonb, uuid) to service_role;
