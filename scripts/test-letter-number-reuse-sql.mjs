import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const migration = readFileSync(
  "supabase/migrations/20260930150000_letter_number_reuse_policy.sql",
  "utf8",
);
const assertions = readFileSync(
  "supabase/tests/letter_number_reuse.integration.sql",
  "utf8",
);

// Minimal canonical schema: only the tables/columns/constraints the reuse
// migration and the assertion block touch. Mirrors the disposable-PostgreSQL
// pattern used by test-branch-asset-without-project-sql.mjs.
const sql = `
create extension if not exists pgcrypto;

do $$ begin create role anon;           exception when duplicate_object then null; end $$;
do $$ begin create role authenticated;  exception when duplicate_object then null; end $$;
do $$ begin create role service_role;   exception when duplicate_object then null; end $$;

create schema if not exists auth;
create or replace function auth.uid() returns uuid
  language sql stable set search_path = ''
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text
  language sql stable set search_path = ''
as $$ select current_user::text $$;

create table if not exists auth.users ( id uuid primary key );

create table if not exists public.master_entities (
  id uuid primary key, code text not null, name text
);
create table if not exists public.master_departments ( id uuid primary key );
create table if not exists public.master_offices ( id uuid primary key, kedudukan text not null );
create table if not exists public.master_projects ( id uuid primary key, office_id uuid );
create table if not exists public.master_letter_types ( id uuid primary key, name text not null, code text not null );
create table if not exists public.master_dept_letter_types (
  dept_id uuid not null references public.master_departments(id),
  letter_type_id uuid not null references public.master_letter_types(id),
  sort_index integer
);
create table if not exists public.profiles (
  id uuid primary key, role text not null, office_id uuid, department_id uuid,
  is_active boolean default true, deleted_at timestamptz
);
create table if not exists public.form_usages (
  id uuid primary key, form_id uuid, name text not null, request_category text not null,
  scope_type text not null default 'all', status text not null default 'active'
);
create table if not exists public.master_forms (
  id uuid primary key, nama_form text, nomor_form text
);

-- Current letter_number_counter_configs shape (pusat/cabang/cabang_000).
create table if not exists public.letter_number_counter_configs (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null,
  entity_id uuid not null references public.master_entities(id),
  dept_id uuid references public.master_departments(id),
  project_id uuid references public.master_projects(id),
  office_id uuid references public.master_offices(id),
  year integer not null,
  start_from integer not null default 1,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid,
  constraint letter_number_counter_scope_check check (
    (scope_type = 'pusat'      and dept_id is not null and project_id is null and office_id is null) or
    (scope_type = 'cabang'     and project_id is not null and dept_id is null and office_id is null) or
    (scope_type = 'cabang_000' and office_id is not null and project_id is null and dept_id is null)
  )
);

-- surat_reservations current shape before this migration (office_id,
-- number_scope_type included).
create table if not exists public.surat_reservations (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.master_entities(id),
  type_id uuid references public.master_letter_types(id),
  office_id uuid references public.master_offices(id),
  project_id uuid references public.master_projects(id),
  dept_id uuid references public.master_departments(id),
  year integer not null,
  no_urut integer not null,
  status text not null default 'PENDING',
  reserved_by uuid,
  created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '30 minutes',
  number_scope_type text not null
);

-- surat_registration_drafts (columns void_surat_registration_draft touches).
create table if not exists public.surat_registration_drafts (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid,
  no_surat text,
  payload jsonb default '{}',
  signer_assignments jsonb default '[]',
  created_by uuid,
  status text not null default 'DRAFT',
  expires_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz default now()
);

-- surat_registrasi (submit simulation).
create table if not exists public.surat_registrasi (
  id uuid primary key default gen_random_uuid(),
  no_surat text, status text, created_by uuid, created_at timestamptz default now()
);

set "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';

insert into public.master_entities (id, code, name) values
  ('a0000000-0000-4000-8000-000000000010', 'UAI', 'PT UAI');

insert into public.master_offices (id, kedudukan) values
  ('a0000000-0000-4000-8000-000000000030', 'Pusat'),
  ('a0000000-0000-4000-8000-000000000031', 'KC');

insert into public.master_departments (id) values
  ('a0000000-0000-4000-8000-000000000020');

insert into public.profiles (id, role, office_id, department_id, is_active) values
  ('10000000-0000-4000-8000-000000000001', 'user',   'a0000000-0000-4000-8000-000000000030', 'a0000000-0000-4000-8000-000000000020', true),
  ('20000000-0000-4000-8000-000000000002', 'user',   'a0000000-0000-4000-8000-000000000030', 'a0000000-0000-4000-8000-000000000020', true),
  ('30000000-0000-4000-8000-000000000003', 'admin',  'a0000000-0000-4000-8000-000000000030', 'a0000000-0000-4000-8000-000000000020', true);

insert into public.master_letter_types (id, name, code) values
  ('a0000000-0000-4000-8000-000000000050', 'Permohonan', 'MH');

insert into public.master_dept_letter_types (dept_id, letter_type_id, sort_index) values
  ('a0000000-0000-4000-8000-000000000020', 'a0000000-0000-4000-8000-000000000050', 1);

insert into auth.users (id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000003');

insert into public.letter_number_counter_configs
  (scope_type, entity_id, dept_id, year, start_from, is_active) values
  ('pusat', 'a0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000020', 2026, 1, true);

${migration}

${assertions}
`;

const run = (args, input = "") => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 240_000 });
  if (result.status !== 0) {
    throw new Error(
      `docker ${args.join(" ")} exited ${result.status}\n${result.stderr || ""}\n${result.stdout || ""}`,
    );
  }
  return `${result.stdout || ""}\n${result.stderr || ""}`;
};

const id = run([
  "run", "-d",
  "-e", "POSTGRES_PASSWORD=test",
  "postgres:17-alpine",
]).trim();
try {
  let ready = false;
  for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
    const probe = spawnSync(
      "docker",
      ["exec", id, "psql", "-h", "127.0.0.1", "-U", "postgres", "-Atqc", "select 1"],
      { encoding: "utf8" },
    );
    ready = probe.status === 0 && probe.stdout.trim() === "1";
    if (!ready) {
      const sab = new SharedArrayBuffer(4);
      Atomics.wait(new Int32Array(sab), 0, 0, 500);
    }
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready.");
  const output = run([
    "exec", "-i", id,
    "psql", "-h", "127.0.0.1", "-v", "ON_ERROR_STOP=1", "-U", "postgres",
  ], sql);
  if (!output.includes("Letter number reuse: all assertions passed")) {
    throw new Error("SQL runner did not see the success marker.\n" + output);
  }
  process.stdout.write(output);
} finally {
  spawnSync("docker", ["rm", "-f", id], { encoding: "utf8" });
}
