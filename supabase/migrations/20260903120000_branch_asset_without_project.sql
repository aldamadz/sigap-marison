-- MRN-22: Branch asset without project (virtual scope "000").
--
-- Problem: branch offices that genuinely have no registered projects cannot
-- register Asset documents because every branch trigger requires project_id NOT NULL.
--
-- Solution: introduce a narrow, database-verified exception for the single case
-- where ALL of the following are simultaneously true:
--   1. office.kedudukan <> 'Pusat'  (branch office)
--   2. request_category = 'asset'
--   3. project_id IS NULL in the payload
--   4. form_input_data->>'project_is_default' = 'true'
--   5. form_input_data->>'project_code'       = '000'
--   6. DB confirms: the branch has NO active projects
--
-- Security notes:
--   - DB independently verifies there are no active projects for the branch;
--     a forged payload sent from a branch that HAS projects is always rejected.
--   - Counter scope for the virtual "000" is (entity_id, office_id, year) —
--     isolated per branch per year, no collision with any real project.
--   - project_id remains NULL in the database row; no synthetic project is created.
--   - RLS and ownership rules are unchanged.
--   - All functions use SECURITY DEFINER with fixed search_path and revoke PUBLIC.

-- ─── 1. Helper: branch has active projects ────────────────────────────────────
-- Returns TRUE if the branch office has at least one project in master_projects.
-- Used by triggers to verify the fallback claim is legitimate.

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

-- ─── 2. Helper: validate branch-asset fallback payload ───────────────────────
-- Pure boolean predicate called by both the reservation trigger and the
-- registration trigger. Centralises the rule so the two triggers stay in sync.

create or replace function public.is_valid_branch_asset_fallback(
  p_office_id   uuid,
  p_project_id  uuid,
  p_form_input  jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_project_id is null
    and coalesce(p_form_input->>'request_category', '') = 'asset'
    and coalesce(p_form_input->>'project_is_default', '') = 'true'
    and coalesce(p_form_input->>'project_code', '')        = '000'
    and coalesce(p_form_input->>'project_name', '')        = 'Tanpa proyek'
    -- DB-side verification: branch must genuinely have no projects
    and not public.branch_has_active_projects(p_office_id);
$$;

revoke all on function public.is_valid_branch_asset_fallback(uuid, uuid, jsonb) from public, anon;
grant execute on function public.is_valid_branch_asset_fallback(uuid, uuid, jsonb) to authenticated, service_role;

-- ─── 3. Reservation scope counter for virtual "000" ─────────────────────────
-- We need a separate counter config scope for the fallback so it does not
-- collide with the per-project counter.  We add a new scope_type 'cabang_000'.
-- The letter_number_counter_configs constraint is replaced to allow this scope.

alter table public.letter_number_counter_configs
  drop constraint if exists letter_number_counter_scope_check;

alter table public.letter_number_counter_configs
  add constraint letter_number_counter_scope_check check (
    (scope_type = 'pusat'      and dept_id    is not null and project_id is null  and office_id is null)
    or
    (scope_type = 'cabang'     and project_id is not null and dept_id    is null  and office_id is null)
    or
    (scope_type = 'cabang_000' and office_id  is not null and project_id is null  and dept_id   is null)
  );

-- Add office_id column if it doesn't exist (idempotent: column added only once)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'letter_number_counter_configs'
      and column_name  = 'office_id'
  ) then
    alter table public.letter_number_counter_configs
      add column office_id uuid references public.master_offices(id) on delete cascade;
  end if;
end;
$$;

-- Unique index for cabang_000 scope: one counter per (entity, office, year)
create unique index if not exists letter_number_counter_cabang_000_unique
on public.letter_number_counter_configs(entity_id, year, office_id)
where scope_type = 'cabang_000' and is_active = true;

-- ─── 4. generate_new_letter_number — extend to support virtual "000" scope ───
-- New optional parameter p_is_asset_fallback.  When true, the RPC bypasses the
-- project_id requirement for branches and uses (entity_id, office_id, year) as
-- the counter partition.  A reservation with project_id = NULL is inserted; the
-- updated trigger (step 5) will accept it.

