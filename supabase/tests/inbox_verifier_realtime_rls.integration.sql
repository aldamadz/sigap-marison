-- Test: 20260805083000_inbox_verifier_realtime_rls.sql (ACTUAL RLS)
-- Rollback-based integration test that applies the migration via \ir and
-- exercises actual SELECT through surat_signatures RLS policy.
-- All fixtures are transaction-local with test UUIDs (no staging data dependency).
-- Run: cd supabase/tests && psql -f inbox_verifier_realtime_rls.integration.sql
-- Safety: everything runs inside BEGIN ... ROLLBACK; no data or schema persists.

begin;

set search_path = public;

-- ============================================================
-- 1. Apply the migration under test (canonical file, not duplicated)
-- ============================================================
\ir ../migrations/20260805083000_inbox_verifier_realtime_rls.sql

-- ============================================================
-- 2. Profile fixtures (transaction-local, test UUIDs)
--    No auth.users fixture needed: profiles.id has no FK to auth.users.
--    ON CONFLICT DO NOTHING so re-runs on staging don't fail.
-- ============================================================
insert into public.profiles (id, full_name, role)
values
  ('a0000000-0000-0000-0000-000000000001', 'Test Requester', 'user'),
  ('a0000000-0000-0000-0000-000000000002', 'Test Signer', 'user'),
  ('a0000000-0000-0000-0000-000000000003', 'Test Verifier', 'user'),
  ('a0000000-0000-0000-0000-000000000004', 'Test Admin', 'admin'),
  ('a0000000-0000-0000-0000-000000000005', 'Test Unrelated', 'user')
on conflict (id) do nothing;

-- ============================================================
-- 3. Surat & signature fixtures (transaction-local, test UUIDs)
-- ============================================================

-- Surat 1: readable by requester (created_by), signer (user_id),
--          verifier (verifier_snapshot), admin (role).
insert into public.surat_registrasi (
  id, no_surat, judul_surat, status, current_step, created_at, updated_at,
  requester_snapshot, location_snapshot, form_input_data, data_snapshot,
  policy_snapshot, created_by
) values (
  'b0000000-0000-0000-0000-000000000001', 'VRF-RLS-001', 'Verifier RLS Fixture',
  'PROSES', 1, now(), now(),
  '{"full_name":"Test Requester"}'::jsonb,
  '{"department":{"name":"Dept"},"office":{"name":"Office"}}'::jsonb,
  '{"request_category":"pembelian"}'::jsonb, '{}'::jsonb, '{}'::jsonb,
  'a0000000-0000-0000-0000-000000000001'
);

-- Signature: user_id = signer, verifier_snapshot points to verifier
insert into public.surat_signatures (
  id, surat_id, user_id, role_name, step_order, is_signed, status, available_at,
  verification_required, verification_status, verifier_snapshot,
  attachment_requirements_snapshot, signature_position_snapshot, signer_snapshot
) values (
  'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002', 'Signer', 1, false, 'PENDING', now(),
  true, 'pending',
  '[{"user_id":"a0000000-0000-0000-0000-000000000003","full_name":"Test Verifier"}]'::jsonb,
  '[]'::jsonb, '{}'::jsonb, '{}'::jsonb
);

-- Signature with null-user: must NEVER grant standalone access
insert into public.surat_signatures (
  id, surat_id, user_id, role_name, step_order, is_signed, status, available_at,
  verification_required, verification_status, verifier_snapshot,
  attachment_requirements_snapshot, signature_position_snapshot, signer_snapshot
) values (
  'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002', 'Signer', 2, false, 'PENDING', now(),
  true, 'pending',
  '[{"user_id":null,"full_name":"Null User"}]'::jsonb,
  '[]'::jsonb, '{}'::jsonb, '{}'::jsonb
);

-- Surat 2: ONLY has null-user signature (no real verifier)
-- Must not be readable by verifier / unrelated / null
insert into public.surat_registrasi (
  id, no_surat, judul_surat, status, current_step, created_at, updated_at,
  requester_snapshot, location_snapshot, form_input_data, data_snapshot,
  policy_snapshot, created_by
) values (
  'b0000000-0000-0000-0000-000000000002', 'VRF-RLS-002', 'NullUser Only Surat',
  'PROSES', 1, now(), now(),
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
  'a0000000-0000-0000-0000-000000000001'
);
insert into public.surat_signatures (
  id, surat_id, user_id, role_name, step_order, is_signed, status, available_at,
  verification_required, verification_status, verifier_snapshot,
  attachment_requirements_snapshot, signature_position_snapshot, signer_snapshot
) values (
  'c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000002', 'Signer', 1, false, 'PENDING', now(),
  true, 'pending',
  '[{"user_id":null,"full_name":"Null Only"}]'::jsonb,
  '[]'::jsonb, '{}'::jsonb, '{}'::jsonb
);

