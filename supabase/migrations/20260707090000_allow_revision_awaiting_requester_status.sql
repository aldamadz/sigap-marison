alter table public.surat_revision_events
  drop constraint if exists surat_revision_events_status_check;

alter table public.surat_revision_events
  add constraint surat_revision_events_status_check
  check (status in ('open', 'awaiting_requester', 'resolved', 'cancelled'));

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