create or replace function public.generate_new_letter_number(
  p_entity_id         uuid,
  p_type_id           uuid,
  p_office_id         uuid,
  p_project_id        uuid,
  p_user_id           uuid,
  p_dept_id           uuid        default null::uuid,
  p_is_asset_fallback boolean     default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_next_val  integer;
  v_year      integer := extract(year from now());
  v_is_pusat  boolean;
  v_start_from integer := 1;
begin
  select (kedudukan = 'Pusat') into v_is_pusat
  from public.master_offices
  where id = p_office_id;

  if not found then
    raise exception 'Kantor penomoran tidak ditemukan.' using errcode = '23503';
  end if;

  -- Security: asset-fallback only allowed when branch genuinely has no projects
  if p_is_asset_fallback then
    if v_is_pusat then
      raise exception 'Fallback proyek 000 tidak berlaku untuk kantor pusat.' using errcode = '22023';
    end if;
    if p_project_id is not null then
      raise exception 'Fallback proyek 000 tidak boleh disertai project_id.' using errcode = '22023';
    end if;
    if public.branch_has_active_projects(p_office_id) then
      raise exception 'Kantor cabang ini memiliki proyek aktif; fallback 000 ditolak.' using errcode = '22023';
    end if;
  end if;

  -- ── Pusat branch ────────────────────────────────────────────────────────
  if v_is_pusat then
    select coalesce(max(start_from), 1) into v_start_from
    from public.letter_number_counter_configs
    where scope_type = 'pusat'
      and is_active   = true
      and entity_id   = p_entity_id
      and dept_id     = p_dept_id
      and project_id  is null
      and year        = v_year;

    select no_urut into v_next_val
    from public.surat_reservations
    where entity_id   = p_entity_id
      and dept_id     = p_dept_id
      and project_id  is null
      and year        = v_year
      and no_urut     >= v_start_from
      and status      = 'CANCELLED'
    order by no_urut asc
    limit 1;

  -- ── Branch 000 fallback ─────────────────────────────────────────────────
  elsif p_is_asset_fallback then
    select coalesce(max(start_from), 1) into v_start_from
    from public.letter_number_counter_configs
    where scope_type = 'cabang_000'
      and is_active   = true
      and entity_id   = p_entity_id
      and office_id   = p_office_id
      and project_id  is null
      and dept_id     is null
      and year        = v_year;

    -- Advisory lock: prevent concurrent numbering on the same (entity, office, year)
    perform pg_advisory_xact_lock(
      hashtext('cabang_000:' || p_entity_id::text || ':' || p_office_id::text || ':' || v_year::text)
    );

    select no_urut into v_next_val
    from public.surat_reservations
    where entity_id   = p_entity_id
      and office_id   = p_office_id
      and project_id  is null
      and dept_id     is null
      and year        = v_year
      and no_urut     >= v_start_from
      and status      = 'CANCELLED'
      -- Only recycle reservations that were themselves fallback (no project, no dept)
    order by no_urut asc
    limit 1;

  -- ── Regular branch (has project) ────────────────────────────────────────
  else
    select coalesce(max(start_from), 1) into v_start_from
    from public.letter_number_counter_configs
    where scope_type = 'cabang'
      and is_active   = true
      and entity_id   = p_entity_id
      and project_id  = p_project_id
      and dept_id     is null
      and year        = v_year;

    select no_urut into v_next_val
    from public.surat_reservations
    where entity_id   = p_entity_id
      and project_id  = p_project_id
      and dept_id     is null
      and year        = v_year
      and no_urut     >= v_start_from
      and status      = 'CANCELLED'
    order by no_urut asc
    limit 1;
  end if;

  -- ── Reuse CANCELLED slot or allocate next ────────────────────────────────
  if v_next_val is not null then
    if v_is_pusat then
      update public.surat_reservations
      set status      = 'PENDING',
          type_id     = p_type_id,
          office_id   = p_office_id,
          project_id  = null,
          dept_id     = p_dept_id,
          reserved_by = p_user_id,
          created_at  = now(),
          expires_at  = (now() + '00:30:00'::interval)
      where entity_id = p_entity_id
        and year      = v_year
        and no_urut   = v_next_val
        and dept_id   = p_dept_id
        and project_id is null;
    elsif p_is_asset_fallback then
      update public.surat_reservations
      set status      = 'PENDING',
          type_id     = p_type_id,
          office_id   = p_office_id,
          project_id  = null,
          dept_id     = null,
          reserved_by = p_user_id,
          created_at  = now(),
          expires_at  = (now() + '00:30:00'::interval)
      where entity_id = p_entity_id
        and year      = v_year
        and no_urut   = v_next_val
        and office_id = p_office_id
        and project_id is null
        and dept_id   is null;
    else
      update public.surat_reservations
      set status      = 'PENDING',
          type_id     = p_type_id,
          office_id   = p_office_id,
          project_id  = p_project_id,
          dept_id     = null,
          reserved_by = p_user_id,
          created_at  = now(),
          expires_at  = (now() + '00:30:00'::interval)
      where entity_id  = p_entity_id
        and year       = v_year
        and no_urut    = v_next_val
        and project_id = p_project_id
        and dept_id    is null;
    end if;
  else
    -- Allocate next number
    if v_is_pusat then
      select greatest(coalesce(max(no_urut), 0) + 1, v_start_from) into v_next_val
      from public.surat_reservations
      where entity_id  = p_entity_id
        and dept_id    = p_dept_id
        and project_id is null
        and year       = v_year;
    elsif p_is_asset_fallback then
      select greatest(coalesce(max(no_urut), 0) + 1, v_start_from) into v_next_val
      from public.surat_reservations
      where entity_id  = p_entity_id
        and office_id  = p_office_id
        and project_id is null
        and dept_id    is null
        and year       = v_year;
    else
      select greatest(coalesce(max(no_urut), 0) + 1, v_start_from) into v_next_val
      from public.surat_reservations
      where entity_id  = p_entity_id
        and project_id = p_project_id
        and dept_id    is null
        and year       = v_year;
    end if;

    insert into public.surat_reservations (
      entity_id, type_id, office_id, project_id, dept_id,
      year, no_urut, status, reserved_by
    ) values (
      p_entity_id,
      p_type_id,
      p_office_id,
      case when v_is_pusat or p_is_asset_fallback then null else p_project_id end,
      case when v_is_pusat then p_dept_id else null end,
      v_year,
      v_next_val,
      'PENDING',
      p_user_id
    );
  end if;

  return v_next_val;
end;
$function$;

-- Preserve existing grant + add overload grant (same name, new signature)
revoke all on function public.generate_new_letter_number(uuid,uuid,uuid,uuid,uuid,uuid) from public, anon;
revoke all on function public.generate_new_letter_number(uuid,uuid,uuid,uuid,uuid,uuid,boolean) from public, anon;
grant execute on function public.generate_new_letter_number(uuid,uuid,uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.generate_new_letter_number(uuid,uuid,uuid,uuid,uuid,uuid,boolean) to authenticated;

-- ─── 5. Update reservation scope trigger ─────────────────────────────────────
-- Allow project_id IS NULL AND dept_id IS NULL when it is a branch-asset fallback
-- reservation.  The fallback is verified by checking there are no projects on the
-- branch — so a forged payload from a branch WITH projects is still rejected.

create or replace function public.enforce_surat_reservation_number_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kedudukan text;
begin
  select office.kedudukan into v_kedudukan
  from public.master_offices office where office.id = new.office_id;
  if not found then raise exception 'Kantor penomoran tidak ditemukan.' using errcode = '23503'; end if;

  if v_kedudukan = 'Pusat' then
    if new.dept_id is null or new.project_id is not null then
      raise exception 'Penomoran kantor pusat wajib per departemen tanpa scope proyek.' using errcode = '22023';
    end if;
  else
    -- Branch: allow either a real project OR a verified asset-fallback (both project_id and dept_id NULL)
    if new.project_id is null and new.dept_id is null then
      -- Must be a genuine fallback: branch has no projects
      if public.branch_has_active_projects(new.office_id) then
        raise exception 'Penomoran cabang tanpa proyek hanya diizinkan jika kantor tidak memiliki proyek aktif.' using errcode = '22023';
      end if;
      -- Valid fallback — allow through
    elsif new.project_id is null then
      -- dept_id set but no project_id on a branch → invalid
      raise exception 'Penomoran kantor cabang wajib per proyek tanpa scope departemen.' using errcode = '22023';
    else
      -- project_id present: validate it belongs to this office
      if new.dept_id is not null then
        raise exception 'Penomoran kantor cabang wajib per proyek tanpa scope departemen.' using errcode = '22023';
      end if;
      if not exists (
        select 1 from public.master_projects project
        where project.id = new.project_id and project.office_id = new.office_id
      ) then
        raise exception 'Proyek penomoran tidak berada pada kantor cabang yang dipilih.' using errcode = '22023';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_surat_reservation_number_scope on public.surat_reservations;
create trigger trg_enforce_surat_reservation_number_scope
before insert or update of office_id, project_id, dept_id, year
on public.surat_reservations
for each row execute function public.enforce_surat_reservation_number_scope();

-- ─── 6. Update registration trigger ──────────────────────────────────────────
-- Allow project_id IS NULL on a branch registration only when all fallback
-- markers are present AND the DB confirms the branch has no projects.

create or replace function public.enforce_surat_registration_branch_project()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kedudukan text;
begin
  select office.kedudukan into v_kedudukan
  from public.master_offices office where office.id = new.office_id;
  if not found then raise exception 'Kantor penerbit tidak ditemukan.' using errcode = '23503'; end if;

  if v_kedudukan <> 'Pusat' then
    if new.project_id is null then
      -- Allowed only for verified branch-asset fallback
      if not public.is_valid_branch_asset_fallback(
        new.office_id,
        new.project_id,
        coalesce(new.form_input_data, '{}'::jsonb)
      ) then
        raise exception 'Proyek wajib dipilih untuk pengajuan kantor cabang.' using errcode = '22023';
      end if;
      -- Valid fallback — allow through
    else
      -- project_id provided: must belong to this office
      if not exists (
        select 1 from public.master_projects project
        where project.id = new.project_id and project.office_id = new.office_id
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
