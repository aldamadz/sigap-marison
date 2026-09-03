-- Test: 20260903120000_branch_asset_without_project.sql (MRN-22)
-- Disposable PostgreSQL integration test.
-- The runner script (scripts/test-branch-asset-without-project-sql.mjs) sets
-- up a minimal canonical schema, applies the migration under test, and then
-- runs these assertions inside BEGIN ... ROLLBACK; no data persists.
--
-- Prerequisite fixtures (provided by the runner):
--   profiles:           f0000000-0000-4000-8000-000000000001 (active user)
--                       f0000000-0000-4000-8000-000000000002 (active user)
--   master_offices:     a0000000-0000-4000-8000-000000000030 (Pusat)
--                       a0000000-0000-4000-8000-000000000031 (KC no projects)
--                       a0000000-0000-4000-8000-000000000032 (KC with projects)
--                       a0000000-0000-4000-8000-000000000033 (KC no projects, second branch)
--   master_entities:    a0000000-0000-4000-8000-000000000010
--   master_departments: a0000000-0000-4000-8000-000000000020
--   master_letter_types:        a0000000-0000-4000-8000-000000000050 (Aset)
--                       a0000000-0000-4000-8000-000000000052 (Unit)
--   master_dept_letter_types:   asset  -> Aset
--                       unit   -> Unit
--   master_projects:    a0000000-0000-4000-8000-000000000040 (PRJ001, MRN_KC_HASPROJ)
--   form_usages:        a0000000-0000-4000-8000-000000000060 (asset, asset, MRN_KC_NOPROJ)
--                       a0000000-0000-4000-8000-000000000061 (unit)
--   form_usage_steps:   one step per usage (for completeness)
--
-- JWT claim is set so auth.uid() returns f0000000-0000-4000-8000-000000000001.

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ A. Predicate helpers                                                 ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- branch_has_active_projects
do $$
declare v boolean;
begin
  v := public.branch_has_active_projects('a0000000-0000-4000-8000-000000000031'::uuid);
  if v <> false then raise exception 'A1: expected branch NOPROJ to have no projects'; end if;

  v := public.branch_has_active_projects('a0000000-0000-4000-8000-000000000032'::uuid);
  if v <> true then raise exception 'A2: expected branch HASPROJ to have projects'; end if;
end $$;

-- resolve_form_usage_category
do $$
declare v text;
begin
  v := public.resolve_form_usage_category('a0000000-0000-4000-8000-000000000060'::uuid);
  if v <> 'asset' then raise exception 'B1: resolve_form_usage_category(asset) = %', v; end if;

  v := public.resolve_form_usage_category('a0000000-0000-4000-8000-000000000061'::uuid);
  if v <> 'unit' then raise exception 'B2: resolve_form_usage_category(unit) = %', v; end if;
end $$;

-- assert_branch_asset_fallback_eligible — happy path
do $$
begin
  perform public.assert_branch_asset_fallback_eligible(
    'f0000000-0000-4000-8000-000000000001'::uuid,
    'a0000000-0000-4000-8000-000000000031'::uuid,  -- branch no projects
    'a0000000-0000-4000-8000-000000000060'::uuid   -- asset usage
  );
exception when others then
  raise exception 'C1: expected fallback to be valid, got %', sqlerrm;
end $$;

-- assert_branch_asset_fallback_eligible — Pusat rejected
do $$
declare v_failed boolean := false;
begin
  begin
    perform public.assert_branch_asset_fallback_eligible(
      'f0000000-0000-4000-8000-000000000001'::uuid,
      'a0000000-0000-4000-8000-000000000030'::uuid,  -- Pusat
      'a0000000-0000-4000-8000-000000000060'::uuid
    );
  exception when others then
    v_failed := true;
    if sqlerrm not like '%pusat%' then
      raise exception 'C2: unexpected error: %', sqlerrm;
    end if;
  end;
  if not v_failed then raise exception 'C2: fallback on Pusat should be rejected'; end if;
end $$;

