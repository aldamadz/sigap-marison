-- Migration: 20260930150000_letter_number_reuse_policy.sql
-- Purpose: admin-configurable reuse window for letter numbers freed by
--          cancelled (voided) drafts, applied consistently to every numbering
--          scope (pusat, cabang, cabang_000 / branch_asset_000, and
--          branch_keu1_000).
--
-- Business rules (agreed):
--   * When a numbered draft is cancelled (void_surat_registration_draft), its
--     number may be taken again by a new submission during an admin-configured
--     window (positive value in hours or days).
--   * After the window passes without the number being reclaimed, the number is
--     VOID permanently and must never be reused.
--   * A number that was ever USED can never be reused.
--   * The original draft stays recorded as cancelled; re-use by another actor
--     keeps an audit trail (event log + reservation audit columns).
--   * Historic VOID reservations (pre-migration, reuse_until IS NULL) are never
--     resurrected.
--   * Counter-start changes must not clobber USED, PENDING, in-window, or VOID
--     numbers. Reclaim only selects VOID rows in window; PENDING and USED are
--     excluded; the "insert new" branch takes max+1.
--
-- Review hardening (PR #413):
--   * claim_reusable_letter_number is an INTERNAL function: server now() only
--     (no client timestamp), execute granted only to service_role, reached
--     exclusively through the scope-validating allocators.
--   * Reclaim atomically detaches any stale cancelled draft so the next owner
--     starts a fresh draft; create_surat_registration_draft is guarded so it
--     can never revive a VOID draft (fail closed).
--   * Cancel audit is preserved: voided_at/voided_by/reuse_until remain on the
--     reservation, and every cancel + reclaim is appended to
--     letter_number_reservation_events.
--   * Allocation/reclaim is serialized with pg_advisory_xact_lock per scope +
--     row lock, so two concurrent requests can never claim the same number.
--
-- Forward-only: CREATE OR REPLACE + new tables. No applied migration edited.

-- ──────────────────────────────────────────────────────────────────────
-- 1. Reuse policy (single active row)
-- ──────────────────────────────────────────────────────────────────────

create table if not exists public.letter_number_reuse_policies (
  id uuid primary key default gen_random_uuid(),
  unit text not null check (unit in ('hours', 'days')),
  value integer not null check (value > 0 and value <= 3650),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

-- Only one active policy may exist at a time.
create unique index if not exists letter_number_reuse_policies_one_active
  on public.letter_number_reuse_policies ((true)) where is_active;

create or replace function public.touch_letter_number_reuse_policy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  if tg_op = 'INSERT' then
    new.created_by = coalesce(new.created_by, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_touch_letter_number_reuse_policy on public.letter_number_reuse_policies;
create trigger trg_touch_letter_number_reuse_policy
before insert or update on public.letter_number_reuse_policies
for each row execute function public.touch_letter_number_reuse_policy();

alter table public.letter_number_reuse_policies enable row level security;

drop policy if exists "Admins can manage letter number reuse policy" on public.letter_number_reuse_policies;
create policy "Admins can manage letter number reuse policy"
on public.letter_number_reuse_policies
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'super_admin')
      and coalesce(p.is_active, true) = true
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'super_admin')
      and coalesce(p.is_active, true) = true
  )
);

-- Default: 1 day. Admin can change it on the configuration page.
insert into public.letter_number_reuse_policies (unit, value, notes)
select 'days', 1, 'Default: nomor draft dibatalkan dapat dipakai ulang selama 1 hari.'
where not exists (
  select 1 from public.letter_number_reuse_policies where is_active = true
);

-- The reuse window at the time the draft is voided. NULL means reuse is
-- disabled (the number becomes permanently VOID immediately). Internal use
-- only (called from definer functions); not granted to authenticated.
create or replace function public.get_letter_number_reuse_window()
returns interval
language sql
stable
security definer
set search_path = ''
as $$
  select make_interval(
    days  => case when p.unit = 'days'  then p.value else 0 end,
    hours => case when p.unit = 'hours' then p.value else 0 end
  )
  from public.letter_number_reuse_policies p
  where p.is_active
  order by p.created_at desc
  limit 1;