-- ============================================================
-- 4. Assertions: actual SELECT through surat_signatures RLS policy
--    Tests SELECT directly on the table (not only can_read_surat).
--    Single DO block to avoid GUC loss between blocks (proven during dev).
-- ============================================================
do $$
declare
  v_requester uuid := 'a0000000-0000-0000-0000-000000000001';
  v_signer    uuid := 'a0000000-0000-0000-0000-000000000002';
  v_verifier  uuid := 'a0000000-0000-0000-0000-000000000003';
  v_admin     uuid := 'a0000000-0000-0000-0000-000000000004';
  v_unrelated uuid := 'a0000000-0000-0000-0000-000000000005';
  v_surat1 uuid := 'b0000000-0000-0000-0000-000000000001';
  v_surat2 uuid := 'b0000000-0000-0000-0000-000000000002';
  v_count integer;
begin
  -- Requester: SELECT surat_signatures via created_by path
  perform set_config('request.jwt.claim.sub', v_requester::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_requester)::text, true);
  set local role authenticated;
  select count(*) into v_count from public.surat_signatures where surat_id = v_surat1;
  assert v_count = 2, 'requester must see both signatures of surat 1 via created_by';
  reset role;

  -- Signer: SELECT surat_signatures via user_id path
  perform set_config('request.jwt.claim.sub', v_signer::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_signer)::text, true);
  set local role authenticated;
  select count(*) into v_count from public.surat_signatures where surat_id = v_surat1;
  assert v_count = 2, 'signer must see both signatures of surat 1 via user_id';
  reset role;

  -- Verifier: SELECT surat_signatures via verifier_snapshot containment
  perform set_config('request.jwt.claim.sub', v_verifier::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_verifier)::text, true);
  set local role authenticated;
  select count(*) into v_count from public.surat_signatures where surat_id = v_surat1;
  assert v_count = 2, 'verifier must see both signatures of surat 1 via verifier_snapshot';
  reset role;

  -- Admin: SELECT surat_signatures via admin role in profiles
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin)::text, true);
  set local role authenticated;
  select count(*) into v_count from public.surat_signatures where surat_id = v_surat1;
  assert v_count = 2, 'admin must see both signatures of surat 1 via admin role';
  reset role;

  -- Unrelated: SELECT surat_signatures must return 0 rows
  perform set_config('request.jwt.claim.sub', v_unrelated::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_unrelated)::text, true);
  set local role authenticated;
  select count(*) into v_count from public.surat_signatures where surat_id = v_surat1;
  assert v_count = 0, 'unrelated must not see any signatures of surat 1';
  reset role;

  -- Null actor: SELECT surat_signatures must return 0 rows
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);
  set local role authenticated;
  select count(*) into v_count from public.surat_signatures where surat_id = v_surat1;
  assert v_count = 0, 'null actor must not see any signatures of surat 1';
  reset role;

  -- Null-user-only surat: verifier must NOT read (0 rows)
  perform set_config('request.jwt.claim.sub', v_verifier::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_verifier)::text, true);
  set local role authenticated;
  select count(*) into v_count from public.surat_signatures where surat_id = v_surat2;
  assert v_count = 0, 'verifier must not see signatures of null-user-only surat 2';
  reset role;

  -- Null-user-only surat: unrelated must NOT read
  perform set_config('request.jwt.claim.sub', v_unrelated::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_unrelated)::text, true);
  set local role authenticated;
  select count(*) into v_count from public.surat_signatures where surat_id = v_surat2;
  assert v_count = 0, 'unrelated must not see signatures of null-user-only surat 2';
  reset role;

  -- Null-user-only surat: null actor must NOT read
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);
  set local role authenticated;
  select count(*) into v_count from public.surat_signatures where surat_id = v_surat2;
  assert v_count = 0, 'null actor must not see signatures of null-user-only surat 2';
  reset role;

  raise notice 'ACTUAL RLS ASSERTIONS PASSED: requester/signer/verifier/admin read surat 1; unrelated/null rejected; null-user-only surat 2 never readable';
end $$;

rollback;