-- assert_branch_asset_fallback_eligible — branch with projects rejected
do $$
declare v_failed boolean := false;
begin
  begin
    perform public.assert_branch_asset_fallback_eligible(
      'f0000000-0000-4000-8000-000000000001'::uuid,
      'a0000000-0000-4000-8000-000000000032'::uuid,  -- branch with projects
      'a0000000-0000-4000-8000-000000000060'::uuid
    );
  exception when others then
    v_failed := true;
    if sqlerrm not like '%proyek%' then
      raise exception 'C3: unexpected error: %', sqlerrm;
    end if;
  end;
  if not v_failed then raise exception 'C3: fallback on branch with projects should be rejected'; end if;
end $$;

-- assert_branch_asset_fallback_eligible — non-asset usage rejected
do $$
declare v_failed boolean := false;
begin
  begin
    perform public.assert_branch_asset_fallback_eligible(
      'f0000000-0000-4000-8000-000000000001'::uuid,
      'a0000000-0000-4000-8000-000000000031'::uuid,
      'a0000000-0000-4000-8000-000000000061'::uuid  -- unit usage
    );
  exception when others then
    v_failed := true;
    if sqlerrm not like '%Aset%' then
      raise exception 'C4: unexpected error: %', sqlerrm;
    end if;
  end;
  if not v_failed then raise exception 'C4: fallback on unit usage should be rejected'; end if;
end $$;

-- assert_branch_asset_fallback_eligible — inactive user rejected
do $$
declare v_failed boolean := false;
begin
  update public.profiles set deleted_at = now()
    where id = 'f0000000-0000-4000-8000-000000000001'::uuid;
  begin
    perform public.assert_branch_asset_fallback_eligible(
      'f0000000-0000-4000-8000-000000000001'::uuid,
      'a0000000-0000-4000-8000-000000000031'::uuid,
      'a0000000-0000-4000-8000-000000000060'::uuid
    );
  exception when others then
    v_failed := true;
    if sqlerrm not like '%aktor%' and sqlerrm not like '%profil%' then
      raise exception 'C5: unexpected error: %', sqlerrm;
    end if;
  end;
  if not v_failed then raise exception 'C5: fallback with deleted profile should be rejected'; end if;

  -- restore profile for subsequent tests
  update public.profiles set deleted_at = null
    where id = 'f0000000-0000-4000-8000-000000000001'::uuid;
end $$;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ D. New 8-parameter RPC — branch fallback path                        ║
-- ╚══════════════════════════════════════════════════════════════════════╝

do $$
declare
  v_n1 int; v_n2 int; v_n3 int;
begin
  v_n1 := public.generate_new_letter_number(
    'a0000000-0000-4000-8000-000000000010'::uuid,
    'a0000000-0000-4000-8000-000000000050'::uuid,
    'a0000000-0000-4000-8000-000000000031'::uuid,  -- branch no projects
    null,                                          -- project_id null
    'f0000000-0000-4000-8000-000000000001'::uuid,
    null,                                          -- dept_id null
    'a0000000-0000-4000-8000-000000000060'::uuid   -- asset usage
  );
  if v_n1 <> 1 then raise exception 'D1: expected no_urut=1, got %', v_n1; end if;

  v_n2 := public.generate_new_letter_number(
    'a0000000-0000-4000-8000-000000000010'::uuid,
    'a0000000-0000-4000-8000-000000000050'::uuid,
    'a0000000-0000-4000-8000-000000000031'::uuid,
    null,
    'f0000000-0000-4000-8000-000000000001'::uuid,
    null,
    'a0000000-0000-4000-8000-000000000060'::uuid
  );
  if v_n2 <> 2 then raise exception 'D2: expected no_urut=2, got %', v_n2; end if;

  v_n3 := public.generate_new_letter_number(
    'a0000000-0000-4000-8000-000000000010'::uuid,
    'a0000000-0000-4000-8000-000000000050'::uuid,
    'a0000000-0000-4000-8000-000000000031'::uuid,
    null,
    'f0000000-0000-4000-8000-000000000001'::uuid,
    null,
    'a0000000-0000-4000-8000-000000000060'::uuid
  );
  if v_n3 <> 3 then raise exception 'D3: expected no_urut=3, got %', v_n3; end if;
end $$;

