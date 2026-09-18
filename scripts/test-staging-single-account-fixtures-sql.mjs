import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const canonical = [
  "supabase/migrations/20260917130000_canonical_submission_workflow_contract.sql",
  "supabase/migrations/20260917131000_atomic_configured_checker_input.sql",
  "supabase/migrations/20260917132000_optional_branch_signer_fallback.sql",
  "supabase/migrations/20260917133000_seed_canonical_submission_workflows.sql",
  "supabase/migrations/20260918100000_restore_asset_recommendation_config.sql",
  "supabase/migrations/20260918130000_fix_recommendation_creator_auto_approval.sql",
].map((f) => readFileSync(f, "utf8")).join("\n\n");
const fixture = readFileSync(
  "supabase/migrations/20260919000000_staging_single_account_usage_fixtures.sql",
  "utf8",
);
const assertions = readFileSync(
  "supabase/tests/staging_single_account_fixtures.integration.sql",
  "utf8",
);
const behavioral = readFileSync(
  "supabase/tests/staging_single_account_behavioral.integration.sql",
  "utf8",
);

const sql = `
create extension if not exists pgcrypto;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable set search_path = ''
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.master_departments (id uuid primary key, name text not null unique, code text);
create table public.master_offices (id uuid primary key, name text not null, code text, kedudukan text, marison_branch_id bigint, marison_synced_at timestamptz, marison_review_required boolean default false);
create table public.master_letter_types (id uuid primary key, name text not null, code text);
create table public.master_entities (id uuid primary key, name text not null, code text);
create table public.master_projects (id uuid primary key, name text, code text, office_id uuid references public.master_offices(id), marison_project_id bigint, marison_synced_at timestamptz, marison_review_required boolean default false);
create table public.profiles (
  id uuid primary key, full_name text, job_title text, role text default 'user',
  office_id uuid references public.master_offices(id),
  department_id uuid references public.master_departments(id),
  is_active boolean default true, deleted_at timestamptz,
  email text, nik text, marison_employee_id bigint, marison_synced_at timestamptz, marison_review_required boolean default false
);
create table public.master_forms (
  id uuid primary key, nama_form text not null, nomor_form text, created_at timestamptz default now()
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
  external_revision_policy jsonb not null default '{"recipient_type":"requester","recipient_step_order":null,"approval_restart_step":1}'::jsonb,
  is_system_template boolean not null default false
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
  assignee_mode text not null default 'select',
  input_schema jsonb not null default '{}'::jsonb,
  verifier_department_id uuid references public.master_departments(id),
  verifier_scope text not null default 'request_office',
  skip_if_no_candidate boolean not null default false,
  candidate_fallback_mode text,
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
  data_snapshot jsonb default '{}'::jsonb, updated_at timestamptz default now()
);
create table public.surat_signatures (
  id uuid primary key default gen_random_uuid(), surat_id uuid references public.surat_registrasi(id),
  user_id uuid references public.profiles(id), form_usage_step_id uuid references public.form_usage_steps(id),
  step_order integer default 1, role_name text default 'membuat', label_jabatan text,
  is_signed boolean default false, action_type text not null default 'approval' check (action_type in ('approval','unit_allocation')),
  requires_unit_allocation boolean default false, attachment_requirements_snapshot jsonb default '[]'::jsonb,
  verifier_snapshot jsonb default '[]'::jsonb, verification_required boolean default false,
  verification_status text default 'not_required', verified_at timestamptz, verified_by uuid,
  verification_note text, input_schema_snapshot jsonb default '{}'::jsonb
);
create table public.surat_attachments (
  id uuid primary key default gen_random_uuid(), surat_id uuid references public.surat_registrasi(id),
  signature_id uuid references public.surat_signatures(id), stage text, requirement_key text
);
create table public.surat_revision_events (
  id uuid primary key default gen_random_uuid(), surat_id uuid references public.surat_registrasi(id),
  status text, target_type text, target_user_ids uuid[] default array[]::uuid[], created_at timestamptz default now()
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
declare v_usage_id uuid := p_usage_id; v_step jsonb;
begin
  if v_usage_id is null then
    insert into public.form_usages (form_id, name, request_category, scope_type)
    values ('10000000-0000-4000-8000-000000000001', p_payload->>'name', 'non_asset', 'pusat')
    returning id into v_usage_id;
  end if;
  for v_step in select value from jsonb_array_elements(p_steps) loop
    insert into public.form_usage_steps (usage_id, step_order, role_name, label, action_type)
    values (v_usage_id, (v_step->>'step_order')::integer, v_step->>'role_name', v_step->>'label', v_step->>'action_type');
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
create or replace function public.marison_payload_profile_source_valid(p_profile_id uuid)
returns boolean language sql stable as $$
  select exists (select 1 from public.profiles p where p.id=p_profile_id and p.deleted_at is null and p.is_active and p.marison_employee_id > 0 and nullif(btrim(p.nik),'') is not null and p.marison_synced_at is not null)
$$;
create or replace function public.marison_payload_office_source_valid(p_office_id uuid)
returns boolean language sql stable as $$
  select exists (select 1 from public.master_offices o where o.id=p_office_id and o.marison_branch_id > 0 and o.marison_synced_at is not null)
$$;

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
update public.master_departments set code='PBO' where id='30000000-0000-4000-8000-000000000009';
insert into public.master_offices (id,name,code,kedudukan,marison_branch_id,marison_synced_at) values
 ('20000000-0000-4000-8000-000000000001','Kantor Pusat','001','Pusat',1,now()),
 ('20000000-0000-4000-8000-000000000002','Cabang A','002','KC',2,now()),
 ('20000000-0000-4000-8000-000000000003','Cabang B','003','KC',3,now()),
 ('20000000-0000-4000-8000-000000000004','Cabang Tanpa BM','004','KC',4,now());
insert into public.master_forms (id,nama_form) values
 ('10000000-0000-4000-8000-000000000001','FORM PERMINTAAN BARANG & JASA'),
 ('10000000-0000-4000-8000-000000000002','REKOMENDASI PEREMAJAAN BARANG / ALAT KERJA');
insert into public.master_letter_types (id,name,code) values
 ('70000000-0000-4000-8000-000000000001','Rekomendasi','REK');
insert into public.master_entities (id,name,code) values
 ('80000000-0000-4000-8000-000000000001','UAI','UAI');
insert into public.master_projects (id,name,code,office_id,marison_project_id,marison_synced_at) values
 ('90000000-0000-4000-8000-000000000001','Project A','PRJ-A','20000000-0000-4000-8000-000000000002',101,now());
insert into public.profiles (id,full_name,job_title,role,office_id,department_id,email,nik,marison_employee_id,marison_synced_at) values
 ('40000000-0000-4000-8000-000000000001','Assistant Marketing','Assistant Manager Marketing','user','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','a1@x.test','N1',null,null),
 ('40000000-0000-4000-8000-000000000002','Manager Marketing','Manager Marketing','user','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','a2@x.test','N2',null,null),
 ('40000000-0000-4000-8000-000000000003','Manager Planning','Staff','user','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000004','a3@x.test','N3',null,null),
 ('40000000-0000-4000-8000-000000000005','Admin Planning','Staff Admin Perencanaan','user','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000004','a5@x.test','N5',null,null),
 ('40000000-0000-4000-8000-000000000006','Manager Finance','Manager','user','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000005','a6@x.test','N6',null,null),
 ('40000000-0000-4000-8000-000000000007','Manager HRD','Manager','user','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','a7@x.test','N7',null,null),
 ('40000000-0000-4000-8000-000000000010','Director A','Direktur Utama','user','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','d1@x.test','D1',null,null),
 ('40000000-0000-4000-8000-000000000011','Director B','Direktur I','user','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','d2@x.test','D2',null,null),
 ('40000000-0000-4000-8000-000000000012','Director C','Direktur II','user','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','d3@x.test','D3',null,null),
 ('40000000-0000-4000-8000-000000000013','SPV A','Supervisor Teknik','user','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000007','s1@x.test','S1',null,null),
 ('40000000-0000-4000-8000-000000000014','ABM A','Assistant Branch Manager','user','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000006','b1@x.test','B1',null,null),
 ('40000000-0000-4000-8000-000000000015','BM A','Branch Manager','user','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000006','b2@x.test','B2',null,null),
 ('40000000-0000-4000-8000-000000000016','SPV B','Supervisor Teknik','user','20000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000007','s2@x.test','S2',null,null),
 ('40000000-0000-4000-8000-000000000017','ABM B','Assistant Branch Manager','user','20000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000006','b3@x.test','B3',null,null),
 ('40000000-0000-4000-8000-000000000018','BM B','Branch Manager','user','20000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000006','b4@x.test','B4',null,null),
 ('40000000-0000-4000-8000-000000000020','Branch Requester','Staff','user','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000007','r1@x.test','R1',null,null),
 ('40000000-0000-4000-8000-000000000021','Other Branch User','Staff','user','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000008','r2@x.test','R2',null,null),
 ('40000000-0000-4000-8000-000000000022','Branch D Supervisor','Supervisor Teknik','user','20000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000007','r3@x.test','R3',null,null),
 ('40000000-0000-4000-8000-000000000023','Staff IT Recommendation','Staff IT','user','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000009','rec@x.test','REC',null,null),
 ('1cc26c67-064c-44e2-9e23-e3b4311500e1','Tester Satu Akun','Staff PBO','admin','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000009','system.tuyemaris@gmail.com','I114',17,now());

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

${canonical}
${fixture}
-- idempotency: second run must not duplicate
${fixture}
-- Behavioral active-task predicate (subset of compact inbox RPC, no revision tasks).
create or replace function public.is_inbox_task_active(p_user_id uuid, p_signature_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.surat_signatures ss
    join public.surat_registrasi sr on sr.id=ss.surat_id
    where ss.id=p_signature_id
      and coalesce(ss.is_signed,false) is not true
      and sr.status='PROSES' and ss.step_order=sr.current_step
      and (ss.user_id=p_user_id
        or (ss.verification_required is true and ss.verification_status='pending'
          and ss.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id', p_user_id::text))))
  )
$$;
${assertions}
${behavioral}
`;

const run = (args, input = "") => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 180000 });
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(" ")} exited ${result.status}\n${result.stderr || ""}\n${result.stdout || ""}`);
  }
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
  if (!output.includes("STAGING single-account fixtures: all assertions passed")) {
    throw new Error(`SQL success marker missing.\n${output}`);
  }
  if (!output.includes("STAGING single-account behavioral: all assertions passed")) {
    throw new Error(`Behavioral marker missing.\n${output}`);
  }
  process.stdout.write(output);
} finally {
  spawnSync("docker", ["rm", "-f", id], { encoding: "utf8" });
}
