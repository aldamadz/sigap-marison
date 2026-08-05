-- Test: 20260805083000_inbox_verifier_realtime_rls.sql (ACTUAL RLS)
-- Rollback-based integration test that ACTUALLY applies the migration and
-- exercises public.can_read_surat through request.jwt.claims + role
-- authenticated. Does NOT rely only on _t_old/_t_new helper mirrors.
-- Run: psql -f supabase/tests/inbox_verifier_realtime_rls.integration.sql
-- Safety: everything runs inside BEGIN ... ROLLBACK; no data or schema persists.

begin;

set search_path = public;

-- ============================================================
-- 1. Apply the migration under test (CREATE OR REPLACE FUNCTION)
--    Inlined here so the test file is self-contained (no \ir dependency).
-- ============================================================

create or replace function public.can_read_surat(p_surat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.surat_registrasi sr
    where sr.id = p_surat_id
      and (
        sr.created_by = auth.uid()
        or exists (
          select 1
          from public.surat_signatures ss
          where ss.surat_id = sr.id
            and (
              ss.user_id = auth.uid()
              or (
                auth.uid() is not null
                and ss.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
              )
            )
        )
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
      )
  );
$$;

revoke all on function public.can_read_surat(uuid) from public, anon;
grant execute on function public.can_read_surat(uuid) to authenticated, service_role;

-- ============================================================
-- 2. Fixture (real tables, rolled back at the end)
--    Actors are real staging profiles so FK constraints hold:
--    requester = asti, signer = candra, verifier = rukmana,
--    admin = aldama, unrelated = slamet.
-- ============================================================
insert into public.surat_registrasi (
  id, no_surat, judul_surat, status, current_step, created_at, updated_at,
  requester_snapshot, location_snapshot, form_input_data, data_snapshot,
  policy_snapshot, created_by
) values (
  'c1000000-0000-0000-0000-000000000001', 'VRF-RLS-001', 'Verifier RLS Fixture',
  'PROSES', 1, now(), now(),
  '{"full_name":"Asti Sumaryani"}'::jsonb,
  '{"department":{"name":"Dept"},"office":{"name":"Office"}}'::jsonb,
  '{"request_category":"pembelian"}'::jsonb, '{}'::jsonb, '{}'::jsonb,
  'fe7c4836-a360-4d53-89e0-376c7193451e'
);

insert into public.surat_signatures (
  id, surat_id, user_id, role_name, step_order, is_signed, status, available_at,
  verification_required, verification_status, verifier_snapshot,
  attachment_requirements_snapshot, signature_position_snapshot, signer_snapshot
) values (
  'c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
  'fbc7e006-1646-47b4-8f25-681651c54076', 'Signer', 1, false, 'PENDING', now(),
  true, 'pending',
  '[{"user_id":"fffb3bc5-a1b8-4c8c-aabb-78d3ca9ad946","full_name":"Rukmana Rizky"}]'::jsonb,
  '[]'::jsonb, '{}'::jsonb, '{}'::jsonb
);

-- Signature whose verifier_snapshot contains a null user_id element.
-- This must NEVER grant access to any actor (including a null auth.uid()).
insert into public.surat_signatures (
  id, surat_id, user_id, role_name, step_order, is_signed, status, available_at,
  verification_required, verification_status, verifier_snapshot,
  attachment_requirements_snapshot, signature_position_snapshot, signer_snapshot
) values (
  'c2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001',
  'fbc7e006-1646-47b4-8f25-681651c54076', 'Signer', 2, false, 'PENDING', now(),
  true, 'pending',
  '[{"user_id":null,"full_name":"Null User"}]'::jsonb,
  '[]'::jsonb, '{}'::jsonb, '{}'::jsonb
);

-- Surat kedua yang HANYA memiliki signature dengan {"user_id":null}.
-- Surat ini tidak boleh dapat dibaca oleh siapa pun kecuali melalui
-- created_by/signer/admin (tidak ada di sini untuk verifier/unrelated/null).
insert into public.surat_registrasi (
  id, no_surat, judul_surat, status, current_step, created_at, updated_at,
  requester_snapshot, location_snapshot, form_input_data, data_snapshot,
  policy_snapshot, created_by
) values (
  'c1000000-0000-0000-0000-000000000002', 'VRF-RLS-002', 'NullUser Only Surat',
  'PROSES', 1, now(), now(),
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
  'fe7c4836-a360-4d53-89e0-376c7193451e'
);
insert into public.surat_signatures (
  id, surat_id, user_id, role_name, step_order, is_signed, status, available_at,
  verification_required, verification_status, verifier_snapshot,
  attachment_requirements_snapshot, signature_position_snapshot, signer_snapshot
) values (
  'c2000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000002',
  'fb13c2ba-72a0-4f25-983f-2f3b6f1ed33f', 'Signer', 1, false, 'PENDING', now(),
  true, 'pending',
  '[{"user_id":null,"full_name":"Null Only"}]'::jsonb,
  '[]'::jsonb, '{}'::jsonb, '{}'::jsonb
);

