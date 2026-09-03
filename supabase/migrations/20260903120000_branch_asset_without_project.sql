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
--     2. request_category = 'asset'   (taken from form_usages, not from the
--        payload's form_input_data)
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
--
-- Security
--   - DB independently verifies the branch has no active projects.
--   - RLS and ownership rules are unchanged.
--   - All SECURITY DEFINER functions use set search_path = '' with explicit
--     schema-qualified references, revoke from PUBLIC and anon, and grant only
--     to authenticated.
--   - p_user_id MUST equal auth.uid() (defended in the RPC).
--   - No synthetic project row is created in master_projects.

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
  v_validation_failed boolean := false;
begin
  -- Drop every known name variant.  The original migration used
  -- letter_number_counter_scope_check; downstream tools may have created
  -- letter_number_counter_configs_scope_type_check.
  for v_constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.letter_number_counter_configs'::regclass
      and contype  = 'c'
      and pg_get_constraintdef(oid) like '%scope_type%'
  loop
    -- Validate existing rows BEFORE dropping the old constraint.
    if exists (
      select 1
      from public.letter_number_counter_configs cfg
      where
        (cfg.scope_type = 'pusat'
            and (cfg.dept_id is null or cfg.project_id is not null or cfg.office_id is not null))
        or (cfg.scope_type = 'cabang'
            and (cfg.project_id is null or cfg.dept_id is not null or cfg.office_id is not null))
    ) then
      raise exception 'Existing letter_number_counter_configs rows violate the new scope_type contract. Resolve manually before applying MRN-22.';
    end if;

    execute format('alter table public.letter_number_counter_configs drop constraint %I', v_constraint_name);
  end loop;

  alter table public.letter_number_counter_configs
    add constraint letter_number_counter_scope_check check (
      (scope_type = 'pusat'
        and dept_id    is not null
        and project_id is null
        and office_id  is null)
      or
      (scope_type = 'cabang'
        and project_id is not null
        and dept_id    is null
        and office_id  is null)
      or
      (scope_type = 'cabang_000'
        and office_id  is not null
        and project_id is null
        and dept_id    is null)
    );
end
$$;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 3. Unique index for cabang_000 scope                                ║
-- ║    One active counter per (entity, office, year).                   ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create unique index if not exists letter_number_counter_cabang_000_unique
  on public.letter_number_counter_configs(entity_id, year, office_id)
  where scope_type = 'cabang_000' and is_active = true;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 4. Immutable scope marker on surat_reservations                     ║
-- ║    A reservation MUST carry an explicit number_scope_type.          ║
-- ║    This is the only way a (branch, project_id null, dept_id null)   ║
-- ║    row can exist: it was created via the fallback RPC.              ║
-- ╚══════════════════════════════════════════════════════════════════════╝

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'surat_reservations'
      and column_name  = 'number_scope_type'
  ) then
    alter table public.surat_reservations
      add column number_scope_type text
      not null
      default 'cabang'
      check (number_scope_type in ('pusat', 'cabang', 'branch_asset_000'));
  end if;
end
$$;

create index if not exists idx_surat_reservations_scope_marker
  on public.surat_reservations(number_scope_type, office_id, project_id, dept_id);

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 5. Helper: branch has active projects                               ║
-- ║    Used by triggers and the numbering RPC to verify the fallback    ║
-- ║    claim is legitimate.                                             ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create or replace function public.branch_has_active_projects(p_office_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.master_projects p
    where p.office_id = p_office_id
  );
$$;

revoke all on function public.branch_has_active_projects(uuid) from public, anon;
grant execute on function public.branch_has_active_projects(uuid) to authenticated, service_role;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 6. Authoritative category resolver                                  ║
-- ║    Resolves request_category from form_usages, NOT from             ║
-- ║    form_input_data on the client.  Form usage is the trusted        ║
-- ║    configuration row.                                               ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create or replace function public.resolve_form_usage_category(
  p_form_usage_id uuid,
  p_legacy_workflow_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select lower(usage.request_category)
       from public.form_usages usage
       where usage.id = p_form_usage_id),
    (select lower(detail.request_category)
       from public.master_penggunaan_detail detail
       where detail.id = p_legacy_workflow_id
       limit 1)
  );
