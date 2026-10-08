import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const migrations = [
  "supabase/migrations/20260917130000_canonical_submission_workflow_contract.sql",
  "supabase/migrations/20260917131000_atomic_configured_checker_input.sql",
  "supabase/migrations/20260917132000_optional_branch_signer_fallback.sql",
  "supabase/migrations/20260917133000_seed_canonical_submission_workflows.sql",
  "supabase/migrations/20260918100000_restore_asset_recommendation_config.sql",
  "supabase/migrations/20260918130000_fix_recommendation_creator_auto_approval.sql",
  "supabase/migrations/20260923130000_production_runtime_contract_recovery.sql",
].map((file) => readFileSync(file, "utf8")).join("\n\n");
const assertions = readFileSync("supabase/tests/canonical_submission_workflows.integration.sql", "utf8");
const nonPlanningMigration = readFileSync("supabase/migrations/20260929090000_remove_inherited_planning_checkers_from_fund.sql", "utf8");
const nonPlanningAssertions = readFileSync("supabase/tests/non_planning_checker_defaults.integration.sql", "utf8");
const keu1Migration = readFileSync("supabase/migrations/20260929080000_seed_keu1_form_usage.sql", "utf8");
const keu1Assertions = readFileSync("supabase/tests/keu1_form_usage.integration.sql", "utf8");
const keu1SubmitMigration = readFileSync("supabase/migrations/20261001060000_keu1_submit_and_first_signer.sql", "utf8").replace(/\r\n/g, "\n");
const branchGuardSource = readFileSync("supabase/migrations/20260930140000_mar10_kc_descendant_number_scope.sql", "utf8");
const branchGuard = branchGuardSource.slice(branchGuardSource.indexOf("create or replace function public.enforce_surat_registration_branch_project()"));
const keu1SubmitAssertions = readFileSync("supabase/tests/keu1_submit_and_first_signer.integration.sql", "utf8");
const makerMigration = readFileSync("supabase/migrations/20261001120000_contextual_first_maker_candidates.sql", "utf8").replace(/\r\n/g, "\n");
const makerAssertions = readFileSync("supabase/tests/contextual_first_maker_candidates.integration.sql", "utf8");
const bmMigration = readFileSync("supabase/migrations/20261001130000_keu1_related_branch_manager.sql", "utf8").replace(/\r\n/g, "\n");
const bmAssertions = readFileSync("supabase/tests/keu1_branch_manager_candidates.integration.sql", "utf8");
const optionalProjectMigration = readFileSync("supabase/migrations/20261005090000_keu1_optional_branch_project.sql", "utf8");
const optionalProjectAssertions = readFileSync("supabase/tests/keu1_optional_project.integration.sql", "utf8");
const branchReportingFallback = readFileSync("supabase/migrations/20261008160000_dynamic_branch_reporting_officer_fallback.sql", "utf8");
const officerHelpers = branchReportingFallback.slice(branchReportingFallback.indexOf("create or replace function organization_internal.officer_rank"),
  branchReportingFallback.indexOf("create or replace function organization_internal.resolve_office_superior"));
const officerMigration = readFileSync("supabase/migrations/20261008170000_related_branch_review_signer_candidates.sql", "utf8").replace(/\r\n/g, "\n");
const officerAssertions = readFileSync("supabase/tests/related_branch_review_signer_candidates.integration.sql", "utf8");
const fundChecklist = process.argv.includes("--fund-checklist");
const fundChecklistSql = fundChecklist
  ? readFileSync("supabase/tests/fund_item_checklist.setup.sql", "utf8")
    + readFileSync("supabase/migrations/20261007090000_fund_item_verification_and_realtime.sql", "utf8")
    + readFileSync("supabase/migrations/20261007090000_fund_item_verification_and_realtime.sql", "utf8")
    + readFileSync("supabase/tests/fund_item_checklist.integration.sql", "utf8")
  : "";