$$;

revoke all on function public.get_letter_number_reuse_window() from public, anon, authenticated;
grant execute on function public.get_letter_number_reuse_window() to service_role;

-- ──────────────────────────────────────────────────────────────────────
-- 2. Reservation audit columns + event log
-- ──────────────────────────────────────────────────────────────────────

alter table public.surat_reservations
  add column if not exists voided_at timestamptz;
alter table public.surat_reservations
  add column if not exists voided_by uuid references auth.users(id);
alter table public.surat_reservations
  add column if not exists reuse_until timestamptz;
alter table public.surat_reservations
  add column if not exists reused_count integer not null default 0 check (reused_count >= 0);
alter table public.surat_reservations
  add column if not exists last_reused_at timestamptz;

comment on column public.surat_reservations.voided_at is
  'Waktu pembatalan terakhir (riwayat lengkap di letter_number_reservation_events).';
comment on column public.surat_reservations.voided_by is
  'Akun yang membatalkan terakhir (riwayat lengkap di letter_number_reservation_events).';
comment on column public.surat_reservations.reuse_until is
  'Batas waktu nomor boleh dipakai ulang. NULL/lewat => nomor VOID permanen.';
comment on column public.surat_reservations.reused_count is
  'Berapa kali nomor yang pernah dibatalkan dipakai ulang.';
comment on column public.surat_reservations.last_reused_at is
  'Waktu terakhir nomor dipakai ulang.';

-- Event log: every cancel (void) and every reclaim, with actor + time, so the
-- history of who cancelled and who took the number is never lost.
create table if not exists public.letter_number_reservation_events (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.surat_reservations(id) on delete cascade,
  kind text not null check (kind in ('void', 'reclaimed')),
  actor_id uuid references auth.users(id),
  occurred_at timestamptz not null default now(),
  reuse_window interval,
  notes text
);

create index if not exists letter_number_reservation_events_reservation_idx
  on public.letter_number_reservation_events(reservation_id, occurred_at);

alter table public.letter_number_reservation_events enable row level security;

drop policy if exists "Admins can read reservation events" on public.letter_number_reservation_events;
create policy "Admins can read reservation events"
on public.letter_number_reservation_events
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'super_admin')
      and coalesce(p.is_active, true) = true
  )
);

