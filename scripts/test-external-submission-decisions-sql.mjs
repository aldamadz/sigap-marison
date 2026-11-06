import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const migration = readFileSync("supabase/migrations/20260818170000_external_submission_decisions.sql", "utf8");
const receiptMigration = readFileSync("supabase/migrations/20261106090000_external_submission_decision_receipts.sql", "utf8");
const receiptTests = readFileSync("supabase/tests/external_submission_decision_receipts.integration.sql", "utf8");
const canonicalOwnerFixture = String.raw`
create role canonical_writer;
grant service_role to canonical_writer;
grant usage on schema public,auth,extensions to canonical_writer;
grant all on all tables in schema public to canonical_writer;
grant usage,select on all sequences in schema public to canonical_writer;
alter table public.external_submission_decision_events owner to canonical_writer;
alter table public.surat_external_revision_history owner to canonical_writer;
alter function public.apply_external_submission_decision(uuid,text,text,text,timestamptz,text,text) owner to canonical_writer;
`;

const schema = String.raw`
create schema auth;
create schema extensions;
create extension pgcrypto with schema extensions;
create role anon;
create role authenticated;
create role service_role;
create function auth.uid() returns uuid language sql stable set search_path='' as
$$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table auth.users(id uuid primary key);
create table public.profiles(id uuid primary key references auth.users(id),is_active boolean default true);
create table public.surat_registrasi(
 id uuid primary key,created_by uuid references public.profiles(id),no_surat text,judul_surat text,status text,current_step integer,
 entity_id uuid,office_id uuid,project_id uuid,dept_id uuid,letter_type_id uuid,penggunaan_id uuid,form_usage_id uuid,
 request_place text,request_date date,form_input_data jsonb default '{}',data_snapshot jsonb default '{}',pdf_path text,updated_at timestamptz default now()
);
create table public.surat_signatures(
 id uuid primary key,surat_id uuid references public.surat_registrasi(id),user_id uuid references public.profiles(id),step_order integer,
 role_name text,label_jabatan text,form_usage_step_id uuid,action_type text,requires_unit_allocation boolean default false,
 verification_required boolean default false,verification_status text default 'not_required',verifier_snapshot jsonb default '[]',
 attachment_requirements_snapshot jsonb default '[]',is_signed boolean default false,signed_at timestamptz,catatan text,
 file_path_snap text,pdf_path_snap text,status text default 'PENDING',available_at timestamptz
);
create table public.surat_attachments(
 id uuid primary key default gen_random_uuid(),surat_id uuid references public.surat_registrasi(id),file_url text,file_name text,file_type text,
 file_size bigint,requirement_key text,requirement_label text,stage text,created_at timestamptz default now()
);
create table public.notifications(id bigint generated always as identity primary key,user_id uuid,type text,title text,message text,data jsonb,link text);
create table public.surat_revision_events(
 id uuid primary key default gen_random_uuid(),surat_id uuid references public.surat_registrasi(id),signature_id uuid,actor_id uuid references public.profiles(id),
 target_type text,target_user_ids uuid[] default '{}',from_step integer,target_step integer,reason text,changes jsonb default '{}',
 status text default 'open',resolved_at timestamptz,resolved_by uuid references public.profiles(id),created_at timestamptz default now()
);
create table public.surat_reservations(id uuid primary key);
create table public.surat_registration_drafts(
 id uuid primary key default gen_random_uuid(),reservation_id uuid not null unique references public.surat_reservations(id),created_by uuid references auth.users(id),
 no_surat text,status text default 'DRAFT',payload jsonb default '{}',signer_assignments jsonb default '[]',current_section text default 'details',
 expires_at timestamptz default now()+interval '7 days',submitted_at timestamptz,voided_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now()
);
create table public.surat_registration_draft_files(
 id uuid primary key default gen_random_uuid(),draft_id uuid references public.surat_registration_drafts(id),created_by uuid references auth.users(id),
 file_url text,file_name text,file_type text,file_size bigint,requirement_key text,requirement_label text,created_at timestamptz default now()
);
create table public.surat_linked_documents(id uuid primary key default gen_random_uuid(),parent_surat_id uuid,child_surat_id uuid,link_type text,status text);
create table public.surat_recommendation_tasks(
 id uuid primary key default gen_random_uuid(),parent_surat_id uuid,claimed_by uuid,status text,candidate_snapshot jsonb default '[]'
);
create table public.document_pdf_jobs(id uuid primary key default gen_random_uuid(),surat_id uuid,status text);
create type public.marison_outbound_dispatch_status as enum('pending','processing','failed_retryable','failed_terminal','outcome_unknown','succeeded','skipped');
create table public.marison_outbound_dispatches(
 id uuid primary key default gen_random_uuid(),surat_id uuid,environment text,generation integer,kind text,endpoint text,idempotency_key text unique,
 status public.marison_outbound_dispatch_status,replacement_of_dispatch_id uuid references public.marison_outbound_dispatches(id),post_started_at timestamptz,
 response jsonb,external_reference text,payload jsonb,payload_body text,payload_hash text,payload_built_at timestamptz,
 created_at timestamptz default now(),unique(surat_id,environment,generation)
);
create function public.marison_procurement_routing_block(p_id uuid) returns text language sql stable as
$$select case when form_input_data->>'test_form'='KEU' then 'finance_not_connected' end from public.surat_registrasi where id=p_id$$;
create function public.recommendation_all_items_rejected(uuid) returns boolean language sql stable as $$select false$$;
create function public.accept_surat_process_revision(p_event_id uuid,p_note text default null) returns boolean language plpgsql security definer as $$
begin
 update public.surat_revision_events set status='resolved',resolved_at=clock_timestamp(),resolved_by=auth.uid() where id=p_event_id;
 update public.surat_signatures set is_signed=false,signed_at=null,status='PENDING',available_at=case when step_order=1 then clock_timestamp() end where surat_id=(select surat_id from public.surat_revision_events where id=p_event_id);
 update public.surat_registrasi set status='PROSES',current_step=1 where id=(select surat_id from public.surat_revision_events where id=p_event_id);
 return true;
end$$;
${migration}
`;

