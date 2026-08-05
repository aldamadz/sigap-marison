-- Test: 20260805090000_fix_generation_aware_idempotency_key.sql
-- Run on a DISPOSABLE PostgreSQL database, NOT on staging Supabase.
-- Prerequisite: migration already applied (outside this transaction).
-- Run: psql -f supabase/tests/marison_idempotency_key.integration.sql
-- Safety: everything inside BEGIN ... ROLLBACK; no data persists.

begin;

set search_path = public;

-- ============================================================
-- Fixture helpers (minimal test tables, no real staging data)
-- ============================================================
create table if not exists _test_profiles (
  id uuid primary key,
  full_name text not null default '',
  role text not null default 'user',
  is_active boolean not null default true,
  deleted_at timestamptz
);

create table if not exists _test_surat (
  id uuid primary key,
  no_surat text not null,
  judul_surat text not null,
  status text not null default 'PROSES',
  current_step integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  requester_snapshot jsonb not null default '{}'::jsonb,
  location_snapshot jsonb not null default '{}'::jsonb,
  form_input_data jsonb not null default '{}'::jsonb,
  data_snapshot jsonb not null default '{}'::jsonb,
  policy_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid not null
);

insert into _test_profiles (id, full_name, role) values
  ('f0000000-0000-0000-0000-000000000001', 'Test Admin', 'admin');

insert into _test_surat (id, no_surat, judul_surat, created_by) values
  ('f0000000-0000-0000-0000-000000000010', 'TST-001', 'Gen Test Surat', 'f0000000-0000-0000-0000-000000000001');

do $$
declare
  v_lease uuid := gen_random_uuid();
  v_payload jsonb := '{"test":true}'::jsonb;
  v_body text := '{"test":true}';
  v_hash text;
  v_got text;
  v_gen1_id uuid := 'f0000000-0000-0000-0000-000000000020';
  v_gen2_id uuid := 'f0000000-0000-0000-0000-000000000021';
  v_gen3_id uuid := 'f0000000-0000-0000-0000-000000000022';
  v_gen2b_id uuid := 'f0000000-0000-0000-0000-000000000023';
  v_surat_id uuid := 'f0000000-0000-0000-0000-000000000010';
