create or replace function public.accept_surat_process_revision(
  p_event_id uuid,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_event public.surat_revision_events%rowtype;
  v_surat public.surat_registrasi%rowtype;
  v_creator uuid;
  v_restart_step integer;
  v_form_input jsonb;
  v_snapshot jsonb;
  v_items jsonb;
  v_change jsonb;
  v_item jsonb;
  v_index integer;
  v_action text;
  v_approved text;
  v_requested text;
  v_item_name text;
  v_unit_approved text;
  v_next_title text;
  v_applied_revision jsonb;
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi';
  end if;

  select *
  into v_event
  from public.surat_revision_events
  where id = p_event_id
    and status in ('open', 'awaiting_requester')
  for update;

  if not found then
    raise exception 'Riwayat perbaikan tidak tersedia';
  end if;

  select *
  into v_surat
  from public.surat_registrasi
  where id = v_event.surat_id
  for update;

  if not found then
    raise exception 'Surat tidak ditemukan';
  end if;

  v_creator := v_surat.created_by;

  if v_actor <> v_creator and not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role::text in ('admin', 'super_admin')
  ) then
    raise exception 'Hanya pemohon yang dapat menyetujui kelanjutan setelah perbaikan';
  end if;

  v_restart_step := greatest(
    1,
    coalesce(
      nullif(v_event.changes->>'restart_step', '')::integer,
      case when v_event.target_type = 'signer' then v_event.target_step else v_event.from_step end,
      v_event.from_step,
      1
    )
  );

  v_form_input := coalesce(v_surat.form_input_data, '{}'::jsonb);
  v_snapshot := coalesce(v_surat.data_snapshot, '{}'::jsonb);
  v_items := case
    when jsonb_typeof(v_form_input->'items') = 'array' then v_form_input->'items'
    else '[]'::jsonb
  end;
  v_next_title := v_surat.judul_surat;

  if jsonb_typeof(v_event.changes->'item_revisions') = 'array' then
    for v_change in
      select value from jsonb_array_elements(v_event.changes->'item_revisions')
    loop
      v_index := nullif(v_change->>'index', '')::integer;
      v_action := coalesce(nullif(v_change->>'action', ''), 'keep');
      v_approved := nullif(trim(coalesce(v_change->>'nilai_disetujui', '')), '');
      v_requested := nullif(trim(coalesce(v_change->>'nilai_diajukan', '')), '');

      if v_index is null or v_index < 0 or v_index >= jsonb_array_length(v_items) then
        continue;
      end if;

      v_item := coalesce(v_items->v_index, '{}'::jsonb);

      if v_action = 'adjust' and v_approved is not null then
        v_item := v_item || jsonb_build_object(
          'jumlah', v_approved,
          'nilai_diajukan', v_requested,
          'nilai_disetujui', v_approved,
          'revision_action', v_action,
          'revision_reason', nullif(trim(coalesce(v_change->>'alasan', v_change->>'reason', '')), '')
        );

        v_item_name := coalesce(v_item->>'nama_barang', v_item->>'nama', v_item->>'barang', v_item->>'name', '');
        if v_item_name <> '' then
          v_item_name := regexp_replace(v_item_name, '([0-9]+)\s*Unit', v_approved || ' Unit', 'i');
          v_item := jsonb_set(v_item, '{nama_barang}', to_jsonb(v_item_name), true);
          v_item := jsonb_set(v_item, '{nama}', to_jsonb(v_item_name), true);
          v_item := jsonb_set(v_item, '{barang}', to_jsonb(v_item_name), true);
          v_item := jsonb_set(v_item, '{name}', to_jsonb(v_item_name), true);
        end if;

        if lower(coalesce(v_form_input->>'request_mode', '')) = 'unit'
          or lower(coalesce(v_form_input->>'request_category', '')) = 'unit' then
          v_unit_approved := v_approved;
          v_form_input := jsonb_set(v_form_input, '{requested_unit_count}', to_jsonb(v_approved), true);
          if v_form_input ? 'unit_request_sentence' then
            v_form_input := jsonb_set(
              v_form_input,
              '{unit_request_sentence}',
              to_jsonb(regexp_replace(coalesce(v_form_input->>'unit_request_sentence', ''), '([0-9]+)\s*Unit', v_approved || ' Unit', 'i')),
              true
            );
          end if;
        end if;
      elsif v_action = 'reject' then
        v_item := v_item || jsonb_build_object(
          'revision_action', v_action,
          'revision_reason', nullif(trim(coalesce(v_change->>'alasan', v_change->>'reason', '')), ''),
          'is_rejected', true
        );
      end if;

      v_items := jsonb_set(v_items, array[v_index::text], v_item, true);
    end loop;

    v_form_input := jsonb_set(v_form_input, '{items}', v_items, true);
  end if;

  if v_unit_approved is not null then
    v_next_title := regexp_replace(coalesce(v_next_title, ''), '([0-9]+)\s*Unit', v_unit_approved || ' Unit', 'i');
  end if;

  v_applied_revision := jsonb_build_object(
    'event_id', v_event.id,
    'target_type', v_event.target_type,
    'target_user_ids', v_event.target_user_ids,
    'from_step', v_event.from_step,
    'target_step', v_event.target_step,
    'reason', v_event.reason,
    'changes', coalesce(v_event.changes, '{}'::jsonb) || jsonb_build_object(
      'requester_acceptance_note', nullif(trim(coalesce(p_note, '')), ''),
      'accepted_at', now(),
      'restart_step', v_restart_step
    ),
    'accepted_at', now(),
    'accepted_by', v_actor,
    'restart_step', v_restart_step
  );

  update public.surat_revision_events
  set status = 'resolved',
      resolved_at = now(),
      resolved_by = v_actor,
      changes = coalesce(changes, '{}'::jsonb) || jsonb_build_object(
        'requester_acceptance_note', nullif(trim(coalesce(p_note, '')), ''),
        'accepted_at', now(),
        'restart_step', v_restart_step
      )
  where id = p_event_id;

  update public.surat_signatures
  set is_signed = false,
      signed_at = null,
      catatan = null,
      file_path_snap = null,
      pdf_path_snap = null,
      status = 'PENDING',
      available_at = case when step_order = v_restart_step then now() else null end
  where surat_id = v_event.surat_id
    and step_order >= v_restart_step;

  delete from public.document_pdf_jobs
  where surat_id = v_event.surat_id;

  update public.surat_registrasi
  set status = 'PROSES',
      current_step = v_restart_step,
      judul_surat = v_next_title,
      form_input_data = v_form_input,
      pdf_path = null,
      data_snapshot = jsonb_set(
        jsonb_set(v_snapshot - 'revision', '{input}', v_form_input, true),
        '{applied_revision}',
        v_applied_revision,
        true
      ),
      updated_at = now()
  where id = v_event.surat_id;

  insert into public.notifications (user_id, type, title, message, data, link)
  select
    ss.user_id,
    'info',
    'Pengajuan Dilanjutkan Setelah Perbaikan',
    'Pemohon menyetujui perbaikan untuk "' || coalesce(sr.judul_surat, '') || '". Mohon tinjau ulang tahap Anda.',
    jsonb_build_object('surat_id', sr.id, 'revision_event_id', v_event.id, 'event_type', 'revision_accepted'),
    '/surat/inbox'
  from public.surat_registrasi sr
  join public.surat_signatures ss on ss.surat_id = sr.id and ss.step_order = v_restart_step
  where sr.id = v_event.surat_id
    and ss.user_id is not null;

  return true;
