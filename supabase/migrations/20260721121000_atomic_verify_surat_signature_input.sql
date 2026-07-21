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
  v_allocated_at timestamptz := now();
  v_revision_event_id uuid;
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi';
  end if;

  select *
  into v_signature
  from public.surat_signatures
  where id = p_sig_id
  for update;

  if not found then
    raise exception 'Tugas pemeriksaan tidak ditemukan';
  end if;

  select *
  into v_surat
  from public.surat_registrasi
  where id = v_signature.surat_id
  for update;

  if not found then
    raise exception 'Dokumen tidak ditemukan';
  end if;

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
    select 1
    from public.profiles p
    where p.id = v_actor
      and p.role::text = 'admin'
  ) then
    raise exception 'Tugas pemeriksaan tidak tersedia untuk user ini';
  end if;

  v_snapshot := coalesce(v_surat.data_snapshot, '{}'::jsonb);
  v_draft_input := coalesce(v_snapshot #> array['verification_drafts', p_sig_id::text, 'input'], '{}'::jsonb);
  if jsonb_typeof(v_draft_input) <> 'object' then
    v_draft_input := '{}'::jsonb;
  end if;

  v_input_source := case
    when v_payload <> '{}'::jsonb then v_payload
    else v_draft_input
  end;

  v_form_input := coalesce(v_surat.form_input_data, '{}'::jsonb);
  if jsonb_typeof(v_form_input) <> 'object' then
    v_form_input := '{}'::jsonb;
  end if;

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

    if nullif(v_allocated_project->>'code', '') is null then
      raise exception 'Project unit wajib dipilih';
    end if;

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
  set form_input_data = v_form_input,
      data_snapshot = v_snapshot,
      updated_at = now()
  where id = v_surat.id;

  update public.surat_signatures
  set verification_status = 'verified',
      verified_at = now(),
      verified_by = v_actor,
      verification_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_sig_id;

  select id
  into v_revision_event_id
  from public.surat_revision_events
  where surat_id = v_surat.id
    and status = 'open'
    and target_type = 'checker'
    and v_actor = any(target_user_ids)
  order by created_at desc
  limit 1;

  if v_revision_event_id is not null then
    perform public.resolve_surat_process_revision(v_revision_event_id, p_note);
  else
    update public.surat_registrasi
    set status = 'PROSES',
        data_snapshot = coalesce(data_snapshot, '{}'::jsonb) - 'revision',
        updated_at = now()
    where id = v_surat.id;
  end if;

  return true;
end;
$$;

revoke all on function public.verify_surat_signature_v2(uuid, text, jsonb) from public, anon;
grant execute on function public.verify_surat_signature_v2(uuid, text, jsonb) to authenticated, service_role;

do $$
declare
  r record;
  v_form_input jsonb;
  v_snapshot jsonb;
  v_draft_input jsonb;
  v_requested_project jsonb;
  v_allocated_project jsonb;
  v_allocated_units jsonb;
  v_verification_input jsonb;
begin
  for r in
    select sr.id as surat_id,
           ss.id as signature_id,
           ss.verified_at,
           ss.verified_by,
           sr.form_input_data,
           sr.data_snapshot
    from public.surat_registrasi sr
    join public.surat_signatures ss on ss.surat_id = sr.id
    where ss.verification_required is true
      and (ss.requires_unit_allocation is true or ss.action_type = 'unit_allocation')
      and ss.verification_status = 'verified'
      and coalesce(sr.form_input_data->>'request_mode', sr.form_input_data->>'request_category', '') = 'unit'
      and (
        jsonb_typeof(sr.form_input_data->'allocated_units') is distinct from 'array'
        or case
          when jsonb_typeof(sr.form_input_data->'allocated_units') = 'array'
            then jsonb_array_length(sr.form_input_data->'allocated_units')
          else 0
        end = 0
      )
      and jsonb_typeof(sr.data_snapshot #> array['verification_drafts', ss.id::text, 'input', 'allocated_units']) = 'array'
      and case
        when jsonb_typeof(sr.data_snapshot #> array['verification_drafts', ss.id::text, 'input', 'allocated_units']) = 'array'
          then jsonb_array_length(sr.data_snapshot #> array['verification_drafts', ss.id::text, 'input', 'allocated_units'])
        else 0
      end > 0
  loop
    v_form_input := coalesce(r.form_input_data, '{}'::jsonb);
    v_snapshot := coalesce(r.data_snapshot, '{}'::jsonb);
    v_draft_input := coalesce(v_snapshot #> array['verification_drafts', r.signature_id::text, 'input'], '{}'::jsonb);
    v_requested_project := coalesce(v_form_input->'requested_project', '{}'::jsonb);
    v_allocated_project := case
      when nullif(v_requested_project->>'code', '') is not null then v_requested_project
      else coalesce(v_draft_input->'allocated_project', '{}'::jsonb)
    end;
    v_allocated_units := coalesce(v_draft_input->'allocated_units', '[]'::jsonb);

    v_form_input := v_form_input || jsonb_build_object(
      'allocated_project', v_allocated_project,
      'allocated_units', v_allocated_units,
      'allocated_unit_count', jsonb_array_length(v_allocated_units),
      'allocated_by_signature_id', r.signature_id,
      'allocated_at', coalesce(r.verified_at, now())
    );

    v_verification_input := v_form_input || jsonb_build_object(
      'signature_id', r.signature_id,
      'verified_by', r.verified_by,
      'verified_at', coalesce(r.verified_at, now())
    );

    v_snapshot := jsonb_set(v_snapshot, '{input}', v_form_input, true);
    v_snapshot := jsonb_set(
      v_snapshot,
      '{verification_inputs}',
      coalesce(v_snapshot->'verification_inputs', '{}'::jsonb) || jsonb_build_object(
        'latest', v_verification_input,
        r.signature_id::text, v_verification_input
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
    set form_input_data = v_form_input,
        data_snapshot = v_snapshot,
        updated_at = now()
    where id = r.surat_id;
  end loop;
end;
$$;