-- ============================================================
-- 3. Helpers
--    NOTE: SET LOCAL inside a plpgsql function does not reliably reach a
--    SECURITY DEFINER call, so we set config + role directly inside each
--    DO block rather than through a helper function (proven during dev:
--    helper returned false for requester while inline DO returned true).
-- ============================================================

-- ============================================================
-- 4. Assertions (ACTUAL RLS)
--    NOTE: run inside a single DO block. Multiple DO blocks that each do
--    set local role authenticated + reset role caused request.jwt.claim.sub
--    to be lost between blocks in this psql session (proven during dev).
--    Setting config + role once and asserting all actors inside one block is
--    deterministic.
-- ============================================================
do $$
declare
  v_requester uuid := 'fe7c4836-a360-4d53-89e0-376c7193451e'; -- asti
  v_signer    uuid := 'fbc7e006-1646-47b4-8f25-681651c54076'; -- candra
  v_verifier  uuid := 'fffb3bc5-a1b8-4c8c-aabb-78d3ca9ad946'; -- rukmana
  v_unrelated uuid := 'fb627906-a1bc-41f1-bf5a-e6e5fbd79254'; -- slamet
  v_admin     uuid := '6d2e3979-c5d6-49b2-94e1-db6a8fac96f7'; -- aldama
  v_count integer;
begin
  -- requester (asti)
  perform set_config('request.jwt.claim.sub', v_requester::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_requester)::text, true);
  set local role authenticated;
  assert public.can_read_surat('c1000000-0000-0000-0000-000000000001'), 'requester must read via created_by';
  reset role;

  -- signer (candra)
  perform set_config('request.jwt.claim.sub', v_signer::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_signer)::text, true);
  set local role authenticated;
  assert public.can_read_surat('c1000000-0000-0000-0000-000000000001'), 'signer must read via user_id';
  reset role;

  -- verifier (rukmana) via containment
  perform set_config('request.jwt.claim.sub', v_verifier::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_verifier)::text, true);
  set local role authenticated;
  assert public.can_read_surat('c1000000-0000-0000-0000-000000000001'), 'verifier must read via verifier_snapshot';
  reset role;

  -- admin (aldama)
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin)::text, true);
  set local role authenticated;
  assert public.can_read_surat('c1000000-0000-0000-0000-000000000001'), 'admin must read';
  reset role;

  -- unrelated (slamet) rejected
  perform set_config('request.jwt.claim.sub', v_unrelated::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_unrelated)::text, true);
  set local role authenticated;
  assert not public.can_read_surat('c1000000-0000-0000-0000-000000000001'), 'unrelated must be rejected';
  reset role;

  -- null actor (auth.uid() null) rejected
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);
  set local role authenticated;
  assert not public.can_read_surat('c1000000-0000-0000-0000-000000000001'), 'null actor must not read';
  reset role;

  -- verifier SELECT: can_read_surat is per-surat, so rukmana sees both
  -- signatures of the readable surat (valid + null-user one).
  perform set_config('request.jwt.claim.sub', v_verifier::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_verifier)::text, true);
  set local role authenticated;
  select count(*) into v_count
  from public.surat_signatures ss
  where ss.surat_id = 'c1000000-0000-0000-0000-000000000001';
  assert v_count = 2, 'verifier SELECT must see both signatures of readable surat';
  reset role;

  -- null-user-only surat: verifier must NOT read
  perform set_config('request.jwt.claim.sub', v_verifier::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_verifier)::text, true);
  set local role authenticated;
  assert not public.can_read_surat('c1000000-0000-0000-0000-000000000002'), 'null-user-only surat must not be readable by verifier';
  reset role;

  -- null-user-only surat: unrelated must NOT read
  perform set_config('request.jwt.claim.sub', v_unrelated::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_unrelated)::text, true);
  set local role authenticated;
  assert not public.can_read_surat('c1000000-0000-0000-0000-000000000002'), 'null-user-only surat must not be readable by unrelated';
  reset role;

  -- null-user-only surat: null actor must NOT read
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);
  set local role authenticated;
  assert not public.can_read_surat('c1000000-0000-0000-0000-000000000002'), 'null-user-only surat must not be readable by null actor';
  reset role;

  raise notice 'ACTUAL RLS ASSERTIONS PASSED + SELECT: requester/signer/verifier/admin read; unrelated & null actor rejected; null-user snapshot never grants standalone access';
end $$;

rollback;
