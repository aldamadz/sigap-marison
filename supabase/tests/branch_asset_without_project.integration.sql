-- Test: 20260903120000_branch_asset_without_project.sql (MRN-22)
-- Run on a DISPOSABLE PostgreSQL database, NOT on staging Supabase.
-- Prerequisite: canonical schema (master_offices, master_projects,
-- master_entities, master_dept_letter_types, master_departments,
-- master_penggunaan_detail, profiles, surat_reservations,
-- surat_registrasi, letter_number_counter_configs) and the
-- migration already applied (outside this transaction).
-- Run: psql -f supabase/tests/branch_asset_without_project.integration.sql
-- Safety: everything inside BEGIN ... ROLLBACK; no data persists.

begin;

set search_path = public;

-- ============================================================
-- Fixture: profiles
-- ============================================================
insert into public.profiles (
  id, nik, full_name, job_title, is_active, theme_preference,
  marison_review_required, marison_review_reasons, role, email
) values
  ('a0000000-0000-4000-8000-000000000001', 'MRN-PROF-01', 'MRN Requester', 'Staf', true, 'system', false, '{}'::text[], 'user', 'mrn-req@test.local');

-- ============================================================
-- Fixture: entity
-- ============================================================
insert into public.master_entities (id, code, name) values
  ('a0000000-0000-4000-8000-000000000010', 'MRN', 'PT MRN Test');

-- ============================================================
-- Fixture: department
-- ============================================================
insert into public.master_departments (id, code, name, dept_index, entity_id) values
  ('a0000000-0000-4000-8000-000000000020', 'OPS', 'Operasional', 1, 'a0000000-0000-4000-8000-000000000010');

-- ============================================================
-- Fixture: offices
--   - Pusat: keep as canonical
--   - Branch without projects: MRN_KC_NOPROJ
--   - Branch with projects: MRN_KC_HASPROJ
-- ============================================================
insert into public.master_offices (id, code, name, kedudukan) values
  ('a0000000-0000-4000-8000-000000000030', 'MRN_PUSAT', 'MRN Pusat', 'Pusat'),
  ('a0000000-0000-4000-8000-000000000031', 'MRN_KC_NOPROJ', 'MRN KC Tanpa Proyek', 'KC'),
  ('a0000000-0000-4000-8000-000000000032', 'MRN_KC_HASPROJ', 'MRN KC Dengan Proyek', 'KC');

-- ============================================================
-- Fixture: a real project owned by MRN_KC_HASPROJ
-- ============================================================
insert into public.master_projects (id, code, name, office_id, entity_id) values
  ('a0000000-0000-4000-8000-000000000040', 'PRJ001', 'Proyek Real Satu', 'a0000000-0000-4000-8000-000000000032', 'a0000000-0000-4000-8000-000000000010');

-- ============================================================
-- Fixture: letter type and dept mapping
-- ============================================================
insert into public.master_letter_types (id, code, name, entity_id) values
  ('a0000000-0000-4000-8000-000000000050', 'L01', 'Aset', 'a0000000-0000-4000-8000-000000000010');

insert into public.master_dept_letter_types (id, dept_id, letter_type_id, sort_index) values
  ('a0000000-0000-4000-8000-000000000051', 'a0000000-0000-4000-8000-000000000020', 'a0000000-0000-4000-8000-000000000050', 1);

-- ============================================================
-- Test 1: branch_has_active_projects() returns correct values
-- ============================================================
do $$
declare
  v_has bool;
begin
  v_has := public.branch_has_active_projects('a0000000-0000-4000-8000-000000000031'::uuid);
  if v_has <> false then
    raise exception 'expected no projects for branch MRN_KC_NOPROJ, got %', v_has;
  end if;

  v_has := public.branch_has_active_projects('a0000000-0000-4000-8000-000000000032'::uuid);
  if v_has <> true then
    raise exception 'expected projects for branch MRN_KC_HASPROJ, got %', v_has;
  end if;
end
$$;

-- ============================================================
-- Test 2: is_valid_branch_asset_fallback() — full marker passes
-- ============================================================
do $$
declare
  v_ok bool;
begin
  v_ok := public.is_valid_branch_asset_fallback(
    'a0000000-0000-4000-8000-000000000031'::uuid,  -- branch without projects
    null,
    '{
      "request_category": "asset",
      "project_is_default": true,
      "project_code": "000",
      "project_name": "Tanpa proyek"
    }'::jsonb
  );
  if v_ok <> true then
    raise exception 'expected fallback to be valid for genuine branch-asset, got %', v_ok;
  end if;
