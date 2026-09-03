-- MRN-22: Branch asset without project (virtual scope "000").
--
-- Problem
--   Branch offices that genuinely have no registered projects cannot register
--   Aset documents because every branch trigger requires project_id NOT NULL.
--
-- Solution
--   Allow a narrow, database-verified exception for the single case where
--   ALL of the following are simultaneously true:
--     1. office.kedudukan <> 'Pusat'  (branch office)
--     2. form_usage_id is canonical and resolves to 'asset'
--     3. project_id IS NULL in the payload
--     4. office genuinely has no active projects  (DB-verified)
--     5. The reservation row carries number_scope_type = 'branch_asset_000'
--        (an immutable marker; the only way a row with project_id NULL AND
--        dept_id NULL can exist on a branch is via this fallback path)
--
--   A forged payload from a branch that HAS projects is always rejected.
--   A forged reservation with project_id NULL AND dept_id NULL without the
--   marker is always rejected.
--   Unit, Non Unit, Non Aset (Fund), and Pusat are NOT affected.

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 1. Add office_id column on letter_number_counter_configs            ║
-- ║    BEFORE adding the constraint that references it.                  ║
-- ╚══════════════════════════════════════════════════════════════════════╝

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'letter_number_counter_configs'
      and column_name  = 'office_id'
  ) then
    alter table public.letter_number_counter_configs
      add column office_id uuid
      references public.master_offices(id) on delete cascade;
  end if;
end
$$;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 2. Replace counter scope check constraint (idempotent)             ║
-- ║    Allows new scope_type 'cabang_000' alongside pusat / cabang.     ║
-- ╚══════════════════════════════════════════════════════════════════════╝

do $$
declare
  v_constraint_name text;
begin
  for v_constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.letter_number_counter_configs'::regclass
      and contype  = 'c'
      and pg_get_constraintdef(oid) like '%scope_type%'
  loop
    if exists (
      select 1
      from public.letter_number_counter_configs cfg
      where
        (cfg.scope_type = 'pusat'
            and (cfg.dept_id is null or cfg.project_id is not null or cfg.office_id is not null))
        or (cfg.scope_type = 'cabang'
            and (cfg.project_id is null or cfg.dept_id is not null or cfg.office_id is not null))
    ) then
      raise exception 'Existing letter_number_counter_configs rows violate the new scope_type contract.';
    end if;

    execute format('alter table public.letter_number_counter_configs drop constraint %I', v_constraint_name);
  end loop;

  alter table public.letter_number_counter_configs
    add constraint letter_number_counter_scope_check check (
      (scope_type = 'pusat'      and dept_id is not null and project_id is null and office_id is null) or
      (scope_type = 'cabang'     and project_id is not null and dept_id is null and office_id is null) or
      (scope_type = 'cabang_000' and office_id is not null and project_id is null and dept_id is null)
    );
end
$$;

create unique index if not exists letter_number_counter_cabang_000_unique
  on public.letter_number_counter_configs(entity_id, year, office_id)
  where scope_type = 'cabang_000' and is_active = true;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 3. Immutable scope marker on surat_reservations                     ║
-- ║    Add nullable without default, backfill, then set not null.       ║
-- ╚══════════════════════════════════════════════════════════════════════╝

do $$
declare
  v_invalid_count int;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'surat_reservations'
      and column_name  = 'number_scope_type'
  ) then
    alter table public.surat_reservations add column number_scope_type text
      check (number_scope_type in ('pusat', 'cabang', 'branch_asset_000'));

    update public.surat_reservations res
    set number_scope_type = case
      when off.kedudukan = 'Pusat' and res.dept_id is not null and res.project_id is null then 'pusat'
      when off.kedudukan <> 'Pusat' and res.project_id is not null and res.dept_id is null then 'cabang'
      else null
    end
    from public.master_offices off
    where off.id = res.office_id;

    select count(*) into v_invalid_count
    from public.surat_reservations
    where number_scope_type is null;

    if v_invalid_count > 0 then
      raise exception 'Migration failed: % existing reservations do not match standard pusat/cabang rules and cannot be safely backfilled.', v_invalid_count;
    end if;

    alter table public.surat_reservations alter column number_scope_type set not null;
  end if;