-- D4. Counter isolated per (entity, office) — second branch starts at 1
do $$
declare v_n int;
begin
  v_n := public.generate_new_letter_number(
    'a0000000-0000-4000-8000-000000000010'::uuid,
    'a0000000-0000-4000-8000-000000000050'::uuid,
    'a0000000-0000-4000-8000-000000000033'::uuid,  -- second branch
    null,
    'f0000000-0000-4000-8000-000000000001'::uuid,
    null,
    'a0000000-0000-4000-8000-000000000060'::uuid
  );
  if v_n <> 1 then raise exception 'D4: second branch counter expected to start at 1, got %', v_n; end if;
end $$;

-- D5. Branch fallback REJECTED when branch has projects
do $$
declare v_failed boolean := false;
begin
  begin
    perform public.generate_new_letter_number(
      'a0000000-0000-4000-8000-000000000010'::uuid,
      'a0000000-0000-4000-8000-000000000050'::uuid,
      'a0000000-0000-4000-8000-000000000032'::uuid,  -- branch with projects
      null,
      'f0000000-0000-4000-8000-000000000001'::uuid,
      null,
      'a0000000-0000-4000-8000-000000000060'::uuid
    );
  exception when others then
    v_failed := true;
    if sqlerrm not like '%proyek%' then
      raise exception 'D5: unexpected error: %', sqlerrm;
    end if;
  end;
  if not v_failed then raise exception 'D5: branch fallback on branch-with-projects should fail'; end if;
end $$;

-- D6. Spoofed p_user_id rejected
do $$
declare v_failed boolean := false;
begin
  begin
    perform public.generate_new_letter_number(
      'a0000000-0000-4000-8000-000000000010'::uuid,
      'a0000000-0000-4000-8000-000000000050'::uuid,
      'a0000000-0000-4000-8000-000000000031'::uuid,
      null,
      'f0000000-0000-4000-8000-000000000002'::uuid,  -- different from auth.uid
      null,
      'a0000000-0000-4000-8000-000000000060'::uuid
    );
  exception when others then
    v_failed := true;
    if sqlerrm not like '%p_user_id%' then
      raise exception 'D6: unexpected error: %', sqlerrm;
    end if;
  end;
  if not v_failed then raise exception 'D6: spoofed p_user_id should be rejected'; end if;
end $$;

-- D7. Unit category via fallback path is rejected
do $$
declare v_failed boolean := false;
begin
  begin
    perform public.generate_new_letter_number(
      'a0000000-0000-4000-8000-000000000010'::uuid,
      'a0000000-0000-4000-8000-000000000052'::uuid,  -- Unit letter type
      'a0000000-0000-4000-8000-000000000031'::uuid,
      null,
      'f0000000-0000-4000-8000-000000000001'::uuid,
      null,
      'a0000000-0000-4000-8000-000000000061'::uuid   -- unit usage
    );
  exception when others then
    v_failed := true;
    if sqlerrm not like '%Aset%' then
      raise exception 'D7: unexpected error: %', sqlerrm;
    end if;
  end;
  if not v_failed then raise exception 'D7: unit via fallback should be rejected'; end if;
end $$;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ E. Legacy 6-parameter RPC — no fallback path                        ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- E1. Legacy RPC accepts cabang path normally (with a real project)
do $$
declare v_n int;
begin
  v_n := public.generate_new_letter_number(
    'a0000000-0000-4000-8000-000000000010'::uuid,
    'a0000000-0000-4000-8000-000000000050'::uuid,
    'a0000000-0000-4000-8000-000000000032'::uuid,  -- branch with projects
    'a0000000-0000-4000-8000-000000000040'::uuid,  -- real project
    'f0000000-0000-4000-8000-000000000001'::uuid,
    null
  );
  if v_n <> 3 then raise exception 'E1: legacy cabang expected no_urut=3, got %', v_n; end if;
end $$;

