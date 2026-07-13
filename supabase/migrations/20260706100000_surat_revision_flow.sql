create table if not exists public.surat_revision_events (
  id uuid primary key default gen_random_uuid(),
  surat_id uuid not null references public.surat_registrasi(id) on delete cascade,
  signature_id uuid references public.surat_signatures(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  target_type text not null default 'requester'
    check (target_type in ('requester', 'checker', 'signer', 'recommendation')),
  target_user_ids uuid[] not null default '{}',
  from_step integer,
  target_step integer,
  reason text not null,
  changes jsonb not null default '{}'::jsonb,
  status text not null default 'open'
    check (status in ('open', 'resolved', 'cancelled')),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.surat_revision_events enable row level security;

drop policy if exists "surat_revision_events_participants_select" on public.surat_revision_events;
create policy "surat_revision_events_participants_select"
on public.surat_revision_events
for select
to authenticated
using (
  actor_id = auth.uid()
  or auth.uid() = any(target_user_ids)
  or exists (
    select 1
    from public.surat_registrasi sr
    where sr.id = surat_revision_events.surat_id
      and sr.created_by = auth.uid()
  )
  or exists (
    select 1
    from public.surat_signatures ss
    where ss.surat_id = surat_revision_events.surat_id
      and (
        ss.user_id = auth.uid()
        or exists (
          select 1
          from jsonb_array_elements(coalesce(ss.verifier_snapshot, '[]'::jsonb)) verifier
          where verifier->>'user_id' = auth.uid()::text
        )
      )
  )
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role::text in ('admin', 'super_admin')
  )
);

create index if not exists surat_revision_events_surat_created_idx
on public.surat_revision_events (surat_id, created_at desc);

create index if not exists surat_revision_events_target_open_idx
on public.surat_revision_events (status, target_type, created_at desc)
where status = 'open';

create or replace function public.get_surat_revision_history(p_surat_id uuid)
returns table (
  id uuid,
  surat_id uuid,
  signature_id uuid,
  actor_id uuid,
  actor_name text,
  target_type text,
  target_user_ids uuid[],
  from_step integer,
  target_step integer,
  reason text,
  changes jsonb,
  status text,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    e.id,
    e.surat_id,
    e.signature_id,
    e.actor_id,
    p.full_name as actor_name,
    e.target_type,
    e.target_user_ids,
    e.from_step,
    e.target_step,
    e.reason,
    e.changes,
    e.status,
    e.resolved_at,
    e.resolved_by,
    e.created_at
  from public.surat_revision_events e
  left join public.profiles p on p.id = e.actor_id
  where e.surat_id = p_surat_id
    and (
      e.actor_id = auth.uid()
      or auth.uid() = any(e.target_user_ids)
      or exists (
        select 1
        from public.surat_registrasi sr
        where sr.id = e.surat_id
          and sr.created_by = auth.uid()
      )
      or exists (
        select 1
        from public.surat_signatures ss
        where ss.surat_id = e.surat_id
          and (
            ss.user_id = auth.uid()
            or exists (
              select 1
              from jsonb_array_elements(coalesce(ss.verifier_snapshot, '[]'::jsonb)) verifier
              where verifier->>'user_id' = auth.uid()::text
            )
          )
      )
      or exists (
        select 1 from public.profiles pr
        where pr.id = auth.uid()
          and pr.role::text in ('admin', 'super_admin')
      )
    )
  order by e.created_at desc;
$$;

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
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi';
  end if;

  if v_reason is null or length(v_reason) < 5 then
    raise exception 'Alasan perbaikan minimal 5 karakter';
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
    and status = 'open';

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
    coalesce(p_changes, '{}'::jsonb)
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
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi';
  end if;

  select *
  into v_event
  from public.surat_revision_events
  where id = p_event_id
    and status = 'open'
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

  update public.surat_revision_events
  set status = 'resolved',
      resolved_at = now(),
      resolved_by = v_actor,
      changes = coalesce(changes, '{}'::jsonb) || jsonb_build_object(
        'resolution_note', nullif(trim(coalesce(p_note, '')), '')
      )
  where id = p_event_id;

  update public.surat_registrasi
  set status = 'PROSES',
      data_snapshot = coalesce(data_snapshot, '{}'::jsonb) - 'revision',
      updated_at = now()
  where id = v_event.surat_id
    and status = 'MENUNGGU_PERBAIKAN';

  insert into public.notifications (user_id, type, title, message, data, link)
  select
    sr.created_by,
    'info',
    'Perbaikan Pengajuan Selesai',
    'Perbaikan untuk "' || coalesce(sr.judul_surat, '') || '" sudah diselesaikan dan proses berlanjut.',
    jsonb_build_object(
      'surat_id', sr.id,
      'revision_event_id', v_event.id,
      'event_type', 'revision_resolved'
    ),
    '/surat/monitoring'
  from public.surat_registrasi sr
  where sr.id = v_event.surat_id
    and sr.created_by is not null;

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
    and status = 'open'
  for update;

  if not found then
    raise exception 'Riwayat perbaikan tidak tersedia';
  end if;

  if not exists (
    select 1
    from public.surat_registrasi sr
    where sr.id = v_event.surat_id
      and sr.created_by = v_actor
  ) then
    raise exception 'Hanya pemohon yang dapat membatalkan pengajuan setelah revisi';
  end if;

  update public.surat_revision_events
  set status = 'cancelled',
      resolved_at = now(),
      resolved_by = v_actor,
      changes = coalesce(changes, '{}'::jsonb) || jsonb_build_object('cancel_note', v_note)
  where id = p_event_id;

  update public.surat_registrasi
  set status = 'REJECTED',
      data_snapshot = jsonb_set(
        coalesce(data_snapshot, '{}'::jsonb),
        '{revision_cancelled}',
        jsonb_build_object('event_id', p_event_id, 'note', v_note, 'cancelled_at', now()),
        true
      ),
      updated_at = now()
  where id = v_event.surat_id;

  return true;
end;
$$;

revoke all on function public.get_surat_revision_history(uuid) from public, anon;
revoke all on function public.request_surat_process_revision(uuid, uuid, text, integer, text, jsonb) from public, anon;
revoke all on function public.resolve_surat_process_revision(uuid, text) from public, anon;
revoke all on function public.cancel_surat_after_revision(uuid, text) from public, anon;

grant execute on function public.get_surat_revision_history(uuid) to authenticated, service_role;
grant execute on function public.request_surat_process_revision(uuid, uuid, text, integer, text, jsonb) to authenticated, service_role;
grant execute on function public.resolve_surat_process_revision(uuid, text) to authenticated, service_role;
grant execute on function public.cancel_surat_after_revision(uuid, text) to authenticated, service_role;

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

  update public.surat_revision_events
  set status = 'resolved',
      resolved_at = now(),
      resolved_by = v_actor,
      changes = coalesce(changes, '{}'::jsonb) || jsonb_build_object(
        'resolution_note', nullif(trim(coalesce(p_note, '')), '')
      )
  where surat_id = v_surat_id
    and status = 'open'
    and target_type = 'checker'
    and v_actor = any(target_user_ids);

  update public.surat_registrasi
  set status = 'PROSES',
      data_snapshot = coalesce(data_snapshot, '{}'::jsonb) - 'revision',
      updated_at = now()
  where id = v_surat_id;

  return true;
end;
$$;

revoke all on function public.verify_surat_signature(uuid, text) from public, anon;
grant execute on function public.verify_surat_signature(uuid, text) to authenticated, service_role;