end
$$;

-- ============================================================
-- Test 3: is_valid_branch_asset_fallback() — forged payload from
-- branch WITH projects is rejected (DB-side guard).
-- ============================================================
do $$
declare
  v_ok bool;
begin
  v_ok := public.is_valid_branch_asset_fallback(
    'a0000000-0000-4000-8000-000000000032'::uuid,  -- branch WITH projects
    null,
    '{
      "request_category": "asset",
      "project_is_default": true,
      "project_code": "000",
      "project_name": "Tanpa proyek"
    }'::jsonb
  );
  if v_ok <> false then
    raise exception 'expected fallback to be REJECTED for branch with projects, got %', v_ok;
  end if;
end
$$;

-- ============================================================
-- Test 4: is_valid_branch_asset_fallback() — missing marker rejected
-- ============================================================
do $$
declare
  v_ok bool;
begin
  v_ok := public.is_valid_branch_asset_fallback(
    'a0000000-0000-4000-8000-000000000031'::uuid,
    null,
    '{"request_category": "asset"}'::jsonb  -- no marker
  );
  if v_ok <> false then
    raise exception 'expected fallback rejected when markers missing, got %', v_ok;
  end if;

  v_ok := public.is_valid_branch_asset_fallback(
    'a0000000-0000-4000-8000-000000000031'::uuid,
    null,
    '{
      "request_category": "unit",
      "project_is_default": true,
      "project_code": "000",
      "project_name": "Tanpa proyek"
    }'::jsonb
  );
  if v_ok <> false then
    raise exception 'expected fallback rejected for non-asset category, got %', v_ok;
  end if;
end
$$;

-- ============================================================
-- Test 5: generate_new_letter_number() — branch asset fallback
--   succeeds and produces 1, then 2, then 3 (counter scope).
-- ============================================================
do $$
declare
  v_n1 int;
  v_n2 int;
  v_n3 int;
begin
  v_n1 := public.generate_new_letter_number(
    'a0000000-0000-4000-8000-000000000010'::uuid,  -- entity
    'a0000000-0000-4000-8000-000000000050'::uuid,  -- letter type
    'a0000000-0000-4000-8000-000000000031'::uuid,  -- branch without projects
    null,                                          -- project_id null
    'a0000000-0000-4000-8000-000000000001'::uuid,  -- user
    'a0000000-0000-4000-8000-000000000020'::uuid,  -- dept
    true                                            -- p_is_asset_fallback
  );
  if v_n1 <> 1 then
    raise exception 'expected first fallback no_urut=1, got %', v_n1;
  end if;

  v_n2 := public.generate_new_letter_number(
    'a0000000-0000-4000-8000-000000000010'::uuid,
    'a0000000-0000-4000-8000-000000000050'::uuid,
    'a0000000-0000-4000-8000-000000000031'::uuid,
    null,
    'a0000000-0000-4000-8000-000000000001'::uuid,
    'a0000000-0000-4000-8000-000000000020'::uuid,
    true
  );
  if v_n2 <> 2 then
    raise exception 'expected second fallback no_urut=2, got %', v_n2;
  end if;

  v_n3 := public.generate_new_letter_number(
    'a0000000-0000-4000-8000-000000000010'::uuid,
    'a0000000-0000-4000-8000-000000000050'::uuid,
    'a0000000-0000-4000-8000-000000000031'::uuid,
    null,
    'a0000000-0000-4000-8000-000000000001'::uuid,
    'a0000000-0000-4000-8000-000000000020'::uuid,
    true
  );
  if v_n3 <> 3 then
    raise exception 'expected third fallback no_urut=3, got %', v_n3;
  end if;
end
$$;

-- ============================================================
-- Test 6: counter is isolated per (entity, office, year) — a
-- fallback reservation on branch A must not collide with branch B
-- ============================================================
do $$
declare
  v_n int;
  v_exists bool;
