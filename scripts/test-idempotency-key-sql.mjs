import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const baseMigration = readFileSync("supabase/migrations/20260729103000_durable_marison_outbound_dispatch.sql", "utf8");
const replacementMigration = readFileSync("supabase/migrations/20260803120000_marison_outbound_replacement_jobs.sql", "utf8");
const fixMigration = readFileSync("supabase/migrations/20260805090000_fix_generation_aware_idempotency_key.sql", "utf8");

const fixtureSql = `
create extension if not exists pgcrypto;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

create schema if not exists extensions;
create or replace function extensions.digest(text, text) returns bytea
language sql stable as 'select public.digest($1::text, $2::text)';
create or replace function extensions.digest(bytea, text) returns bytea
language sql stable as 'select public.digest($1::bytea, $2::text)';

create table public.profiles (
  id uuid primary key,
  nik text not null,
  full_name text not null,
  job_title text not null,
  role text,
  is_active boolean not null default true,
  deleted_at timestamptz,
  theme_preference text not null default 'system',
  marison_review_required boolean not null default false,
  marison_review_reasons text[] not null default '{}'::text[],
  email text
);
create table public.surat_registrasi (
  id uuid primary key default gen_random_uuid(),
  no_surat text,
  judul_surat text not null,
  status text default 'PROSES',
  current_step integer default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  requester_snapshot jsonb not null default '{}'::jsonb,
  location_snapshot jsonb not null default '{}'::jsonb,
  form_input_data jsonb not null default '{}'::jsonb,
  data_snapshot jsonb not null default '{}'::jsonb,
  policy_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id)
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  type text,
  title text,
  message text,
  data jsonb,
  link text,
  read_at timestamptz,
  created_at timestamptz default now()
);
`;