begin
  v_hash := encode(digest(v_body, 'sha256'), 'hex');

  -- ============================================================
  -- Test 1: exact key generation 1 (legacy)
  -- ============================================================
  insert into public.marison_outbound_dispatches (id, surat_id, environment, kind, endpoint, generation, idempotency_key, status)
  values (v_gen1_id, v_surat_id, 'staging', 'unit', '/unit-submissions', 1, 'sigap:staging:unit:f0000000-0000-0000-0000-000000000010', 'pending');

  update public.marison_outbound_dispatches set status = 'processing', lease_token = v_lease, lease_acquired_at = clock_timestamp(), lease_expires_at = clock_timestamp() + interval '5 minutes' where id = v_gen1_id;

  perform prepare_marison_outbound_dispatch(v_gen1_id, v_lease, 'unit', '/unit-submissions', 'v1', v_payload, v_body, v_hash);

  select idempotency_key into v_got from public.marison_outbound_dispatches where id = v_gen1_id;
  assert v_got = 'sigap:staging:unit:f0000000-0000-0000-0000-000000000010', 'gen1 exact key mismatch, got: ' || coalesce(v_got, 'NULL');
  raise notice 'Test 1 PASS: generation 1 exact key';

  -- ============================================================
  -- Test 2: exact key generation 2 (g2 suffix)
  -- ============================================================
  insert into public.marison_outbound_dispatches (id, surat_id, environment, kind, endpoint, generation, idempotency_key, status)
  values (v_gen2_id, v_surat_id, 'staging', 'unit', '/unit-submissions', 2, 'sigap:staging:unit:f0000000-0000-0000-0000-000000000010:g2', 'pending');

  update public.marison_outbound_dispatches set status = 'processing', lease_token = v_lease, lease_acquired_at = clock_timestamp(), lease_expires_at = clock_timestamp() + interval '5 minutes' where id = v_gen2_id;

  perform prepare_marison_outbound_dispatch(v_gen2_id, v_lease, 'unit', '/unit-submissions', 'v1', v_payload, v_body, v_hash);

  select idempotency_key into v_got from public.marison_outbound_dispatches where id = v_gen2_id;
  assert v_got = 'sigap:staging:unit:f0000000-0000-0000-0000-000000000010:g2', 'gen2 exact key mismatch, got: ' || coalesce(v_got, 'NULL');
  raise notice 'Test 2 PASS: generation 2 exact key';

  -- ============================================================
  -- Test 3: exact key generation 3 (g3 suffix)
  -- ============================================================
  insert into public.marison_outbound_dispatches (id, surat_id, environment, kind, endpoint, generation, idempotency_key, status)
  values (v_gen3_id, v_surat_id, 'staging', 'unit', '/unit-submissions', 3, 'sigap:staging:unit:f0000000-0000-0000-0000-000000000010:g3', 'pending');

  update public.marison_outbound_dispatches set status = 'processing', lease_token = v_lease, lease_acquired_at = clock_timestamp(), lease_expires_at = clock_timestamp() + interval '5 minutes' where id = v_gen3_id;

  perform prepare_marison_outbound_dispatch(v_gen3_id, v_lease, 'unit', '/unit-submissions', 'v1', v_payload, v_body, v_hash);

  select idempotency_key into v_got from public.marison_outbound_dispatches where id = v_gen3_id;
  assert v_got = 'sigap:staging:unit:f0000000-0000-0000-0000-000000000010:g3', 'gen3 exact key mismatch, got: ' || coalesce(v_got, 'NULL');
  raise notice 'Test 3 PASS: generation 3 exact key';

  -- ============================================================
  -- Test 4: malformed key with correct :g2 suffix is REJECTED
  --         Key is UNIQUE (never used) but environment/kind/surat_id wrong.
  --         prepare must fail-closed with 55000 before mutating payload.
  -- ============================================================
  insert into public.marison_outbound_dispatches (id, surat_id, environment, kind, endpoint, generation, idempotency_key, status)
  values (v_gen2b_id, v_surat_id, 'staging', 'unit', '/unit-submissions', 2, 'sigap:production:non_unit:00000000-0000-0000-0000-000000000099:g2', 'pending');

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
    assert v_got = 'sigap:production:non_unit:00000000-0000-0000-0000-000000000099:g2', 'key must be unchanged after rejection';
    raise notice 'Test 4 PASS: malformed key rejected, payload=null, key=unchanged';
  end;

  -- ============================================================
  -- Test 5: repeat prepare is idempotent (same key, same payload)
  -- ============================================================
  perform prepare_marison_outbound_dispatch(v_gen2_id, v_lease, 'unit', '/unit-submissions', 'v1', v_payload, v_body, v_hash);

  select idempotency_key into v_got from public.marison_outbound_dispatches where id = v_gen2_id;
  assert v_got = 'sigap:staging:unit:f0000000-0000-0000-0000-000000000010:g2', 'repeat prepare must not change key';
  raise notice 'Test 5 PASS: repeat prepare idempotent';

  -- ============================================================
  -- Test 6: unique constraint still enforced
  -- ============================================================
  begin
    insert into public.marison_outbound_dispatches (id, surat_id, environment, kind, endpoint, generation, idempotency_key, status)
    values ('f0000000-0000-0000-0000-000000000099', v_surat_id, 'staging', 'unit', '/unit-submissions', 1, 'sigap:staging:unit:f0000000-0000-0000-0000-000000000010', 'pending');
    raise exception 'Should have rejected duplicate key';
  exception when others then
    -- 23505 = unique_violation
    if sqlstate = '23505' then
      raise notice 'Test 6 PASS: unique constraint active';
    else
      raise;
    end if;
  end;

  raise notice 'ALL IDEMPOTENCY KEY FIX TESTS PASSED (6/6)';
end $$;

rollback;