const tests = String.raw`
begin;
insert into auth.users values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into public.profiles values('10000000-0000-4000-8000-000000000001',true),('10000000-0000-4000-8000-000000000002',true);
insert into public.surat_registrasi(id,created_by,no_surat,judul_surat,status,current_step,entity_id,office_id,project_id,dept_id,letter_type_id,form_usage_id,request_place,request_date,form_input_data,data_snapshot)
values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','UNIT-EXT-001','Unit revisi','DONE',2,
 '30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000006','Magelang','2026-08-18',
 '{"request_category":"unit","request_mode":"unit","requested_unit_count":3,"requested_project":{"id":"13","code":"PRJ-13"},"allocated_units":[{"id":1},{"id":2},{"id":3}]}'::jsonb,
 '{"input":{"requested_unit_count":3},"policy_snapshot":{"form_id":"30000000-0000-4000-8000-000000000007"}}'::jsonb);
insert into public.surat_signatures(id,surat_id,user_id,step_order,role_name,label_jabatan,is_signed,status)
values('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,'membuat','Pemohon',true,'APPROVED'),
('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',2,'menyetujui','Manager',true,'APPROVED');
insert into public.marison_outbound_dispatches(id,surat_id,environment,generation,kind,endpoint,idempotency_key,status,post_started_at,response,external_reference)
values('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','staging',1,'unit','/unit-submissions','sigap:staging:unit:test','succeeded',now(),'{"ok":true}','EXT-1');

do $$declare result jsonb; event_id uuid; draft public.surat_registration_drafts;begin
 result:=public.apply_external_submission_decision('60000000-0000-4000-8000-000000000001','UNIT-EXT-001','revision_required','Jumlah unit harus dikurangi.',now(),'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','staging');
 if result->>'status'<>'MENUNGGU_PERBAIKAN' then raise exception 'revision status invalid';end if;
 if (select count(*) from public.surat_external_revision_history)<>1 then raise exception 'history not captured';end if;
 result:=public.apply_external_submission_decision('60000000-0000-4000-8000-000000000001','UNIT-EXT-001','revision_required','Jumlah unit harus dikurangi.',now(),'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','staging');
 if result->>'idempotent'<>'true' or (select count(*) from public.external_submission_decision_events)<>1 then raise exception 'replay not idempotent';end if;
 begin perform public.apply_external_submission_decision('60000000-0000-4000-8000-000000000001','UNIT-EXT-001','revision_required','Alasan keputusan berbeda.',now(),'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','staging');raise exception 'conflict accepted';exception when sqlstate '55000' then null;end;
 select (data_snapshot#>>'{revision,event_id}')::uuid into event_id from public.surat_registrasi where no_surat='UNIT-EXT-001';
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
 draft:=public.create_external_submission_revision_draft(event_id);
 if draft.reservation_id is not null or draft.no_surat<>'UNIT-EXT-001' then raise exception 'revision draft invalid';end if;
 result:=public.submit_external_submission_revision(event_id,draft.id,
   jsonb_build_object('entity_id','30000000-0000-4000-8000-000000000001','office_id','30000000-0000-4000-8000-000000000002','project_id','30000000-0000-4000-8000-000000000003','dept_id','30000000-0000-4000-8000-000000000004','letter_type_id','30000000-0000-4000-8000-000000000005','form_usage_id','30000000-0000-4000-8000-000000000006','form_input_data',jsonb_build_object('request_category','unit','request_mode','unit','requested_unit_count',2,'requested_project',jsonb_build_object('id','13','code','PRJ-13'))),
   'Disesuaikan menjadi dua unit');
 if (select form_input_data->>'requested_unit_count' from public.surat_registrasi where no_surat='UNIT-EXT-001')<>'2' then raise exception 'unit count not updated';end if;
 if (select project_id::text from public.surat_registrasi where no_surat='UNIT-EXT-001')<>'30000000-0000-4000-8000-000000000003' then raise exception 'identity changed';end if;
end$$;

insert into public.surat_registrasi(id,created_by,no_surat,judul_surat,status,current_step,form_input_data)
values('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','ASSET-EXT-002','Aset ditolak','DONE',2,'{"request_category":"asset"}');
insert into public.marison_outbound_dispatches(surat_id,environment,generation,kind,endpoint,idempotency_key,status,post_started_at,response)
values('20000000-0000-4000-8000-000000000002','staging',1,'asset','/asset-purchase-requests','sigap:staging:asset:test','succeeded',now(),'{}');
select public.apply_external_submission_decision('60000000-0000-4000-8000-000000000002','ASSET-EXT-002','rejected','Pengajuan tidak sesuai kebijakan.',now(),'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','staging');
do $$begin
 if not exists(select 1 from public.surat_registrasi where no_surat='ASSET-EXT-002' and status='REJECTED' and data_snapshot#>>'{external_decision,terminal}'='true') then raise exception 'terminal rejection invalid';end if;
end$$;
rollback;
select 'ALL EXTERNAL SUBMISSION DECISION SQL TESTS PASSED' result;
`;

