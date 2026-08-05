-- Test: 20260805090000_fix_generation_aware_idempotency_key.sql
-- Run on a DISPOSABLE PostgreSQL database, NOT on staging Supabase.
-- Prerequisite: canonical schema (profiles, surat_registrasi,
-- marison_outbound_dispatches) and the migration already applied
-- (outside this transaction).
-- Run: psql -f supabase/tests/marison_idempotency_key.integration.sql
-- Safety: everything inside BEGIN ... ROLLBACK; no data persists.

begin;

set search_path = public;

-- ============================================================
-- Fixture: canonical public.profiles (all required columns)
-- ============================================================
insert into public.profiles (
  id, nik, full_name, job_title, is_active, theme_preference,
  marison_review_required, marison_review_reasons, role, email
) values
  ('f0000000-0000-4000-8000-000000000001', 'IKY-PROF-001', 'IKY Admin One', 'Admin', true, 'system', false, '{}'::text[], 'admin', 'iky-admin-1@test.local'),
  ('f0000000-0000-4000-8000-000000000002', 'IKY-PROF-002', 'IKY Admin Two', 'Admin', true, 'system', false, '{}'::text[], 'admin', 'iky-admin-2@test.local');

-- ============================================================
-- Fixture: canonical public.surat_registrasi (two test surat)
--   Surat 1: used for gen1/gen2/gen3 dispatch jobs
--   Surat 2: used for the isolated idempotency unique constraint test
-- ============================================================
insert into public.surat_registrasi (
  id, no_surat, judul_surat, created_by,
  status, current_step,
  requester_snapshot, location_snapshot, form_input_data, data_snapshot, policy_snapshot
) values
  (
    'f0000000-0000-4000-8000-000000000010',
    'IKY-SURAT-001', 'IKY Key Test Surat One',
    'f0000000-0000-4000-8000-000000000001',
    'DONE', 1,
    '{"full_name":"IKY Requester One"}'::jsonb,
    '{"department":{"name":"Dept"},"office":{"name":"Office"}}'::jsonb,
    '{"request_category":"unit"}'::jsonb, '{}'::jsonb, '{}'::jsonb
  ),
  (
    'f0000000-0000-4000-8000-000000000011',
    'IKY-SURAT-002', 'IKY Key Test Surat Two',
    'f0000000-0000-4000-8000-000000000002',
    'DONE', 1,
    '{"full_name":"IKY Requester Two"}'::jsonb,
    '{"department":{"name":"Dept"},"office":{"name":"Office"}}'::jsonb,
    '{"request_category":"unit"}'::jsonb, '{}'::jsonb, '{}'::jsonb
  );

do $$
declare
  v_lease uuid := gen_random_uuid();
  v_payload jsonb := '{"test":true}'::jsonb;
  v_body text := '{"test":true}';
  v_hash text;
  v_got text;
  v_gen1_id uuid := 'f0000000-0000-4000-8000-000000000020';
  v_gen2_id uuid := 'f0000000-0000-4000-8000-000000000021';
  v_gen3_id uuid := 'f0000000-0000-4000-8000-000000000022';
  v_gen2b_id uuid := 'f0000000-0000-4000-8000-000000000023';
  v_surat1_id uuid := 'f0000000-0000-4000-8000-000000000010';
  v_surat2_id uuid := 'f0000000-0000-4000-8000-000000000011';
  v_dup_id uuid := 'f0000000-0000-4000-8000-000000000030';
  v_constraint_name text;
