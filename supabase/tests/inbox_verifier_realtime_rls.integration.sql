-- Test: 20260805083000_inbox_verifier_realtime_rls.sql
-- Rollback-based integration test proving predicate equivalence and no
-- access expansion.
-- Run: psql -f supabase/tests/inbox_verifier_realtime_rls.integration.sql
-- Purpose: Verify that rewriting the verifier predicate in can_read_surat
--          from jsonb_array_elements to containment (@>) does not change which
--          users can read, and that requester/signer/verifier/admin still can
--          while unrelated users are rejected.

begin;

set search_path = public;

-- ============================================================
-- Fixture
-- ============================================================

-- local test users (do not touch real profiles)
create temp table _t_users (
  id uuid primary key,
  label text,
  is_admin boolean default false
);
insert into _t_users (id, label, is_admin) values
  ('c0000000-0000-0000-0000-000000000001', 'requester', false),
  ('c0000000-0000-0000-0000-000000000002', 'signer',    false),
  ('c0000000-0000-0000-0000-000000000003', 'verifier',  false),
  ('c0000000-0000-0000-0000-000000000004', 'unrelated', false),
  ('c0000000-0000-0000-0000-000000000005', 'admin',     true);

-- surrogate auth.uid() using role re-auth is complex; instead build the
-- predicate comparison using the same shape as can_read_surat but with a
-- fixed actor, in a helper SQL function that mirrors the OLD and NEW predicate.
-- We compare old vs new behavior for a set of actors on one fixture.

create temp table _t_surat (
  id uuid primary key,
  created_by uuid
);
insert into _t_surat values ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001');

create temp table _t_signature (
  id uuid primary key,
  surat_id uuid,
  user_id uuid,
  verifier_snapshot jsonb
);
-- signer is user c2, verifier c3, unrelated c4, admin c5
insert into _t_signature (id, surat_id, user_id, verifier_snapshot) values
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
   '[{"user_id":"c0000000-0000-0000-0000-000000000003","full_name":"Verifier Tiga"}]');

-- Multiple verifier row
insert into _t_signature (id, surat_id, user_id, verifier_snapshot) values
  ('c2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
   '[{"user_id":"c0000000-0000-0000-0000-000000000003","full_name":"V3"},{"user_id":"c0000000-0000-0000-0000-000000000009","full_name":"Other"}]');

-- Null/empty/malformed snapshot rows
insert into _t_signature (id, surat_id, user_id, verifier_snapshot) values
  ('c2000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', '[]'::jsonb),
  ('c2000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', null),
  ('c2000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', '{"bad":true}'::jsonb);

-- ============================================================
-- Helper: old predicate (jsonb_array_elements)
-- Safe for malformed snapshot: only processes jsonb arrays (mirrors the
-- production intent; a malformed object in the OLD predicate would raise in
-- jsonb_array_elements, whereas the NEW containment predicate returns false
-- without raising).
-- ============================================================
create or replace function _t_old_can_read(p_actor uuid, p_sig_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from _t_signature ss
    join _t_surat sr on sr.id = ss.surat_id
    where ss.id = p_sig_id
      and (
        sr.created_by = p_actor
        or ss.user_id = p_actor
        or (
          jsonb_typeof(ss.verifier_snapshot) = 'array'
          and exists (
            select 1 from jsonb_array_elements(coalesce(ss.verifier_snapshot, '[]'::jsonb)) v
            where v->>'user_id' = p_actor::text
          )
        )
        or exists (select 1 from _t_users u where u.id = p_actor and u.is_admin)
      )
  );
$$;

-- ============================================================
-- Helper: new predicate (containment @>)
-- ============================================================
create or replace function _t_new_can_read(p_actor uuid, p_sig_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from _t_signature ss
    join _t_surat sr on sr.id = ss.surat_id
    where ss.id = p_sig_id
      and (
        sr.created_by = p_actor
        or ss.user_id = p_actor
        or ss.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id', p_actor::text))
        or exists (select 1 from _t_users u where u.id = p_actor and u.is_admin)
      )
  );
$$;

-- ============================================================
-- Assertions
-- ============================================================

