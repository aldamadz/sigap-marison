import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const migrations = [
  "supabase/migrations/20260729103000_durable_marison_outbound_dispatch.sql",
  "supabase/migrations/20260730120000_marison_outbound_identity_overrides.sql",
  "supabase/migrations/20260731100000_marison_outbound_payload_mappings.sql",
  "supabase/migrations/20260731145000_fix_marison_payload_mapping_audit_action.sql",
  "supabase/migrations/20260731170000_mrn16_external_identity_readiness.sql",
  "supabase/migrations/20260803120000_marison_outbound_replacement_jobs.sql",
  "supabase/migrations/20260805090000_fix_generation_aware_idempotency_key.sql",
  "supabase/migrations/20260810090000_stop_marison_rpc_retry_storm.sql",
  "supabase/migrations/20260811153000_fund_submission_outbound.sql",
].map((path) => readFileSync(path, "utf8")).join("\n");

const integrationTests = [
  "supabase/tests/marison_idempotency_key.integration.sql",
  "supabase/tests/marison_rpc_retry_storm.integration.sql",
  "supabase/tests/marison_fund_submission.integration.sql",
].map((path) => readFileSync(path, "utf8")).join("\n");

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
  email text,
  marison_employee_id bigint,
  marison_synced_at timestamptz
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
create table public.surat_linked_documents (
  id uuid primary key default gen_random_uuid(),
  child_surat_id uuid not null references public.surat_registrasi(id),
  link_type text,
  status text
);
create or replace function public.recommendation_all_items_rejected(uuid) returns boolean
language sql stable as 'select false';
create table public.master_offices (
  id uuid primary key,
  name text,
  code text,
  kedudukan text,
  marison_branch_id bigint,
  marison_synced_at timestamptz,
  marison_review_required boolean not null default false
);
create table public.master_projects (
  id uuid primary key,
  name text,
  code text,
  office_id uuid references public.master_offices(id),
  marison_project_id bigint,
  marison_synced_at timestamptz,
  marison_review_required boolean not null default false
);
create type public.activity_action as enum ('CREATE', 'INSERT', 'UPDATE', 'DELETE');
create table public.activity_logs (
  id uuid default gen_random_uuid(),
  user_id uuid,
  action public.activity_action,
  table_name text,
  record_id text,
  old_values jsonb,
  new_values jsonb
);
create or replace function public.is_current_user_admin() returns boolean
language sql as 'select false';
`;

const run = (args, input = "") => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 120000 });
  if (result.status !== 0) throw new Error(`${result.stderr || ""}\n${result.stdout || ""}`.trim() || "Docker command failed");
  return result.stdout;
};

const id = run(["run", "-d", "-e", "POSTGRES_PASSWORD=test", "postgres:17-alpine"]).trim();
try {
  let ready = false;
  for (let attempt = 0; attempt < 40 && !ready; attempt += 1) {
    ready = spawnSync("docker", ["exec", id, "pg_isready", "-U", "postgres"], { encoding: "utf8" }).status === 0;
    if (!ready) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 750);
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready");
  // Apply the real migration lineage once, then run both rollback-based suites
  // in the same disposable database to avoid a second PostgreSQL container.
  process.stdout.write(run(
    ["exec", "-i", "-e", "PGPASSWORD=test", id, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"],
    fixtureSql + migrations + integrationTests
  ));
} finally {
  run(["rm", "-f", id]);
}
