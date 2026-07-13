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

  select created_by into v_creator
  from public.surat_registrasi
  where id = v_event.surat_id;

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
      jsonb_build_object('surat_id', sr.id, 'revision_event_id', v_event.id, 'event_type', 'revision_waiting_requester'),
      '/surat/monitoring'
    from public.surat_registrasi sr
    where sr.id = v_event.surat_id
      and v_creator is not null;

    return true;
  end if;

  return public.accept_surat_process_revision(p_event_id, p_note);
end;
$$;

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
  v_creator uuid;
  v_restart_step integer;
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

  select created_by into v_creator
  from public.surat_registrasi
  where id = v_event.surat_id;

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
      status = 'PENDING',
      available_at = case when step_order = v_restart_step then coalesce(available_at, now()) else null end
  where surat_id = v_event.surat_id
    and step_order >= v_restart_step;

  update public.surat_registrasi
  set status = 'PROSES',
      current_step = v_restart_step,
      data_snapshot = coalesce(data_snapshot, '{}'::jsonb) - 'revision',
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

create or replace function public.cancel_surat_after_revision(
  p_event_id uuid,
  p_note text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_event public.surat_revision_events%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi';
  end if;

  if v_note is null or length(v_note) < 5 then
    raise exception 'Alasan pembatalan minimal 5 karakter';
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

  if not exists (
    select 1
    from public.surat_registrasi sr
    where sr.id = v_event.surat_id
      and sr.created_by = v_actor
  ) and not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role::text in ('admin', 'super_admin')
  ) then
    raise exception 'Hanya pemohon yang dapat membatalkan pengajuan setelah revisi';
  end if;

  update public.surat_revision_events
  set status = 'cancelled',
      resolved_at = now(),
      resolved_by = v_actor,
      changes = coalesce(changes, '{}'::jsonb) || jsonb_build_object('cancel_note', v_note, 'cancelled_at', now())
  where id = p_event_id;

  update public.surat_registrasi
  set status = 'REJECTED',
      data_snapshot = jsonb_set(
        coalesce(data_snapshot, '{}'::jsonb),
        '{revision_cancelled}',
        jsonb_build_object('event_id', p_event_id, 'note', v_note, 'cancelled_at', now()),
        true
      ) - 'revision',
      updated_at = now()
  where id = v_event.surat_id;

  return true;
end;
$$;

create or replace function public.handle_approve_surat_v2(
  p_sig_id uuid,
  p_surat_id uuid,
  p_note text,
  p_file_path text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_current_step integer;
  v_signature_step integer;
  v_total_steps integer;
  v_created_by uuid;
  v_no_surat text;
  v_judul_surat text;
  v_is_done boolean := false;
  v_verification_required boolean := false;
  v_verification_status text := 'not_required';
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi';
  end if;

  select sr.current_step, sr.created_by, sr.no_surat, sr.judul_surat
  into v_current_step, v_created_by, v_no_surat, v_judul_surat
  from public.surat_registrasi sr
  where sr.id = p_surat_id
    and sr.status = 'PROSES'
  for update;

  if not found then
    raise exception 'Surat tidak ditemukan atau sudah selesai';
  end if;

  select ss.step_order, ss.verification_required, ss.verification_status
  into v_signature_step, v_verification_required, v_verification_status
  from public.surat_signatures ss
  where ss.id = p_sig_id
    and ss.surat_id = p_surat_id
    and ss.user_id = v_actor
    and ss.is_signed = false
  for update;

  if not found then
    raise exception 'Tanda tangan tidak tersedia untuk user ini';
  end if;

  if v_signature_step <> v_current_step then
    raise exception 'Tahap tanda tangan belum aktif atau sudah diproses';
  end if;

  if v_verification_required and v_verification_status <> 'verified' then
    raise exception 'Data pengajuan belum diperiksa tim pemeriksa';
  end if;

  update public.surat_signatures
  set is_signed = true,
      signed_at = now(),
      catatan = p_note,
      file_path_snap = p_file_path,
      status = 'APPROVED'
  where id = p_sig_id;

  select count(*)
  into v_total_steps
  from public.surat_signatures
  where surat_id = p_surat_id;

  if v_current_step >= v_total_steps then
    update public.surat_registrasi
    set file_path = p_file_path,
        status = 'DONE',
        updated_at = now()
    where id = p_surat_id;
    v_is_done := true;
  else
    update public.surat_registrasi
    set file_path = p_file_path,
        current_step = v_current_step + 1,
        updated_at = now()
    where id = p_surat_id;

    update public.surat_signatures
    set available_at = coalesce(available_at, now())
    where surat_id = p_surat_id
      and step_order = v_current_step + 1
      and is_signed = false;
  end if;

  if v_is_done and v_created_by is not null then
    insert into public.notifications (user_id, type, title, message, data, link)
    values (
      v_created_by,
      'success',
      'Dokumen Selesai Disetujui',
      'Dokumen "' || coalesce(v_judul_surat, '') || '" (' || coalesce(v_no_surat, '') || ') telah menyelesaikan seluruh tahap persetujuan.',
      jsonb_build_object(
        'surat_id', p_surat_id,
        'no_surat', v_no_surat,
        'judul', v_judul_surat,
        'file_path', p_file_path
      ),
      '/surat/monitoring'
    );
  end if;

  return json_build_object('success', true, 'isDone', v_is_done);
end;
$$;

revoke all on function public.accept_surat_process_revision(uuid, text) from public, anon;
grant execute on function public.accept_surat_process_revision(uuid, text) to authenticated, service_role;

grant execute on function public.request_surat_process_revision(uuid, uuid, text, integer, text, jsonb) to authenticated, service_role;
grant execute on function public.resolve_surat_process_revision(uuid, text) to authenticated, service_role;
grant execute on function public.cancel_surat_after_revision(uuid, text) to authenticated, service_role;
grant execute on function public.handle_approve_surat_v2(uuid, uuid, text, text) to authenticated, service_role;

create or replace function public.verify_surat_signature(
  p_sig_id uuid,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_surat_id uuid;
  v_revision_event_id uuid;
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi';
  end if;

  select ss.surat_id
  into v_surat_id
  from public.surat_signatures ss
  join public.surat_registrasi sr on sr.id = ss.surat_id
  where ss.id = p_sig_id
    and sr.status in ('PROSES', 'MENUNGGU_PERBAIKAN')
    and ss.step_order = sr.current_step
    and ss.is_signed = false
    and ss.verification_required = true
    and ss.verification_status <> 'verified'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(ss.verifier_snapshot, '[]'::jsonb)) verifier
      where verifier->>'user_id' = v_actor::text
    )
  for update of ss;

  if not found then
    raise exception 'Tugas pemeriksaan tidak tersedia untuk user ini';
  end if;

  update public.surat_signatures
  set verification_status = 'verified',
      verified_at = now(),
      verified_by = v_actor,
      verification_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_sig_id;

  select id
  into v_revision_event_id
  from public.surat_revision_events
  where surat_id = v_surat_id
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
    where id = v_surat_id;
  end if;

  return true;
end;
$$;

grant execute on function public.verify_surat_signature(uuid, text) to authenticated, service_role;