create or replace function public.log_letter_number_reservation_event(
  p_reservation_id uuid,
  p_kind text,
  p_actor_id uuid,
  p_reuse_window interval default null,
  p_notes text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.letter_number_reservation_events
    (reservation_id, kind, actor_id, reuse_window, notes)
  values
    (p_reservation_id, p_kind, p_actor_id, p_reuse_window, p_notes);
$$;

revoke all on function public.log_letter_number_reservation_event(uuid, text, uuid, interval, text) from public, anon, authenticated;
grant execute on function public.log_letter_number_reservation_event(uuid, text, uuid, interval, text) to service_role;

-- ──────────────────────────────────────────────────────────────────────
-- 3. Reclaim helper (internal, atomic, per-scope locked, audit-preserving)
-- ──────────────────────────────────────────────────────────────────────

create or replace function public.claim_reusable_letter_number(
  p_entity_id         uuid,
  p_year              integer,
  p_number_scope_type text,
  p_office_id         uuid,
  p_project_id        uuid,
  p_dept_id           uuid,
  p_start_from        integer,
  p_type_id           uuid,
  p_reserved_by       uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_next  integer;
  v_row_id uuid;
  v_now timestamptz := now();
begin
  if v_actor is null or p_reserved_by is distinct from v_actor then
    raise exception 'Sesi penomoran tidak valid.' using errcode = '42501';
  end if;

  -- Serialize reclaims per scope so two concurrent requests can never claim
  -- the same number twice.
  perform pg_advisory_xact_lock(hashtext(
    'letter-number-reuse:' || p_entity_id::text || ':' || p_year::text
      || ':' || coalesce(p_number_scope_type, '')
      || ':' || coalesce(p_office_id::text, '-')
      || ':' || coalesce(p_project_id::text, '-')
      || ':' || coalesce(p_dept_id::text, '-')
  ));

  -- Only VOID rows voided with a reuse window still open are eligible. The
  -- cutoff is server now(); there is no client-supplied timestamp to bypass.
  -- Historic VOID rows (reuse_until IS NULL) and expired rows are skipped.
  -- USED rows are never touched.
  select r.id, r.no_urut
  into v_row_id, v_next
  from public.surat_reservations r
  where r.entity_id = p_entity_id
    and r.year = p_year
    and r.status = 'VOID'
    and r.voided_at is not null
    and r.reuse_until > v_now
    and r.no_urut >= p_start_from
    and r.number_scope_type = p_number_scope_type
    and (p_number_scope_type = 'pusat' or r.office_id = p_office_id)
    and r.dept_id is not distinct from p_dept_id
    and r.project_id is not distinct from p_project_id
  order by r.no_urut asc
  limit 1
  for update;

  if v_row_id is not null then
    -- Detach any stale cancelled draft so the next owner starts a fresh draft;
    -- the original applicant's cancelled history stays intact.
    update public.surat_registration_drafts
    set reservation_id = null
    where reservation_id = v_row_id
      and status = 'VOID';

    -- Audit: record the reclaim (actor + time).
    perform public.log_letter_number_reservation_event(
      v_row_id, 'reclaimed', p_reserved_by, null, 'Nomor dipakai ulang oleh pemohon baru.'
    );

    update public.surat_reservations
    set status = 'PENDING',
        type_id = p_type_id,
        -- Preserve the reservation's scope keys: the reclaimed number belongs
        -- to its original scope, and callers pass null for dimensions that do
        -- not apply to that scope (e.g. office_id for 'pusat').
        office_id = coalesce(p_office_id, office_id),
        project_id = coalesce(p_project_id, project_id),
        dept_id = coalesce(p_dept_id, dept_id),
        number_scope_type = p_number_scope_type,
        reserved_by = p_reserved_by,
        created_at = v_now,
        expires_at = v_now + interval '30 minutes',
        reused_count = reused_count + 1,
        last_reused_at = v_now
    where id = v_row_id;

    return v_next;
  end if;

  return null;
end;
$$;

revoke all on function public.claim_reusable_letter_number(uuid, integer, text, uuid, uuid, uuid, integer, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_reusable_letter_number(uuid, integer, text, uuid, uuid, uuid, integer, uuid, uuid) to service_role;

-- ──────────────────────────────────────────────────────────────────────
-- 4. Void: keep the cancel audit and append an event
-- ──────────────────────────────────────────────────────────────────────

create or replace function public.void_surat_registration_draft(p_draft_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_reservation_id uuid;
  v_draft_status text;
  v_reservation_status text;
  v_window interval;
begin
  if v_user_id is null then
    raise exception 'Sesi login tidak tersedia.';
  end if;

  select exists (
    select 1
    from public.profiles profile
    where profile.id = v_user_id
      and coalesce(profile.is_active, true) = true
      and coalesce(profile.role::text, '') in ('admin', 'super_admin')
  )
  into v_is_admin;

  select draft.reservation_id, draft.status::text
  into v_reservation_id, v_draft_status
  from public.surat_registration_drafts draft
  where draft.id = p_draft_id
    and (draft.created_by = v_user_id or v_is_admin)
  for update;

  if v_reservation_id is null then
    raise exception 'Draft tidak ditemukan atau Anda tidak berhak membatalkannya.';
  end if;

  if v_draft_status <> 'DRAFT' then
    raise exception 'Draft sudah tidak aktif (%).', v_draft_status;
  end if;

  select reservation.status::text
  into v_reservation_status
  from public.surat_reservations reservation
  where reservation.id = v_reservation_id
  for update;

  if v_reservation_status is null then
    raise exception 'Reservasi nomor tidak ditemukan.';
  end if;

  if v_reservation_status <> 'PENDING' then
    raise exception 'Reservasi nomor sudah tidak aktif (%).', v_reservation_status;
  end if;

  -- Window snapshotted at void time. No window configured => reuse_until equals
  -- void time => the number is permanently VOID.
  v_window := coalesce(public.get_letter_number_reuse_window(), interval '0');

  update public.surat_reservations reservation
  set status = 'VOID',
      voided_at = now(),
      voided_by = v_user_id,
      reuse_until = now() + v_window
  where reservation.id = v_reservation_id;

  -- Audit: record the cancel (actor + time + window used).
  perform public.log_letter_number_reservation_event(
    v_reservation_id, 'void', v_user_id, v_window, 'Draft dibatalkan oleh pemohon.'
  );

  update public.surat_registration_drafts draft
  set status = 'VOID',
      voided_at = now()
  where draft.id = p_draft_id
    and draft.status = 'DRAFT';
end;
$$;

revoke all on function public.void_surat_registration_draft(uuid) from public, anon;
grant execute on function public.void_surat_registration_draft(uuid) to authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────
-- 5. Draft RPC guard: never resurrect a cancelled draft
-- ──────────────────────────────────────────────────────────────────────
-- Forward-only override of create_surat_registration_draft (original in
-- 20260622143000). The ON CONFLICT branch must not revive a VOID draft; if a
-- cancelled draft still references the reservation it fails closed instead.

create or replace function public.create_surat_registration_draft(
  p_no_urut integer,
  p_no_surat text,
  p_payload jsonb default '{}'::jsonb,
  p_signer_assignments jsonb default '[]'::jsonb
)
returns public.surat_registration_drafts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_reservation_id uuid;
  v_draft public.surat_registration_drafts;
begin
  if v_user_id is null then
    raise exception 'Sesi login tidak tersedia.';
  end if;

  select r.id
  into v_reservation_id
  from public.surat_reservations r
  where r.no_urut = p_no_urut
    and r.year = extract(year from now())::integer
    and r.reserved_by = v_user_id
    and r.status = 'PENDING'
  order by r.created_at desc
  limit 1;

  if v_reservation_id is null then
    raise exception 'Reservation nomor tidak ditemukan.';
  end if;

  insert into public.surat_registration_drafts (
    reservation_id, created_by, no_surat, payload, signer_assignments
  ) values (
    v_reservation_id, v_user_id, p_no_surat, coalesce(p_payload, '{}'::jsonb),
    coalesce(p_signer_assignments, '[]'::jsonb)
  )
  on conflict (reservation_id) do update
  set no_surat = excluded.no_surat,
      payload = excluded.payload,
      signer_assignments = excluded.signer_assignments,
      status = 'DRAFT',
      expires_at = now() + interval '7 days',
      voided_at = null
  where surat_registration_drafts.status is distinct from 'VOID'
  returning * into v_draft;

  if v_draft is null then
    raise exception 'Reservasi masih memiliki draft pembatalan. Hubungi administrator.';
  end if;

  return v_draft;
end;
$$;

revoke all on function public.create_surat_registration_draft(integer, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_surat_registration_draft(integer, text, jsonb, jsonb) to authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────
-- 6. Rewire every allocator to reclaim in-window VOID numbers
-- ──────────────────────────────────────────────────────────────────────

-- 6a. generate_new_letter_number (6 args): pusat + cabang (project).
create or replace function public.generate_new_letter_number(
  p_entity_id  uuid,
  p_type_id    uuid,
  p_office_id  uuid,
  p_project_id uuid,
  p_user_id    uuid,
  p_dept_id    uuid default null::uuid
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_next_val integer;
  v_year integer := extract(year from now());
  v_is_pusat boolean;
  v_start_from integer := 1;
begin
  if v_actor is null then raise exception 'Sesi login tidak tersedia.' using errcode = '42501'; end if;
  if p_user_id is distinct from v_actor then raise exception 'p_user_id tidak sesuai dengan sesi login.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles profile where profile.id = v_actor and coalesce(profile.is_active, true) = true and profile.deleted_at is null) then
    raise exception 'Profil aktor tidak aktif atau telah dihapus.' using errcode = '42501';
  end if;

  select (office.kedudukan = 'Pusat') into v_is_pusat from public.master_offices office where office.id = p_office_id;
  if not found then raise exception 'Kantor penomoran tidak ditemukan.' using errcode = '23503'; end if;

  perform pg_advisory_xact_lock(hashtext('letter-number:' || p_entity_id::text || ':' || v_year::text || ':' || case when v_is_pusat then 'pusat:' || p_dept_id::text else 'cabang:' || p_project_id::text end));

  if v_is_pusat then
    select coalesce(max(start_from), 1) into v_start_from from public.letter_number_counter_configs config
    where config.scope_type = 'pusat' and config.is_active = true and config.entity_id = p_entity_id and config.dept_id = p_dept_id and config.project_id is null and config.office_id is null and config.year = v_year;

    select public.claim_reusable_letter_number(
      p_entity_id, v_year, 'pusat', null, null, p_dept_id, v_start_from, p_type_id, v_actor
    ) into v_next_val;
  else
    if p_project_id is null then raise exception 'Proyek wajib dipilih untuk pengajuan kantor cabang.' using errcode = '22023'; end if;

    select coalesce(max(start_from), 1) into v_start_from from public.letter_number_counter_configs config
    where config.scope_type = 'cabang' and config.is_active = true and config.entity_id = p_entity_id and config.project_id = p_project_id and config.dept_id is null and config.office_id is null and config.year = v_year;

    select public.claim_reusable_letter_number(
      p_entity_id, v_year, 'cabang', p_office_id, p_project_id, null, v_start_from, p_type_id, v_actor
    ) into v_next_val;
  end if;

  if v_next_val is null then
    select greatest(coalesce(max(no_urut), 0) + 1, v_start_from) into v_next_val from public.surat_reservations
    where entity_id = p_entity_id and year = v_year
      and ((v_is_pusat and dept_id = p_dept_id and project_id is null) or (not v_is_pusat and project_id = p_project_id and dept_id is null));

    insert into public.surat_reservations (entity_id, type_id, office_id, project_id, dept_id, year, no_urut, status, reserved_by, number_scope_type)
    values (p_entity_id, p_type_id, p_office_id, p_project_id, case when v_is_pusat then p_dept_id else null end, v_year, v_next_val, 'PENDING', p_user_id, case when v_is_pusat then 'pusat' else 'cabang' end);
  end if;
  return v_next_val;
end;
$$;

revoke all on function public.generate_new_letter_number(uuid, uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.generate_new_letter_number(uuid, uuid, uuid, uuid, uuid, uuid) to authenticated, service_role;

-- 6b. generate_new_letter_number (7 args, form_usage): pusat + cabang + cabang_000 fallback.
create or replace function public.generate_new_letter_number(
  p_entity_id          uuid,
  p_type_id            uuid,
  p_office_id          uuid,
  p_project_id         uuid,
  p_user_id            uuid,
  p_dept_id            uuid,
  p_form_usage_id      uuid
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_next_val integer;
  v_year integer := extract(year from now());
  v_is_pusat boolean;
  v_is_branch_fallback boolean;
  v_start_from integer := 1;
begin
  if v_actor is null then raise exception 'Sesi login tidak tersedia.' using errcode = '42501'; end if;
  if p_user_id is distinct from v_actor then raise exception 'p_user_id tidak sesuai dengan sesi login.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles profile where profile.id = v_actor and coalesce(profile.is_active, true) = true and profile.deleted_at is null) then
    raise exception 'Profil aktor tidak aktif atau telah dihapus.' using errcode = '42501';
  end if;
  if p_form_usage_id is null then raise exception 'Form usage wajib diisi untuk pemesanan nomor cabang.' using errcode = '22023'; end if;

  select (office.kedudukan = 'Pusat') into v_is_pusat from public.master_offices office where office.id = p_office_id;
  if not found then raise exception 'Kantor penomoran tidak ditemukan.' using errcode = '23503'; end if;

  v_is_branch_fallback := (not v_is_pusat) and p_project_id is null;
  if v_is_branch_fallback then
    perform public.assert_branch_asset_fallback_eligible(v_actor, p_office_id, p_entity_id, p_dept_id, p_form_usage_id);
  elsif not v_is_pusat and p_project_id is null then
    raise exception 'Proyek wajib dipilih untuk pengajuan kantor cabang.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('letter-number:' || p_entity_id::text || ':' || v_year::text || ':' || case when v_is_pusat then 'pusat:' || p_dept_id::text when v_is_branch_fallback then 'cabang_000:' || p_office_id::text else 'cabang:' || p_project_id::text end));

  if v_is_pusat then
    select coalesce(max(start_from), 1) into v_start_from from public.letter_number_counter_configs config
    where config.scope_type = 'pusat' and config.is_active = true and config.entity_id = p_entity_id and config.dept_id = p_dept_id and config.project_id is null and config.office_id is null and config.year = v_year;

    select public.claim_reusable_letter_number(
      p_entity_id, v_year, 'pusat', null, null, p_dept_id, v_start_from, p_type_id, v_actor
    ) into v_next_val;
  elsif v_is_branch_fallback then
    select coalesce(max(start_from), 1) into v_start_from from public.letter_number_counter_configs config
    where config.scope_type = 'cabang_000' and config.is_active = true and config.entity_id = p_entity_id and config.office_id = p_office_id and config.project_id is null and config.dept_id is null and config.year = v_year;

    select public.claim_reusable_letter_number(
      p_entity_id, v_year, 'branch_asset_000', p_office_id, null, null, v_start_from, p_type_id, v_actor
    ) into v_next_val;
  else
    select coalesce(max(start_from), 1) into v_start_from from public.letter_number_counter_configs config
    where config.scope_type = 'cabang' and config.is_active = true and config.entity_id = p_entity_id and config.project_id = p_project_id and config.dept_id is null and config.office_id is null and config.year = v_year;

    select public.claim_reusable_letter_number(
      p_entity_id, v_year, 'cabang', p_office_id, p_project_id, null, v_start_from, p_type_id, v_actor
    ) into v_next_val;
  end if;

  if v_next_val is null then
    select greatest(coalesce(max(no_urut), 0) + 1, v_start_from) into v_next_val from public.surat_reservations
    where entity_id = p_entity_id and year = v_year
      and ((v_is_pusat and dept_id = p_dept_id and project_id is null) or (v_is_branch_fallback and office_id = p_office_id and project_id is null and dept_id is null) or (not v_is_pusat and not v_is_branch_fallback and project_id = p_project_id and dept_id is null));

    insert into public.surat_reservations (entity_id, type_id, office_id, project_id, dept_id, year, no_urut, status, reserved_by, number_scope_type)
    values (p_entity_id, p_type_id, p_office_id, p_project_id, case when v_is_pusat then p_dept_id else null end, v_year, v_next_val, 'PENDING', p_user_id, case when v_is_pusat then 'pusat' when v_is_branch_fallback then 'branch_asset_000' else 'cabang' end);
  end if;
  return v_next_val;
end;
$$;

revoke all on function public.generate_new_letter_number(uuid, uuid, uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.generate_new_letter_number(uuid, uuid, uuid, uuid, uuid, uuid, uuid) to authenticated, service_role;

-- 6c. generate_keu1_branch_letter_number: KEU 1 cabang tanpa proyek.
create or replace function public.generate_keu1_branch_letter_number(
  p_entity_id uuid,
  p_type_id uuid,
  p_office_id uuid,
  p_user_id uuid,
  p_dept_id uuid,
  p_form_usage_id uuid
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_office_id uuid;
  v_validation jsonb;
  v_department_id uuid;
  v_year integer := extract(year from now())::integer;
  v_start integer;
  v_next integer;
begin
  if v_actor is null or p_user_id is distinct from v_actor then
    raise exception 'Sesi penomoran tidak valid.' using errcode = '42501';
  end if;
  select profile.role, profile.office_id into v_role, v_office_id
  from public.profiles profile
  where profile.id = v_actor and coalesce(profile.is_active, true) = true and profile.deleted_at is null;
  if not found then raise exception 'Profil pemohon tidak aktif.' using errcode = '42501'; end if;
  if v_role not in ('admin', 'super_admin') and v_office_id is distinct from p_office_id then
    raise exception 'Kantor pemohon tidak sesuai profil.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.master_offices office where office.id = p_office_id and office.kedudukan <> 'Pusat') then
    raise exception 'Nomor KEU 1 cabang memerlukan kantor cabang.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.form_usages usage
    join public.master_forms form on form.id = usage.form_id
    where usage.id = p_form_usage_id and usage.request_category = 'non_asset'
      and usage.scope_type = 'cabang' and upper(trim(form.nomor_form)) = 'FM-UAI.KEU-01-00'
  ) then
    raise exception 'Kegunaan KEU 1 cabang tidak valid.' using errcode = '22023';
  end if;
  v_validation := public.validate_form_usage_for_actor(p_form_usage_id, p_dept_id);
  v_department_id := nullif(v_validation->>'requester_department_id', '')::uuid;
  if v_validation->>'request_category' is distinct from 'non_asset'
    or v_department_id is distinct from p_dept_id
    or not exists (select 1 from public.master_entities entity where entity.id = p_entity_id)
    or not exists (select 1 from public.master_dept_letter_types map where map.dept_id = p_dept_id and map.letter_type_id = p_type_id) then
    raise exception 'Konteks penomoran KEU 1 tidak valid.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('letter-number:' || p_entity_id::text || ':' || v_year::text || ':cabang_000:' || p_office_id::text));
  select coalesce(max(config.start_from), 1) into v_start
  from public.letter_number_counter_configs config
  where config.scope_type = 'cabang_000' and config.is_active = true
    and config.entity_id = p_entity_id and config.office_id = p_office_id and config.year = v_year;

  select public.claim_reusable_letter_number(
    p_entity_id, v_year, 'branch_keu1_000', p_office_id, null, null, v_start, p_type_id, v_actor
  ) into v_next;

  if v_next is null then
    select greatest(coalesce(max(reservation.no_urut), 0) + 1, v_start) into v_next
    from public.surat_reservations reservation
    where reservation.entity_id = p_entity_id and reservation.office_id = p_office_id
      and reservation.year = v_year and reservation.project_id is null and reservation.dept_id is null;
    insert into public.surat_reservations (
      entity_id, type_id, office_id, project_id, dept_id, year, no_urut,
      status, reserved_by, number_scope_type
    ) values (
      p_entity_id, p_type_id, p_office_id, null, null, v_year, v_next,
      'PENDING', v_actor, 'branch_keu1_000'
    );
  end if;
  return v_next;
end;
$$;

revoke all on function public.generate_keu1_branch_letter_number(uuid, uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.generate_keu1_branch_letter_number(uuid, uuid, uuid, uuid, uuid, uuid) to authenticated, service_role;