const sql = `
create extension if not exists pgcrypto;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable set search_path = ''
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.master_departments (id uuid primary key, name text not null unique, code text);
create table public.master_offices (id uuid primary key, name text not null, kedudukan text);
create table public.master_letter_types (id uuid primary key, name text not null, code text);
create table public.master_entities (id uuid primary key, name text not null, code text);
create table public.profiles (
  id uuid primary key, full_name text, job_title text, role text default 'user',
  office_id uuid references public.master_offices(id),
  department_id uuid references public.master_departments(id),
  is_active boolean default true, deleted_at timestamptz, avatar_url text
);
create table public.master_forms (
  id uuid primary key default gen_random_uuid(), nama_form text not null, nomor_form text,
  department_id uuid references public.master_departments(id), input_schema jsonb not null default '[]'::jsonb,
  created_at timestamptz default now()
);
create table public.approval_route_steps (
  id uuid primary key default gen_random_uuid(),
  action_type text not null default 'approval' check (action_type in ('approval','unit_allocation'))
);
create table public.form_usages (
  id uuid primary key default gen_random_uuid(), form_id uuid references public.master_forms(id),
  name text not null, description text, route_id uuid, request_category text not null,
  scope_type text not null default 'all', status text not null default 'draft', sort_order integer default 0,
  created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now(),
  recommendation_config jsonb not null default '{}'::jsonb,
  external_revision_policy jsonb not null default '{"recipient_type":"requester","recipient_step_order":null,"approval_restart_step":1}'::jsonb
);
create table public.form_usage_departments (
  usage_id uuid references public.form_usages(id) on delete cascade,
  department_id uuid references public.master_departments(id), primary key (usage_id, department_id)
);
create table public.form_usage_steps (
  id uuid primary key default gen_random_uuid(), usage_id uuid references public.form_usages(id) on delete cascade,
  route_step_id uuid, step_order integer not null, role_name text not null, label text not null,
  signer_department_id uuid references public.master_departments(id),
  action_type text not null default 'approval' check (action_type in ('approval','unit_allocation')),
  candidate_scope text not null default 'manual', created_at timestamptz default now(),
  unique (usage_id, step_order)
);
create table public.form_usage_step_users (
  usage_step_id uuid references public.form_usage_steps(id) on delete cascade,
  user_id uuid references public.profiles(id), primary key (usage_step_id, user_id)
);
create table public.form_usage_step_verifiers (
  usage_step_id uuid references public.form_usage_steps(id) on delete cascade,
  user_id uuid references public.profiles(id), primary key (usage_step_id, user_id)
);
create table public.form_usage_attachment_requirements (
  id uuid primary key default gen_random_uuid(), usage_id uuid references public.form_usages(id),
  usage_step_id uuid references public.form_usage_steps(id), stage_order integer not null default 0,
  requirement_key text not null, label text not null, is_required boolean default true,
  allow_multiple boolean default false, min_files integer default 1, max_files integer default 1,
  allowed_types text[] default array[]::text[], max_size_bytes bigint, sort_order integer default 0,
  unique (usage_id, stage_order, requirement_key)
);
create table public.surat_registrasi (
  id uuid primary key default gen_random_uuid(), form_usage_id uuid references public.form_usages(id),
  office_id uuid references public.master_offices(id), dept_id uuid references public.master_departments(id),
  represented_department_id uuid, created_by uuid references public.profiles(id), status text default 'PROSES',
  current_step integer default 1, form_input_data jsonb default '{}'::jsonb,
  data_snapshot jsonb default '{}'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now(),
  no_surat text, judul_surat text, file_path text, lampiran_path text, policy_snapshot jsonb default '{}'::jsonb,
  requester_snapshot jsonb default '{}'::jsonb, location_snapshot jsonb default '{}'::jsonb
);
create table public.surat_signatures (
  id uuid primary key default gen_random_uuid(), surat_id uuid references public.surat_registrasi(id),
  user_id uuid references public.profiles(id), form_usage_step_id uuid references public.form_usage_steps(id),
  step_order integer default 1, role_name text default 'membuat', label_jabatan text,
  is_signed boolean default false, action_type text not null default 'approval' check (action_type in ('approval','unit_allocation')),
  requires_unit_allocation boolean default false, attachment_requirements_snapshot jsonb default '[]'::jsonb,
  verifier_snapshot jsonb default '[]'::jsonb, verification_required boolean default false,
  verification_status text default 'not_required', verified_at timestamptz, verified_by uuid,
  verification_note text, available_at timestamptz, signer_snapshot jsonb default '{}'::jsonb, status text default 'PENDING',
  signed_at timestamptz, catatan text
);
create table public.surat_attachments (
  id uuid primary key default gen_random_uuid(), surat_id uuid references public.surat_registrasi(id),
  signature_id uuid references public.surat_signatures(id), stage text, requirement_key text, created_at timestamptz default now()
);
create table public.surat_revision_events (
  id uuid primary key default gen_random_uuid(), surat_id uuid references public.surat_registrasi(id),
  status text, target_type text, target_step integer, target_user_ids uuid[] default array[]::uuid[], created_at timestamptz default now()
);
create table public.department_kpi_configs (
  dept_id uuid, is_active boolean default true, work_days integer[], work_start time, work_end time,
  break_start time, break_end time, timezone text, sla_minutes integer
);

create or replace function public.is_current_user_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'
    and is_active is true and deleted_at is null)
$$;
create or replace function public.can_read_surat(p_surat_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.surat_registrasi where id = p_surat_id and created_by = auth.uid())
$$;
create or replace function public.calculate_business_minutes(
  p_started_at timestamptz, p_ended_at timestamptz, p_work_days integer[], p_work_start time,
  p_work_end time, p_break_start time, p_break_end time, p_timezone text
) returns integer language sql immutable as $$ select 0 $$;

create or replace function public.is_valid_external_revision_policy(p_policy jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p_policy) = 'object'
    and coalesce(p_policy->>'recipient_type','') in ('requester','signer')
    and coalesce(p_policy->>'approval_restart_step','') ~ '^[1-8]$'
$$;
create or replace function public.save_form_usage_config_pre_external_revision_policy(
  p_usage_id uuid, p_payload jsonb, p_department_ids uuid[], p_steps jsonb,
  p_attachments jsonb, p_verifiers jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_usage_id uuid := p_usage_id;
  v_step jsonb;
begin
  if v_usage_id is null then
    insert into public.form_usages (form_id, name, request_category, scope_type)
    values ('10000000-0000-4000-8000-000000000001', p_payload->>'name', 'non_asset', 'pusat')
    returning id into v_usage_id;
  end if;
  for v_step in select value from jsonb_array_elements(p_steps)
  loop
    insert into public.form_usage_steps (usage_id, step_order, role_name, label, action_type)
    values (
      v_usage_id, (v_step->>'step_order')::integer,
      v_step->>'role_name', v_step->>'label', v_step->>'action_type'
    );
  end loop;
  return v_usage_id;
end $$;
create or replace function public.save_form_usage_config(
  p_usage_id uuid, p_payload jsonb, p_department_ids uuid[], p_steps jsonb,
  p_attachments jsonb, p_verifiers jsonb default '[]'::jsonb
) returns uuid language plpgsql as $$ begin return coalesce(p_usage_id, gen_random_uuid()); end $$;
create or replace function public.resolve_surat_process_revision(p_event_id uuid, p_note text)
returns boolean language sql as $$ select true $$;
create or replace function public.validate_form_usage_signature() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger validate_form_usage_signature_before_write before insert or update on public.surat_signatures
for each row execute function public.validate_form_usage_signature();

insert into public.master_departments (id,name) values
 ('30000000-0000-4000-8000-000000000001','Marketing'),
 ('30000000-0000-4000-8000-000000000002','HRD & GA'),
 ('30000000-0000-4000-8000-000000000003','Direksi'),
 ('30000000-0000-4000-8000-000000000004','Perencanaan'),
 ('30000000-0000-4000-8000-000000000005','Keuangan & Akuntansi'),
 ('30000000-0000-4000-8000-000000000006','Branch Manager'),
 ('30000000-0000-4000-8000-000000000007','Teknik (Cabang)'),
 ('30000000-0000-4000-8000-000000000008','Umum & Keuangan (Cabang)'),
 ('30000000-0000-4000-8000-000000000009','Pengembangan Organisasi');
update public.master_departments
set code = 'PBO'
where id = '30000000-0000-4000-8000-000000000009';
insert into public.master_offices (id,name,kedudukan) values
 ('20000000-0000-4000-8000-000000000001','Kantor Pusat','Pusat'),
 ('20000000-0000-4000-8000-000000000002','Cabang A','KC'),
 ('20000000-0000-4000-8000-000000000003','Cabang B','KC'),
 ('20000000-0000-4000-8000-000000000004','Cabang Tanpa BM','KC');
insert into public.master_forms (id,nama_form) values
 ('10000000-0000-4000-8000-000000000001','FORM PERMINTAAN BARANG & JASA'),
 ('10000000-0000-4000-8000-000000000002','REKOMENDASI PEREMAJAAN BARANG / ALAT KERJA');
insert into public.master_letter_types (id,name,code) values
 ('70000000-0000-4000-8000-000000000001','Rekomendasi','REK');
insert into public.master_entities (id,name,code) values
 ('80000000-0000-4000-8000-000000000001','UAI','UAI');
insert into public.profiles (id,full_name,job_title,role,office_id,department_id) values
 ('40000000-0000-4000-8000-000000000001','Assistant Marketing','Assistant Manager Marketing','user','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000002','Manager Marketing','Manager Marketing','user','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000003','Manager Planning','Staff','user','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000004'),
 ('40000000-0000-4000-8000-000000000005','Admin Planning','Staff Admin Perencanaan','user','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000004'),
 ('40000000-0000-4000-8000-000000000006','Manager Finance','Manager','user','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000005'),
 ('40000000-0000-4000-8000-000000000007','Manager HRD','Manager','user','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002'),
 ('40000000-0000-4000-8000-000000000010','Director A','Direktur Utama','user','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003'),
 ('40000000-0000-4000-8000-000000000011','Director B','Direktur I','user','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003'),
 ('40000000-0000-4000-8000-000000000012','Director C','Direktur II','user','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003'),
 ('40000000-0000-4000-8000-000000000013','SPV A','Supervisor Teknik','user','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000007'),
 ('40000000-0000-4000-8000-000000000014','ABM A','Assistant Branch Manager','user','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000006'),
 ('40000000-0000-4000-8000-000000000015','BM A','Branch Manager','user','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000006'),
 ('40000000-0000-4000-8000-000000000016','SPV B','Supervisor Teknik','user','20000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000007'),
 ('40000000-0000-4000-8000-000000000017','ABM B','Assistant Branch Manager','user','20000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000006'),
 ('40000000-0000-4000-8000-000000000018','BM B','Branch Manager','user','20000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000006'),
 ('40000000-0000-4000-8000-000000000020','Branch Requester','Staff','user','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000007'),
 ('40000000-0000-4000-8000-000000000021','Other Branch User','Staff','user','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000008'),
 ('40000000-0000-4000-8000-000000000022','Branch D Supervisor','Supervisor Teknik','user','20000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000007');

insert into public.profiles (id,full_name,job_title,role,office_id,department_id) values
 ('40000000-0000-4000-8000-000000000023','Staff IT Recommendation','Staff IT','user','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000009');

insert into public.form_usages (id,form_id,name,request_category,scope_type,status) values
 ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Legacy Pusat Asset','asset','pusat','active'),
 ('50000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002','Rekomendasi Peremajaan Aset','non_asset','pusat','active'),
 ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Permohonan Aset (Pusat)','asset','pusat','active'),
 ('50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Permohonan Order Bangun Marketing','unit','pusat','active'),
 ('50000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','Permohonan Teknik Cabang','non_unit','cabang','active');
insert into public.form_usage_steps (id,usage_id,step_order,role_name,label,action_type,candidate_scope) values
 ('60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',1,'memeriksa','Pimpinan Departemen','approval','head_office'),
 ('60000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000003',3,'memeriksa','Mgr. Perencanaan','unit_allocation','head_office'),
 ('60000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000004',3,'memeriksa','Mgr. Perencanaan','approval','head_office');
insert into public.form_usage_steps (id,usage_id,step_order,role_name,label,action_type,candidate_scope) values
 ('60000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005',1,'membuat','Staff IT','approval','manual');
insert into public.form_usage_step_users values
 ('60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003'),
 ('60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000006'),
 ('60000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000003'),
 ('60000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000003'),
 ('60000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000023');
insert into public.form_usage_step_verifiers values
 ('60000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000005');

insert into public.form_usage_attachment_requirements (
  id, usage_id, usage_step_id, stage_order, requirement_key, label,
  is_required, allow_multiple, min_files, max_files
) values (
  '90000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000005',
  '60000000-0000-4000-8000-000000000004',
  1, 'lampiran', 'Lampiran', true, true, 1, 10
);

insert into public.surat_registrasi (
  id, form_usage_id, office_id, dept_id, created_by, status, current_step
) values (
  'a0000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000005',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000009',
  '40000000-0000-4000-8000-000000000023',
  'PROSES', 1
);
insert into public.surat_signatures (
  id, surat_id, user_id, form_usage_step_id, step_order, role_name,
  is_signed, attachment_requirements_snapshot
) values (
  'b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000023',
  '60000000-0000-4000-8000-000000000004',
  1, 'membuat', false,
  '[{"usage_id":"50000000-0000-4000-8000-000000000005","stage_order":1,"requirement_key":"lampiran","label":"Lampiran","is_required":true,"min_files":1}]'::jsonb
);

${migrations}
${assertions}
${nonPlanningMigration}
${nonPlanningMigration}
${nonPlanningAssertions}
${keu1Migration}
${keu1Migration}
${keu1Assertions}
alter table public.surat_registrasi add column entity_id uuid, add column letter_type_id uuid,
  add column project_id uuid;
create table public.master_projects (id uuid primary key, office_id uuid);
create table public.surat_reservations (
 id uuid primary key default gen_random_uuid(), entity_id uuid, type_id uuid, office_id uuid,
 project_id uuid, dept_id uuid, year integer, no_urut integer, reserved_by uuid,
 number_scope_type text, status text
);
create function public.branch_has_registered_projects(uuid) returns boolean language sql as $$ select false $$;
create function public.get_office_descendant_ids(uuid) returns setof uuid language sql as $$ select null::uuid where false $$;
create function public.resolve_form_usage_category(p_form_usage_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select lower(usage.request_category) from public.form_usages usage where usage.id = p_form_usage_id;
$$;
${branchGuard}
create trigger registration_branch_guard before insert or update on public.surat_registrasi
 for each row execute function public.enforce_surat_registration_branch_project();
do $$ declare v_usage uuid; begin
 select usage.id into v_usage from public.form_usages usage
 join public.master_forms form on form.id = usage.form_id
 where form.nomor_form = 'FM-UAI.KEU-01-00' and usage.scope_type = 'cabang';
 begin
  insert into public.surat_registrasi (form_usage_id, office_id, created_by, no_surat, form_input_data)
  values (v_usage, '20000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000020', '017/UAI/000/X/2026', '{"fund_without_project":true}');
  raise exception 'Expected original nonexistent-column regression';
 exception when undefined_column then
  if position('no_urut' in sqlerrm) = 0 then raise; end if;
 end;
 raise notice 'Original KEU 1 no_urut failure reproduced';
end $$;
${keu1SubmitMigration}
${keu1SubmitMigration}
${keu1SubmitAssertions}
alter table public.master_offices add column parent_id uuid;
${makerMigration}
${makerMigration}
${makerAssertions}
${bmMigration}
${bmMigration}
${bmAssertions}
${optionalProjectMigration.replace(/\r\n/g, "\n")}
${optionalProjectMigration.replace(/\r?\n/g, "\r\n")}
${optionalProjectAssertions}
create schema organization_internal;
${officerHelpers}
${officerMigration}
${officerMigration}
${officerAssertions}
${fundChecklistSql}
`;