end
$$;

create index if not exists idx_surat_reservations_scope_marker
  on public.surat_reservations(number_scope_type, office_id, project_id, dept_id);

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 4. Helpers: Branch Projects and Form Category                       ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create or replace function public.branch_has_active_projects(p_office_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.master_projects p where p.office_id = p_office_id);
$$;

create or replace function public.resolve_form_usage_category(p_form_usage_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select lower(usage.request_category) from public.form_usages usage where usage.id = p_form_usage_id;
$$;

revoke all on function public.branch_has_active_projects(uuid) from public, anon;
grant execute on function public.branch_has_active_projects(uuid) to authenticated, service_role;

revoke all on function public.resolve_form_usage_category(uuid) from public, anon;
grant execute on function public.resolve_form_usage_category(uuid) to authenticated, service_role;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 5. Server-side validation of the branch-asset fallback claim        ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create or replace function public.assert_branch_asset_fallback_eligible(
  p_actor          uuid,
  p_office_id      uuid,
  p_entity_id      uuid,
  p_department_id  uuid,
  p_form_usage_id  uuid
)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_kedudukan text;
  v_usage_validation jsonb;
  v_category  text;
  v_user_role text;
  v_user_office uuid;
  v_requester_department_id uuid;
  v_department_entity uuid;
begin
  if p_actor is null then raise exception 'Sesi login tidak tersedia.' using errcode = '42501'; end if;
  if p_actor is distinct from auth.uid() then
    raise exception 'Aktor fallback tidak sesuai dengan sesi login.' using errcode = '42501';
  end if;

  select profile.role, profile.office_id
  into v_user_role, v_user_office
  from public.profiles profile
  where profile.id = p_actor and coalesce(profile.is_active, true) = true and profile.deleted_at is null;

  if not found then
    raise exception 'Profil aktor tidak aktif atau telah dihapus.' using errcode = '42501';
  end if;

  select office.kedudukan into v_kedudukan from public.master_offices office where office.id = p_office_id;
  if v_kedudukan is null then raise exception 'Kantor penomoran tidak ditemukan.' using errcode = '23503'; end if;
  if v_kedudukan = 'Pusat' then raise exception 'Fallback proyek 000 tidak berlaku untuk kantor pusat.' using errcode = '22023'; end if;

  -- Use the existing single source of truth for form usage authorization
  v_usage_validation := public.validate_form_usage_for_actor(
    p_form_usage_id,
    p_department_id
  );
  v_category := v_usage_validation->>'request_category';
  v_requester_department_id := nullif(v_usage_validation->>'requester_department_id', '')::uuid;

  if v_category is distinct from 'asset' then
    raise exception 'Fallback proyek 000 hanya berlaku untuk klasifikasi Aset.' using errcode = '22023';
  end if;

  select department.entity_id into v_department_entity
  from public.master_departments department
  where department.id = v_requester_department_id;

  if v_department_entity is distinct from p_entity_id then
    raise exception 'Entitas reservasi tidak sesuai departemen pengaju.' using errcode = '42501';
  end if;

  if v_user_role is distinct from 'admin' then
    if v_user_office is distinct from p_office_id then
      raise exception 'Anda tidak diizinkan membuat reservasi untuk kantor lain.' using errcode = '42501';
    end if;
  end if;

  if public.branch_has_active_projects(p_office_id) then
    raise exception 'Kantor cabang ini memiliki proyek aktif; fallback 000 tidak dapat dipakai.' using errcode = '22023';
  end if;

  return true;
end;
$$;

revoke all on function public.assert_branch_asset_fallback_eligible(uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.assert_branch_asset_fallback_eligible(uuid, uuid, uuid, uuid, uuid) to authenticated, service_role;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 6. Updated reservation scope trigger & RLS Policies                 ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create or replace function public.enforce_surat_reservation_number_scope()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_kedudukan text;
begin
  select office.kedudukan into v_kedudukan from public.master_offices office where office.id = new.office_id;
  if not found then raise exception 'Kantor penomoran tidak ditemukan.' using errcode = '23503'; end if;

  -- Compatibility: Infer missing standard scope markers for direct inserts
  if new.number_scope_type is null then
    if v_kedudukan = 'Pusat' and new.dept_id is not null and new.project_id is null then
      new.number_scope_type := 'pusat';
    elsif v_kedudukan <> 'Pusat' and new.project_id is not null and new.dept_id is null then
      new.number_scope_type := 'cabang';
    else
      raise exception 'Tanda lingkup nomor tidak dapat disimpulkan secara otomatis. Wajib diisi eksplisit.' using errcode = '22023';
    end if;
  end if;

  if new.number_scope_type not in ('pusat', 'cabang', 'branch_asset_000') then
    raise exception 'Tanda lingkup nomor tidak valid.' using errcode = '22023';
  end if;

  if v_kedudukan = 'Pusat' then
    if new.number_scope_type <> 'pusat' then raise exception 'Penomoran kantor pusat wajib memakai scope pusat.' using errcode = '22023'; end if;
    if new.dept_id is null or new.project_id is not null then raise exception 'Penomoran kantor pusat wajib per departemen tanpa scope proyek.' using errcode = '22023'; end if;
  else
    if new.number_scope_type = 'branch_asset_000' then
      if new.project_id is not null or new.dept_id is not null then raise exception 'Fallback branch_asset_000 wajib project_id NULL dan dept_id NULL.' using errcode = '22023'; end if;
      if public.branch_has_active_projects(new.office_id) then raise exception 'Kantor cabang ini memiliki proyek aktif; fallback branch_asset_000 ditolak.' using errcode = '22023'; end if;
    elsif new.number_scope_type = 'cabang' then
      if new.project_id is null or new.dept_id is not null then raise exception 'Penomoran kantor cabang wajib per proyek tanpa scope departemen.' using errcode = '22023'; end if;
      if not exists (select 1 from public.master_projects project where project.id = new.project_id and project.office_id = new.office_id) then
        raise exception 'Proyek penomoran tidak berada pada kantor cabang yang dipilih.' using errcode = '22023';
      end if;
    else
      raise exception 'Scope pusat tidak boleh dipakai untuk kantor cabang.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_surat_reservation_number_scope on public.surat_reservations;
create trigger trg_enforce_surat_reservation_number_scope
  before insert or update of office_id, project_id, dept_id, year, number_scope_type
  on public.surat_reservations
  for each row execute function public.enforce_surat_reservation_number_scope();

create or replace function public.prevent_surat_reservation_identity_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.entity_id is distinct from old.entity_id then
    raise exception 'Identitas nomor reservasi (entity_id) tidak boleh diubah.' using errcode = '22023';
  end if;
  if new.office_id is distinct from old.office_id then
    raise exception 'Identitas nomor reservasi (office_id) tidak boleh diubah.' using errcode = '22023';
  end if;
  if new.project_id is distinct from old.project_id then
    raise exception 'Identitas nomor reservasi (project_id) tidak boleh diubah.' using errcode = '22023';
  end if;
  if new.dept_id is distinct from old.dept_id then
    raise exception 'Identitas nomor reservasi (dept_id) tidak boleh diubah.' using errcode = '22023';
  end if;
  if new.year is distinct from old.year then
    raise exception 'Identitas nomor reservasi (year) tidak boleh diubah.' using errcode = '22023';
  end if;
  if new.no_urut is distinct from old.no_urut then
    raise exception 'Identitas nomor reservasi (no_urut) tidak boleh diubah.' using errcode = '22023';
  end if;
  if new.number_scope_type is distinct from old.number_scope_type then
    raise exception 'Tanda lingkup nomor (number_scope_type) tidak boleh diubah.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_a_prevent_surat_reservation_scope_update on public.surat_reservations;
drop trigger if exists trg_a_prevent_surat_reservation_identity_update on public.surat_reservations;
create trigger trg_a_prevent_surat_reservation_identity_update
  before update of entity_id, office_id, project_id, dept_id, year, no_urut, number_scope_type on public.surat_reservations
  for each row execute function public.prevent_surat_reservation_identity_update();

-- Restrict authenticated users from inserting branch_asset_000 directly.
-- The RPC is security definer and bypasses RLS, so it can still insert it.
alter table public.surat_reservations enable row level security;
drop policy if exists "Prevent direct branch_asset_000 insert" on public.surat_reservations;
create policy "Prevent direct branch_asset_000 insert" on public.surat_reservations
  as restrictive for insert to authenticated
  with check (number_scope_type <> 'branch_asset_000');


-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 7. Updated registration trigger                                     ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create or replace function public.enforce_surat_registration_branch_project()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_kedudukan text;
  v_marker jsonb := coalesce(new.form_input_data, '{}'::jsonb);
  v_category text;
begin
  select office.kedudukan into v_kedudukan from public.master_offices office where office.id = new.office_id;
  if not found then raise exception 'Kantor penerbit tidak ditemukan.' using errcode = '23503'; end if;

  if v_kedudukan <> 'Pusat' then
    if new.project_id is null then
      -- MRN-22 Validation: MUST have canonical form usage and category 'asset'.
      -- Legacy workflow cannot use fallback.
      if new.form_usage_id is null then
        raise exception 'Penggunaan form wajib untuk pengajuan cabang tanpa proyek.' using errcode = '22023';
      end if;

      v_category := public.resolve_form_usage_category(new.form_usage_id);
      if v_category is distinct from 'asset' then
        raise exception 'Proyek wajib dipilih untuk pengajuan non-aset di kantor cabang.' using errcode = '22023';
      end if;

      if coalesce(nullif(v_marker->>'project_is_default', ''), '') <> 'true'
        or coalesce(nullif(v_marker->>'project_code', ''), '')        <> '000'
        or coalesce(nullif(v_marker->>'project_name', ''), '')        <> 'Tanpa proyek' then
        raise exception 'Proyek wajib dipilih untuk pengajuan kantor cabang (atau gunakan marker fallback).' using errcode = '22023';
      end if;

      if public.branch_has_active_projects(new.office_id) then
        raise exception 'Proyek wajib dipilih untuk pengajuan kantor cabang (kantor ini memiliki proyek aktif).' using errcode = '22023';
      end if;
    else
      if not exists (select 1 from public.master_projects project where project.id = new.project_id and project.office_id = new.office_id) then
        raise exception 'Proyek pengajuan tidak berada pada kantor cabang yang dipilih.' using errcode = '22023';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_surat_registration_branch_project on public.surat_registrasi;
create trigger trg_enforce_surat_registration_branch_project
  before insert or update of office_id, project_id, form_usage_id, form_input_data
  on public.surat_registrasi
  for each row execute function public.enforce_surat_registration_branch_project();

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 8. generate_new_letter_number RPC                                   ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- Legacy 6-parameter signature
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

    select no_urut into v_next_val from public.surat_reservations
    where entity_id = p_entity_id and dept_id = p_dept_id and project_id is null and year = v_year and no_urut >= v_start_from and status = 'CANCELLED' order by no_urut asc limit 1;
  else
    if p_project_id is null then raise exception 'Proyek wajib dipilih untuk pengajuan kantor cabang.' using errcode = '22023'; end if;

    select coalesce(max(start_from), 1) into v_start_from from public.letter_number_counter_configs config
    where config.scope_type = 'cabang' and config.is_active = true and config.entity_id = p_entity_id and config.project_id = p_project_id and config.dept_id is null and config.office_id is null and config.year = v_year;

    select no_urut into v_next_val from public.surat_reservations
    where entity_id = p_entity_id and project_id = p_project_id and dept_id is null and year = v_year and no_urut >= v_start_from and status = 'CANCELLED' order by no_urut asc limit 1;
  end if;

  if v_next_val is not null then
    update public.surat_reservations
       set status = 'PENDING', type_id = p_type_id, office_id = p_office_id, project_id = p_project_id,
           dept_id = case when v_is_pusat then p_dept_id else null end,
           number_scope_type = case when v_is_pusat then 'pusat' else 'cabang' end,
           reserved_by = p_user_id, created_at = now(), expires_at = (now() + interval '30 minutes')
     where entity_id = p_entity_id and year = v_year and no_urut = v_next_val
       and ((v_is_pusat and dept_id = p_dept_id and project_id is null) or (not v_is_pusat and project_id = p_project_id and dept_id is null));
  else
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

    select no_urut into v_next_val from public.surat_reservations
    where entity_id = p_entity_id and dept_id = p_dept_id and project_id is null and year = v_year and no_urut >= v_start_from and status = 'CANCELLED' order by no_urut asc limit 1;
  elsif v_is_branch_fallback then
    select coalesce(max(start_from), 1) into v_start_from from public.letter_number_counter_configs config
    where config.scope_type = 'cabang_000' and config.is_active = true and config.entity_id = p_entity_id and config.office_id = p_office_id and config.project_id is null and config.dept_id is null and config.year = v_year;

    select no_urut into v_next_val from public.surat_reservations
    where entity_id = p_entity_id and office_id = p_office_id and project_id is null and dept_id is null and number_scope_type = 'branch_asset_000' and year = v_year and no_urut >= v_start_from and status = 'CANCELLED' order by no_urut asc limit 1;
  else
    select coalesce(max(start_from), 1) into v_start_from from public.letter_number_counter_configs config
    where config.scope_type = 'cabang' and config.is_active = true and config.entity_id = p_entity_id and config.project_id = p_project_id and config.dept_id is null and config.office_id is null and config.year = v_year;

    select no_urut into v_next_val from public.surat_reservations
    where entity_id = p_entity_id and project_id = p_project_id and dept_id is null and year = v_year and no_urut >= v_start_from and status = 'CANCELLED' order by no_urut asc limit 1;
  end if;

  if v_next_val is not null then
    update public.surat_reservations
       set status = 'PENDING', type_id = p_type_id, office_id = p_office_id, project_id = p_project_id,
           dept_id = case when v_is_pusat then p_dept_id else null end,
           number_scope_type = case when v_is_pusat then 'pusat' when v_is_branch_fallback then 'branch_asset_000' else 'cabang' end,
           reserved_by = p_user_id, created_at = now(), expires_at = (now() + interval '30 minutes')
     where entity_id = p_entity_id and year = v_year and no_urut = v_next_val
       and ((v_is_pusat and dept_id = p_dept_id and project_id is null) or (v_is_branch_fallback and office_id = p_office_id and project_id is null and dept_id is null and number_scope_type = 'branch_asset_000') or (not v_is_pusat and not v_is_branch_fallback and project_id = p_project_id and dept_id is null));
  else
    select greatest(coalesce(max(no_urut), 0) + 1, v_start_from) into v_next_val from public.surat_reservations
    where entity_id = p_entity_id and year = v_year
      and ((v_is_pusat and dept_id = p_dept_id and project_id is null) or (v_is_branch_fallback and office_id = p_office_id and project_id is null and dept_id is null and number_scope_type = 'branch_asset_000') or (not v_is_pusat and not v_is_branch_fallback and project_id = p_project_id and dept_id is null));

    insert into public.surat_reservations (entity_id, type_id, office_id, project_id, dept_id, year, no_urut, status, reserved_by, number_scope_type)
    values (p_entity_id, p_type_id, p_office_id, p_project_id, case when v_is_pusat then p_dept_id else null end, v_year, v_next_val, 'PENDING', p_user_id, case when v_is_pusat then 'pusat' when v_is_branch_fallback then 'branch_asset_000' else 'cabang' end);
  end if;
  return v_next_val;
end;
$$;

revoke all on function public.generate_new_letter_number(uuid, uuid, uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.generate_new_letter_number(uuid, uuid, uuid, uuid, uuid, uuid, uuid) to authenticated, service_role;