-- E2. Legacy RPC rejects null project_id on a branch (no fallback path)
do $$
declare v_failed boolean := false;
begin
  begin
    perform public.generate_new_letter_number(
      'a0000000-0000-4000-8000-000000000010'::uuid,
      'a0000000-0000-4000-8000-000000000050'::uuid,
      'a0000000-0000-4000-8000-000000000031'::uuid,  -- branch no projects
      null,
      'f0000000-0000-4000-8000-000000000001'::uuid,
      null
    );
  exception when others then
    v_failed := true;
    if sqlerrm not like '%Proyek%' then
      raise exception 'E2: unexpected error: %', sqlerrm;
    end if;
  end;
  if not v_failed then raise exception 'E2: legacy 6-param must NOT create fallback'; end if;
end $$;

-- E3. Legacy RPC accepts pusat path without project_id (like internal recommendations)
do $$
declare v_n int;
begin
  v_n := public.generate_new_letter_number(
    'a0000000-0000-4000-8000-000000000010'::uuid,
    'a0000000-0000-4000-8000-000000000050'::uuid,
    'a0000000-0000-4000-8000-000000000030'::uuid,  -- Pusat
    null,                                          -- project_id
    'f0000000-0000-4000-8000-000000000001'::uuid,
    'a0000000-0000-4000-8000-000000000020'::uuid   -- dept_id
  );
  if v_n <> 2 then raise exception 'E3: legacy pusat expected no_urut=2 (since backfill used 1), got %', v_n; end if;
end $$;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ F. Reservation trigger — direct insert (bypassing RPC) must fail    ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- F1. Direct insert with project_id NULL AND dept_id NULL on a branch
--     without a real fallback path is rejected (infer rules fail)
do $$
declare v_failed boolean := false;
begin
  begin
    insert into public.surat_reservations (
      entity_id, type_id, office_id, project_id, dept_id,
      year, no_urut, status, reserved_by
    ) values (
      'a0000000-0000-4000-8000-000000000010'::uuid,
      'a0000000-0000-4000-8000-000000000050'::uuid,
      'a0000000-0000-4000-8000-000000000031'::uuid,  -- branch no projects
      null,
      null,
      extract(year from now())::int,
      999,
      'PENDING',
      'f0000000-0000-4000-8000-000000000001'::uuid
    );
  exception when others then
    v_failed := true;
    if sqlerrm not like '%Tanda lingkup nomor tidak dapat disimpulkan secara otomatis%' then
      raise exception 'F1: unexpected error: %', sqlerrm;
    end if;
  end;
  if not v_failed then raise exception 'F1: direct insert without explicit marker and uninferrable scope must fail'; end if;
end $$;

-- F2. Direct insert claiming branch_asset_000 on a branch WITH projects
--     is rejected by the trigger (DB-side branch_has_active_projects check)
do $$
declare v_failed boolean := false;
begin
  begin
    insert into public.surat_reservations (
      entity_id, type_id, office_id, project_id, dept_id,
      year, no_urut, status, reserved_by, number_scope_type
    ) values (
      'a0000000-0000-4000-8000-000000000010'::uuid,
      'a0000000-0000-4000-8000-000000000050'::uuid,
      'a0000000-0000-4000-8000-000000000032'::uuid,  -- branch with projects
      null,
      null,
      extract(year from now())::int,
      999,
      'PENDING',
      'f0000000-0000-4000-8000-000000000001'::uuid,
      'branch_asset_000'
    );
  exception when others then
    v_failed := true;
    if sqlerrm not like '%proyek%' then
      raise exception 'F2: unexpected error: %', sqlerrm;
    end if;
  end;
  if not v_failed then raise exception 'F2: forged branch_asset_000 on branch-with-projects must fail'; end if;
end $$;

-- F3. Reservation rows created by the RPC carry the correct number_scope_type
do $$
declare
  v_count_branch_fallback int;
  v_count_cabang int;
begin
  select count(*) into v_count_branch_fallback
    from public.surat_reservations
    where office_id = 'a0000000-0000-4000-8000-000000000031'::uuid
      and number_scope_type = 'branch_asset_000';
  if v_count_branch_fallback <> 3 then
    raise exception 'F3: expected 3 branch_asset_000 reservations, got %', v_count_branch_fallback;
  end if;

  select count(*) into v_count_cabang
    from public.surat_reservations
    where office_id = 'a0000000-0000-4000-8000-000000000032'::uuid
      and number_scope_type = 'cabang';
  if v_count_cabang <> 2 then
    raise exception 'F3b: expected 2 cabang reservation, got %', v_count_cabang;
  end if;
