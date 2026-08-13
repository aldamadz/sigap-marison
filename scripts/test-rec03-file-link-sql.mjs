import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const blockers = readFileSync("supabase/migrations/20260811140000_rec03_file_link_blockers.sql", "utf8");
const readiness = readFileSync("supabase/migrations/20260813163000_fix_recommendation_pdf_readiness.sql", "utf8");
const acceptance = readFileSync("supabase/tests/recommendation_file_link.integration.sql", "utf8");
const fixture = `
create schema extensions;
create extension pgcrypto with schema extensions;
create schema auth;
create role anon;create role authenticated;create role service_role;
create function auth.role() returns text language sql stable set search_path='' as $$select current_user::text$$;
create table public.profiles(id uuid primary key,role text,is_active boolean,deleted_at timestamptz);
create table public.surat_registrasi(id uuid primary key,created_by uuid,no_surat text,judul_surat text,status text,file_path text,pdf_path text,form_input_data jsonb default '{}',data_snapshot jsonb default '{}',updated_at timestamptz default now());
create table public.surat_linked_documents(id uuid primary key default gen_random_uuid(),parent_surat_id uuid,child_surat_id uuid,link_type text,status text,updated_at timestamptz default now());
create table public.surat_attachments(id uuid primary key default gen_random_uuid(),surat_id uuid,file_url text,file_size bigint,file_type text);
create table public.document_pdf_jobs(id uuid primary key default gen_random_uuid(),surat_id uuid,signature_id uuid,source_file_path text,status text default 'queued',pdf_url text,recommendation_content_fingerprint text,render_payload jsonb,lease_token uuid,lease_expires_at timestamptz,error_message text,updated_at timestamptz,finished_at timestamptz,requested_by uuid,refresh boolean default false,created_at timestamptz default now());
create type public.marison_outbound_dispatch_status as enum('pending','processing','succeeded','failed_retryable','failed_terminal','outcome_unknown','skipped');
create table public.marison_outbound_dispatches(id uuid primary key,surat_id uuid,environment text,kind text,endpoint text,idempotency_key text,status public.marison_outbound_dispatch_status,lease_token uuid,lease_acquired_at timestamptz,lease_expires_at timestamptz,post_started_at timestamptz,response jsonb,external_reference text,completed_at timestamptz,skipped_code text,skipped_reason text,updated_at timestamptz default now());
create table public.file_view_tokens(id uuid primary key default gen_random_uuid(),token_hash text not null unique,bucket text not null,object_path text not null,storage_origin text not null,requested_by uuid,surat_id uuid,purpose text not null,expires_at timestamptz,consumed_at timestamptz,created_at timestamptz default now(),revoked_at timestamptz,revoked_by uuid,revoke_reason text,last_accessed_at timestamptz);
create table public.file_view_token_audit(id bigint generated always as identity primary key,token_id uuid not null,token_hash text not null,surat_id uuid,purpose text not null,action text not null,actor_id uuid,reason text,created_at timestamptz default now());
create function public.publish_document_pdf_job(uuid,text,text,text,uuid) returns public.document_pdf_jobs language sql as $$select null::public.document_pdf_jobs$$;
create function public.recommendation_pdf_render_payload(p_surat_id uuid,p_source_file_path text) returns jsonb language sql stable as $$
 select jsonb_build_object('workbook_source',jsonb_build_object('bucket','dokumen_surat','path',p_source_file_path),'parent_workbook_source',jsonb_build_object('bucket','dokumen_surat','path',p.file_path),'child_input',c.form_input_data,'parent_input',p.form_input_data)
 from public.surat_registrasi c join public.surat_linked_documents l on l.child_surat_id=c.id and l.link_type='recommendation' and l.status='active' join public.surat_registrasi p on p.id=l.parent_surat_id where c.id=p_surat_id and c.file_path=p_source_file_path
$$;
create function public.recommendation_content_fingerprint(p_payload jsonb) returns text language sql immutable as $$select encode(extensions.digest(p_payload::text,'sha256'),'hex')$$;
create function public.recommendation_pdf_is_current(uuid) returns boolean language sql stable as $$select false$$;
create function public.recommendation_all_items_rejected(uuid) returns boolean language sql stable as $$select false$$;
create function public.consume_file_view_token(text) returns table(token_id uuid,surat_id uuid,bucket text,object_path text,storage_origin text) language sql as $$select null::uuid,null::uuid,null::text,null::text,null::text where false$$;
grant all on all tables in schema public to service_role;
`;
const run = (args, input = "") => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 120000 });
  if (result.status !== 0) throw new Error(`${result.stderr || ""}\n${result.stdout || ""}`.trim() || "Docker command failed");
  return result.stdout;
};
const id = run(["run", "-d", "-e", "POSTGRES_PASSWORD=test", "postgres:17-alpine"]).trim();
try {
  let ready = false;
  for (let attempt = 0; attempt < 30 && !ready; attempt += 1) {
    ready = spawnSync("docker", ["exec", id, "pg_isready", "-U", "postgres"], { encoding: "utf8" }).status === 0;
    if (!ready) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready");
  process.stdout.write(run(["exec", "-i", id, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"], fixture + blockers + readiness + acceptance));
} finally {
  run(["rm", "-f", id]);
}