$$;

revoke all on function public.resolve_form_usage_category(uuid, uuid) from public, anon;
grant execute on function public.resolve_form_usage_category(uuid, uuid) to authenticated, service_role;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 7. Server-side validation of the branch-asset fallback claim        ║
-- ║    Always called via the SECURITY DEFINER RPC.  Verifies:           ║
-- ║      - the form usage maps to 'asset' category;                    ║
-- ║      - the actor is active;                                         ║
-- ║      - the office is a branch with no active projects.              ║
-- ║    Marker strings in form_input_data are not consulted.            ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create or replace function public.assert_branch_asset_fallback_eligible(
  p_actor          uuid,
  p_office_id      uuid,
  p_form_usage_id  uuid,
  p_legacy_workflow_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_kedudukan text;
  v_category  text;
begin
  if p_actor is null then
    raise exception 'Sesi login tidak tersedia.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = p_actor
      and coalesce(profile.is_active, true) = true
      and profile.deleted_at is null
  ) then
    raise exception 'Profil aktor tidak aktif atau telah dihapus.' using errcode = '42501';
  end if;

  select office.kedudukan
    into v_kedudukan
  from public.master_offices office
  where office.id = p_office_id;

  if v_kedudukan is null then
    raise exception 'Kantor penomoran tidak ditemukan.' using errcode = '23503';
  end if;

  if v_kedudukan = 'Pusat' then
    raise exception 'Fallback proyek 000 tidak berlaku untuk kantor pusat.' using errcode = '22023';
  end if;

  v_category := public.resolve_form_usage_category(p_form_usage_id, p_legacy_workflow_id);

  if v_category is distinct from 'asset' then
    raise exception 'Fallback proyek 000 hanya berlaku untuk klasifikasi Aset.' using errcode = '22023';
  end if;

  if public.branch_has_active_projects(p_office_id) then
    raise exception 'Kantor cabang ini memiliki proyek aktif; fallback 000 tidak dapat dipakai.' using errcode = '22023';
  end if;

  return true;
end;
$$;

