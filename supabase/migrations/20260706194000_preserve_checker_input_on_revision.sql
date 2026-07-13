create or replace function public.request_surat_process_revision(
  p_surat_id uuid,
  p_sig_id uuid,
  p_target_type text,
  p_target_step integer,
  p_reason text,
  p_changes jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_surat public.surat_registrasi%rowtype;
  v_signature public.surat_signatures%rowtype;
  v_target_ids uuid[] := '{}';
  v_event_id uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_target_type text := coalesce(nullif(trim(p_target_type), ''), 'requester');
  v_changes jsonb := coalesce(p_changes, '{}'::jsonb);
  v_form_input jsonb;
  v_checker_input jsonb;
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi';
  end if;

  if v_reason is null or length(v_reason) < 5 then
    raise exception 'Alasan perbaikan minimal 5 karakter';
  end if;

  if jsonb_typeof(v_changes) <> 'object' then
    raise exception 'Data perubahan tidak valid';
  end if;

  select *
  into v_surat
  from public.surat_registrasi
  where id = p_surat_id
    and status in ('PROSES', 'MENUNGGU_PERBAIKAN')
  for update;

  if not found then
    raise exception 'Surat tidak ditemukan atau sudah selesai';
  end if;

  if p_sig_id is not null then
    select *
    into v_signature
    from public.surat_signatures
    where id = p_sig_id
      and surat_id = p_surat_id;

    if not found then
      raise exception 'Tahap persetujuan tidak ditemukan';
    end if;

    if v_signature.user_id <> v_actor and not exists (
      select 1
      from jsonb_array_elements(coalesce(v_signature.verifier_snapshot, '[]'::jsonb)) verifier
      where verifier->>'user_id' = v_actor::text
    ) and not exists (
      select 1 from public.profiles p
      where p.id = v_actor and p.role::text in ('admin', 'super_admin')
    ) then
      raise exception 'Anda tidak berwenang mengembalikan proses ini';
    end if;
  elsif v_surat.created_by <> v_actor then
    raise exception 'Hanya pemohon yang dapat menarik pengajuan ini';
  end if;

  if v_target_type not in ('requester', 'checker', 'signer', 'recommendation') then
    raise exception 'Tujuan perbaikan tidak valid';
  end if;

  if v_target_type = 'requester' then
    v_target_ids := array[v_surat.created_by];
  elsif v_target_type = 'checker' then
    select array_agg(distinct (verifier->>'user_id')::uuid)
    into v_target_ids
    from public.surat_signatures ss,
    lateral jsonb_array_elements(coalesce(ss.verifier_snapshot, '[]'::jsonb)) verifier
    where ss.surat_id = p_surat_id
      and ss.step_order = coalesce(p_target_step, v_surat.current_step)
      and verifier->>'user_id' is not null;
  elsif v_target_type = 'signer' then
    select array_agg(distinct ss.user_id)
    into v_target_ids
    from public.surat_signatures ss
    where ss.surat_id = p_surat_id
      and ss.step_order = coalesce(p_target_step, greatest(v_surat.current_step - 1, 1))
      and ss.user_id is not null;
  elsif v_target_type = 'recommendation' then
    select array_agg(distinct coalesce(srt.claimed_by, (candidate->>'user_id')::uuid))
    into v_target_ids
    from public.surat_recommendation_tasks srt
    left join lateral jsonb_array_elements(coalesce(srt.candidate_snapshot, '[]'::jsonb)) candidate on true
    where srt.parent_surat_id = p_surat_id
      and coalesce(srt.claimed_by::text, candidate->>'user_id') is not null;
  end if;

  v_target_ids := coalesce(v_target_ids, '{}');
  if cardinality(v_target_ids) = 0 then
    raise exception 'Tujuan perbaikan belum memiliki user aktif';
  end if;

  if v_target_type = 'checker' and not (v_changes ? 'checker_input_snapshot') then
    v_form_input := coalesce(v_surat.form_input_data, '{}'::jsonb);
    v_checker_input := coalesce(v_surat.data_snapshot->'verification_inputs'->'latest', '{}'::jsonb);
    if jsonb_typeof(v_checker_input) <> 'object' then
      v_checker_input := '{}'::jsonb;
    end if;

    if jsonb_typeof(v_form_input->'allocated_units') = 'array' and jsonb_array_length(v_form_input->'allocated_units') > 0 then
      v_checker_input := v_form_input;
    end if;

    if jsonb_typeof(v_checker_input->'allocated_units') = 'array' and jsonb_array_length(v_checker_input->'allocated_units') > 0 then
      v_changes := v_changes || jsonb_build_object('checker_input_snapshot', v_checker_input);
    end if;
  end if;

  update public.surat_revision_events
  set status = 'resolved',
      resolved_at = now(),
      resolved_by = v_actor
  where surat_id = p_surat_id
    and status in ('open', 'awaiting_requester');

  insert into public.surat_revision_events (
    surat_id,
    signature_id,
    actor_id,
    target_type,
    target_user_ids,
    from_step,
    target_step,
    reason,
    changes
  )
  values (
    p_surat_id,
    p_sig_id,
    v_actor,
    v_target_type,
    v_target_ids,
    v_surat.current_step,
    p_target_step,
    v_reason,
    v_changes
  )
  returning id into v_event_id;

  update public.surat_registrasi
  set status = 'MENUNGGU_PERBAIKAN',
      data_snapshot = jsonb_set(
        coalesce(data_snapshot, '{}'::jsonb),
        '{revision}',
        jsonb_build_object(
          'event_id', v_event_id,
          'target_type', v_target_type,
          'target_user_ids', v_target_ids,
          'from_step', v_surat.current_step,
          'target_step', p_target_step,
          'reason', v_reason,
          'changes', v_changes,
          'requires_requester_acceptance', true,
          'created_at', now()
        ),
        true
      ),
      updated_at = now()
  where id = p_surat_id;

  insert into public.notifications (user_id, type, title, message, data, link)
  select
    target_id,
    'warning',
    'Pengajuan Menunggu Perbaikan',
    'Pengajuan "' || coalesce(v_surat.judul_surat, '') || '" membutuhkan perbaikan. Catatan: ' || v_reason,
    jsonb_build_object(
      'surat_id', p_surat_id,
      'signature_id', p_sig_id,
      'revision_event_id', v_event_id,
      'event_type', 'revision_requested'
    ),
    case
      when v_target_type in ('checker', 'signer') then '/surat/inbox'
      when v_target_type = 'recommendation' then '/surat/rekomendasi'
      else '/surat/monitoring'
    end
  from unnest(v_target_ids) as target_id;

  return v_event_id;
end;
$$;

revoke all on function public.request_surat_process_revision(uuid, uuid, text, integer, text, jsonb) from public, anon;
grant execute on function public.request_surat_process_revision(uuid, uuid, text, integer, text, jsonb) to authenticated, service_role;
