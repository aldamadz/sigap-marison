import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const migration = readFileSync(
  "supabase/migrations/20260903120000_branch_asset_without_project.sql",
  "utf8",
);
const compatibilityMigration = readFileSync(
  "supabase/migrations/20260903170000_mrn22_staging_schema_compatibility.sql",
  "utf8",
);
const assertions = readFileSync(
  "supabase/tests/branch_asset_without_project.integration.sql",
  "utf8",
);

// Minimal canonical schema — mirrors the production lineage of all tables
// and constraints that the MRN-22 migration depends on.  This is intentionally
// compact: only the columns, types, and FK targets the migration touches.
//
// JWT claim is set to f0000000-0000-4000-8000-000000000001 so auth.uid()
// returns that user.
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

-- master_entities
create table if not exists public.master_entities (
  id uuid primary key,
  code text not null,
  name text
);

-- master_departments
create table if not exists public.master_departments (
  id uuid primary key
);

-- master_offices
create table if not exists public.master_offices (
  id uuid primary key,
  kedudukan text not null
);

-- profiles (actor)
create table if not exists public.profiles (
  id uuid primary key,
  role text not null,
  office_id uuid references public.master_offices(id),
  department_id uuid references public.master_departments(id),
  is_active boolean default true,
  deleted_at timestamptz
);

-- master_letter_types
create table if not exists public.master_letter_types (
  id uuid primary key,
  name text not null,
  code text not null
);

-- master_dept_letter_types (join)
create table if not exists public.master_dept_letter_types (
  dept_id uuid not null references public.master_departments(id),
  letter_type_id uuid not null references public.master_letter_types(id)
);

-- master_projects
create table if not exists public.master_projects (
  id uuid primary key,
  office_id uuid not null references public.master_offices(id)
);

-- form_usages
create table if not exists public.form_usages (
  id uuid primary key,
  form_id uuid,
  name text not null,
  request_category text not null
    check (request_category in ('asset', 'unit', 'non_unit', 'non_asset')),
  scope_type text not null default 'all'
    check (scope_type in ('all', 'pusat', 'cabang')),
  status text not null default 'active'
);

-- master_penggunaan_detail (legacy workflow)
create table if not exists public.master_penggunaan_detail (
  id uuid primary key,
  request_categories text[]
);

-- form_usage_steps
create table if not exists public.form_usage_steps (
  id uuid primary key,
  usage_id uuid not null references public.form_usages(id) on delete cascade
);

create table if not exists public.form_usage_departments (
  usage_id uuid not null references public.form_usages(id) on delete cascade,
  department_id uuid not null references public.master_departments(id) on delete cascade,
  primary key (usage_id, department_id)
);

-- letter_number_counter_configs (pre-MRN-22 shape: 2 scope types only, no office_id)
create table if not exists public.letter_number_counter_configs (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.master_entities(id),
  scope_type text not null
    check (scope_type in ('pusat', 'cabang')),
  year integer not null,
  dept_id uuid references public.master_departments(id),
  project_id uuid references public.master_projects(id),
  start_from integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint letter_number_counter_scope_check check (
    (scope_type = 'pusat'  and dept_id is not null and project_id is null)
    or
    (scope_type = 'cabang' and project_id is not null and dept_id is null)
  )
);
create unique index if not exists letter_number_counter_pusat_unique
  on public.letter_number_counter_configs(entity_id, year, dept_id)
  where scope_type = 'pusat' and is_active = true;
create unique index if not exists letter_number_counter_cabang_unique
  on public.letter_number_counter_configs(entity_id, year, project_id)
  where scope_type = 'cabang' and is_active = true;

-- surat_reservations (pre-MRN-22 shape — no number_scope_type yet)
create table if not exists public.surat_reservations (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.master_entities(id),
  type_id uuid references public.master_letter_types(id),
  office_id uuid not null references public.master_offices(id),
  project_id uuid references public.master_projects(id),
  dept_id uuid references public.master_departments(id),
  year integer not null,
  no_urut integer not null,
  status text not null default 'PENDING',
  reserved_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  expires_at timestamptz
);

