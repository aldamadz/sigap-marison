import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const migration = readFileSync("supabase/migrations/20260810143000_rec03_recommendation_multi_detail_foundation.sql", "utf8");
const assertions = readFileSync("supabase/tests/recommendation_multi_detail.integration.sql", "utf8");
const canonicalFixture = readFileSync("fixtures/recommendation-multi-detail-v1.json", "utf8").replaceAll("'", "''");
const fixture = `
create schema extensions;
create extension pgcrypto with schema extensions;
create schema auth;
create role anon; create role authenticated; create role service_role;
create function auth.uid() returns uuid language sql stable set search_path='' as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.profiles(id uuid primary key,role text not null,is_active boolean default true);
create table public.surat_registrasi(
 id uuid primary key,created_by uuid references public.profiles(id),no_surat text,judul_surat text,status text,file_path text,pdf_path text,
 current_step integer default 1,reservation_id uuid,form_input_data jsonb default '{}',data_snapshot jsonb default '{}',updated_at timestamptz default now());
create table public.surat_reservations(id uuid primary key,status text,reserved_by uuid references public.profiles(id));
create table public.surat_recommendation_tasks(
 id uuid primary key,parent_surat_id uuid references public.surat_registrasi(id),submitted_surat_id uuid references public.surat_registrasi(id),
 reservation_id uuid references public.surat_reservations(id),required_before_step integer default 3,status text,claimed_by uuid references public.profiles(id),
 submitted_at timestamptz,updated_at timestamptz default now());
create function public.touch_surat_recommendation_task() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=now();return new;end$$;
create trigger trg_touch_surat_recommendation_task before update on public.surat_recommendation_tasks for each row execute function public.touch_surat_recommendation_task();
create table public.surat_linked_documents(parent_surat_id uuid,child_surat_id uuid,link_type text,required_before_step integer,created_by uuid,status text default 'active',updated_at timestamptz default now(),unique(parent_surat_id,child_surat_id,link_type));
create table public.surat_revision_events(id uuid primary key default gen_random_uuid(),surat_id uuid,target_type text,status text,target_user_ids uuid[],reason text,changes jsonb default '{}',created_at timestamptz default now());
create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid,type text,title text,message text,data jsonb default '{}',link text);
create table public.surat_signatures(id uuid primary key,surat_id uuid,user_id uuid,is_signed boolean default false,signed_at timestamptz,step_order integer,status text,catatan text,pdf_path_snap text,file_path_snap text,verification_required boolean default false,verification_status text default 'not_required',available_at timestamptz);
create table public.surat_attachments(id uuid primary key default gen_random_uuid(),surat_id uuid,file_url text,file_size bigint,file_type text);
create table public.document_pdf_jobs(id uuid primary key default gen_random_uuid(),surat_id uuid,signature_id uuid,source_file_path text,status text default 'queued',pdf_url text,error_message text,requested_by uuid,refresh boolean default false,locked_by text,locked_at timestamptz,attempt_count integer default 0,created_at timestamptz default now(),updated_at timestamptz default now(),finished_at timestamptz);
create table public.file_view_tokens(id uuid primary key default gen_random_uuid(),token_hash text unique,bucket text,object_path text,storage_origin text,requested_by uuid,surat_id uuid,purpose text,expires_at timestamptz,consumed_at timestamptz,created_at timestamptz default now());
create type public.marison_outbound_dispatch_status as enum('pending','processing','succeeded','failed_retryable','failed_terminal','outcome_unknown','skipped');
create table public.marison_outbound_dispatches(
 id uuid primary key default gen_random_uuid(),surat_id uuid not null,environment text not null,generation integer default 1,kind text,endpoint text,contract_version text,
 payload jsonb,payload_body text,payload_hash text,payload_built_at timestamptz,idempotency_key text not null,status public.marison_outbound_dispatch_status default 'pending',
 lease_token uuid,lease_acquired_at timestamptz,lease_expires_at timestamptz,post_started_at timestamptz,last_attempt_at timestamptz,completed_at timestamptz,skipped_code text,skipped_reason text,updated_at timestamptz default now(),
 constraint fixture_payload check((payload is null and payload_body is null and payload_hash is null and payload_built_at is null and contract_version is null) or payload is not null),
 constraint fixture_skip check((status='skipped' and skipped_code is not null and skipped_reason is not null and completed_at is not null) or status<>'skipped'));
create function public.mark_marison_outbound_post_started(uuid,uuid) returns boolean language sql as $$select true$$;
grant all on all tables in schema public to authenticated,service_role;
`;
const run=(args,input="")=>{const result=spawnSync("docker",args,{input,encoding:"utf8",timeout:120000});if(result.status!==0)throw new Error(`${result.stderr||""}\n${result.stdout||""}`.trim()||"Docker command failed");return result.stdout;};
const id=run(["run","-d","-e","POSTGRES_PASSWORD=test","postgres:17-alpine"]).trim();
try{
 let ready=false;for(let attempt=0;attempt<30&&!ready;attempt+=1){ready=spawnSync("docker",["exec",id,"pg_isready","-U","postgres"],{encoding:"utf8"}).status===0;if(!ready)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,500);}
 if(!ready)throw new Error("Disposable PostgreSQL did not become ready");
 process.stdout.write(run(["exec","-i",id,"psql","-U","postgres","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose"],fixture+migration+assertions.replace("__CANONICAL_FIXTURE__",canonicalFixture)));
}finally{run(["rm","-f",id]);}
