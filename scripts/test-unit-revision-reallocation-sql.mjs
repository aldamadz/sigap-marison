import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const migration = readFileSync("supabase/migrations/20260811170000_unit_revision_reallocation_guard.sql", "utf8");
const statusMigration = readFileSync("supabase/migrations/20260811173000_keep_open_checker_revision_in_revision_status.sql", "utf8");
const notificationMigration = readFileSync("supabase/migrations/20260811174500_notify_signed_users_on_checker_revision.sql", "utf8");
const assertions = readFileSync("supabase/tests/unit_revision_reallocation.integration.sql", "utf8");
const verifiedPresentation = process.argv.includes('--verified-presentation');
const authority = process.argv.includes('--authority') || verifiedPresentation;
const externalAddendum = process.argv.includes('--external-addendum') || authority;
const partial = process.argv.includes('--partial') || externalAddendum;

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

const run = (args, input = "", includeStderr = false) => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 120000 });
  if (result.status !== 0) throw new Error(`${result.stderr || ""}\n${result.stdout || ""}`.trim() || "Docker command failed");
  return result.stdout + (includeStderr ? result.stderr : '');
};

const id = run([
  "run", "-d", "--network", "none", "--read-only", "--cap-drop", "ALL", "--user", "70:70",
  "--security-opt", "no-new-privileges", "--pids-limit", "64", "--memory", "384m", "--cpus", "1",
  "--ulimit", "fsize=67108864:67108864",
  "--tmpfs", "/scratch:rw,size=268435456,uid=70,gid=70",
  "--tmpfs", "/var/run/postgresql:rw,size=1048576,uid=70,gid=70",
  "-e", "PGDATA=/scratch/data", "-e", "HOME=/scratch", "-e", "TMPDIR=/scratch",
  "-e", "POSTGRES_PASSWORD=test",
  "-e", "POSTGRES_USER=sigap_fixture_root", "-e", "POSTGRES_DB=postgres",
  "--health-cmd", "pg_isready -h 127.0.0.1 -U sigap_fixture_root -d postgres",
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
  run(['exec','-i',id,'psql','-U','sigap_fixture_root','-d','postgres','-v','ON_ERROR_STOP=1'],
    'create role postgres login superuser;');
  process.stdout.write(run(["exec", "-i", "-e", "PGPASSWORD=test", id, "psql", "-h", "127.0.0.1", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], fixture + migration + statusMigration + notificationMigration + assertions));
  if (partial) {
    const productionShape = process.argv.includes('--production-shape');
    const baseline = process.argv.includes('--baseline');
    const setup = `
      alter table public.profiles add column deleted_at timestamptz;
      alter table public.profiles add column full_name text;
      alter table public.surat_signatures add column input_schema_snapshot jsonb default '{}';
      alter table public.surat_signatures add column attachment_requirements_snapshot jsonb default '[]';
      create table public.surat_attachments(id uuid,surat_id uuid,signature_id uuid,stage text,requirement_key text);
      create function public.is_valid_checker_input_schema(jsonb) returns boolean language sql as $$select true$$;
      create function public.can_read_surat(p_id uuid) returns boolean language sql security definer set search_path='' as $$
        select exists(select 1 from public.surat_registrasi d where d.id=p_id and (d.created_by=auth.uid()
          or exists(select 1 from public.surat_signatures s where s.surat_id=d.id and
            (s.user_id=auth.uid() or s.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id',auth.uid()::text)))))) $$;
      grant usage on schema auth to authenticated;
      ${productionShape ? `
        drop function public.guard_unit_allocation_verification_count() cascade;
        drop function public.guard_surat_finalization_completeness() cascade;
        drop function public.accept_surat_process_revision(uuid,text);
        drop function public.accept_surat_process_revision_pre_unit_reallocation(uuid,text);
        drop function public.resolve_surat_process_revision(uuid,text);
        drop function public.resolve_surat_process_revision_pre_unit_reallocation(uuid,text);
        create function public.resolve_surat_process_revision(uuid,text) returns boolean language sql as $$select true$$;
      ` : ''}
      ${readFileSync('supabase/migrations/20260917131000_atomic_configured_checker_input.sql','utf8')}
      alter function public.verify_surat_signature_v2(uuid,text,jsonb) owner to postgres;
      alter role postgres nosuperuser;
      ${baseline ? '' : readFileSync('supabase/migrations/20261015130000_unit_partial_readiness_history.sql','utf8')}
      ${baseline ? '' : readFileSync('supabase/migrations/20261015130000_unit_partial_readiness_history.sql','utf8')}
      ${readFileSync('supabase/tests/unit_partial_readiness.integration.sql','utf8')}
    `;
    const output = run(['exec','-i',id,'psql','-U','sigap_fixture_root','-d','postgres','-v','ON_ERROR_STOP=1'],setup,true);
    if (!output.includes('Unit partial readiness: all assertions passed')) throw new Error('Partial Unit assertions did not finish');
    process.stdout.write(output);
    console.log(`Unit partial readiness shape: ${productionShape ? 'production without legacy guards' : 'staging legacy reallocation guards'}.`);
    if (externalAddendum) {
      const externalFixture = `
        create table public.external_submission_decision_events(
          id uuid primary key,event_id uuid,surat_id uuid,decision text,revision_generation integer);
        create table public.surat_external_revision_history(
          id uuid primary key,surat_id uuid,decision_event_id uuid,generation integer,
          document_snapshot jsonb,signatures_snapshot jsonb);
      `;
      const externalMigration = readFileSync('supabase/migrations/20261104160000_preserve_external_unit_addendum_review.sql','utf8');
      const externalAssertions = readFileSync('supabase/tests/unit_external_addendum_review.integration.sql','utf8');
      const externalOutput = run(['exec','-i',id,'psql','-U','sigap_fixture_root','-d','postgres','-v','ON_ERROR_STOP=1'],
        externalFixture+externalMigration+externalMigration+externalAssertions,true);
      if (!externalOutput.includes('External Unit addendum review: all assertions passed')) {
        throw new Error('External addendum assertions did not finish');
      }
      process.stdout.write(externalOutput);
      if (authority) {
        // Only the registration dependency is reduced; verification/history are real migrations.
        const registration = `create function public.create_surat_registrasi_core(p_payload jsonb,p_actor uuid)
          returns public.surat_registrasi language plpgsql security definer set search_path='' as $$
          declare v_actor uuid:=p_actor; row public.surat_registrasi;
          begin
  if v_actor is null then raise exception 'Unauthorized';end if;
          insert into public.surat_registrasi(id,created_by,status,current_step,form_input_data,data_snapshot)
          values((p_payload->>'id')::uuid,v_actor,'PROSES',1,p_payload->'form_input_data',p_payload->'data_snapshot') returning * into row;
          return row;end $$;
          alter function public.create_surat_registrasi_core(jsonb,uuid) owner to postgres;`;
        const fix=readFileSync('supabase/migrations/20261109171000_unit_allocation_authority.sql','utf8');
        const ownerGrant=process.argv.includes('--owner-baseline') ? '' :
          readFileSync('supabase/migrations/20261110100000_unit_allocation_authority_owner_grant.sql','utf8');
        const proof=run(['exec','-i',id,'psql','-U','sigap_fixture_root','-d','postgres','-v','ON_ERROR_STOP=1'],
          registration+fix+fix+ownerGrant+ownerGrant+readFileSync('supabase/tests/unit_allocation_authority.integration.sql','utf8'),true);
        if(!proof.includes('Unit allocation authority assertions passed'))throw new Error('Missing Unit authority proof');
        console.log('Unit allocation authority assertions passed (real verification RPC, immutable history, initial injection and post-completion tampering).');
        if (verifiedPresentation) {
          const presentation = process.argv.includes('--presentation-baseline') ? '' :
            readFileSync('supabase/migrations/20261111090000_verified_unit_presentation.sql', 'utf8');
          const ownerBefore = 'create temporary table presentation_authority_before as select proowner,proacl from pg_proc where oid=\'public.get_verified_unit_allocation(uuid)\'::regprocedure;';
          const result = run(['exec','-i',id,'psql','-U','sigap_fixture_root','-d','postgres','-v','ON_ERROR_STOP=1'],
            ownerBefore + presentation + presentation + readFileSync('supabase/tests/verified_unit_presentation.integration.sql','utf8'), true);
          if (!result.includes('Verified Unit presentation assertions passed')) throw new Error('Missing verified Unit presentation proof');
          process.stdout.write(result);
        }
      }
    }
  }
} finally {
  run(["rm", "-f", id]);
}