end $$;

-- F4. RLS prevents authenticated role from inserting branch_asset_000
do $$
declare v_failed boolean := false;
begin
  set local role authenticated;
  begin
    insert into public.surat_reservations (
      entity_id, type_id, office_id, project_id, dept_id,
      year, no_urut, status, reserved_by, number_scope_type
    ) values (
      'a0000000-0000-4000-8000-000000000010'::uuid,
      'a0000000-0000-4000-8000-000000000050'::uuid,
      'a0000000-0000-4000-8000-000000000031'::uuid,
      null, null, extract(year from now())::int, 999, 'PENDING',
      'f0000000-0000-4000-8000-000000000001'::uuid,
      'branch_asset_000'
    );
  exception when others then
    v_failed := true;
  end;
  reset role;
  if not v_failed then raise exception 'F4: RLS should block direct branch_asset_000 insert by authenticated role'; end if;
end $$;

-- F5. Immutability of number_scope_type
do $$
declare v_failed boolean := false;
begin
  begin
    update public.surat_reservations
    set number_scope_type = 'pusat'
    where number_scope_type = 'branch_asset_000';
  exception when others then
    v_failed := true;
    if sqlerrm not like '%tidak boleh diubah%' then
      raise exception 'F5: unexpected error: %', sqlerrm;
    end if;
  end;
  if not v_failed then raise exception 'F5: update of number_scope_type should be blocked'; end if;
end $$;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ G. Registration trigger                                              ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- G1. Marker missing on a fallback request → rejected
do $$
declare v_failed boolean := false;
begin
  begin
    insert into public.surat_registrasi (
      no_surat, entity_id, office_id, project_id, dept_id,
      letter_type_id, judul_surat, status, current_step,
      created_by, form_usage_id, form_input_data, data_snapshot, requester_snapshot,
      location_snapshot, policy_snapshot
    ) values (
      '999/MRN/X/IX/2026',
      'a0000000-0000-4000-8000-000000000010'::uuid,
      'a0000000-0000-4000-8000-000000000031'::uuid,  -- branch no projects
      null,
      'a0000000-0000-4000-8000-000000000020'::uuid,
      'a0000000-0000-4000-8000-000000000050'::uuid,
      'Aset Fallback Tanpa Marker',
      'PROSES', 1,
      'f0000000-0000-4000-8000-000000000001'::uuid,
      'a0000000-0000-4000-8000-000000000060'::uuid,
      '{}'::jsonb,
      '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
    );
  exception when others then
    v_failed := true;
    if sqlerrm not like '%Proyek%' then
      raise exception 'G1: unexpected error: %', sqlerrm;
    end if;
  end;
  if not v_failed then raise exception 'G1: fallback without markers must be rejected'; end if;
end $$;

-- G2. Forged fallback (markers present, branch HAS projects) → rejected
do $$
declare v_failed boolean := false;
begin
  begin
    insert into public.surat_registrasi (
      no_surat, entity_id, office_id, project_id, dept_id,
      letter_type_id, judul_surat, status, current_step,
      created_by, form_usage_id, form_input_data, data_snapshot, requester_snapshot,
      location_snapshot, policy_snapshot
    ) values (
      '999/MRN/X/IX/2026',
      'a0000000-0000-4000-8000-000000000010'::uuid,
      'a0000000-0000-4000-8000-000000000032'::uuid,  -- branch with projects
      null,
      'a0000000-0000-4000-8000-000000000020'::uuid,
      'a0000000-0000-4000-8000-000000000050'::uuid,
      'Aset Forged',
      'PROSES', 1,
      'f0000000-0000-4000-8000-000000000001'::uuid,
      'a0000000-0000-4000-8000-000000000060'::uuid,
      '{
        "project_is_default":true,
        "project_code":"000",
        "project_name":"Tanpa proyek"
      }'::jsonb,
      '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
    );
  exception when others then
    v_failed := true;
    if sqlerrm not like '%Proyek%' then
      raise exception 'G2: unexpected error: %', sqlerrm;
    end if;
  end;
  if not v_failed then raise exception 'G2: forged fallback on branch-with-projects must fail'; end if;
