-- Disposable PostgreSQL only. RPC bodies are loaded from actual migrations/preflight,
-- not mocked here. No employee fixture is included in a rollout migration.
create extension if not exists pgcrypto;
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema auth,public to authenticated,anon,service_role;
grant execute on function auth.uid() to authenticated,service_role;

create table public.master_departments(id uuid primary key,name text not null,code text);
create table public.master_offices(id uuid primary key,name text,kedudukan text,parent_id uuid);
create table public.master_projects(id uuid primary key,office_id uuid references public.master_offices,name text);
create table public.master_entities(id uuid primary key,name text,code text);
create table public.master_letter_types(id uuid primary key,name text,code text);
create table public.master_dept_letter_types(dept_id uuid,letter_type_id uuid,primary key(dept_id,letter_type_id));
create table public.profiles(id uuid primary key,full_name text,job_title text,nik text,email text,
  role text default 'user',is_active boolean default true,deleted_at timestamptz,office_id uuid,department_id uuid);
-- Intentionally NO job_title_display column: production/staging do not have it.
create table public.master_forms(id uuid primary key default gen_random_uuid(),nama_form text,nomor_form text,
  department_id uuid,input_schema jsonb default '[]',created_at timestamptz default now());
create table public.approval_route_templates(id uuid primary key default gen_random_uuid(),name text,description text,
  status text default 'draft',created_by uuid,created_at timestamptz default now(),updated_at timestamptz default now());
create table public.approval_route_steps(id uuid primary key default gen_random_uuid(),route_id uuid references public.approval_route_templates,
  step_order integer,role_name text check(role_name in ('membuat','memeriksa','menyetujui')),label text,
  action_type text default 'approval',created_at timestamptz default now(),unique(route_id,step_order));
create table public.form_usages(id uuid primary key default gen_random_uuid(),form_id uuid references public.master_forms,
  route_id uuid references public.approval_route_templates,name text,description text,request_category text,
  scope_type text,status text,sort_order integer default 0,created_by uuid,created_at timestamptz default now(),updated_at timestamptz default now(),
  first_maker_policy text default 'contextual' check(first_maker_policy in ('contextual','configured')),
  recommendation_config jsonb default '{}',external_revision_policy jsonb default '{"recipient_type":"requester","recipient_step_order":null,"approval_restart_step":1}');
alter table public.form_usages add column is_system_template boolean default false;
create table public.form_usage_departments(usage_id uuid references public.form_usages,department_id uuid,primary key(usage_id,department_id));
create table public.form_usage_steps(id uuid primary key default gen_random_uuid(),usage_id uuid references public.form_usages,
  route_step_id uuid references public.approval_route_steps,step_order integer,role_name text check(role_name in ('membuat','memeriksa','menyetujui')),
  label text,signer_department_id uuid,action_type text default 'approval',assignee_mode text default 'select',candidate_scope text default 'manual',
  input_schema jsonb default '{}',skip_if_no_candidate boolean default false,candidate_fallback_mode text,created_at timestamptz default now(),unique(usage_id,step_order));
alter table public.form_usage_steps add column verifier_department_id uuid,
  add column verifier_scope text default 'request_office';
create table public.form_usage_step_users(usage_step_id uuid references public.form_usage_steps,user_id uuid references public.profiles,primary key(usage_step_id,user_id));
create table public.form_usage_step_verifiers(usage_step_id uuid references public.form_usage_steps,user_id uuid references public.profiles,created_at timestamptz default now(),primary key(usage_step_id,user_id));
create table public.form_usage_attachment_requirements(id uuid primary key default gen_random_uuid(),usage_id uuid,usage_step_id uuid,
  stage_order integer,requirement_key text,label text,is_required boolean default true,allow_multiple boolean default false,
  min_files integer default 1,max_files integer default 1,allowed_types text[] default '{}',max_size_bytes bigint,sort_order integer default 0);