-- surat_registrasi (registrations)
create table if not exists public.surat_registrasi (
  id uuid primary key default gen_random_uuid(),
  no_surat text unique,
  entity_id uuid references public.master_entities(id),
  office_id uuid not null references public.master_offices(id),
  project_id uuid references public.master_projects(id),
  dept_id uuid references public.master_departments(id),
  letter_type_id uuid references public.master_letter_types(id),
  judul_surat text,
  status text,
  current_step integer default 1,
  reservation_id uuid,
  form_usage_id uuid references public.form_usages(id),
  form_input_data jsonb default '{}',
  data_snapshot jsonb default '{}',
  requester_snapshot jsonb default '{}',
  location_snapshot jsonb default '{}',
  policy_snapshot jsonb default '{}',
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Set JWT claim so auth.uid() returns the active user
-- (use session-scoped SET; SET LOCAL requires an open transaction)
set "request.jwt.claim.sub" = 'f0000000-0000-4000-8000-000000000001';

-- Seed fixtures
insert into public.master_entities (id, code, name) values
  ('a0000000-0000-4000-8000-000000000010', 'ENT10', 'Entity Test'),
  ('a0000000-0000-4000-8000-000000000011', 'ENT11', 'Entity Cross');

insert into public.master_offices (id, kedudukan) values
  ('a0000000-0000-4000-8000-000000000030', 'Pusat'),
  ('a0000000-0000-4000-8000-000000000031', 'KC'),
  ('a0000000-0000-4000-8000-000000000032', 'KCP'),
  ('a0000000-0000-4000-8000-000000000033', 'KC'),
  ('a0000000-0000-4000-8000-000000000034', 'Kost');

insert into public.master_departments (id) values
  ('a0000000-0000-4000-8000-000000000020'),
  ('a0000000-0000-4000-8000-000000000021');

insert into public.profiles (id, role, office_id, department_id, is_active) values
  ('f0000000-0000-4000-8000-000000000001', 'user', 'a0000000-0000-4000-8000-000000000031', 'a0000000-0000-4000-8000-000000000020', true),
  ('f0000000-0000-4000-8000-000000000002', 'user', 'a0000000-0000-4000-8000-000000000032', 'a0000000-0000-4000-8000-000000000020', true),
  ('f0000000-0000-4000-8000-000000000003', 'user', 'a0000000-0000-4000-8000-000000000031', 'a0000000-0000-4000-8000-000000000021', true),
  ('f0000000-0000-4000-8000-000000000004', 'admin', 'a0000000-0000-4000-8000-000000000033', 'a0000000-0000-4000-8000-000000000020', true),
  ('f0000000-0000-4000-8000-000000000005', 'super_admin', 'a0000000-0000-4000-8000-000000000033', 'a0000000-0000-4000-8000-000000000020', true);

insert into public.master_letter_types (id, name, code) values
  ('a0000000-0000-4000-8000-000000000050', 'Aset', 'ASET'),
  ('a0000000-0000-4000-8000-000000000052', 'Unit', 'UNIT');

insert into public.master_dept_letter_types (dept_id, letter_type_id) values
  ('a0000000-0000-4000-8000-000000000020', 'a0000000-0000-4000-8000-000000000050'),
  ('a0000000-0000-4000-8000-000000000020', 'a0000000-0000-4000-8000-000000000052');

insert into public.master_projects (id, office_id) values
  ('a0000000-0000-4000-8000-000000000040', 'a0000000-0000-4000-8000-000000000032'),
  ('a0000000-0000-4000-8000-000000000041', 'a0000000-0000-4000-8000-000000000034');

-- Match the production authorization behavior used by MRN-22.
create or replace function public.validate_form_usage_for_actor(
  p_usage_id uuid,
  p_requested_department_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $f$
declare
  v_actor uuid := auth.uid();
  v_profile public.profiles;
  v_usage public.form_usages;
  v_department_id uuid;
  v_step_count integer;
begin
  if v_actor is null then raise exception 'Sesi login tidak tersedia.'; end if;

  select * into v_profile from public.profiles
  where id = v_actor and coalesce(is_active, true) = true;
  if not found then raise exception 'Akun deaktif.'; end if;

  select * into v_usage from public.form_usages
  where id = p_usage_id and status = 'active';
  if not found then raise exception 'Kegunaan form tidak aktif atau tidak ditemukan.'; end if;

  if v_profile.role = 'admin' and p_requested_department_id is not null then
    v_department_id := p_requested_department_id;
  else
    v_department_id := v_profile.department_id;
  end if;

  if v_department_id is null then raise exception 'Departemen pengaju belum ditentukan.'; end if;
  if not exists (
    select 1 from public.form_usage_departments permission
    where permission.usage_id = v_usage.id
      and permission.department_id = v_department_id
  ) then
    raise exception 'Departemen tidak diizinkan memakai kegunaan form ini.';
  end if;

  select count(*) into v_step_count from public.form_usage_steps
  where usage_id = v_usage.id;
  if v_step_count < 2 or v_step_count > 8 then
    raise exception 'Kegunaan form harus memiliki 2 sampai 8 tahap.';
  end if;

  return jsonb_build_object(
    'usage_id', v_usage.id,
    'form_id', v_usage.form_id,
    'request_category', v_usage.request_category,
    'requester_department_id', v_department_id,
    'represented_by_admin', case
      when v_profile.role = 'admin' and v_department_id is distinct from v_profile.department_id
        then v_actor
      else null
    end
  );
end;
$f$;

insert into public.form_usages (id, name, request_category, scope_type, status) values
  ('a0000000-0000-4000-8000-000000000060', 'Pengadaan Aset Cabang', 'asset', 'cabang', 'active'),
  ('a0000000-0000-4000-8000-000000000061', 'Permohonan Unit',       'unit',  'cabang', 'active'),
  ('a0000000-0000-4000-8000-000000000062', 'Pengadaan Aset Dept Auth', 'asset', 'cabang', 'active'),
  ('a0000000-0000-4000-8000-000000000063', 'Pengadaan Aset Inactive', 'asset', 'cabang', 'draft');

insert into public.form_usage_steps (id, usage_id) values
  ('a0000000-0000-4000-8000-000000000070', 'a0000000-0000-4000-8000-000000000060'),
  ('a0000000-0000-4000-8000-000000000071', 'a0000000-0000-4000-8000-000000000060'),
  ('a0000000-0000-4000-8000-000000000072', 'a0000000-0000-4000-8000-000000000061'),
  ('a0000000-0000-4000-8000-000000000073', 'a0000000-0000-4000-8000-000000000061'),
  ('a0000000-0000-4000-8000-000000000074', 'a0000000-0000-4000-8000-000000000062'),
  ('a0000000-0000-4000-8000-000000000075', 'a0000000-0000-4000-8000-000000000062'),
  ('a0000000-0000-4000-8000-000000000076', 'a0000000-0000-4000-8000-000000000063'),
  ('a0000000-0000-4000-8000-000000000077', 'a0000000-0000-4000-8000-000000000063');

insert into public.form_usage_departments (usage_id, department_id) values
  ('a0000000-0000-4000-8000-000000000060', 'a0000000-0000-4000-8000-000000000020'),
  ('a0000000-0000-4000-8000-000000000061', 'a0000000-0000-4000-8000-000000000020'),
  ('a0000000-0000-4000-8000-000000000062', 'a0000000-0000-4000-8000-000000000021'),
  ('a0000000-0000-4000-8000-000000000063', 'a0000000-0000-4000-8000-000000000020');

insert into public.master_penggunaan_detail (id, request_categories) values
  ('a0000000-0000-4000-8000-000000000080', array['asset', 'non_asset']);

-- Pre-migration reservations to test backfill
-- 13 Pusat reservations
insert into public.surat_reservations (id, entity_id, office_id, project_id, dept_id, year, no_urut)
select
  gen_random_uuid(), 'a0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000030', null, 'a0000000-0000-4000-8000-000000000020', 2026, generate_series(1, 13);

-- 6 Cabang reservations (KC/KCP)
insert into public.surat_reservations (id, entity_id, office_id, project_id, dept_id, year, no_urut)
select
  gen_random_uuid(), 'a0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000032', 'a0000000-0000-4000-8000-000000000040', null, 2026, generate_series(1, 6);

${migration}

${compatibilityMigration}

${assertions}
`;

const run = (args, input = "") => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 180_000 });
  if (result.status !== 0) {
    throw new Error(
      `docker ${args.join(" ")} exited ${result.status}\n${result.stderr || ""}\n${result.stdout || ""}`,
    );
  }
  return result.stdout;
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
      const ms = 500;
      const sab = new SharedArrayBuffer(4);
      Atomics.wait(new Int32Array(sab), 0, 0, ms);
    }
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready.");
  const output = run([
    "exec", "-i", id,
    "psql", "-h", "127.0.0.1", "-v", "ON_ERROR_STOP=1", "-U", "postgres",
  ], sql);
  if (!output.includes("MRN-22 branch-asset integration: all assertions passed")) {
    throw new Error("SQL runner did not see the success marker.\n" + output);
  }
  process.stdout.write(output);
} finally {
  spawnSync("docker", ["rm", "-f", id], { encoding: "utf8" });
}
