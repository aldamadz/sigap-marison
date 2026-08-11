-- An open checker revision is authoritative. Keep the registration in the
-- revision state so the canonical compact inbox predicate can surface it.

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
  end if;
  return new;
end;
$$;

update public.surat_registrasi sr
set status = 'MENUNGGU_PERBAIKAN',
    current_step = sre.target_step,
    data_snapshot = jsonb_set(
      coalesce(sr.data_snapshot, '{}'::jsonb),
      '{revision}',
      coalesce(sr.data_snapshot->'revision', '{}'::jsonb) || jsonb_build_object(
        'event_id', sre.id,
        'target_type', 'checker',
        'target_user_ids', sre.target_user_ids,
        'from_step', sre.from_step,
        'target_step', sre.target_step,
        'reason', sre.reason,
        'changes', coalesce(sre.changes, '{}'::jsonb),
        'created_at', sre.created_at
      ),
      true
    ),
    updated_at = clock_timestamp()
from public.surat_revision_events sre
where sre.surat_id = sr.id
  and sre.status = 'open'
  and sre.target_type = 'checker'
  and sre.target_step is not null
  and (sr.status is distinct from 'MENUNGGU_PERBAIKAN' or sr.current_step is distinct from sre.target_step);

