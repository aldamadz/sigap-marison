import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const migration = readFileSync(
  "supabase/migrations/20260824100000_configurable_external_revision_and_proactive_pdf.sql",
  "utf8",
);

const schema = String.raw`
create extension if not exists pgcrypto;
create schema auth;
create role anon;
create role authenticated;
create role service_role;
create function auth.uid() returns uuid language sql stable set search_path='' as
$$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;

create table public.profiles(id uuid primary key, is_active boolean default true, role text default 'user');
create table public.form_usages(id uuid primary key default gen_random_uuid(), updated_at timestamptz default now());
create function public.is_current_user_admin() returns boolean language sql stable as $$select true$$;
create function public.save_form_usage_config(uuid,jsonb,uuid[],jsonb,jsonb,jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid := coalesce($1, gen_random_uuid());
begin
  insert into public.form_usages(id) values(v_id) on conflict(id) do nothing;
  return v_id;
end$$;

create table public.surat_registrasi(
  id uuid primary key, created_by uuid references public.profiles(id), no_surat text, status text,
  current_step integer, form_usage_id uuid references public.form_usages(id), policy_snapshot jsonb default '{}',
  data_snapshot jsonb default '{}', form_input_data jsonb default '{}', file_path text, pdf_path text,
  updated_at timestamptz default now()
);
create table public.surat_signatures(
  id uuid primary key, surat_id uuid references public.surat_registrasi(id), user_id uuid references public.profiles(id),
  step_order integer, is_signed boolean default false, signed_at timestamptz, catatan text, file_path_snap text,
  pdf_path_snap text, status text default 'PENDING', available_at timestamptz
);
create table public.surat_revision_events(
  id uuid primary key default gen_random_uuid(), surat_id uuid references public.surat_registrasi(id), actor_id uuid,
  target_type text, target_user_ids uuid[] default '{}', from_step integer, target_step integer, reason text,
  changes jsonb default '{}', status text default 'open', resolved_at timestamptz, resolved_by uuid,
  created_at timestamptz default now()
);
create table public.external_submission_decision_events(
  id uuid primary key default gen_random_uuid(), event_id uuid unique, surat_id uuid, payload_hash text
);
create table public.surat_external_revision_history(
  id uuid primary key default gen_random_uuid(), surat_id uuid, generation integer,
  signatures_snapshot jsonb default '[]'
);
create table public.notifications(
  id bigint generated always as identity primary key, user_id uuid, type text, title text,
  message text, data jsonb default '{}', link text
);
create table public.surat_linked_documents(
  id uuid primary key default gen_random_uuid(), parent_surat_id uuid, child_surat_id uuid,
  link_type text, status text
);
create table public.document_pdf_jobs(
  id uuid primary key default gen_random_uuid(), surat_id uuid references public.surat_registrasi(id),
  signature_id uuid, source_file_path text, status text default 'queued', requested_by uuid,
  refresh boolean default false
);

create function public.apply_external_submission_decision(uuid,text,text,text,timestamptz,text,text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_surat public.surat_registrasi%rowtype; v_event_id uuid; v_existing text;
begin
  select payload_hash into v_existing from public.external_submission_decision_events where event_id=$1;
  if found then return jsonb_build_object('success',true,'idempotent',v_existing=$6); end if;
  select * into v_surat from public.surat_registrasi where no_surat=$2 for update;
  insert into public.external_submission_decision_events(event_id,surat_id,payload_hash) values($1,v_surat.id,$6);
  insert into public.surat_revision_events(surat_id,target_type,target_user_ids,from_step,target_step,reason,changes)
  values(v_surat.id,'requester',array[v_surat.created_by],v_surat.current_step,1,$4,
    jsonb_build_object('external_submission_revision',true,'external_event_id',$1,'revision_generation',1))
  returning id into v_event_id;
  update public.surat_registrasi set status='MENUNGGU_PERBAIKAN', data_snapshot=jsonb_build_object(
    'revision',jsonb_build_object('event_id',v_event_id,'target_type','requester','target_user_ids',array[v_surat.created_by],
      'target_step',1,'changes',jsonb_build_object('external_submission_revision',true,'external_event_id',$1)))
  where id=v_surat.id;
  insert into public.notifications(user_id,type,title,message,data,link)
  select user_id,'warning','Perlu diperbaiki','Perbaiki',jsonb_build_object('event_id',$1),'/surat/tindak-lanjut'
  from (select v_surat.created_by user_id union select user_id from public.surat_signatures where surat_id=v_surat.id) related;
  return jsonb_build_object('success',true,'idempotent',false,'revision_event_id',v_event_id);
end$$;

create function public.accept_surat_process_revision(uuid,text default null)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.surat_revision_events set status='resolved' where id=$1;
  update public.surat_signatures set is_signed=false,signed_at=null,status='PENDING',available_at=case when step_order=1 then now() end
    where surat_id=(select surat_id from public.surat_revision_events where id=$1);
  update public.surat_registrasi set status='PROSES',current_step=1 where id=(select surat_id from public.surat_revision_events where id=$1);
  return true;
end$$;
create function public.resolve_surat_process_revision(uuid,text default null)
returns boolean language sql security definer set search_path='' as $$select true$$;

${migration}
`;

