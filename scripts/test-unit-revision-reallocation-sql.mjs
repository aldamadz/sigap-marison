import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const migration = readFileSync("supabase/migrations/20260811170000_unit_revision_reallocation_guard.sql", "utf8");
const statusMigration = readFileSync("supabase/migrations/20260811173000_keep_open_checker_revision_in_revision_status.sql", "utf8");
const assertions = readFileSync("supabase/tests/unit_revision_reallocation.integration.sql", "utf8");

const fixture = `
create schema auth;
create extension if not exists pgcrypto;
create role anon; create role authenticated; create role service_role;
create function auth.uid() returns uuid language sql stable set search_path='' as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.profiles(id uuid primary key, role text not null, is_active boolean default true);
create table public.surat_registrasi(
 id uuid primary key, created_by uuid, no_surat text, judul_surat text, status text, current_step integer,
 form_input_data jsonb default '{}', data_snapshot jsonb default '{}', pdf_path text, updated_at timestamptz default now());
create table public.surat_signatures(
 id uuid primary key, surat_id uuid, user_id uuid, step_order integer, is_signed boolean default false,
 signed_at timestamptz, catatan text, file_path_snap text, pdf_path_snap text, status text,
 action_type text, requires_unit_allocation boolean default false, verification_required boolean default false,
 verification_status text default 'not_required', verified_at timestamptz, verified_by uuid,
 verification_note text, verifier_snapshot jsonb default '[]', available_at timestamptz);
create table public.surat_revision_events(
 id uuid primary key, surat_id uuid, signature_id uuid, actor_id uuid, target_type text,
 target_user_ids uuid[] default '{}', from_step integer, target_step integer, reason text,
 changes jsonb default '{}', status text, created_at timestamptz default now(), resolved_at timestamptz, resolved_by uuid);
create table public.document_pdf_jobs(id uuid primary key default gen_random_uuid(), surat_id uuid);
create table public.notifications(
 id uuid primary key default gen_random_uuid(), user_id uuid, type text, title text, message text,
 data jsonb default '{}', link text, created_at timestamptz default now());

create function public.accept_surat_process_revision(p_event_id uuid,p_note text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_event public.surat_revision_events%rowtype; v_approved text;
begin
 select * into v_event from public.surat_revision_events where id=p_event_id for update;
 if not found then raise exception 'Riwayat perbaikan tidak tersedia'; end if;
 v_approved := v_event.changes->'item_revisions'->0->>'nilai_disetujui';
 update public.surat_registrasi set status='PROSES',current_step=1,
   form_input_data=jsonb_set(form_input_data,'{requested_unit_count}',to_jsonb(v_approved),true),
   data_snapshot=(data_snapshot-'revision')||jsonb_build_object('applied_revision',jsonb_build_object('event_id',p_event_id));
 update public.surat_revision_events set status='resolved',resolved_at=now(),resolved_by=auth.uid() where id=p_event_id;
 update public.surat_signatures set is_signed=false,signed_at=null,status='PENDING',available_at=case when step_order=1 then now() end where surat_id=v_event.surat_id;
 insert into public.notifications(user_id,type,title,message,data,link)
 select user_id,'info','restart','restart',jsonb_build_object('revision_event_id',p_event_id,'event_type','revision_accepted'),'/surat/inbox'
 from public.surat_signatures where surat_id=v_event.surat_id and step_order=1;
 return true;
end$$;
create function public.resolve_surat_process_revision(p_event_id uuid,p_note text default null)
returns boolean language sql security definer set search_path=public as $$select true$$;
grant all on all tables in schema public to authenticated,service_role;
grant execute on all functions in schema public to authenticated,service_role;
`;

const run = (args, input = "") => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 120000 });
  if (result.status !== 0) throw new Error(`${result.stderr || ""}\n${result.stdout || ""}`.trim() || "Docker command failed");
  return result.stdout;
};

const id = run([
  "run", "-d", "-e", "POSTGRES_PASSWORD=test",
  "--health-cmd", "pg_isready -U postgres",
  "--health-interval", "1s", "--health-timeout", "5s", "--health-retries", "30",
  "postgres:17-alpine",
]).trim();
try {
  let ready = false;
  for (let attempt = 0; attempt < 40 && !ready; attempt += 1) {
    const health = spawnSync("docker", ["inspect", "--format", "{{.State.Health.Status}}", id], { encoding: "utf8" });
    ready = health.status === 0 && health.stdout.trim() === "healthy";
    if (!ready) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  process.stdout.write(run(["exec", "-i", "-e", "PGPASSWORD=test", id, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], fixture + migration + statusMigration + assertions));
} finally {
  run(["rm", "-f", id]);
}