const assertionsSql = `
-- canonical fixtures: two profiles, two surat_registrasi
insert into public.profiles (id, nik, full_name, job_title, role, is_active) values
  ('f0000000-0000-4000-8000-000000000001', 'IKY-PROF-001', 'IKY Admin One', 'Admin', 'admin', true),
  ('f0000000-0000-4000-8000-000000000002', 'IKY-PROF-002', 'IKY Admin Two', 'Admin', 'admin', true);

insert into public.surat_registrasi (id, no_surat, judul_surat, created_by, status, requester_snapshot, form_input_data) values
  ('f0000000-0000-4000-8000-000000000010', 'IKY-SURAT-001', 'IKY Key Test Surat One', 'f0000000-0000-4000-8000-000000000001', 'DONE', '{}'::jsonb, '{"request_category":"unit"}'::jsonb),
  ('f0000000-0000-4000-8000-000000000011', 'IKY-SURAT-002', 'IKY Key Test Surat Two', 'f0000000-0000-4000-8000-000000000002', 'DONE', '{}'::jsonb, '{"request_category":"unit"}'::jsonb);

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
  v_gen9_id uuid := 'f0000000-0000-4000-8000-000000000023';
  v_surat1_id uuid := 'f0000000-0000-4000-8000-000000000010';
  v_surat2_id uuid := 'f0000000-0000-4000-8000-000000000011';
  v_dup_id uuid := 'f0000000-0000-4000-8000-000000000030';
  v_constraint_name text;
begin
  v_hash := encode(extensions.digest(convert_to(v_body, 'UTF8'), 'sha256'), 'hex');

  -- Test 1: generation 1 exact key (legacy)
  insert into public.marison_outbound_dispatches (id, surat_id, environment, kind, endpoint, generation, idempotency_key, status)
  values (v_gen1_id, v_surat1_id, 'staging', 'unit', '/unit-submissions', 1, 'sigap:staging:unit:f0000000-0000-4000-8000-000000000010', 'pending');
  update public.marison_outbound_dispatches set status = 'processing', lease_token = v_lease, lease_acquired_at = clock_timestamp(), lease_expires_at = clock_timestamp() + interval '5 minutes' where id = v_gen1_id;
  perform prepare_marison_outbound_dispatch(v_gen1_id, v_lease, 'unit', '/unit-submissions', 'v1', v_payload, v_body, v_hash);
  select idempotency_key into v_got from public.marison_outbound_dispatches where id = v_gen1_id;
  if v_got <> 'sigap:staging:unit:f0000000-0000-4000-8000-000000000010' then
    raise exception 'gen1 exact key mismatch, got %', v_got;
  end if;
  raise notice 'Test 1 PASS: generation 1 exact key';

  update public.marison_outbound_dispatches
  set status = 'failed_terminal', lease_token = null, lease_acquired_at = null, lease_expires_at = null
  where id = v_gen1_id;

  -- Test 2: generation 2 exact key (:g2)
  insert into public.marison_outbound_dispatches (id, surat_id, environment, kind, endpoint, generation, idempotency_key, status)
  values (v_gen2_id, v_surat1_id, 'staging', 'unit', '/unit-submissions', 2, 'sigap:staging:unit:f0000000-0000-4000-8000-000000000010:g2', 'pending');
  update public.marison_outbound_dispatches set status = 'processing', lease_token = v_lease, lease_acquired_at = clock_timestamp(), lease_expires_at = clock_timestamp() + interval '5 minutes' where id = v_gen2_id;
  perform prepare_marison_outbound_dispatch(v_gen2_id, v_lease, 'unit', '/unit-submissions', 'v1', v_payload, v_body, v_hash);
  select idempotency_key into v_got from public.marison_outbound_dispatches where id = v_gen2_id;
  if v_got <> 'sigap:staging:unit:f0000000-0000-4000-8000-000000000010:g2' then
    raise exception 'gen2 exact key mismatch, got %', v_got;
  end if;
  raise notice 'Test 2 PASS: generation 2 exact key';

  update public.marison_outbound_dispatches
  set status = 'failed_terminal', lease_token = null, lease_acquired_at = null, lease_expires_at = null
  where id = v_gen2_id;

  -- Test 3: generation 3 exact key (:g3)
  insert into public.marison_outbound_dispatches (id, surat_id, environment, kind, endpoint, generation, idempotency_key, status)
  values (v_gen3_id, v_surat1_id, 'staging', 'unit', '/unit-submissions', 3, 'sigap:staging:unit:f0000000-0000-4000-8000-000000000010:g3', 'pending');
  update public.marison_outbound_dispatches set status = 'processing', lease_token = v_lease, lease_acquired_at = clock_timestamp(), lease_expires_at = clock_timestamp() + interval '5 minutes' where id = v_gen3_id;
  perform prepare_marison_outbound_dispatch(v_gen3_id, v_lease, 'unit', '/unit-submissions', 'v1', v_payload, v_body, v_hash);
  select idempotency_key into v_got from public.marison_outbound_dispatches where id = v_gen3_id;
  if v_got <> 'sigap:staging:unit:f0000000-0000-4000-8000-000000000010:g3' then
    raise exception 'gen3 exact key mismatch, got %', v_got;
  end if;
  raise notice 'Test 3 PASS: generation 3 exact key';

  update public.marison_outbound_dispatches
  set status = 'failed_terminal', lease_token = null, lease_acquired_at = null, lease_expires_at = null
  where id = v_gen3_id;

  -- Test 4: malformed key (unique but wrong env/kind/surat, generation 9)
  --         prepare must fail-closed with 55000 before mutating payload.
  insert into public.marison_outbound_dispatches (id, surat_id, environment, kind, endpoint, generation, idempotency_key, status)
  values (v_gen9_id, v_surat1_id, 'staging', 'unit', '/unit-submissions', 9, 'sigap:production:non_unit:00000000-0000-4000-8000-000000000099:g2', 'pending');
  update public.marison_outbound_dispatches set status = 'processing', lease_token = v_lease, lease_acquired_at = clock_timestamp(), lease_expires_at = clock_timestamp() + interval '5 minutes' where id = v_gen9_id;
  begin
    perform prepare_marison_outbound_dispatch(v_gen9_id, v_lease, 'unit', '/unit-submissions', 'v1', v_payload, v_body, v_hash);
    raise exception 'Should have rejected malformed key';
  exception when sqlstate '55000' then
    select payload is null into v_got from public.marison_outbound_dispatches where id = v_gen9_id;
    if v_got <> 'true' then raise exception 'payload must remain null after rejection, got %', v_got; end if;
    select idempotency_key into v_got from public.marison_outbound_dispatches where id = v_gen9_id;
    if v_got <> 'sigap:production:non_unit:00000000-0000-4000-8000-000000000099:g2' then
      raise exception 'key must be unchanged after rejection';
    end if;
    raise notice 'Test 4 PASS: malformed key rejected, payload=null, key=unchanged';
  end;

  update public.marison_outbound_dispatches
  set status = 'failed_terminal', lease_token = null, lease_acquired_at = null, lease_expires_at = null
  where id = v_gen9_id;

  -- Test 5: repeat prepare is idempotent
  update public.marison_outbound_dispatches
  set status = 'processing', lease_token = v_lease, lease_acquired_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + interval '5 minutes'
  where id = v_gen2_id;
  perform prepare_marison_outbound_dispatch(v_gen2_id, v_lease, 'unit', '/unit-submissions', 'v1', v_payload, v_body, v_hash);
  select idempotency_key into v_got from public.marison_outbound_dispatches where id = v_gen2_id;
  if v_got <> 'sigap:staging:unit:f0000000-0000-4000-8000-000000000010:g2' then
    raise exception 'repeat prepare must not change key';
  end if;
  raise notice 'Test 5 PASS: repeat prepare idempotent';

  -- Test 6: idempotency unique constraint enforced in isolation
  --         Surat 2 uses the SAME idempotency_key as surat 1's gen1 job.
  --         Only marison_outbound_dispatches_idempotency_key_key can fire
  --         (surat_id differs, so generation index cannot collide).
  begin
    insert into public.marison_outbound_dispatches (id, surat_id, environment, kind, endpoint, generation, idempotency_key, status)
    values (v_dup_id, v_surat2_id, 'staging', 'unit', '/unit-submissions', 1, 'sigap:staging:unit:f0000000-0000-4000-8000-000000000010', 'pending');
    raise exception 'Should have rejected duplicate idempotency key';
  exception when others then
    if sqlstate <> '23505' then raise; end if;
    get stacked diagnostics v_constraint_name = constraint_name;
    if v_constraint_name <> 'marison_outbound_dispatches_idempotency_key_key' then
      raise exception 'constraint name mismatch, got %', v_constraint_name;
    end if;
    raise notice 'Test 6 PASS: unique constraint active, constraint_name=%', v_constraint_name;
  end;

  raise notice 'ALL IDEMPOTENCY KEY FIX TESTS PASSED (6/6)';
end $$;

select 'Idempotency key SQL integration passed' as result;
`;

const run = (args, input = "") => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 120000 });
  if (result.status !== 0) throw new Error(`${result.stderr || ""}\n${result.stdout || ""}`.trim() || "Docker command failed");
  return result.stdout;
};

const id = run(["run", "-d", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17"]).trim();
try {
  let ready = false;
  for (let attempt = 0; attempt < 30 && !ready; attempt += 1) {
    ready = spawnSync("docker", ["exec", id, "pg_isready", "-U", "postgres"], { encoding: "utf8" }).status === 0;
    if (!ready) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready");
  process.stdout.write(run(
    ["exec", "-i", id, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"],
    fixtureSql + baseMigration + replacementMigration + fixMigration + assertionsSql
  ));
} finally {
  run(["rm", "-f", id]);
}