const tests = String.raw`
begin;
insert into public.profiles(id,is_active,role) values
 ('10000000-0000-4000-8000-000000000001',true,'user'),
 ('10000000-0000-4000-8000-000000000002',true,'user'),
 ('10000000-0000-4000-8000-000000000003',true,'user');

select public.save_form_usage_config(
 '20000000-0000-4000-8000-000000000001',
 '{"external_revision_policy":{"recipient_type":"signer","recipient_step_order":2,"approval_restart_step":2}}',
 '{}',
 '[{"step_order":1},{"step_order":2},{"step_order":3}]',
 '[]','[]'
);
do $$begin
  assert (select external_revision_policy->>'recipient_type'='signer' from public.form_usages where id='20000000-0000-4000-8000-000000000001'), 'policy was not persisted';
  begin
    perform public.save_form_usage_config(null,'{"external_revision_policy":{"recipient_type":"signer","recipient_step_order":4,"approval_restart_step":2}}','{}','[{"step_order":1},{"step_order":2}]','[]','[]');
    raise exception 'invalid signer step accepted';
  exception when sqlstate '22023' then null;
  end;
end$$;

insert into public.surat_registrasi(id,created_by,no_surat,status,current_step,form_usage_id,policy_snapshot,form_input_data,file_path)
values(
 '30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','EXT-REV-001','DONE',3,
 '20000000-0000-4000-8000-000000000001',
 '{"external_revision_policy":{"recipient_type":"signer","recipient_step_order":2,"approval_restart_step":2}}',
 '{}','native://document/30000000-0000-4000-8000-000000000001'
);
insert into public.surat_signatures(id,surat_id,user_id,step_order,is_signed,status,file_path_snap) values
 ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,true,'APPROVED','native://document/30000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',2,true,'APPROVED','native://document/30000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003',3,true,'APPROVED','native://document/30000000-0000-4000-8000-000000000001');
do $$begin
  assert (select count(*)=1 from public.document_pdf_jobs where surat_id='30000000-0000-4000-8000-000000000001' and signature_id is null), 'registration PDF was not queued';
end$$;

do $$declare result jsonb; revision_id uuid;begin
  result:=public.apply_external_submission_decision(
    '50000000-0000-4000-8000-000000000001','EXT-REV-001','revision_required','Perbaiki data.',now(),
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','staging');
  revision_id:=(result->>'revision_event_id')::uuid;
  assert (select target_type='signer' and target_step=2 and target_user_ids=array['10000000-0000-4000-8000-000000000002'::uuid]
    and changes->>'restart_step'='2' from public.surat_revision_events where id=revision_id), 'configured signer routing failed';
  assert result->>'approval_restart_step'='2', 'restart step missing from response';

  result:=public.apply_external_submission_decision(
    '50000000-0000-4000-8000-000000000001','EXT-REV-001','revision_required','Perbaiki data.',now(),
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','staging');
  assert result->>'idempotent'='true', 'idempotent replay failed';

  perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
  perform public.resolve_surat_process_revision(revision_id,'Sudah diperbaiki');
  assert (select status='PROSES' and current_step=2 from public.surat_registrasi where id='30000000-0000-4000-8000-000000000001'), 'approval did not restart at configured step';
  assert (select is_signed from public.surat_signatures where id='40000000-0000-4000-8000-000000000001'), 'earlier approval was not preserved';
  assert (select not is_signed and available_at is not null from public.surat_signatures where id='40000000-0000-4000-8000-000000000002'), 'configured restart signer not reopened';
end$$;

do $$begin
  update public.surat_signatures set is_signed=false where id='40000000-0000-4000-8000-000000000002';
  update public.surat_signatures
  set is_signed=true, file_path_snap='native://document/30000000-0000-4000-8000-000000000001'
  where id='40000000-0000-4000-8000-000000000002';
  assert (select count(*)=1 from public.document_pdf_jobs where signature_id='40000000-0000-4000-8000-000000000002'), 'signed PDF was not queued';

  insert into public.surat_registrasi(id,created_by,no_surat,status,current_step,form_input_data,file_path)
  values('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','REC-001','PROSES',1,
    '{"linked_parent_surat_id":"30000000-0000-4000-8000-000000000001"}','native://document/30000000-0000-4000-8000-000000000002');
  assert (select count(*)=0 from public.document_pdf_jobs where surat_id='30000000-0000-4000-8000-000000000002'), 'recommendation incorrectly entered generic PDF queue';
end$$;
rollback;
select 'ALL CONFIGURED REVISION AND PROACTIVE PDF SQL TESTS PASSED' result;
`;

const run = (args, input = "") => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 180_000 });
  if (result.status !== 0) throw new Error(`${result.stderr || ""}\n${result.stdout || ""}`.trim());
  return result.stdout;
};

const containerId = run(["run", "-d", "-e", "POSTGRES_PASSWORD=test", "postgres:17-alpine"]).trim();
try {
  let ready = false;
  for (let attempt = 0; attempt < 40 && !ready; attempt += 1) {
    ready = spawnSync("docker", ["exec", containerId, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], { encoding: "utf8" }).status === 0;
    if (!ready) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready");
  process.stdout.write(run(["exec", "-i", containerId, "psql", "-h", "127.0.0.1", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], `${schema}\n${tests}`));
} finally {
  run(["rm", "-f", containerId]);
}