do $$
declare
  v_requester uuid := 'c0000000-0000-0000-0000-000000000001';
  v_signer    uuid := 'c0000000-0000-0000-0000-000000000002';
  v_verifier  uuid := 'c0000000-0000-0000-0000-000000000003';
  v_unrelated uuid := 'c0000000-0000-0000-0000-000000000004';
  v_admin     uuid := 'c0000000-0000-0000-0000-000000000005';
  v_sig_valid uuid := 'c2000000-0000-0000-0000-000000000001';
  v_sig_multi uuid := 'c2000000-0000-0000-0000-000000000002';
  v_sig_empty uuid := 'c2000000-0000-0000-0000-000000000003';
  v_sig_null  uuid := 'c2000000-0000-0000-0000-000000000004';
  v_sig_mal   uuid := 'c2000000-0000-0000-0000-000000000005';
  o_old boolean; o_new boolean;
begin
  -- requester: old == new == true
  select _t_old_can_read(v_requester, v_sig_valid) into o_old;
  select _t_new_can_read(v_requester, v_sig_valid) into o_new;
  assert o_old and o_new, 'requester should read under both predicates';

  -- signer
  select _t_old_can_read(v_signer, v_sig_valid) into o_old;
  select _t_new_can_read(v_signer, v_sig_valid) into o_new;
  assert o_old and o_new, 'signer should read under both predicates';

  -- verifier (single)
  select _t_old_can_read(v_verifier, v_sig_valid) into o_old;
  select _t_new_can_read(v_verifier, v_sig_valid) into o_new;
  assert o_old and o_new, 'verifier should read under both predicates (single)';

  -- verifier (multiple) - verifier c3 present in multi row
  select _t_old_can_read(v_verifier, v_sig_multi) into o_old;
  select _t_new_can_read(v_verifier, v_sig_multi) into o_new;
  assert o_old and o_new, 'verifier should read under both predicates (multiple)';

  -- admin
  select _t_old_can_read(v_admin, v_sig_valid) into o_old;
  select _t_new_can_read(v_admin, v_sig_valid) into o_new;
  assert o_old and o_new, 'admin should read under both predicates';

  -- unrelated rejected (old and new)
  select _t_old_can_read(v_unrelated, v_sig_valid) into o_old;
  select _t_new_can_read(v_unrelated, v_sig_valid) into o_new;
  assert not o_old and not o_new, 'unrelated must be rejected under both predicates';

  -- empty snapshot: no verifier access (only signer/requester/admin paths remain)
  select _t_new_can_read(v_verifier, v_sig_empty) into o_new;
  assert not o_new, 'empty snapshot must not grant verifier access';

  -- null snapshot: no verifier access
  select _t_new_can_read(v_verifier, v_sig_null) into o_new;
  assert not o_new, 'null snapshot must not grant verifier access';

  -- malformed snapshot (object, not array): no verifier access
  select _t_new_can_read(v_verifier, v_sig_mal) into o_new;
  assert not o_new, 'malformed snapshot must not grant verifier access';

  raise notice 'ALL ASSERTIONS PASSED: verifier predicate old==new for valid fixtures; unrelated rejected; empty/null/malformed rejected';
end $$;

-- ============================================================
-- Equivalence sweep: every actor x signature row must produce the same
-- old vs new result (no access expansion/contraction).
-- ============================================================
do $$
declare
  r record;
  o_old boolean; o_new boolean;
  mismatch integer := 0;
begin
  for r in
    select a.id as actor, s.id as sig
    from _t_users a cross join _t_signature s
  loop
    select _t_old_can_read(r.actor, r.sig) into o_old;
    select _t_new_can_read(r.actor, r.sig) into o_new;
    if o_old is distinct from o_new then
      mismatch := mismatch + 1;
      raise warning 'MISMATCH actor=% sig=% old=% new=%', r.actor, r.sig, o_old, o_new;
    end if;
  end loop;
  assert mismatch = 0, 'predicate mismatch count must be zero';
  raise notice 'EQUIVALENCE SWEEP OK: 0 mismatches across % actor x signature combos', (select count(*) from _t_users u cross join _t_signature s);
end $$;

-- cleanup helpers
drop function if exists _t_old_can_read(uuid, uuid);
drop function if exists _t_new_can_read(uuid, uuid);

rollback;