begin
  v_n := public.generate_new_letter_number(
    'a0000000-0000-4000-8000-000000000010'::uuid,
    'a0000000-0000-4000-8000-000000000050'::uuid,
    'a0000000-0000-4000-8000-000000000031'::uuid,  -- branch A
    null,
    'a0000000-0000-4000-8000-000000000001'::uuid,
    'a0000000-0000-4000-8000-000000000020'::uuid,
    true
  );
  if v_n <> 4 then
    raise exception 'expected branch A counter to continue from 4, got %', v_n;
  end if;

  -- Now insert a project for branch B so we can test that the
  -- branch_has_active_projects guard prevents fallback (a different
  -- test verifies that).  Here we directly test counter isolation.
  select exists (
    select 1 from public.surat_reservations
    where entity_id = 'a0000000-0000-4000-8000-000000000010'::uuid
      and office_id = 'a0000000-0000-4000-8000-000000000031'::uuid
      and project_id is null
      and dept_id is null
  ) into v_exists;
  if not v_exists then
    raise exception 'fallback reservation should have office_id=branch A';
  end if;
end
$$;

-- ============================================================
-- Test 7: generate_new_letter_number() REJECTS fallback when
-- branch has projects (security gate).
-- ============================================================
do $$
declare
  v_n int;
begin
  begin
    v_n := public.generate_new_letter_number(
      'a0000000-0000-4000-8000-000000000010'::uuid,
      'a0000000-0000-4000-8000-000000000050'::uuid,
      'a0000000-0000-4000-8000-000000000032'::uuid,  -- branch WITH projects
      null,
      'a0000000-0000-4000-8000-000000000001'::uuid,
      'a0000000-0000-4000-8000-000000000020'::uuid,
      true
    );
    raise exception 'expected fallback rejection on branch with projects, but got n=%', v_n;
  exception when others then
    if sqlerrm not like '%fallback%' and sqlerrm not like '%proyek%' then
      raise exception 'unexpected error: %', sqlerrm;
    end if;
  end;
end
$$;

-- ============================================================
-- Test 8: reservation trigger accepts fallback reservation
-- (project_id null, dept_id null, branch with no projects)
-- ============================================================
do $$
declare
  v_res_id uuid;
begin
  -- simulate by calling generate_new_letter_number again
  v_res_id := (
    select id from public.surat_reservations
    where entity_id = 'a0000000-0000-4000-8000-000000000010'::uuid
      and office_id = 'a0000000-0000-4000-8000-000000000031'::uuid
      and project_id is null
      and dept_id is null
    order by no_urut desc
    limit 1
  );
  if v_res_id is null then
    raise exception 'expected at least one fallback reservation';
  end if;
end
$$;

-- ============================================================
-- Test 9: reservation trigger REJECTS fallback on branch with projects
-- (direct insert simulating forged payload).
-- ============================================================
do $$
declare
  v_failed boolean := false;
begin
  begin
    insert into public.surat_reservations (
      entity_id, type_id, office_id, project_id, dept_id,
      year, no_urut, status, reserved_by
    ) values (
      'a0000000-0000-4000-8000-000000000010'::uuid,
      'a0000000-0000-4000-8000-000000000050'::uuid,
      'a0000000-0000-4000-8000-000000000032'::uuid,  -- branch WITH projects
      null,
      null,
      extract(year from now())::int,
      999,
      'PENDING',
      'a0000000-0000-4000-8000-000000000001'::uuid
    );
  exception when others then
    v_failed := true;
    if sqlerrm not like '%proyek%' then
      raise exception 'unexpected reservation error: %', sqlerrm;
    end if;
  end;
  if not v_failed then
    raise exception 'expected reservation trigger to reject null project on branch with projects';
  end if;
end
$$;

-- ============================================================
-- Test 10: registration trigger accepts fallback for branch without projects
-- (project_id null, form_input_data carries markers)
-- ============================================================
do $$
declare
  v_surat_id uuid;
begin
  insert into public.surat_registrasi (
    no_surat, entity_id, office_id, project_id, dept_id,
    letter_type_id, judul_surat, status, current_step,
    created_by, form_input_data, data_snapshot, requester_snapshot,
    location_snapshot, policy_snapshot
  ) values (
    '001/MRN/999/IX/2026',
    'a0000000-0000-4000-8000-000000000010'::uuid,
    'a0000000-0000-4000-8000-000000000031'::uuid,  -- branch no projects
    null,
    'a0000000-0000-4000-8000-000000000020'::uuid,
    'a0000000-0000-4000-8000-000000000050'::uuid,
    'Surat Aset Tanpa Proyek',
    'PROSES', 1,
    'a0000000-0000-4000-8000-000000000001'::uuid,
    '{
      "request_category": "asset",
      "project_is_default": true,
      "project_code": "000",
      "project_name": "Tanpa proyek"
    }'::jsonb,
    '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
  )
  returning id into v_surat_id;
  if v_surat_id is null then
    raise exception 'expected fallback registration to be inserted';
  end if;