begin
  v_hash := encode(digest(v_body, 'sha256'), 'hex');

  -- ============================================================
  -- Test 1: exact key generation 1 (legacy)
  -- ============================================================
  insert into public.marison_outbound_dispatches (id, surat_id, environment, kind, endpoint, generation, idempotency_key, status)
  values (v_gen1_id, v_surat1_id, 'staging', 'unit', '/unit-submissions', 1, 'sigap:staging:unit:f0000000-0000-4000-8000-000000000010', 'pending');

  update public.marison_outbound_dispatches set status = 'processing', lease_token = v_lease, lease_acquired_at = clock_timestamp(), lease_expires_at = clock_timestamp() + interval '5 minutes' where id = v_gen1_id;

  perform prepare_marison_outbound_dispatch(v_gen1_id, v_lease, 'unit', '/unit-submissions', 'v1', v_payload, v_body, v_hash);

  select idempotency_key into v_got from public.marison_outbound_dispatches where id = v_gen1_id;
  assert v_got = 'sigap:staging:unit:f0000000-0000-4000-8000-000000000010', 'gen1 exact key mismatch, got: ' || coalesce(v_got, 'NULL');
  raise notice 'Test 1 PASS: generation 1 exact key';

  -- gen1 becomes failed_terminal so gen2 can be inserted on the same surat
  -- (in production the replacement flow only opens when gen1 is failed_terminal)
  update public.marison_outbound_dispatches
  set status = 'failed_terminal', lease_token = null, lease_acquired_at = null, lease_expires_at = null
  where id = v_gen1_id;

  -- ============================================================
  -- Test 2: exact key generation 2 (g2 suffix)
  -- ============================================================
  insert into public.marison_outbound_dispatches (id, surat_id, environment, kind, endpoint, generation, idempotency_key, status)
  values (v_gen2_id, v_surat1_id, 'staging', 'unit', '/unit-submissions', 2, 'sigap:staging:unit:f0000000-0000-4000-8000-000000000010:g2', 'pending');

  update public.marison_outbound_dispatches set status = 'processing', lease_token = v_lease, lease_acquired_at = clock_timestamp(), lease_expires_at = clock_timestamp() + interval '5 minutes' where id = v_gen2_id;

  perform prepare_marison_outbound_dispatch(v_gen2_id, v_lease, 'unit', '/unit-submissions', 'v1', v_payload, v_body, v_hash);

  select idempotency_key into v_got from public.marison_outbound_dispatches where id = v_gen2_id;
  assert v_got = 'sigap:staging:unit:f0000000-0000-4000-8000-000000000010:g2', 'gen2 exact key mismatch, got: ' || coalesce(v_got, 'NULL');
  raise notice 'Test 2 PASS: generation 2 exact key';

  -- gen2 becomes failed_terminal so gen3 can be inserted on the same surat
  update public.marison_outbound_dispatches
  set status = 'failed_terminal', lease_token = null, lease_acquired_at = null, lease_expires_at = null
  where id = v_gen2_id;

  -- ============================================================
  -- Test 3: exact key generation 3 (g3 suffix)
  -- ============================================================
  insert into public.marison_outbound_dispatches (id, surat_id, environment, kind, endpoint, generation, idempotency_key, status)
  values (v_gen3_id, v_surat1_id, 'staging', 'unit', '/unit-submissions', 3, 'sigap:staging:unit:f0000000-0000-4000-8000-000000000010:g3', 'pending');

  update public.marison_outbound_dispatches set status = 'processing', lease_token = v_lease, lease_acquired_at = clock_timestamp(), lease_expires_at = clock_timestamp() + interval '5 minutes' where id = v_gen3_id;

  perform prepare_marison_outbound_dispatch(v_gen3_id, v_lease, 'unit', '/unit-submissions', 'v1', v_payload, v_body, v_hash);

  select idempotency_key into v_got from public.marison_outbound_dispatches where id = v_gen3_id;
  assert v_got = 'sigap:staging:unit:f0000000-0000-4000-8000-000000000010:g3', 'gen3 exact key mismatch, got: ' || coalesce(v_got, 'NULL');
  raise notice 'Test 3 PASS: generation 3 exact key';

  -- gen3 becomes failed_terminal so gen2b can be inserted on the same surat
  update public.marison_outbound_dispatches
  set status = 'failed_terminal', lease_token = null, lease_acquired_at = null, lease_expires_at = null
  where id = v_gen3_id;

  -- ============================================================
  -- Test 4: malformed key with correct :g2 suffix is REJECTED
  --         Key is UNIQUE (never used) but environment/kind/surat_id wrong.
  --         generation=9 keeps (surat_id, environment, generation) unique.
  --         prepare must fail-closed with 55000 before mutating payload.
  -- ============================================================
  insert into public.marison_outbound_dispatches (id, surat_id, environment, kind, endpoint, generation, idempotency_key, status)
  values (v_gen2b_id, v_surat1_id, 'staging', 'unit', '/unit-submissions', 9, 'sigap:production:non_unit:00000000-0000-4000-8000-000000000099:g2', 'pending');

  update public.marison_outbound_dispatches set status = 'processing', lease_token = v_lease, lease_acquired_at = clock_timestamp(), lease_expires_at = clock_timestamp() + interval '5 minutes' where id = v_gen2b_id;

  begin
    perform prepare_marison_outbound_dispatch(v_gen2b_id, v_lease, 'unit', '/unit-submissions', 'v1', v_payload, v_body, v_hash);
    raise exception 'Should have rejected malformed key';
  exception when sqlstate '55000' then
    -- Verify payload is still null (not mutated)
    select payload is null into v_got from public.marison_outbound_dispatches where id = v_gen2b_id;
    assert v_got::boolean = true, 'payload must remain null after rejection';
    -- Verify key is unchanged
    select idempotency_key into v_got from public.marison_outbound_dispatches where id = v_gen2b_id;
    assert v_got = 'sigap:production:non_unit:00000000-0000-4000-8000-000000000099:g2', 'key must be unchanged after rejection';
    raise notice 'Test 4 PASS: malformed key rejected, payload=null, key=unchanged';
  end;

  -- gen2b (malformed, rejected) becomes failed_terminal so Test 5 can reclaim gen2
  update public.marison_outbound_dispatches
  set status = 'failed_terminal', lease_token = null, lease_acquired_at = null, lease_expires_at = null
  where id = v_gen2b_id;

  -- ============================================================
  -- Test 5: repeat prepare is idempotent (same key, same payload)
  --         Re-claim gen2 as processing with a fresh lease.
  -- ============================================================
  update public.marison_outbound_dispatches
  set status = 'processing', lease_token = v_lease, lease_acquired_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + interval '5 minutes'
  where id = v_gen2_id;

  perform prepare_marison_outbound_dispatch(v_gen2_id, v_lease, 'unit', '/unit-submissions', 'v1', v_payload, v_body, v_hash);

  select idempotency_key into v_got from public.marison_outbound_dispatches where id = v_gen2_id;
  assert v_got = 'sigap:staging:unit:f0000000-0000-4000-8000-000000000010:g2', 'repeat prepare must not change key';
  raise notice 'Test 5 PASS: repeat prepare idempotent';

  -- ============================================================
  -- Test 6: idempotency unique constraint enforced (isolated)
  --         Insert on surat 2 (different surat_id) using the SAME
  --         idempotency_key as surat 1's gen1 job. This does NOT
  --         collide with the (surat_id, environment, generation)
  --         index, only with marison_outbound_dispatches_idempotency_key_key.
  -- ============================================================
  begin
    insert into public.marison_outbound_dispatches (id, surat_id, environment, kind, endpoint, generation, idempotency_key, status)
    values (v_dup_id, v_surat2_id, 'staging', 'unit', '/unit-submissions', 1, 'sigap:staging:unit:f0000000-0000-4000-8000-000000000010', 'pending');
    raise exception 'Should have rejected duplicate idempotency key';
  exception when others then
    if sqlstate = '23505' then
      get stacked diagnostics v_constraint_name = constraint_name;
      assert v_constraint_name = 'marison_outbound_dispatches_idempotency_key_key',
        'constraint name mismatch, got: ' || coalesce(v_constraint_name, 'NULL');
      raise notice 'Test 6 PASS: unique constraint active, constraint_name=%', v_constraint_name;
    else
      raise;
    end if;
  end;

  raise notice 'ALL IDEMPOTENCY KEY FIX TESTS PASSED (6/6)';
end $$;

rollback;