create table public.surat_registrasi(id uuid primary key default gen_random_uuid(),no_surat text unique,
  entity_id uuid,office_id uuid,project_id uuid,dept_id uuid,letter_type_id uuid,penggunaan_id uuid,form_usage_id uuid references public.form_usages,
  judul_surat text,file_path text,lampiran_path text,is_aset boolean,status text default 'PROSES',current_step integer default 1,
  created_by uuid references public.profiles,requester_nik text,request_place text,request_date date,form_input_data jsonb default '{}',
  requester_snapshot jsonb default '{}',location_snapshot jsonb default '{}',pdf_path text,data_snapshot jsonb default '{}',policy_snapshot jsonb default '{}',
  represented_department_id uuid,represented_by_admin uuid,created_at timestamptz default now(),updated_at timestamptz default now());
create table public.surat_signatures(id uuid primary key default gen_random_uuid(),surat_id uuid references public.surat_registrasi,
  user_id uuid references public.profiles,form_usage_step_id uuid references public.form_usage_steps,step_order integer,role_name text,
  label_jabatan text,is_signed boolean default false,action_type text default 'approval',requires_unit_allocation boolean default false,
  input_schema_snapshot jsonb default '{}',attachment_requirements_snapshot jsonb default '[]',verifier_snapshot jsonb default '[]',
  verification_required boolean default false,verification_status text default 'not_required',verified_at timestamptz,verified_by uuid,
  verification_note text,available_at timestamptz,signer_snapshot jsonb default '{}',status text default 'PENDING',signed_at timestamptz,catatan text,
  file_path_snap text,pdf_path_snap text,created_at timestamptz default now());
create table public.surat_attachments(id uuid primary key default gen_random_uuid(),surat_id uuid references public.surat_registrasi,
  signature_id uuid,stage text,requirement_key text,file_url text,created_at timestamptz default now());
create table public.surat_revision_events(id uuid primary key default gen_random_uuid(),surat_id uuid references public.surat_registrasi,
  signature_id uuid,actor_id uuid,target_type text,target_user_ids uuid[] default '{}',from_step integer,target_step integer,reason text,
  changes jsonb default '{}',status text default 'open',resolved_at timestamptz,resolved_by uuid,created_at timestamptz default now());
create table public.external_submission_decision_events(id uuid primary key default gen_random_uuid(),event_id uuid unique,surat_id uuid,decision text,revision_generation integer,
  reason text,decided_at timestamptz,payload_hash text,created_at timestamptz default now());
create table public.marison_outbound_dispatches(id uuid primary key default gen_random_uuid(),surat_id uuid,environment text,status text,
  post_started_at timestamptz,response jsonb,external_reference text);
create table public.surat_external_revision_history(id uuid primary key default gen_random_uuid(),surat_id uuid references public.surat_registrasi on delete restrict,
  decision_event_id uuid not null references public.external_submission_decision_events on delete restrict,generation integer not null check(generation>0),
  document_snapshot jsonb not null,signatures_snapshot jsonb not null,attachments_snapshot jsonb not null,created_at timestamptz default now(),unique(surat_id,generation));
create table public.surat_reservations(id uuid primary key default gen_random_uuid(),entity_id uuid,type_id uuid,office_id uuid,project_id uuid,
  dept_id uuid,year integer,no_urut integer,reserved_by uuid,status text default 'PENDING',number_scope_type text);
create table public.surat_registration_drafts(id uuid primary key default gen_random_uuid(),reservation_id uuid,created_by uuid,no_surat text,status text default 'DRAFT',
  revision_event_id uuid,payload jsonb,signer_assignments jsonb,expires_at timestamptz,submitted_at timestamptz,voided_at timestamptz);
create unique index surat_registration_drafts_revision_event_key on public.surat_registration_drafts(revision_event_id) where revision_event_id is not null;
create table public.surat_registration_draft_files(id uuid primary key default gen_random_uuid(),draft_id uuid,created_by uuid,
  file_url text,file_name text,file_type text,file_size bigint,requirement_key text,requirement_label text);
alter table public.surat_attachments add column file_name text,add column file_type text,add column file_size bigint,add column requirement_label text;
create table public.master_penggunaan_detail(id uuid primary key,request_categories text[]);
create table public.surat_linked_documents(id uuid primary key,child_surat_id uuid,parent_surat_id uuid,link_type text,status text);
create table public.document_pdf_jobs(id uuid primary key default gen_random_uuid(),surat_id uuid references public.surat_registrasi,
  signature_id uuid references public.surat_signatures,source_file_path text not null,requested_by uuid,refresh boolean default false,
  status text default 'queued',render_payload jsonb,pdf_url text,error_message text,lease_token uuid,lease_expires_at timestamptz,
  locked_by text,locked_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),finished_at timestamptz,attempts integer default 0);