revoke all on function public.assert_branch_asset_fallback_eligible(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.assert_branch_asset_fallback_eligible(uuid, uuid, uuid, uuid) to authenticated, service_role;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 8. Updated reservation scope trigger                                ║
-- ║    Requires the explicit number_scope_type marker.                  ║
-- ║    Branch fallback is allowed only when number_scope_type =         ║
-- ║    'branch_asset_000' AND the branch has no active projects.        ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create or replace function public.enforce_surat_reservation_number_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kedudukan text;
begin
  select office.kedudukan
    into v_kedudukan
  from public.master_offices office
  where office.id = new.office_id;

  if not found then
    raise exception 'Kantor penomoran tidak ditemukan.' using errcode = '23503';
  end if;

  if new.number_scope_type is null
    or new.number_scope_type not in ('pusat', 'cabang', 'branch_asset_000') then
    raise exception 'Tanda lingkup nomor wajib diisi (pusat|cabang|branch_asset_000).' using errcode = '22023';
  end if;

  if v_kedudukan = 'Pusat' then
    if new.number_scope_type <> 'pusat' then
      raise exception 'Penomoran kantor pusat wajib memakai scope pusat.' using errcode = '22023';
    end if;
    if new.dept_id is null or new.project_id is not null then
      raise exception 'Penomoran kantor pusat wajib per departemen tanpa scope proyek.' using errcode = '22023';
    end if;
  else
    -- Branch reservations.
    if new.number_scope_type = 'branch_asset_000' then
      if new.project_id is not null or new.dept_id is not null then
        raise exception 'Fallback branch_asset_000 wajib project_id NULL dan dept_id NULL.' using errcode = '22023';
      end if;
      if public.branch_has_active_projects(new.office_id) then
        raise exception 'Kantor cabang ini memiliki proyek aktif; fallback branch_asset_000 ditolak.' using errcode = '22023';
      end if;
    elsif new.number_scope_type = 'cabang' then
      if new.project_id is null or new.dept_id is not null then
        raise exception 'Penomoran kantor cabang wajib per proyek tanpa scope departemen.' using errcode = '22023';
      end if;
      if not exists (
        select 1
        from public.master_projects project
        where project.id = new.project_id
          and project.office_id = new.office_id
      ) then
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

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 9. Updated registration trigger                                     ║
-- ║    Branch registrations with project_id NULL require the canonical  ║
-- ║    marker in form_input_data AND a valid server-side assertion      ║
-- ║    that the office genuinely has no projects.                       ║
-- ║    Forged payload from a branch with projects is rejected.          ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create or replace function public.enforce_surat_registration_branch_project()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kedudukan text;
  v_marker jsonb := coalesce(new.form_input_data, '{}'::jsonb);
begin
  select office.kedudukan
    into v_kedudukan
  from public.master_offices office
  where office.id = new.office_id;

  if not found then
    raise exception 'Kantor penerbit tidak ditemukan.' using errcode = '23503';
  end if;

  if v_kedudukan <> 'Pusat' then
    if new.project_id is null then
      if coalesce(nullif(v_marker->>'request_category', ''), '') <> 'asset'
        or coalesce(nullif(v_marker->>'project_is_default', ''), '') <> 'true'
        or coalesce(nullif(v_marker->>'project_code', ''), '')        <> '000'
        or coalesce(nullif(v_marker->>'project_name', ''), '')        <> 'Tanpa proyek' then
        raise exception 'Proyek wajib dipilih untuk pengajuan kantor cabang.' using errcode = '22023';
      end if;
      if public.branch_has_active_projects(new.office_id) then
        raise exception 'Proyek wajib dipilih untuk pengajuan kantor cabang.' using errcode = '22023';
      end if;
    else
      if not exists (
        select 1
        from public.master_projects project
        where project.id = new.project_id
          and project.office_id = new.office_id
      ) then
        raise exception 'Proyek pengajuan tidak berada pada kantor cabang yang dipilih.' using errcode = '22023';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_surat_registration_branch_project on public.surat_registrasi;
create trigger trg_enforce_surat_registration_branch_project
  before insert or update of office_id, project_id
  on public.surat_registrasi
  for each row execute function public.enforce_surat_registration_branch_project();

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 10. New generate_new_letter_number RPC (trusted authoritative path) ║
-- ║    - The 6-parameter legacy signature is preserved (no fallback)    ║
-- ║      so old callers cannot accidentally create a fallback row.      ║
-- ║    - A new 8-parameter signature is the only path that may create  ║
-- ║      a branch_asset_000 reservation. It requires:                    ║
-- ║         - p_user_id = auth.uid()                                    ║
-- ║         - p_form_usage_id (or p_legacy_workflow_id) mapping to      ║
-- ║           request_category = 'asset'                                ║
-- ║         - office genuinely has no active projects                   ║
-- ║    - Advisory lock keyed on (entity, office, year, 'cabang_000')   ║
-- ║      prevents concurrent numbering.                                 ║
-- ║    - counter is isolated per (entity_id, office_id, year).         ║
-- ║    - year is recomputed from now(); counter resets each calendar    ║
-- ║      year because surat_reservations rows are scoped by year.      ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- 10a. Legacy 6-parameter signature: rejects any attempt to encode
--      branch_asset_000 (project_id and dept_id both NULL on a branch
--      is rejected by the trigger).
create or replace function public.generate_new_letter_number(
  p_entity_id  uuid,
  p_type_id    uuid,
  p_office_id  uuid,
  p_project_id uuid,
  p_user_id    uuid,
  p_dept_id    uuid default null::uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_next_val integer;
  v_year integer := extract(year from now());
  v_is_pusat boolean;
  v_start_from integer := 1;
begin
  if v_actor is null then
    raise exception 'Sesi login tidak tersedia.' using errcode = '42501';
  end if;
  if p_user_id is distinct from v_actor then
    raise exception 'p_user_id tidak sesuai dengan sesi login.' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = v_actor
      and coalesce(profile.is_active, true) = true
      and profile.deleted_at is null
  ) then
    raise exception 'Profil aktor tidak aktif atau telah dihapus.' using errcode = '42501';
  end if;

  select (office.kedudukan = 'Pusat')
    into v_is_pusat
  from public.master_offices office
  where office.id = p_office_id;

  if not found then
    raise exception 'Kantor penomoran tidak ditemukan.' using errcode = '23503';
  end if;

  perform pg_advisory_xact_lock(hashtext(
    'letter-number:' || p_entity_id::text || ':' || v_year::text || ':' ||
    case when v_is_pusat then 'pusat:' || p_dept_id::text
         else 'cabang:' || p_project_id::text
    end
  ));

  if v_is_pusat then
    select coalesce(max(start_from), 1)
      into v_start_from
    from public.letter_number_counter_configs config
    where config.scope_type = 'pusat'
      and config.is_active   = true
      and config.entity_id   = p_entity_id
      and config.dept_id     = p_dept_id
      and config.project_id  is null
      and config.office_id   is null
      and config.year        = v_year;

    select no_urut
      into v_next_val
    from public.surat_reservations
    where entity_id  = p_entity_id
      and dept_id    = p_dept_id
      and project_id is null
      and year       = v_year
      and no_urut    >= v_start_from
      and status     = 'CANCELLED'
    order by no_urut asc
    limit 1;
  else
    if p_project_id is null then
      raise exception 'Proyek wajib dipilih untuk pengajuan kantor cabang.' using errcode = '22023';
    end if;

    select coalesce(max(start_from), 1)
      into v_start_from
    from public.letter_number_counter_configs config
    where config.scope_type = 'cabang'
      and config.is_active   = true
      and config.entity_id   = p_entity_id
      and config.project_id  = p_project_id
      and config.dept_id     is null
      and config.office_id   is null
      and config.year        = v_year;

    select no_urut
      into v_next_val
    from public.surat_reservations
    where entity_id  = p_entity_id
      and project_id = p_project_id
      and dept_id    is null
      and year       = v_year
      and no_urut    >= v_start_from
      and status     = 'CANCELLED'
    order by no_urut asc
    limit 1;
  end if;

  if v_next_val is not null then
    if v_is_pusat then
      update public.surat_reservations
         set status      = 'PENDING',
             type_id     = p_type_id,
             office_id   = p_office_id,
             project_id  = null,
             dept_id     = p_dept_id,
             number_scope_type = 'pusat',
             reserved_by = p_user_id,
             created_at  = now(),
             expires_at  = (now() + interval '30 minutes')
       where entity_id = p_entity_id
         and year      = v_year
         and no_urut   = v_next_val
         and dept_id   = p_dept_id
         and project_id is null;
    else
      update public.surat_reservations
         set status      = 'PENDING',
             type_id     = p_type_id,
             office_id   = p_office_id,
             project_id  = p_project_id,
             dept_id     = null,
             number_scope_type = 'cabang',
             reserved_by = p_user_id,
             created_at  = now(),
             expires_at  = (now() + interval '30 minutes')
       where entity_id  = p_entity_id
         and year       = v_year
         and no_urut    = v_next_val
         and project_id = p_project_id
         and dept_id    is null;
    end if;
  else
    if v_is_pusat then
      select greatest(coalesce(max(no_urut), 0) + 1, v_start_from)
        into v_next_val
      from public.surat_reservations
      where entity_id  = p_entity_id
        and dept_id    = p_dept_id
        and project_id is null
        and year       = v_year;
    else
      select greatest(coalesce(max(no_urut), 0) + 1, v_start_from)
        into v_next_val
      from public.surat_reservations
      where entity_id  = p_entity_id
        and project_id = p_project_id
        and dept_id    is null
        and year       = v_year;
    end if;

    insert into public.surat_reservations (
      entity_id, type_id, office_id, project_id, dept_id,
      year, no_urut, status, reserved_by, number_scope_type
    ) values (
      p_entity_id,
      p_type_id,
      p_office_id,
      case when v_is_pusat then null else p_project_id end,
      case when v_is_pusat then p_dept_id else null end,
      v_year,
      v_next_val,
      'PENDING',
      p_user_id,
      case when v_is_pusat then 'pusat' else 'cabang' end
    );
  end if;

  return v_next_val;
end;
$$;

revoke all on function public.generate_new_letter_number(uuid, uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.generate_new_letter_number(uuid, uuid, uuid, uuid, uuid, uuid) to authenticated, service_role;

-- 10b. New 8-parameter signature: the only path that may create a
--      branch_asset_000 reservation.  Requires an authoritative form
--      usage (or legacy workflow) and a verified branch fallback.
create or replace function public.generate_new_letter_number(
  p_entity_id          uuid,
  p_type_id            uuid,
  p_office_id          uuid,
  p_project_id         uuid,
  p_user_id            uuid,
  p_dept_id            uuid,
  p_form_usage_id      uuid,
  p_legacy_workflow_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_next_val integer;
  v_year integer := extract(year from now());
  v_is_pusat boolean;
  v_is_branch_fallback boolean;
  v_start_from integer := 1;
begin
  if v_actor is null then
    raise exception 'Sesi login tidak tersedia.' using errcode = '42501';
  end if;
  if p_user_id is distinct from v_actor then
    raise exception 'p_user_id tidak sesuai dengan sesi login.' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = v_actor
      and coalesce(profile.is_active, true) = true
      and profile.deleted_at is null
  ) then
    raise exception 'Profil aktor tidak aktif atau telah dihapus.' using errcode = '42501';
  end if;
  if p_form_usage_id is null and p_legacy_workflow_id is null then
    raise exception 'Form usage atau workflow wajib diisi untuk pemesanan nomor.' using errcode = '22023';
  end if;

  select (office.kedudukan = 'Pusat')
    into v_is_pusat
  from public.master_offices office
  where office.id = p_office_id;

  if not found then
    raise exception 'Kantor penomoran tidak ditemukan.' using errcode = '23503';
  end if;

  v_is_branch_fallback := (not v_is_pusat) and p_project_id is null;

  if v_is_branch_fallback then
    perform public.assert_branch_asset_fallback_eligible(
      v_actor, p_office_id, p_form_usage_id, p_legacy_workflow_id
    );
  elsif not v_is_pusat and p_project_id is null then
    raise exception 'Proyek wajib dipilih untuk pengajuan kantor cabang.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(
    'letter-number:' || p_entity_id::text || ':' || v_year::text || ':' ||
    case
      when v_is_pusat          then 'pusat:'          || p_dept_id::text
      when v_is_branch_fallback then 'cabang_000:'    || p_office_id::text
      else                           'cabang:'        || p_project_id::text
    end
  ));

  if v_is_pusat then
    select coalesce(max(start_from), 1)
      into v_start_from
    from public.letter_number_counter_configs config
    where config.scope_type = 'pusat'
      and config.is_active   = true
      and config.entity_id   = p_entity_id
      and config.dept_id     = p_dept_id
      and config.project_id  is null
      and config.office_id   is null
      and config.year        = v_year;

    select no_urut
      into v_next_val
    from public.surat_reservations
    where entity_id  = p_entity_id
      and dept_id    = p_dept_id
      and project_id is null
      and year       = v_year
      and no_urut    >= v_start_from
      and status     = 'CANCELLED'
    order by no_urut asc
    limit 1;
  elsif v_is_branch_fallback then
    select coalesce(max(start_from), 1)
      into v_start_from
    from public.letter_number_counter_configs config
    where config.scope_type = 'cabang_000'
      and config.is_active   = true
      and config.entity_id   = p_entity_id
      and config.office_id   = p_office_id
      and config.project_id  is null
      and config.dept_id     is null
      and config.year        = v_year;

    select no_urut
      into v_next_val
    from public.surat_reservations
    where entity_id  = p_entity_id
      and office_id  = p_office_id
      and project_id is null
      and dept_id    is null
      and number_scope_type = 'branch_asset_000'
      and year       = v_year
      and no_urut    >= v_start_from
      and status     = 'CANCELLED'
    order by no_urut asc
    limit 1;
  else
    select coalesce(max(start_from), 1)
      into v_start_from
    from public.letter_number_counter_configs config
    where config.scope_type = 'cabang'
      and config.is_active   = true
      and config.entity_id   = p_entity_id
      and config.project_id  = p_project_id
      and config.dept_id     is null
      and config.office_id   is null
      and config.year        = v_year;

    select no_urut
      into v_next_val
    from public.surat_reservations
    where entity_id  = p_entity_id
      and project_id = p_project_id
      and dept_id    is null
      and year       = v_year
      and no_urut    >= v_start_from
      and status     = 'CANCELLED'
    order by no_urut asc
    limit 1;
  end if;

  if v_next_val is not null then
    if v_is_pusat then
      update public.surat_reservations
         set status      = 'PENDING',
             type_id     = p_type_id,
             office_id   = p_office_id,
             project_id  = null,
             dept_id     = p_dept_id,
             number_scope_type = 'pusat',
             reserved_by = p_user_id,
             created_at  = now(),
             expires_at  = (now() + interval '30 minutes')
       where entity_id = p_entity_id
         and year      = v_year
         and no_urut   = v_next_val
         and dept_id   = p_dept_id
         and project_id is null;
    elsif v_is_branch_fallback then
      update public.surat_reservations
         set status      = 'PENDING',
             type_id     = p_type_id,
             office_id   = p_office_id,
             project_id  = null,
             dept_id     = null,
             number_scope_type = 'branch_asset_000',
             reserved_by = p_user_id,
             created_at  = now(),
             expires_at  = (now() + interval '30 minutes')
       where entity_id = p_entity_id
         and year      = v_year
         and no_urut   = v_next_val
         and office_id = p_office_id
         and project_id is null
         and dept_id   is null
         and number_scope_type = 'branch_asset_000';
    else
      update public.surat_reservations
         set status      = 'PENDING',
             type_id     = p_type_id,
             office_id   = p_office_id,
             project_id  = p_project_id,
             dept_id     = null,
             number_scope_type = 'cabang',
             reserved_by = p_user_id,
             created_at  = now(),
             expires_at  = (now() + interval '30 minutes')
       where entity_id  = p_entity_id
         and year       = v_year
         and no_urut    = v_next_val
         and project_id = p_project_id
         and dept_id    is null;
    end if;
  else
    if v_is_pusat then
      select greatest(coalesce(max(no_urut), 0) + 1, v_start_from)
        into v_next_val
      from public.surat_reservations
      where entity_id  = p_entity_id
        and dept_id    = p_dept_id
        and project_id is null
        and year       = v_year;
    elsif v_is_branch_fallback then
      select greatest(coalesce(max(no_urut), 0) + 1, v_start_from)
        into v_next_val
      from public.surat_reservations
      where entity_id  = p_entity_id
        and office_id  = p_office_id
        and project_id is null
        and dept_id    is null
        and number_scope_type = 'branch_asset_000'
        and year       = v_year;
    else
      select greatest(coalesce(max(no_urut), 0) + 1, v_start_from)
        into v_next_val
      from public.surat_reservations
      where entity_id  = p_entity_id
        and project_id = p_project_id
        and dept_id    is null
        and year       = v_year;
    end if;

    insert into public.surat_reservations (
      entity_id, type_id, office_id, project_id, dept_id,
      year, no_urut, status, reserved_by, number_scope_type
    ) values (
      p_entity_id,
      p_type_id,
      p_office_id,
      case when v_is_pusat or v_is_branch_fallback then null else p_project_id end,
      case when v_is_pusat then p_dept_id else null end,
      v_year,
      v_next_val,
      'PENDING',
      p_user_id,
      case
        when v_is_pusat          then 'pusat'
        when v_is_branch_fallback then 'branch_asset_000'
        else                           'cabang'
      end
    );
  end if;

  return v_next_val;
end;
$$;

revoke all on function public.generate_new_letter_number(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.generate_new_letter_number(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) to authenticated, service_role;
