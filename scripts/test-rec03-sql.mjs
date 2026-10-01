import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const migration = readFileSync("supabase/migrations/20260810143000_rec03_recommendation_multi_detail_foundation.sql", "utf8");
const noDispatchMigration = readFileSync("supabase/migrations/20260810170000_skip_all_rejected_outbound_without_jobs.sql", "utf8");
const fileLinkMigration = readFileSync("supabase/migrations/20260811140000_rec03_file_link_blockers.sql", "utf8");
const partialRecoveryMigration = readFileSync("supabase/migrations/20260812090000_recover_partial_recommendation_submission.sql", "utf8");
const restoredRecoveryMigration = readFileSync("supabase/migrations/20261001090000_restore_recommendation_partial_submission_recovery.sql", "utf8");
// Reproduce production drift: registration delegates straight to the current core.
const registrationWithoutRecovery = `
create or replace function public.create_surat_registrasi(p_payload jsonb)
returns public.surat_registrasi language sql security definer set search_path='' as $$
 select public.create_surat_registrasi_core(p_payload, auth.uid());
$$;
`;
const canonicalDraftBinding = /  select draft\.reservation_id::text[\s\S]*?  limit 1;/;
const completionWithoutDraftBinding = partialRecoveryMigration
  .slice(partialRecoveryMigration.indexOf("create or replace function public.complete_recommendation_task"))
  .replace(canonicalDraftBinding, "  v_child_reservation := nullif(coalesce(to_jsonb(v_child)->>'reservation_id', v_input->>'reservation_id'), '');");
