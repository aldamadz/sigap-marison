import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const migration = readFileSync("supabase/migrations/20260923130000_production_runtime_contract_recovery.sql", "utf8");

const sql = `
create extension if not exists pgcrypto;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.master_departments (id uuid primary key, name text, code text);
create table public.master_offices (id uuid primary key, name text, kedudukan text);
create table public.profiles (
  id uuid primary key, full_name text, job_title text, avatar_url text, role text,
  office_id uuid, department_id uuid, is_active boolean default true, deleted_at timestamptz
);
create table public.form_usages (
  id uuid primary key, form_id uuid, name text, description text, route_id uuid, request_category text,
  scope_type text, status text, sort_order integer, created_by uuid, created_at timestamptz default now(),
  updated_at timestamptz default now(), recommendation_config jsonb default '{}'::jsonb
);
create table public.form_usage_steps (
  id uuid primary key, usage_id uuid, route_step_id uuid, step_order integer, role_name text, label text,
  signer_department_id uuid, action_type text check (action_type in ('approval', 'unit_allocation')),
  candidate_scope text default 'manual', created_at timestamptz default now()
);
create table public.surat_registrasi (
  id uuid primary key, form_usage_id uuid, office_id uuid, dept_id uuid, represented_department_id uuid,
  created_by uuid, status text, current_step integer, created_at timestamptz default now(), updated_at timestamptz default now(),
  no_surat text, judul_surat text, file_path text, lampiran_path text, form_input_data jsonb default '{}'::jsonb,
  data_snapshot jsonb default '{}'::jsonb, requester_snapshot jsonb default '{}'::jsonb, location_snapshot jsonb default '{}'::jsonb
);
create table public.surat_signatures (
  id uuid primary key, surat_id uuid, user_id uuid, form_usage_step_id uuid, step_order integer, role_name text,
  label_jabatan text, is_signed boolean default false, action_type text default 'approval', requires_unit_allocation boolean default false,
  verification_required boolean default false, verification_status text default 'not_required', verifier_snapshot jsonb default '[]'::jsonb,
  verified_at timestamptz, verified_by uuid, verification_note text, available_at timestamptz, signer_snapshot jsonb default '{}'::jsonb,
  status text default 'PENDING', signed_at timestamptz, catatan text
);
create table public.surat_attachments (id uuid primary key, surat_id uuid, created_at timestamptz default now());
create table public.surat_revision_events (id uuid primary key, surat_id uuid, status text, target_type text, target_step integer, target_user_ids uuid[]);
create table public.department_kpi_configs (
  dept_id uuid, is_active boolean, work_days integer[], work_start time, work_end time, break_start time, break_end time,
  timezone text, sla_minutes integer
);

create function public.can_read_surat(p_surat_id uuid) returns boolean language sql stable as $$ select true $$;
create function public.calculate_business_minutes(
  p_started_at timestamptz, p_ended_at timestamptz, p_work_days integer[], p_work_start time,
  p_work_end time, p_break_start time, p_break_end time, p_timezone text
) returns integer language sql immutable as $$ select 0 $$;
create function public.save_form_usage_config(
  p_usage_id uuid, p_payload jsonb, p_department_ids uuid[], p_steps jsonb, p_attachments jsonb,
  p_verifiers jsonb default '[]'::jsonb
) returns uuid language sql as $$ select p_usage_id $$;

insert into public.master_departments values ('10000000-0000-4000-8000-000000000001', 'PBO', 'PBO');
insert into public.master_offices values ('20000000-0000-4000-8000-000000000001', 'Pusat', 'Pusat');
insert into public.profiles values ('30000000-0000-4000-8000-000000000001', 'Admin', 'Admin', null, 'admin', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', true, null);
insert into public.form_usages (id, name, request_category, scope_type, status)
values ('40000000-0000-4000-8000-000000000001', 'Legacy Usage', 'asset', 'pusat', 'active');
insert into public.surat_registrasi (id, office_id, dept_id, created_by, status, current_step, no_surat, judul_surat)
values ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'PROSES', 1, '001/TEST', 'Pengujian');

${migration}

do $$
declare
  v_columns text[];
  v_page jsonb;
begin
  select array_agg(column_name order by column_name) into v_columns
  from information_schema.columns
  where table_schema = 'public' and table_name = 'form_usage_steps';
  if not (v_columns @> array['assignee_mode', 'input_schema', 'verifier_department_id', 'verifier_scope', 'skip_if_no_candidate', 'candidate_fallback_mode']) then
    raise exception 'form_usage_steps recovery columns missing: %', v_columns;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'form_usages' and column_name = 'external_revision_policy')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'form_usages' and column_name = 'is_system_template') then
    raise exception 'form_usages recovery columns missing';
  end if;
  perform set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
  v_page := public.get_surat_monitoring_page(24, 0, null, null, null, null);
  if coalesce((v_page->>'count')::integer, 0) <> 1 then raise exception 'monitoring page was not restored'; end if;
  perform public.get_compact_inbox_count('30000000-0000-4000-8000-000000000001', null, null, null);
  perform public.get_user_active_sla_breach_count('30000000-0000-4000-8000-000000000001');
  raise notice 'Production runtime contract recovery: all assertions passed';
end;
$$;
`;

const run = (args, input = "") => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 180_000 });
  if (result.status !== 0) throw new Error(`docker ${args.join(" ")} exited ${result.status}\n${result.stderr || ""}\n${result.stdout || ""}`);
  return `${result.stdout || ""}\n${result.stderr || ""}`;
};

const id = run(["run", "-d", "-e", "POSTGRES_PASSWORD=test", "postgres:17-alpine"]).trim();
try {
  let ready = false;
  for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
    const probe = spawnSync("docker", ["exec", id, "psql", "-h", "127.0.0.1", "-U", "postgres", "-Atqc", "select 1"], { encoding: "utf8" });
    ready = probe.status === 0 && probe.stdout.trim() === "1";
    if (!ready) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready.");
  const output = run(["exec", "-i", id, "psql", "-h", "127.0.0.1", "-v", "ON_ERROR_STOP=1", "-U", "postgres"], sql);
  if (!output.includes("Production runtime contract recovery: all assertions passed")) throw new Error(`SQL success marker missing.\n${output}`);
  process.stdout.write(output);
} finally {
  spawnSync("docker", ["rm", "-f", id], { encoding: "utf8" });
}