const run = (args, input = "") => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 180_000 });
  if (result.status !== 0) throw new Error(`${result.stderr || ""}\n${result.stdout || ""}`.trim());
  return result.stdout;
};

const runAsync = (args, input) => new Promise((resolve, reject) => {
  const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  const timer = setTimeout(() => { child.kill(); reject(new Error("Concurrent callback timed out")); }, 30_000);
  child.stdout.on("data", value => { stdout += value; });
  child.stderr.on("data", value => { stderr += value; });
  child.on("error", error => { clearTimeout(timer); reject(error); });
  child.on("close", code => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error(stderr)); });
  child.stdin.end(input);
});

const containerId = run(["run", "-d", "-e", "POSTGRES_PASSWORD=test", "postgres:17-alpine"]).trim();
try {
  let ready = false;
  for (let attempt = 0; attempt < 40 && !ready; attempt += 1) {
    ready = spawnSync("docker", ["exec", containerId, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], { encoding: "utf8" }).status === 0;
    if (!ready) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready");
  process.stdout.write(run(["exec", "-i", containerId, "psql", "-h", "127.0.0.1", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], `${schema}\n${canonicalOwnerFixture}\n${tests}\n${receiptMigration}\n${receiptMigration}\n${receiptTests}`));
  const sqlArgs = ["exec", "-i", containerId, "psql", "-X", "-qAt", "-h", "127.0.0.1", "-U", "postgres", "-v", "ON_ERROR_STOP=1"];
  run(sqlArgs, `
    insert into auth.users values('70000000-0000-4000-8000-000000000001');
    insert into public.profiles values('70000000-0000-4000-8000-000000000001',true);
    insert into public.surat_registrasi(id,created_by,no_surat,status,current_step,updated_at)
    values('70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001','FUND-CONCURRENT','DONE',1,now()-interval '2 days');
    insert into public.surat_signatures(id,surat_id,user_id,step_order,is_signed,signed_at,status)
    values(gen_random_uuid(),'70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001',1,true,now()-interval '2 days','APPROVED');
    insert into public.marison_outbound_dispatches(surat_id,environment,generation,kind,endpoint,idempotency_key,status,post_started_at,payload_built_at,payload,payload_body,payload_hash)
    values('70000000-0000-4000-8000-000000000002','staging',1,'fund','/fund-submissions','concurrent-fund','failed_terminal',now()-interval '23 hours',now()-interval '1 day',
      '{"submission_number":"FUND-CONCURRENT"}','{"submission_number":"FUND-CONCURRENT"}',
      encode(extensions.digest('{"submission_number":"FUND-CONCURRENT"}','sha256'),'hex'));
  `);
  const callback = `begin; select public.apply_external_submission_decision(
    '70000000-0000-4000-8000-000000000003','FUND-CONCURRENT','rejected','Synthetic concurrent decision',now(),repeat('f',64),'staging');
    select pg_sleep(0.2); commit;`;
  const results = await Promise.all([runAsync(sqlArgs, callback), runAsync(sqlArgs, callback)]);
  const decisions = results.map(output => JSON.parse(output.split("\n").find(line => line.startsWith("{"))));
  assert.equal(decisions.filter(value => value.idempotent === false).length, 1);
  assert.equal(decisions.filter(value => value.idempotent === true).length, 1);
  assert.equal(run(sqlArgs, "select count(*) from public.external_submission_decision_receipts;").trim(), "1");
  process.stdout.write("Concurrent external callbacks: two connections, one decision and one immutable receipt.\n");
} finally {
  run(["rm", "-f", containerId]);
}
