create or replace function public.create_surat_registrasi(p_payload jsonb)
returns public.surat_registrasi
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_department_id uuid;
  v_legacy_workflow_id uuid := nullif(p_payload->>'penggunaan_id', '')::uuid;
  v_form_usage_id uuid := nullif(p_payload->>'form_usage_id', '')::uuid;
  v_request_category text := nullif(p_payload->'form_input_data'->>'request_category', '');
  v_usage_validation jsonb;
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

  if v_request_category not in ('asset', 'unit', 'non_unit') then
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
    case
      when v_form_usage_id is not null
        then nullif(v_usage_validation->>'requester_department_id', '')::uuid
      else nullif(p_payload->>'dept_id', '')::uuid
    end,
    nullif(p_payload->>'letter_type_id', '')::uuid,
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

  return v_row;
end;
$$;

revoke all on function public.create_surat_registrasi(jsonb) from public, anon;
grant execute on function public.create_surat_registrasi(jsonb) to authenticated, service_role;

create or replace function public.validate_form_usage_signature()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage_id uuid;
  v_step public.form_usage_steps;
begin
  select registration.form_usage_id
  into v_usage_id
  from public.surat_registrasi as registration
  where registration.id = new.surat_id;

  if v_usage_id is null then
    return new;
  end if;

  if new.form_usage_step_id is null then
    raise exception 'Tahap kegunaan form wajib disimpan pada signer.';
  end if;

  select *
  into v_step
  from public.form_usage_steps
  where id = new.form_usage_step_id
    and usage_id = v_usage_id;

  if not found then
    raise exception 'Tahap signer tidak sesuai kegunaan form.';
  end if;

  if not exists (
    select 1
    from public.form_usage_step_users as candidate
    where candidate.usage_step_id = v_step.id
      and candidate.user_id = new.user_id
  ) then
    raise exception 'User bukan kandidat signer pada tahap ini.';
  end if;

  new.step_order := v_step.step_order;
  new.role_name := v_step.role_name;
  new.label_jabatan := v_step.label;
  new.action_type := v_step.action_type;
  new.requires_unit_allocation := v_step.action_type = 'unit_allocation';

  return new;
end;
$$;

drop trigger if exists validate_form_usage_signature_before_write
  on public.surat_signatures;
create trigger validate_form_usage_signature_before_write
before insert or update of user_id, form_usage_step_id, step_order, role_name, action_type
on public.surat_signatures
for each row
execute function public.validate_form_usage_signature();