alter table public.document_pdf_jobs add column recommendation_content_fingerprint text;
create table public.surat_recommendation_tasks(id uuid primary key,parent_surat_id uuid,claimed_by uuid,candidate_snapshot jsonb);
create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid,type text,title text,message text,data jsonb,link text,created_at timestamptz default now());

create schema keu10_test;
create function keu10_test.id(p_id integer) returns uuid language sql immutable as $$
  select ('40000000-0000-4000-8000-'||lpad(p_id::text,12,'0'))::uuid
$$;
create function keu10_test.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is distinct from true then raise exception 'ASSERT: %',p_message; end if; end $$;
create function keu10_test.expect_error(p_state text,p_sql text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlstate is distinct from p_state then raise exception 'Expected %, got %: %',p_state,sqlstate,sqlerrm; end if;
    return;
  end;
  raise exception 'Expected %; statement succeeded: %',p_state,p_sql;
end $$;
grant usage on schema keu10_test to authenticated,service_role;
grant execute on all functions in schema keu10_test to authenticated,service_role;
create table keu10_test.results(key text primary key,surat_id uuid,event_id uuid,input jsonb,pdf_job uuid,pdf_snapshot jsonb);
grant select,insert,update on keu10_test.results to authenticated,service_role;

insert into public.master_departments values
 (keu10_test.id(101),'Keuangan & Akuntansi','KEU'),(keu10_test.id(102),'Legal Lahan','LLH'),
 (keu10_test.id(103),'Pengembangan Bisnis','PBI'),(keu10_test.id(104),'Direksi','DIR'),(keu10_test.id(105),'Teknik (Cabang)','TEK');
insert into public.master_offices values
 (keu10_test.id(201),'HQ','Pusat',null),(keu10_test.id(202),'KC A','KC',null),
 (keu10_test.id(203),'KCP A','KCP',keu10_test.id(202)),(keu10_test.id(204),'KC B','KC',null);
insert into public.master_projects values(keu10_test.id(301),keu10_test.id(203),'Project A'),(keu10_test.id(302),keu10_test.id(204),'Project B');
insert into public.master_entities values(keu10_test.id(401),'UAI','UAI');
insert into public.master_letter_types values(keu10_test.id(501),'Permintaan Dana','KEU');
insert into public.master_dept_letter_types values(keu10_test.id(105),keu10_test.id(501));
insert into public.profiles(id,full_name,job_title,role,office_id,department_id) values
 (keu10_test.id(1),'Requester','Staff','user',keu10_test.id(202),keu10_test.id(105)),
 (keu10_test.id(2),'BM A','Branch Manager','user',keu10_test.id(202),keu10_test.id(105)),
 (keu10_test.id(3),'Finance','Manager','user',keu10_test.id(201),keu10_test.id(101)),
 (keu10_test.id(4),'Legal','Manager Legal Lahan','user',keu10_test.id(201),keu10_test.id(102)),
 (keu10_test.id(5),'Business','Manager Pengembangan Bisnis','user',keu10_test.id(201),keu10_test.id(103)),
 (keu10_test.id(6),'DI','Direktur I','user',keu10_test.id(201),keu10_test.id(104)),
 (keu10_test.id(7),'DU','Direktur Utama','user',keu10_test.id(201),keu10_test.id(104)),
 (keu10_test.id(8),'BM B','Branch Manager','user',keu10_test.id(204),keu10_test.id(105)),
 (keu10_test.id(9),'Admin','Staff','admin',keu10_test.id(201),keu10_test.id(101)),
 (keu10_test.id(10),'Assistant DI','Assistant Direktur I','user',keu10_test.id(201),keu10_test.id(104)),
 (keu10_test.id(11),'Finance Staff','Staff','user',keu10_test.id(201),keu10_test.id(101)),
 (keu10_test.id(12),'Outsider','Staff','user',keu10_test.id(204),keu10_test.id(105)),
 (keu10_test.id(13),'DU second','Direktur Utama','user',keu10_test.id(201),keu10_test.id(104));