end;
$$;

revoke all on function public.accept_surat_process_revision(uuid, text) from public, anon;
grant execute on function public.accept_surat_process_revision(uuid, text) to authenticated, service_role;

-- Normalize already accepted revision data for the active test document if it exists.
update public.surat_registrasi sr
set form_input_data = jsonb_set(
      jsonb_set(
        jsonb_set(coalesce(sr.form_input_data, '{}'::jsonb), '{items,0,nama}', to_jsonb(coalesce(sr.form_input_data->'items'->0->>'nama_barang', sr.form_input_data->'items'->0->>'nama', sr.form_input_data->'items'->0->>'barang', '')), true),
        '{items,0,barang}',
        to_jsonb(coalesce(sr.form_input_data->'items'->0->>'nama_barang', sr.form_input_data->'items'->0->>'nama', sr.form_input_data->'items'->0->>'barang', '')),
        true
      ),
      '{items,0,name}',
      to_jsonb(coalesce(sr.form_input_data->'items'->0->>'nama_barang', sr.form_input_data->'items'->0->>'nama', sr.form_input_data->'items'->0->>'barang', '')),
      true
    ),
    data_snapshot = jsonb_set(
      coalesce(sr.data_snapshot, '{}'::jsonb),
      '{input}',
      jsonb_set(
        jsonb_set(
          jsonb_set(coalesce(sr.form_input_data, '{}'::jsonb), '{items,0,nama}', to_jsonb(coalesce(sr.form_input_data->'items'->0->>'nama_barang', sr.form_input_data->'items'->0->>'nama', sr.form_input_data->'items'->0->>'barang', '')), true),
          '{items,0,barang}',
          to_jsonb(coalesce(sr.form_input_data->'items'->0->>'nama_barang', sr.form_input_data->'items'->0->>'nama', sr.form_input_data->'items'->0->>'barang', '')),
          true
        ),
        '{items,0,name}',
        to_jsonb(coalesce(sr.form_input_data->'items'->0->>'nama_barang', sr.form_input_data->'items'->0->>'nama', sr.form_input_data->'items'->0->>'barang', '')),
        true
      ),
      true
    )
where sr.id = '774ba66e-0764-4849-99e2-aaf792ff58d3'::uuid
  and jsonb_typeof(sr.form_input_data->'items') = 'array'
  and jsonb_array_length(sr.form_input_data->'items') > 0;