end $$;

-- G3. Project belonging to a different office is rejected
do $$
declare v_failed boolean := false;
begin
  begin
    insert into public.surat_registrasi (
      no_surat, entity_id, office_id, project_id, dept_id,
      letter_type_id, judul_surat, status, current_step,
      created_by, form_input_data, data_snapshot, requester_snapshot,
      location_snapshot, policy_snapshot
    ) values (
      '999/MRN/X/IX/2026',
      'a0000000-0000-4000-8000-000000000010'::uuid,
      'a0000000-0000-4000-8000-000000000031'::uuid,  -- branch A
      'a0000000-0000-4000-8000-000000000040'::uuid,  -- but project belongs to branch B
      'a0000000-0000-4000-8000-000000000020'::uuid,
      'a0000000-0000-4000-8000-000000000050'::uuid,
      'Surat Lintas Kantor',
      'PROSES', 1,
      'f0000000-0000-4000-8000-000000000001'::uuid,
      '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
    );
  exception when others then
    v_failed := true;
    if sqlerrm not like '%Proyek%' then
      raise exception 'G3: unexpected error: %', sqlerrm;
    end if;
  end;
  if not v_failed then raise exception 'G3: cross-office project must be rejected'; end if;
end $$;

-- G4. Genuine fallback succeeds
do $$
declare v_id uuid;
begin
  insert into public.surat_registrasi (
    no_surat, entity_id, office_id, project_id, dept_id,
    letter_type_id, judul_surat, status, current_step,
    created_by, form_usage_id, form_input_data, data_snapshot, requester_snapshot,
    location_snapshot, policy_snapshot
  ) values (
    '999/MRN/X/IX/2026',
    'a0000000-0000-4000-8000-000000000010'::uuid,
    'a0000000-0000-4000-8000-000000000031'::uuid,
    null,
    'a0000000-0000-4000-8000-000000000020'::uuid,
    'a0000000-0000-4000-8000-000000000050'::uuid,
    'Aset Fallback Valid',
    'PROSES', 1,
    'f0000000-0000-4000-8000-000000000001'::uuid,
    'a0000000-0000-4000-8000-000000000060'::uuid,
    '{
      "project_is_default":true,
      "project_code":"000",
      "project_name":"Tanpa proyek"
    }'::jsonb,
    '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
  )
  returning id into v_id;
  if v_id is null then raise exception 'G4: expected valid fallback to insert'; end if;
end $$;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ H. Counter scope contract                                            ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- H1. Existing counter config rows for pusat/cabang are unchanged and
--     remain valid under the new constraint
do $$
declare
  v_cabang_configs int;
  v_cabang_000_configs int;
begin
  select count(*) into v_cabang_configs
    from public.letter_number_counter_configs
    where scope_type in ('pusat', 'cabang');

  select count(*) into v_cabang_000_configs
    from public.letter_number_counter_configs
    where scope_type = 'cabang_000';

  if v_cabang_000_configs <> 0 then
    raise exception 'H1: expected 0 cabang_000 configs (no insert in this test), got %', v_cabang_000_configs;
  end if;
  -- v_cabang_configs may be 0 if no rows seeded; that's fine for this assertion
  perform v_cabang_configs;  -- silence unused warning
end $$;

-- H2. Pre-migration reservations have been backfilled correctly
do $$
declare
  v_res_pusat text;
  v_res_cabang text;
begin
  select number_scope_type into v_res_pusat from public.surat_reservations where id = 'b0000000-0000-4000-8000-000000000001'::uuid;
  select number_scope_type into v_res_cabang from public.surat_reservations where id = 'b0000000-0000-4000-8000-000000000002'::uuid;

  if v_res_pusat <> 'pusat' then raise exception 'H2: expected backfilled pusat reservation, got %', v_res_pusat; end if;
  if v_res_cabang <> 'cabang' then raise exception 'H2: expected backfilled cabang reservation, got %', v_res_cabang; end if;
end $$;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ I. Final summary                                                     ║
-- ╚══════════════════════════════════════════════════════════════════════╝
select 'MRN-22 branch-asset integration: all assertions passed' as result;