const run = (args, input = "", stdoutOnly = false) => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 180_000 });
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(" ")} exited ${result.status}\n${result.stderr || ""}\n${result.stdout || ""}`);
  }
  return stdoutOnly ? result.stdout : `${result.stdout || ""}\n${result.stderr || ""}`;
};

// Docker image-download progress is stderr, not part of the container identifier.
const id = run(["run", "-d", "-e", "POSTGRES_PASSWORD=test", "postgres:17-alpine"], "", true).trim();
if (!/^[a-f0-9]{64}$/u.test(id)) throw new Error("Docker returned an invalid disposable container ID.");
try {
  let ready = false;
  for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
    const probe = spawnSync("docker", ["exec", id, "psql", "-h", "127.0.0.1", "-U", "postgres", "-Atqc", "select 1"], { encoding: "utf8" });
    ready = probe.status === 0 && probe.stdout.trim() === "1";
    if (!ready) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready.");
  const executedSql = fundChecklist ? sql.slice(0, sql.indexOf(nonPlanningMigration)) + fundChecklistSql : sql;
  const output = run(["exec", "-i", id, "psql", "-h", "127.0.0.1", "-v", "ON_ERROR_STOP=1", "-U", "postgres"], executedSql);
  if (!output.includes("SUR-17 canonical submission workflows: all assertions passed")) {
    throw new Error(`SQL success marker missing.\n${output}`);
  }
  if (fundChecklist) {
    if (!output.includes("Fund item checklist: all assertions passed")) throw new Error("Fund checklist regression marker missing.");
    process.stdout.write(output);
  } else {
  if (!output.includes("Non-Planning checker defaults: all assertions passed")) {
    throw new Error(`Checker migration success marker missing.\n${output}`);
  }
  if (!output.includes("KEU 1 workflow: all assertions passed")) {
    throw new Error(`KEU 1 migration success marker missing.\n${output}`);
  }
  process.stdout.write(output);
  if (fundChecklist && !output.includes("Fund item checklist: all assertions passed")) throw new Error("Fund checklist regression marker missing.");
  if (!output.includes("Contextual first maker: all assertions passed")) throw new Error("Maker regression marker missing.");
  if (!output.includes("KEU 1 optional project: all assertions passed")) throw new Error("Optional project regression marker missing.");
  if (!output.includes("KEU 1 submit and first signer: all assertions passed")) {
    throw new Error("KEU 1 submit regression marker missing.");
  }
  }
} finally {
  spawnSync("docker", ["rm", "-f", id], { encoding: "utf8" });
}
