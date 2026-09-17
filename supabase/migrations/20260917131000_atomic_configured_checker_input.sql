begin;

create or replace function public.verify_surat_signature_v2(
  p_sig_id uuid,
  p_note text default null,
  p_payload jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_signature public.surat_signatures%rowtype;
  v_surat public.surat_registrasi%rowtype;
  v_payload jsonb := case when jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) = 'object' then coalesce(p_payload, '{}'::jsonb) else '{}'::jsonb end;
  v_draft_input jsonb;
  v_input_source jsonb;
  v_form_input jsonb;
  v_snapshot jsonb;
  v_verification_input jsonb;
  v_requested_project jsonb;
  v_allocated_project jsonb;
  v_allocated_units jsonb;
  v_checker_input jsonb;
  v_checker_clean jsonb := '{}'::jsonb;
  v_field jsonb;
  v_field_key text;
  v_field_label text;
  v_field_type text;
  v_field_value text;
  v_requirement jsonb;
  v_allocated_at timestamptz := now();
  v_revision_event_id uuid;
begin
  if v_actor is null then raise exception 'Tidak terautentikasi'; end if;

  select * into v_signature
  from public.surat_signatures
  where id = p_sig_id
  for update;
  if not found then raise exception 'Tugas pemeriksaan tidak ditemukan'; end if;

  select * into v_surat
  from public.surat_registrasi
  where id = v_signature.surat_id
  for update;
  if not found then raise exception 'Dokumen tidak ditemukan'; end if;

  if v_surat.status not in ('PROSES', 'MENUNGGU_PERBAIKAN') then
    raise exception 'Dokumen sudah tidak dalam proses pemeriksaan';
  end if;
  if v_signature.step_order <> v_surat.current_step
     or v_signature.is_signed is true
     or v_signature.verification_required is not true
     or coalesce(v_signature.verification_status, '') = 'verified' then
    raise exception 'Tugas pemeriksaan tidak tersedia untuk user ini';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(coalesce(v_signature.verifier_snapshot, '[]'::jsonb)) verifier
    where verifier->>'user_id' = v_actor::text
  ) and not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role::text = 'admin' and p.is_active is true and p.deleted_at is null
  ) then
    raise exception 'Tugas pemeriksaan tidak tersedia untuk user ini';
  end if;

  v_snapshot := coalesce(v_surat.data_snapshot, '{}'::jsonb);
  v_draft_input := coalesce(v_snapshot #> array['verification_drafts', p_sig_id::text, 'input'], '{}'::jsonb);
  if jsonb_typeof(v_draft_input) <> 'object' then v_draft_input := '{}'::jsonb; end if;
  v_input_source := case when v_payload <> '{}'::jsonb then v_payload else v_draft_input end;
  v_form_input := coalesce(v_surat.form_input_data, '{}'::jsonb);
  if jsonb_typeof(v_form_input) <> 'object' then v_form_input := '{}'::jsonb; end if;

  if v_signature.requires_unit_allocation is true or v_signature.action_type = 'unit_allocation' then
    if coalesce(v_form_input->>'request_mode', v_form_input->>'request_category', '') <> 'unit' then
      raise exception 'Dokumen ini bukan pengajuan unit';
    end if;
    v_requested_project := coalesce(v_form_input->'requested_project', '{}'::jsonb);
    v_allocated_project := case
      when nullif(v_requested_project->>'code', '') is not null then v_requested_project
      else coalesce(v_input_source->'allocated_project', v_draft_input->'allocated_project', '{}'::jsonb)
    end;
    v_allocated_units := coalesce(v_input_source->'allocated_units', v_draft_input->'allocated_units', '[]'::jsonb);
    if jsonb_typeof(v_allocated_units) <> 'array' or jsonb_array_length(v_allocated_units) < 1 then
      raise exception 'Data kavling/unit belum tersimpan. Simpan pilihan kavling terlebih dahulu.';
    end if;
    if nullif(v_allocated_project->>'code', '') is null then raise exception 'Project unit wajib dipilih'; end if;
    if nullif(v_requested_project->>'code', '') is not null
       and v_input_source ? 'allocated_project'
       and nullif(v_input_source->'allocated_project'->>'code', '') is not null
       and v_input_source->'allocated_project'->>'code' <> v_requested_project->>'code' then
      raise exception 'Proyek unit tidak boleh diubah. Buat pengajuan baru jika proyek salah.';
    end if;
    v_form_input := v_form_input || jsonb_build_object(
      'allocated_project', v_allocated_project,
      'allocated_units', v_allocated_units,
      'allocated_unit_count', jsonb_array_length(v_allocated_units),
      'allocated_by_signature_id', p_sig_id,
      'allocated_at', v_allocated_at
    );
  end if;

  if v_signature.action_type = 'configured_input' then
    if not public.is_valid_checker_input_schema(v_signature.input_schema_snapshot)
       or jsonb_array_length(coalesce(v_signature.input_schema_snapshot->'fields', '[]'::jsonb)) = 0 then
      raise exception 'Schema input pemeriksa tidak valid';
    end if;
    v_checker_input := coalesce(v_input_source->'checker_input', v_draft_input->'checker_input', '{}'::jsonb);
    if jsonb_typeof(v_checker_input) <> 'object' then raise exception 'Data pemeriksa tidak valid'; end if;

    for v_field in select value from jsonb_array_elements(v_signature.input_schema_snapshot->'fields')
    loop
      v_field_key := v_field->>'key';
      v_field_label := coalesce(nullif(trim(v_field->>'label'), ''), v_field_key);
      v_field_type := v_field->>'type';
      v_field_value := trim(coalesce(v_checker_input->>v_field_key, ''));
      if coalesce((v_field->>'required')::boolean, false) and v_field_value = '' then
        raise exception '% wajib diisi.', v_field_label using errcode = '22023';
      end if;
      if v_field_value = '' then continue; end if;
      if v_field_type in ('money', 'number') then
        if v_field_value !~ '^-?[0-9]+([.][0-9]+)?$' then
          raise exception '% harus berupa angka.', v_field_label using errcode = '22023';
        end if;
        if v_field ? 'min' and v_field_value::numeric < (v_field->>'min')::numeric then
          raise exception '% kurang dari batas minimum.', v_field_label using errcode = '22023';
        end if;
        v_checker_clean := v_checker_clean || jsonb_build_object(v_field_key, v_field_value::numeric);
      else
        v_checker_clean := v_checker_clean || jsonb_build_object(v_field_key, v_field_value);
      end if;
    end loop;

    for v_requirement in
      select value from jsonb_array_elements(coalesce(v_signature.attachment_requirements_snapshot, '[]'::jsonb))
      where coalesce((value->>'is_required')::boolean, false)
    loop
      if (
        select count(*) from public.surat_attachments attachment
        where attachment.surat_id = v_surat.id
          and attachment.signature_id = p_sig_id
          and attachment.stage = 'approval'
          and attachment.requirement_key = v_requirement->>'requirement_key'
      ) < greatest(1, coalesce((v_requirement->>'min_files')::integer, 1)) then
        raise exception 'Lampiran pemeriksaan belum lengkap: %.', coalesce(v_requirement->>'label', v_requirement->>'requirement_key')
          using errcode = '22023';
      end if;
    end loop;

    v_form_input := jsonb_set(
      v_form_input,
      '{checker_inputs}',
      coalesce(v_form_input->'checker_inputs', '{}'::jsonb) || jsonb_build_object(p_sig_id::text, v_checker_clean),
      true
    );
  end if;

  v_verification_input := v_form_input || jsonb_build_object(
    'signature_id', p_sig_id,
    'verified_by', v_actor,
    'verified_at', v_allocated_at,
    'note', nullif(trim(coalesce(p_note, '')), '')
  );
  v_snapshot := jsonb_set(v_snapshot, '{input}', v_form_input, true);
  v_snapshot := jsonb_set(
    v_snapshot,
    '{verification_inputs}',
    coalesce(v_snapshot->'verification_inputs', '{}'::jsonb) || jsonb_build_object(
      'latest', v_verification_input,
      p_sig_id::text, v_verification_input
    ),
    true
  );
  v_snapshot := v_snapshot || jsonb_build_object(
    'requested_project', v_form_input->'requested_project',
    'allocated_project', v_form_input->'allocated_project',
    'requested_unit_count', v_form_input->'requested_unit_count',
    'allocated_units', coalesce(v_form_input->'allocated_units', '[]'::jsonb),
    'allocated_unit_count', v_form_input->'allocated_unit_count'
  );

  update public.surat_registrasi
  set form_input_data = v_form_input, data_snapshot = v_snapshot, updated_at = now()
  where id = v_surat.id;
  update public.surat_signatures
  set verification_status = 'verified', verified_at = now(), verified_by = v_actor,
      verification_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_sig_id;

  select id into v_revision_event_id
  from public.surat_revision_events
  where surat_id = v_surat.id and status = 'open' and target_type = 'checker'
    and v_actor = any(target_user_ids)
  order by created_at desc limit 1;
  if v_revision_event_id is not null then
    perform public.resolve_surat_process_revision(v_revision_event_id, p_note);
  else
    update public.surat_registrasi
    set status = 'PROSES', data_snapshot = coalesce(data_snapshot, '{}'::jsonb) - 'revision', updated_at = now()
    where id = v_surat.id;
  end if;
  return true;
end;
$$;

revoke all on function public.verify_surat_signature_v2(uuid, text, jsonb) from public, anon;
grant execute on function public.verify_surat_signature_v2(uuid, text, jsonb) to authenticated, service_role;

commit;
