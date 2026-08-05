import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const baseMigration = readFileSync("supabase/migrations/20260729103000_durable_marison_outbound_dispatch.sql", "utf8");
const replacementMigration = readFileSync("supabase/migrations/20260803120000_marison_outbound_replacement_jobs.sql", "utf8");
const fixMigration = readFileSync("supabase/migrations/20260805090000_fix_generation_aware_idempotency_key.sql", "utf8");
// Single source of truth for fixtures and assertions:
const integrationTest = readFileSync("supabase/tests/marison_idempotency_key.integration.sql", "utf8");

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
  // Schema + migrations first (migrations contain COMMIT, so they must run
  // OUTSIDE the integration test transaction), then the integration test.
  process.stdout.write(run(
    ["exec", "-i", id, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"],
    fixtureSql + baseMigration + replacementMigration + fixMigration + integrationTest
  ));
} finally {
  run(["rm", "-f", id]);
}
