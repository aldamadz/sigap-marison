-- Unit revisions that change the requested quantity must return to the allocation
-- verifier before approvals restart. Keep the previous implementations as the
-- fallback for every other revision type.

alter function public.accept_surat_process_revision(uuid, text)
  rename to accept_surat_process_revision_pre_unit_reallocation;

revoke all on function public.accept_surat_process_revision_pre_unit_reallocation(uuid, text)
  from public, anon, authenticated;

create function public.accept_surat_process_revision(
  p_event_id uuid,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.surat_revision_events%rowtype;
  v_surat public.surat_registrasi%rowtype;
  v_allocation_signature public.surat_signatures%rowtype;
  v_checker_ids uuid[] := '{}';
  v_previously_signed_ids uuid[] := '{}';
  v_requested_count integer;
  v_allocated_count integer;
  v_changes jsonb;
begin
  select * into v_event
  from public.surat_revision_events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Riwayat perbaikan tidak tersedia';
  end if;

  select coalesce(array_agg(distinct user_id), '{}')
  into v_previously_signed_ids
  from public.surat_signatures
  where surat_id = v_event.surat_id
    and is_signed is true
    and user_id is not null;

  if not public.accept_surat_process_revision_pre_unit_reallocation(p_event_id, p_note) then
    return false;
  end if;

  select * into v_surat
  from public.surat_registrasi
  where id = v_event.surat_id
  for update;

  if lower(coalesce(v_surat.form_input_data->>'request_mode', v_surat.form_input_data->>'request_category', '')) <> 'unit' then
    return true;
  end if;

  v_requested_count := nullif(regexp_replace(coalesce(v_surat.form_input_data->>'requested_unit_count', ''), '[^0-9]', '', 'g'), '')::integer;
  v_allocated_count := case
    when jsonb_typeof(v_surat.form_input_data->'allocated_units') = 'array'
      then jsonb_array_length(v_surat.form_input_data->'allocated_units')
    else coalesce(nullif(regexp_replace(coalesce(v_surat.form_input_data->>'allocated_unit_count', ''), '[^0-9]', '', 'g'), '')::integer, 0)
  end;

  if v_requested_count is null or v_requested_count < 1 or v_requested_count = v_allocated_count then
    return true;
  end if;

  select * into v_allocation_signature
  from public.surat_signatures
  where surat_id = v_event.surat_id
    and (requires_unit_allocation is true or action_type = 'unit_allocation')
  order by step_order, id
  limit 1
  for update;

  if not found then
    raise exception 'Tahap alokasi unit tidak ditemukan';
  end if;

  select coalesce(array_agg(distinct (verifier->>'user_id')::uuid), '{}')
  into v_checker_ids
  from jsonb_array_elements(coalesce(v_allocation_signature.verifier_snapshot, '[]'::jsonb)) verifier
  where coalesce(verifier->>'user_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

  if cardinality(v_checker_ids) = 0 then
    raise exception 'Tim pemeriksa alokasi unit belum dikonfigurasi';
  end if;

  v_changes := coalesce(v_event.changes, '{}'::jsonb) || jsonb_build_object(
    'requester_acceptance_note', nullif(trim(coalesce(p_note, '')), ''),
    'requester_accepted_at', clock_timestamp(),
    'restart_after_checker', true,
    'allocation_signature_id', v_allocation_signature.id,
    'previously_signed_user_ids', to_jsonb(v_previously_signed_ids),
    'requested_unit_count', v_requested_count,
    'stale_allocated_unit_count', v_allocated_count
  );

  update public.surat_revision_events
  set status = 'open',
      target_type = 'checker',
      target_user_ids = v_checker_ids,
      target_step = v_allocation_signature.step_order,
      resolved_at = null,
      resolved_by = null,
      changes = v_changes
  where id = p_event_id;

  update public.surat_signatures
  set verification_status = 'pending',
      verified_at = null,
      verified_by = null,
      verification_note = null,
      available_at = clock_timestamp()
  where id = v_allocation_signature.id;

  update public.surat_registrasi
  set status = 'MENUNGGU_PERBAIKAN',
      current_step = v_allocation_signature.step_order,
      data_snapshot = jsonb_set(
        coalesce(data_snapshot, '{}'::jsonb) - 'applied_revision',
        '{revision}',
        jsonb_build_object(
          'event_id', p_event_id,
          'target_type', 'checker',
          'target_user_ids', v_checker_ids,
          'from_step', v_event.from_step,
          'target_step', v_allocation_signature.step_order,
          'reason', v_event.reason,
          'changes', v_changes,
          'requester_accepted_at', clock_timestamp(),
          'created_at', v_event.created_at
        ),
        true
      ),
      updated_at = clock_timestamp()
  where id = v_event.surat_id;

  delete from public.notifications
  where data->>'revision_event_id' = p_event_id::text
    and data->>'event_type' = 'revision_accepted';

  insert into public.notifications (user_id, type, title, message, data, link)
  select checker_id, 'warning', 'Alokasi Unit Perlu Disesuaikan',
         'Jumlah pengajuan berubah menjadi ' || v_requested_count || ' unit. Sesuaikan alokasi dari ' || v_allocated_count || ' menjadi ' || v_requested_count || ' unit sebelum approval dilanjutkan.',
         jsonb_build_object('surat_id', v_event.surat_id, 'revision_event_id', p_event_id, 'event_type', 'unit_reallocation_required'),
         '/surat/inbox'
  from unnest(v_checker_ids) checker_id;

  insert into public.notifications (user_id, type, title, message, data, link)
  select signer_id, 'info', 'Data Pengajuan Unit Berubah',
         'Pemohon menyetujui perubahan jumlah unit. Alokasi sedang diperbaiki dan approval akan dimulai ulang setelah data menjadi konsisten.',
         jsonb_build_object('surat_id', v_event.surat_id, 'revision_event_id', p_event_id, 'event_type', 'unit_revision_invalidated_signature'),
         '/surat/monitoring'
  from unnest(v_previously_signed_ids) signer_id
  where not signer_id = any(v_checker_ids);

  return true;
end;
$$;

revoke all on function public.accept_surat_process_revision(uuid, text) from public, anon;
grant execute on function public.accept_surat_process_revision(uuid, text) to authenticated, service_role;

alter function public.resolve_surat_process_revision(uuid, text)
  rename to resolve_surat_process_revision_pre_unit_reallocation;

revoke all on function public.resolve_surat_process_revision_pre_unit_reallocation(uuid, text)
  from public, anon, authenticated;

create function public.resolve_surat_process_revision(
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
  v_allocation_signature_id uuid;
  v_requested_count integer;
  v_allocated_count integer;
  v_restart_step integer;
begin
  select * into v_event
  from public.surat_revision_events
  where id = p_event_id
  for update;

  if not found or coalesce((v_event.changes->>'restart_after_checker')::boolean, false) is not true then
    return public.resolve_surat_process_revision_pre_unit_reallocation(p_event_id, p_note);
  end if;

  if v_actor is null then
    raise exception 'Tidak terautentikasi';
  end if;

  if v_event.status <> 'open' or v_event.target_type <> 'checker' then
    raise exception 'Riwayat perbaikan alokasi unit tidak tersedia';
  end if;

  if not (v_actor = any(v_event.target_user_ids)) and not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.is_active is true and p.role::text in ('admin', 'super_admin')
  ) then
    raise exception 'Anda tidak berwenang menyelesaikan alokasi unit ini';
  end if;

  select * into v_surat
  from public.surat_registrasi
  where id = v_event.surat_id
  for update;

  if not found or v_surat.status <> 'MENUNGGU_PERBAIKAN' then
    raise exception 'Pengajuan tidak sedang menunggu perbaikan alokasi';
  end if;

  v_allocation_signature_id := nullif(v_event.changes->>'allocation_signature_id', '')::uuid;
  if not exists (
    select 1 from public.surat_signatures ss
    where ss.id = v_allocation_signature_id
      and ss.surat_id = v_event.surat_id
      and ss.verification_status = 'verified'
      and (ss.requires_unit_allocation is true or ss.action_type = 'unit_allocation')
  ) then
    raise exception 'Alokasi unit terbaru belum diverifikasi';
  end if;

  v_requested_count := nullif(regexp_replace(coalesce(v_surat.form_input_data->>'requested_unit_count', ''), '[^0-9]', '', 'g'), '')::integer;
  v_allocated_count := case
    when jsonb_typeof(v_surat.form_input_data->'allocated_units') = 'array'
      then jsonb_array_length(v_surat.form_input_data->'allocated_units')
    else coalesce(nullif(regexp_replace(coalesce(v_surat.form_input_data->>'allocated_unit_count', ''), '[^0-9]', '', 'g'), '')::integer, 0)
  end;

  if v_requested_count is null or v_requested_count < 1 or v_allocated_count <> v_requested_count then
    raise exception 'Jumlah alokasi unit harus sama dengan jumlah yang diajukan (% dari %)', v_allocated_count, v_requested_count;
  end if;

  select min(step_order) into v_restart_step
  from public.surat_signatures
  where surat_id = v_event.surat_id;

  if v_restart_step is null then
    raise exception 'Tahap persetujuan tidak ditemukan';
  end if;

  update public.surat_revision_events
  set status = 'resolved',
      resolved_at = clock_timestamp(),
      resolved_by = v_actor,
      changes = coalesce(changes, '{}'::jsonb) || jsonb_build_object(
        'checker_resolution_note', nullif(trim(coalesce(p_note, '')), ''),
        'checker_resolved_at', clock_timestamp(),
        'restart_step', v_restart_step,
        'allocated_unit_count', v_allocated_count
      )
  where id = p_event_id;

  update public.surat_signatures
  set is_signed = false,
      signed_at = null,
      catatan = null,
      file_path_snap = null,
      pdf_path_snap = null,
      status = 'PENDING',
      available_at = case when step_order = v_restart_step then clock_timestamp() else null end,
      verification_status = case
        when id = v_allocation_signature_id then 'verified'
        when verification_required is true then 'pending'
        else 'not_required'
      end,
      verified_at = case when id = v_allocation_signature_id then verified_at else null end,
      verified_by = case when id = v_allocation_signature_id then verified_by else null end,
      verification_note = case when id = v_allocation_signature_id then verification_note else null end
  where surat_id = v_event.surat_id;

  delete from public.document_pdf_jobs where surat_id = v_event.surat_id;

  update public.surat_registrasi
  set status = 'PROSES',
      current_step = v_restart_step,
      pdf_path = null,
      data_snapshot = jsonb_set(
        coalesce(data_snapshot, '{}'::jsonb) - 'revision',
        '{applied_revision}',
        jsonb_build_object(
          'event_id', p_event_id,
          'target_type', 'checker',
          'accepted_by_requester', true,
          'checker_resolved_at', clock_timestamp(),
          'checker_resolved_by', v_actor,
          'restart_step', v_restart_step,
          'requested_unit_count', v_requested_count,
          'allocated_unit_count', v_allocated_count
        ),
        true
      ),
      updated_at = clock_timestamp()
  where id = v_event.surat_id;

  insert into public.notifications (user_id, type, title, message, data, link)
  select distinct ss.user_id, 'info', 'Approval Pengajuan Unit Diulang',
         'Alokasi sudah disesuaikan menjadi ' || v_allocated_count || ' dari ' || v_requested_count || ' unit. Approval dimulai ulang agar seluruh penanda tangan memeriksa data terbaru.',
         jsonb_build_object('surat_id', v_event.surat_id, 'revision_event_id', p_event_id, 'event_type', 'unit_revision_approval_restarted', 'restart_step', v_restart_step),
         '/surat/inbox'
  from public.surat_signatures ss
  where ss.surat_id = v_event.surat_id
    and ss.user_id is not null;

  return true;
end;
$$;

revoke all on function public.resolve_surat_process_revision(uuid, text) from public, anon;
grant execute on function public.resolve_surat_process_revision(uuid, text) to authenticated, service_role;

create function public.reopen_unit_revision_checker_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
  end if;
  return new;
end;
$$;

drop trigger if exists reopen_unit_revision_checker_task_trg on public.surat_revision_events;
create trigger reopen_unit_revision_checker_task_trg
after insert or update of status, target_type, target_step on public.surat_revision_events
for each row execute function public.reopen_unit_revision_checker_task();

create function public.guard_unit_allocation_verification_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_input jsonb;
  v_requested integer;
  v_allocated integer;
begin
  if new.verification_status = 'verified'
     and old.verification_status is distinct from 'verified'
     and (new.requires_unit_allocation is true or new.action_type = 'unit_allocation') then
    select form_input_data into v_input
    from public.surat_registrasi
    where id = new.surat_id
    for share;

    v_requested := nullif(regexp_replace(coalesce(v_input->>'requested_unit_count', ''), '[^0-9]', '', 'g'), '')::integer;
    v_allocated := case
      when jsonb_typeof(v_input->'allocated_units') = 'array' then jsonb_array_length(v_input->'allocated_units')
      else coalesce(nullif(regexp_replace(coalesce(v_input->>'allocated_unit_count', ''), '[^0-9]', '', 'g'), '')::integer, 0)
    end;

    if v_requested is null or v_requested < 1 or v_allocated <> v_requested then
      raise exception 'Jumlah alokasi unit harus sama dengan jumlah yang diajukan (% dari %)', v_allocated, v_requested;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_unit_allocation_verification_count_trg on public.surat_signatures;
create trigger guard_unit_allocation_verification_count_trg
before update of verification_status on public.surat_signatures
for each row execute function public.guard_unit_allocation_verification_count();

create function public.guard_surat_finalization_completeness()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested integer;
  v_allocated integer;
begin
  if new.status = 'DONE' and old.status is distinct from 'DONE' then
    if exists (
      select 1 from public.surat_signatures ss
      where ss.surat_id = new.id and coalesce(ss.is_signed, false) is false
    ) then
      raise exception 'Dokumen belum dapat diselesaikan karena tanda tangan belum lengkap';
    end if;

    if lower(coalesce(new.form_input_data->>'request_mode', new.form_input_data->>'request_category', '')) = 'unit' then
      v_requested := nullif(regexp_replace(coalesce(new.form_input_data->>'requested_unit_count', ''), '[^0-9]', '', 'g'), '')::integer;
      v_allocated := case
        when jsonb_typeof(new.form_input_data->'allocated_units') = 'array' then jsonb_array_length(new.form_input_data->'allocated_units')
        else coalesce(nullif(regexp_replace(coalesce(new.form_input_data->>'allocated_unit_count', ''), '[^0-9]', '', 'g'), '')::integer, 0)
      end;
      if v_requested is null or v_requested < 1 or v_allocated <> v_requested then
        raise exception 'Dokumen unit belum dapat diselesaikan karena alokasi tidak sesuai (% dari %)', v_allocated, v_requested;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_surat_finalization_completeness_trg on public.surat_registrasi;
create trigger guard_surat_finalization_completeness_trg
before update of status on public.surat_registrasi
for each row execute function public.guard_surat_finalization_completeness();

-- Repair only open checker revisions. This restores the currently hidden task
-- without changing its revision event, allocation payload, or approval result.
update public.surat_signatures ss
set verification_status = 'pending',
    verified_at = null,
    verified_by = null,
    verification_note = null,
    available_at = clock_timestamp()
from public.surat_revision_events sre
where sre.surat_id = ss.surat_id
  and sre.status = 'open'
  and sre.target_type = 'checker'
  and sre.target_step = ss.step_order
  and ss.verification_required is true
  and ss.verification_status is distinct from 'pending';
