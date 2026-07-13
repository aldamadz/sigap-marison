create or replace function public.resolve_surat_process_revision(
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
  v_creator uuid;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_has_meaningful_item_change boolean := false;
  v_next_step integer;
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

  if not (v_actor = any(v_event.target_user_ids)) and not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role::text in ('admin', 'super_admin')
  ) then
    raise exception 'Anda tidak berwenang menyelesaikan perbaikan ini';
  end if;

  select created_by
  into v_creator
  from public.surat_registrasi
  where id = v_event.surat_id;

  if v_creator is null then
    raise exception 'Pemohon pengajuan tidak ditemukan';
  end if;

  select exists (
    select 1
    from jsonb_array_elements(coalesce(v_event.changes->'item_revisions', '[]'::jsonb)) as item(row_value)
    where coalesce(item.row_value->>'action', 'keep') <> 'keep'
      or nullif(trim(coalesce(item.row_value->>'nilai_disetujui', '')), '') is distinct from nullif(trim(coalesce(item.row_value->>'nilai_diajukan', '')), '')
  )
  into v_has_meaningful_item_change;

  if v_event.target_type <> 'requester' and v_actor <> v_creator and not v_has_meaningful_item_change then
    v_next_step := greatest(1, coalesce(v_event.target_step, v_event.from_step, 1));

    update public.surat_revision_events
    set status = 'resolved',
        resolved_at = now(),
        resolved_by = v_actor,
        changes = coalesce(changes, '{}'::jsonb) || jsonb_build_object(
          'resolution_note', v_note,
          'resolved_by_worker', v_actor,
          'resolved_by_worker_at', now(),
          'requester_acceptance_skipped', true,
          'requester_acceptance_skip_reason', 'Tidak ada perubahan item/nilai yang perlu disetujui pemohon.'
        )
    where id = p_event_id;

    update public.surat_signatures
    set available_at = case when step_order = v_next_step then coalesce(available_at, now()) else available_at end
    where surat_id = v_event.surat_id;

    update public.surat_registrasi
    set status = 'PROSES',
        current_step = v_next_step,
        data_snapshot = jsonb_set(
          coalesce(data_snapshot, '{}'::jsonb) - 'revision',
          '{applied_revision}',
          jsonb_build_object(
            'event_id', v_event.id,
            'target_type', v_event.target_type,
            'target_user_ids', v_event.target_user_ids,
            'from_step', v_event.from_step,
            'target_step', v_event.target_step,
            'reason', v_event.reason,
            'changes', coalesce(v_event.changes, '{}'::jsonb) || jsonb_build_object(
              'resolution_note', v_note,
              'resolved_by_worker', v_actor,
              'resolved_by_worker_at', now(),
              'requester_acceptance_skipped', true,
              'requester_acceptance_skip_reason', 'Tidak ada perubahan item/nilai yang perlu disetujui pemohon.'
            ),
            'resolved_at', now(),
            'resolved_by', v_actor,
            'restart_step', v_next_step
          ),
          true
        ),
        updated_at = now()
    where id = v_event.surat_id;

    insert into public.notifications (user_id, type, title, message, data, link)
    select
      ss.user_id,
      'info',
      'Pengajuan Siap Ditandatangani',
      'Pemeriksaan untuk "' || coalesce(sr.judul_surat, '') || '" sudah selesai. Silakan lanjutkan persetujuan.',
      jsonb_build_object(
        'surat_id', sr.id,
        'signature_id', ss.id,
        'revision_event_id', v_event.id,
        'event_type', 'revision_checker_resolved_to_signer'
      ),
      '/surat/inbox?task=' || ss.id::text
    from public.surat_registrasi sr
    join public.surat_signatures ss on ss.surat_id = sr.id and ss.step_order = v_next_step
    where sr.id = v_event.surat_id
      and ss.user_id is not null;

    return true;
  end if;

  if v_event.target_type <> 'requester' and v_actor <> v_creator then
    update public.surat_revision_events
    set status = 'awaiting_requester',
        target_type = 'requester',
        target_user_ids = array[v_creator],
        changes = coalesce(changes, '{}'::jsonb) || jsonb_build_object(
          'resolution_note', v_note,
          'resolved_by_worker', v_actor,
          'resolved_by_worker_at', now()
        )
    where id = p_event_id;

    update public.surat_registrasi
    set data_snapshot = jsonb_set(
          coalesce(data_snapshot, '{}'::jsonb),
          '{revision}',
          jsonb_build_object(
            'event_id', v_event.id,
            'target_type', 'requester',
            'target_user_ids', array[v_creator],
            'from_step', v_event.from_step,
            'target_step', v_event.target_step,
            'reason', v_event.reason,
            'changes', coalesce(v_event.changes, '{}'::jsonb) || jsonb_build_object(
              'resolution_note', v_note,
              'resolved_by_worker', v_actor,
              'resolved_by_worker_at', now()
            ),
            'awaiting_requester_acceptance', true,
            'created_at', v_event.created_at
          ),
          true
        ),
        updated_at = now()
    where id = v_event.surat_id;

    insert into public.notifications (user_id, type, title, message, data, link)
    select
      v_creator,
      'warning',
      'Perubahan Pengajuan Perlu Persetujuan',
      'Perbaikan untuk "' || coalesce(sr.judul_surat, '') || '" sudah dikerjakan. Silakan lanjutkan atau batalkan pengajuan.',
      jsonb_build_object(
        'surat_id', sr.id,
        'revision_event_id', v_event.id,
        'event_type', 'revision_waiting_requester'
      ),
      '/surat/monitoring'
    from public.surat_registrasi sr
    where sr.id = v_event.surat_id;

    return true;
  end if;

  return public.accept_surat_process_revision(p_event_id, p_note);
end;
$$;

revoke all on function public.resolve_surat_process_revision(uuid, text) from public, anon;
grant execute on function public.resolve_surat_process_revision(uuid, text) to authenticated, service_role;