if (canonicalDraftBinding.test(completionWithoutDraftBinding)) {
  throw new Error("Production task-linkage drift fixture was not applied.");
}
const pdfCacheMigration = readFileSync("supabase/migrations/20260818173000_rec03_reuse_current_recommendation_pdf.sql", "utf8");
const parentApprovalGateMigration = readFileSync("supabase/migrations/20260819090000_fix_recommendation_parent_approval_gate.sql", "utf8");
const assertions = readFileSync("supabase/tests/recommendation_multi_detail.integration.sql", "utf8");
const canonicalFixture = readFileSync("fixtures/recommendation-multi-detail-v1.json", "utf8").replaceAll("'", "''");
const fixture = `
create schema extensions;
create extension pgcrypto with schema extensions;
create schema auth;
create role anon; create role authenticated; create role service_role;
create function auth.uid() returns uuid language sql stable set search_path='' as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable set search_path='' as $$select current_user::text$$;
create table public.profiles(id uuid primary key,role text not null,is_active boolean default true,deleted_at timestamptz);
create table public.surat_registrasi(
 id uuid primary key,created_by uuid references public.profiles(id),no_surat text unique,judul_surat text,status text,file_path text,pdf_path text,
 current_step integer default 1,reservation_id uuid,form_input_data jsonb default '{}',data_snapshot jsonb default '{}',updated_at timestamptz default now());
create table public.surat_reservations(id uuid primary key,status text,reserved_by uuid references public.profiles(id));
create table public.surat_registration_drafts(
 id uuid primary key,reservation_id uuid unique references public.surat_reservations(id),created_by uuid references public.profiles(id),
 no_surat text,status text,updated_at timestamptz default now());
create table public.surat_recommendation_tasks(
 id uuid primary key,parent_surat_id uuid references public.surat_registrasi(id),submitted_surat_id uuid references public.surat_registrasi(id),
 reservation_id uuid references public.surat_reservations(id),required_before_step integer default 3,status text,claimed_by uuid references public.profiles(id),
 submitted_at timestamptz,updated_at timestamptz default now());
create function public.touch_surat_recommendation_task() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=now();return new;end$$;
create trigger trg_touch_surat_recommendation_task before update on public.surat_recommendation_tasks for each row execute function public.touch_surat_recommendation_task();
create table public.surat_linked_documents(id uuid primary key default gen_random_uuid(),parent_surat_id uuid,child_surat_id uuid,link_type text,required_before_step integer,created_by uuid,status text default 'active',updated_at timestamptz default now(),unique(parent_surat_id,child_surat_id,link_type));
create table public.surat_revision_events(id uuid primary key default gen_random_uuid(),surat_id uuid,target_type text,status text,target_user_ids uuid[],reason text,changes jsonb default '{}',created_at timestamptz default now());
create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid,type text,title text,message text,data jsonb default '{}',link text);
create table public.surat_signatures(id uuid primary key,surat_id uuid,user_id uuid,is_signed boolean default false,signed_at timestamptz,step_order integer,status text,catatan text,pdf_path_snap text,file_path_snap text,verification_required boolean default false,verification_status text default 'not_required',available_at timestamptz);
create table public.surat_attachments(id uuid primary key default gen_random_uuid(),surat_id uuid,file_url text,file_size bigint,file_type text);
create table public.document_pdf_jobs(id uuid primary key default gen_random_uuid(),surat_id uuid,signature_id uuid,source_file_path text,status text default 'queued',pdf_url text,error_message text,requested_by uuid,refresh boolean default false,locked_by text,locked_at timestamptz,attempt_count integer default 0,created_at timestamptz default now(),updated_at timestamptz default now(),finished_at timestamptz);
create function public.claim_document_pdf_jobs(p_worker_id text,p_limit integer default 1,p_max_attempts integer default 3,p_stale_after interval default interval '10 minutes') returns setof public.document_pdf_jobs language sql as $$select * from public.document_pdf_jobs where false$$;
create table public.file_view_tokens(token_hash text primary key,bucket text,object_path text,storage_origin text,requested_by uuid,surat_id uuid,purpose text,expires_at timestamptz,consumed_at timestamptz,created_at timestamptz default now());
create function public.consume_file_view_token(p_token_hash text)
returns table(bucket text,object_path text,storage_origin text) language sql security definer set search_path='' as $$
 select f.bucket,f.object_path,f.storage_origin from public.file_view_tokens f
 where f.token_hash=p_token_hash and (f.expires_at is null or f.expires_at>now())
$$;
create type public.marison_outbound_dispatch_status as enum('pending','processing','succeeded','failed_retryable','failed_terminal','outcome_unknown','skipped');
create table public.marison_outbound_dispatches(
 id uuid primary key default gen_random_uuid(),surat_id uuid not null,environment text not null,generation integer default 1,replacement_of_dispatch_id uuid,kind text,endpoint text,contract_version text,
 payload jsonb,payload_body text,payload_hash text,payload_built_at timestamptz,idempotency_key text not null,status public.marison_outbound_dispatch_status default 'pending',
  lease_token uuid,lease_acquired_at timestamptz,lease_expires_at timestamptz,post_started_at timestamptz,last_attempt_at timestamptz,completed_at timestamptz,skipped_code text,skipped_reason text,error_code text,response jsonb,external_reference text,created_at timestamptz default now(),updated_at timestamptz default now(),
 constraint fixture_payload check((payload is null and payload_body is null and payload_hash is null and payload_built_at is null and contract_version is null) or payload is not null),
 constraint fixture_skip check((status='skipped' and skipped_code is not null and skipped_reason is not null and completed_at is not null) or status<>'skipped'));
create function public.mark_marison_outbound_post_started(uuid,uuid) returns boolean language sql as $$select true$$;
create function public.ensure_marison_outbound_dispatch(uuid,text) returns uuid language sql as $$select null::uuid$$;
create table public.marison_outbound_settings(singleton boolean primary key,environment text,enabled boolean);
insert into public.marison_outbound_settings values(true,'staging',true);
create table public.marison_outbound_replacement_events(id uuid primary key default gen_random_uuid(),old_dispatch_id uuid,new_dispatch_id uuid);
create function public.create_marison_outbound_replacement_strict(uuid,uuid,text) returns uuid language sql as $$select gen_random_uuid()$$;
create function public.create_marison_outbound_replacement(uuid,uuid,text) returns uuid language sql as $$select gen_random_uuid()$$;
create function public.create_surat_registrasi(p_payload jsonb) returns public.surat_registrasi language plpgsql security definer set search_path='' as $$
declare v_row public.surat_registrasi%rowtype;
begin
 insert into public.surat_registrasi(id,created_by,no_surat,judul_surat,status)
 values(gen_random_uuid(),auth.uid(),p_payload->>'no_surat','new','PROSES') returning * into v_row;
 return v_row;
end$$;
create function public.create_surat_registrasi_core(p_payload jsonb, p_actor uuid)
returns public.surat_registrasi language plpgsql security definer set search_path='' as $$
begin
 if p_actor is distinct from auth.uid() then raise exception 'Actor mismatch' using errcode='42501'; end if;
 if exists(select 1 from public.surat_reservations where id=nullif(p_payload->>'reservation_id','')::uuid and (status<>'PENDING' or reserved_by is distinct from p_actor)) then
  raise exception 'Reservasi nomor sudah tidak aktif.' using errcode='55000';
 end if;
 return public.create_surat_registrasi_before_partial_recovery(p_payload);
end$$;
grant all on all tables in schema public to authenticated,service_role;
`;
const beforeNoDispatchMigration = `
insert into public.surat_registrasi(id,status,form_input_data,data_snapshot) values
('10000000-0000-4000-8000-000000000099','DONE','{"request_category":"asset"}','{"recommendation_decisions":[{"recommendation_action":"ditolak"}]}');
insert into public.marison_outbound_dispatches(id,surat_id,environment,kind,endpoint,idempotency_key,status,payload,payload_body,payload_hash,payload_built_at,contract_version,lease_token,lease_acquired_at,lease_expires_at)
values('70000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000099','staging','asset','/asset-purchase-requests','rec03-existing-pending','processing','{}','{}',repeat('e',64),now(),'v1','71000000-0000-4000-8000-000000000099',now()-interval '2 minutes',now()-interval '1 minute');
insert into public.marison_outbound_dispatches(id,surat_id,environment,kind,endpoint,idempotency_key,status,lease_token,lease_expires_at,response,external_reference,post_started_at) values
('70000000-0000-4000-8000-000000000091','10000000-0000-4000-8000-000000000099','staging','asset','/asset-purchase-requests','rec03-live','processing',gen_random_uuid(),now()+interval '5 minutes',null,null,null),
('70000000-0000-4000-8000-000000000092','10000000-0000-4000-8000-000000000099','staging','asset','/asset-purchase-requests','rec03-response','failed_retryable',null,null,'{}',null,null),
('70000000-0000-4000-8000-000000000093','10000000-0000-4000-8000-000000000099','staging','asset','/asset-purchase-requests','rec03-reference','failed_retryable',null,null,null,'vendor-1',null),
('70000000-0000-4000-8000-000000000094','10000000-0000-4000-8000-000000000099','staging','asset','/asset-purchase-requests','rec03-post','processing',gen_random_uuid(),now()-interval '1 minute',null,null,now());
`;
const run=(args,input="")=>{const result=spawnSync("docker",args,{input,encoding:"utf8",timeout:120000});if(result.status!==0)throw new Error(`${result.stderr||""}\n${result.stdout||""}`.trim()||"Docker command failed");return result.stdout;};
const id=run(["run","-d","-e","POSTGRES_PASSWORD=test","postgres:17-alpine"]).trim();
try{
 let ready=false;for(let attempt=0;attempt<30&&!ready;attempt+=1){ready=spawnSync("docker",["exec",id,"pg_isready","-h","127.0.0.1","-U","postgres","-d","postgres"],{encoding:"utf8"}).status===0;if(!ready)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,500);}
 if(!ready)throw new Error("Disposable PostgreSQL did not become ready");
 process.stdout.write(run(["exec","-i",id,"psql","-h","127.0.0.1","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose"],fixture+migration+beforeNoDispatchMigration+noDispatchMigration+fileLinkMigration+partialRecoveryMigration+registrationWithoutRecovery+completionWithoutDraftBinding+restoredRecoveryMigration+restoredRecoveryMigration+pdfCacheMigration+parentApprovalGateMigration+assertions.replace("__CANONICAL_FIXTURE__",canonicalFixture)));
}finally{run(["rm","-f",id]);}
