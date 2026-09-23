-- Direct returns to a checker must inform people whose approval is already
-- recorded. Requester-accepted unit reallocations already send a more specific
-- notification in accept_surat_process_revision, so avoid duplicating those.

create or replace function public.reopen_unit_revision_checker_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision jsonb;
begin
  if new.status = 'open' and new.target_type = 'checker' and new.target_step is not null then
    update public.surat_signatures
    set verification_status = 'pending',
        verified_at = null,
        verified_by = null,
        verification_note = null,
        available_at = clock_timestamp()
    where surat_id = new.surat_id
      and step_order = new.target_step
      and verification_required is true;

    select coalesce(data_snapshot->'revision', '{}'::jsonb)
    into v_revision
    from public.surat_registrasi
    where id = new.surat_id
    for update;

    update public.surat_registrasi
    set status = 'MENUNGGU_PERBAIKAN',
        current_step = new.target_step,
        data_snapshot = jsonb_set(
          coalesce(data_snapshot, '{}'::jsonb),
          '{revision}',
          v_revision || jsonb_build_object(
            'event_id', new.id,
            'target_type', 'checker',
            'target_user_ids', new.target_user_ids,
            'from_step', new.from_step,
            'target_step', new.target_step,
            'reason', new.reason,
            'changes', coalesce(new.changes, '{}'::jsonb),
            'created_at', new.created_at
          ),
          true
        ),
        updated_at = clock_timestamp()
    where id = new.surat_id;

    if coalesce((new.changes->>'restart_after_checker')::boolean, false) is not true then
      insert into public.notifications (user_id, type, title, message, data, link)
      select distinct ss.user_id,
             'info',
             'Data Pengajuan Sedang Diperbaiki',
             'Pengajuan yang sudah Anda tandatangani dikembalikan ke tim pemeriksa. Anda akan mendapat tugas kembali jika tanda tangan perlu diulang.',
             jsonb_build_object(
               'surat_id', new.surat_id,
               'revision_event_id', new.id,
               'event_type', 'unit_revision_checker_reopened'
             ),
             '/surat/monitoring'
      from public.surat_signatures ss
      where ss.surat_id = new.surat_id
        and ss.is_signed is true
        and ss.user_id is not null
        and ss.user_id is distinct from new.actor_id
        and not (ss.user_id = any(new.target_user_ids))
        and not exists (
          select 1 from public.notifications n
          where n.user_id = ss.user_id
            and n.data->>'revision_event_id' = new.id::text
            and n.data->>'event_type' = 'unit_revision_checker_reopened'
        );
    end if;
  end if;
  return new;
end;
$$;

insert into public.notifications (user_id, type, title, message, data, link)
select distinct ss.user_id,
       'info',
       'Data Pengajuan Sedang Diperbaiki',
       'Pengajuan yang sudah Anda tandatangani dikembalikan ke tim pemeriksa. Anda akan mendapat tugas kembali jika tanda tangan perlu diulang.',
       jsonb_build_object(
         'surat_id', sre.surat_id,
         'revision_event_id', sre.id,
         'event_type', 'unit_revision_checker_reopened'
       ),
       '/surat/monitoring'
from public.surat_revision_events sre
join public.surat_signatures ss on ss.surat_id = sre.surat_id and ss.is_signed is true and ss.user_id is not null
where sre.status = 'open'
  and sre.target_type = 'checker'
  and coalesce((sre.changes->>'restart_after_checker')::boolean, false) is not true
  and ss.user_id is distinct from sre.actor_id
  and not (ss.user_id = any(sre.target_user_ids))
  and not exists (
    select 1 from public.notifications n
    where n.user_id = ss.user_id
      and n.data->>'revision_event_id' = sre.id::text
      and n.data->>'event_type' = 'unit_revision_checker_reopened'
  );