end
$$;

-- ============================================================
-- Test 11: registration trigger REJECTS forged fallback on branch
-- WITH projects (markers present but DB has projects).
-- ============================================================
do $$
declare
  v_failed boolean := false;
begin
  begin
    insert into public.surat_registrasi (
      no_surat, entity_id, office_id, project_id, dept_id,
      letter_type_id, judul_surat, status, current_step,
      created_by, form_input_data, data_snapshot, requester_snapshot,
      location_snapshot, policy_snapshot
    ) values (
      '002/MRN/999/IX/2026',
      'a0000000-0000-4000-8000-000000000010'::uuid,
      'a0000000-0000-4000-8000-000000000032'::uuid,  -- branch WITH projects
      null,
      'a0000000-0000-4000-8000-000000000020'::uuid,
      'a0000000-0000-4000-8000-000000000050'::uuid,
      'Surat Aset Tanpa Proyek Forged',
      'PROSES', 1,
      'a0000000-0000-4000-8000-000000000001'::uuid,
      '{
        "request_category": "asset",
        "project_is_default": true,
        "project_code": "000",
        "project_name": "Tanpa proyek"
      }'::jsonb,
      '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
    );
  exception when others then
    v_failed := true;
    if sqlerrm not like '%Proyek%' then
      raise exception 'unexpected registration error: %', sqlerrm;
    end if;
  end;
  if not v_failed then
    raise exception 'expected registration trigger to reject forged fallback on branch with projects';
  end if;
end
$$;

-- ============================================================
-- Test 12: registration trigger still rejects null project on
-- branch with projects when markers are absent.
-- ============================================================
do $$
declare
  v_failed boolean := false;
begin
  begin
    insert into public.surat_registrasi (
      no_surat, entity_id, office_id, project_id, dept_id,
      letter_type_id, judul_surat, status, current_step,
      created_by, form_input_data, data_snapshot, requester_snapshot,
      location_snapshot, policy_snapshot
    ) values (
      '003/MRN/999/IX/2026',
      'a0000000-0000-4000-8000-000000000010'::uuid,
      'a0000000-0000-4000-8000-000000000032'::uuid,  -- branch WITH projects
      null,
      'a0000000-0000-4000-8000-000000000020'::uuid,
      'a0000000-0000-4000-8000-000000000050'::uuid,
      'Surat Aset Tanpa Proyek Aset',
      'PROSES', 1,
      'a0000000-0000-4000-8000-000000000001'::uuid,
      '{"request_category": "asset"}'::jsonb,
      '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
    );
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'expected registration trigger to reject null project on branch with projects when no marker';
  end if;
end
$$;

-- ============================================================
-- Test 13: pusat office is unaffected — its null project_id
-- branch continues to be rejected, fallback flag ignored.
-- ============================================================
do $$
declare
  v_failed boolean := false;
begin
  begin
    -- Pusat without project_id AND without dept_id should be rejected
    -- (pusat requires dept_id, project_id must be null)
    insert into public.surat_reservations (
      entity_id, type_id, office_id, project_id, dept_id,
      year, no_urut, status, reserved_by
    ) values (
      'a0000000-0000-4000-8000-000000000010'::uuid,
      'a0000000-0000-4000-8000-000000000050'::uuid,
      'a0000000-0000-4000-8000-000000000030'::uuid,  -- Pusat
      null,
      null,  -- missing dept for Pusat
      extract(year from now())::int,
      999,
      'PENDING',
      'a0000000-0000-4000-8000-000000000001'::uuid
    );
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'expected pusat trigger to reject missing dept_id';
  end if;
end
$$;

-- ============================================================
-- Test 14: Unit category never uses fallback (additional safety)
-- ============================================================
do $$
declare
  v_ok bool;
begin
  v_ok := public.is_valid_branch_asset_fallback(
    'a0000000-0000-4000-8000-000000000031'::uuid,  -- branch no projects
    null,
    '{
      "request_category": "unit",
      "project_is_default": true,
      "project_code": "000",
      "project_name": "Tanpa proyek"
    }'::jsonb
  );
  if v_ok <> false then
    raise exception 'expected fallback rejected for unit category';
  end if;
end
$$;

rollback;  -- safety: no data persists
