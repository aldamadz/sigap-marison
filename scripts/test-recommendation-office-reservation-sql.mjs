import { readFileSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';

const read = (path) => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
const factory = read(process.argv.includes('--production-shape')
  ? 'supabase/migrations/20260721183000_fix_recommendation_reservation_actor.sql'
  : 'supabase/migrations/20260812135500_fix_recommendation_internal_number_reservation.sql');
const delegation = read('supabase/migrations/20261012140000_delegated_issuing_office.sql');
const triggerSource = read('supabase/migrations/20260626190000_recommendation_tasks_shared_lock.sql');
const migration = read('supabase/migrations/20261016090000_recommendation_internal_office_reservation.sql');
const activeActorMigration = read('supabase/migrations/20261016091000_recommendation_internal_active_actor.sql');
const revisionUpdate = process.argv.includes('--revision-update');
function routine(source, name) {
  const start = source.indexOf(`create or replace function public.${name}(`);
  const end = source.indexOf('$$;', start);
  if (start < 0 || end < start) throw new Error(`Missing canonical routine: ${name}`);
  return source.slice(start, end + 3);
}
const fixture = `
create role postgres nologin nosuperuser;
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth to postgres,authenticated,anon,service_role;
create function public.test_id(n integer) returns uuid language sql immutable as $$select lpad(n::text,32,'0')::uuid$$;
create table public.master_offices(id uuid primary key,name text,code text,kedudukan text);
create table public.profiles(id uuid primary key,full_name text,job_title text,office_id uuid,department_id uuid,role text,is_active boolean default true,deleted_at timestamptz);
create table public.user_access_grants(user_id uuid,permission_key text,office_id uuid);
create table public.master_entities(id uuid primary key,code text);
create table public.master_departments(id uuid primary key,code text);
create table public.master_dept_letter_types(dept_id uuid,letter_type_id uuid,sort_index integer);
create table public.form_usage_steps(id uuid primary key,usage_id uuid,step_order integer);
create table public.form_usage_step_users(usage_step_id uuid,user_id uuid);
create table public.letter_number_counter_configs(scope_type text,is_active boolean,entity_id uuid,dept_id uuid,project_id uuid,year integer,start_from integer);
create table public.surat_registrasi(id uuid primary key default gen_random_uuid(),office_id uuid,created_by uuid default auth.uid(),represented_by_admin uuid,form_input_data jsonb default '{}',policy_snapshot jsonb default '{}');
create table public.surat_reservations(id uuid primary key default gen_random_uuid(),entity_id uuid,type_id uuid,office_id uuid,project_id uuid,dept_id uuid,year integer,no_urut integer,status text,reserved_by uuid,created_at timestamptz,expires_at timestamptz,
 unique nulls not distinct(entity_id,dept_id,project_id,year,no_urut));
create table public.surat_recommendation_tasks(id uuid primary key default gen_random_uuid(),parent_surat_id uuid,reservation_id uuid,no_surat text,no_urut integer,entity_id uuid,office_id uuid,department_id uuid,letter_type_id uuid,form_id uuid,usage_id uuid,required_before_step integer,candidate_snapshot jsonb,created_by uuid,status text default 'pending');
create function public.is_current_user_admin() returns boolean language sql security definer as $$select exists(select 1 from public.profiles where id=auth.uid() and role='admin')$$;
${routine(delegation, 'can_issue_for_office')}
${routine(delegation, 'guard_delegated_issuing_office')}
${factory}
${routine(triggerSource, 'maybe_create_recommendation_task_for_parent')}
create trigger recommendation_task after insert on public.surat_registrasi for each row execute function public.maybe_create_recommendation_task_for_parent();
create trigger guard_delegated_issuing_office before insert or update of office_id on public.surat_reservations for each row execute function public.guard_delegated_issuing_office();
create trigger guard_delegated_issuing_office before insert or update of office_id on public.surat_registrasi for each row execute function public.guard_delegated_issuing_office();
alter function public.create_recommendation_task_for_parent(uuid) owner to postgres;
alter function public.guard_delegated_issuing_office() owner to postgres;
alter function public.can_issue_for_office(uuid) owner to postgres;
alter function public.maybe_create_recommendation_task_for_parent() owner to postgres;
grant all on all tables in schema public to postgres;
grant select,insert,update on public.surat_registrasi,public.surat_reservations to authenticated;
grant select on public.surat_recommendation_tasks to authenticated;
insert into public.master_offices values(test_id(1),'Pusat','00','Pusat'),(test_id(2),'KCP Pati','PTI','KCP'),(test_id(3),'KC Jepara','06','KC'),(test_id(4),'Other KC','99','KC');
insert into public.profiles(id,full_name,job_title,office_id,role) values
 (test_id(10),'Requester','Staff',test_id(2),'user'),(test_id(11),'Other requester','Staff',test_id(3),'user'),(test_id(12),'IT checker','Staff IT',test_id(1),'user');
insert into public.master_entities values(test_id(20),'UAI');
insert into public.master_departments values(test_id(21),'PBO');
insert into public.master_dept_letter_types values(test_id(21),test_id(22),1);
insert into public.form_usage_steps values(test_id(23),test_id(24),1);
insert into public.form_usage_step_users values(test_id(23),test_id(12));
create function public.test_config() returns jsonb language sql as $$select jsonb_build_object('recommendation_config',jsonb_build_object('form_id',test_id(25),'usage_id',test_id(24),'department_id',test_id(21),'letter_type_id',test_id(22),'entity_id',test_id(20)))$$;
create function public.test_assert(ok boolean,message text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Assertion failed: %',message;end if;end$$;
create function public.test_denied(statement text) returns void language plpgsql as $$begin
 begin execute statement; exception when insufficient_privilege then return;end;
 raise exception 'Expected permission denial: %',statement;end$$;
`;

const assertions = `
begin;
select set_config('request.jwt.claim.sub',test_id(10)::text,true);
set local role authenticated;
select test_assert(can_issue_for_office(test_id(2)) and not can_issue_for_office(test_id(1)),'own office only');
insert into surat_registrasi(id,office_id,form_input_data,policy_snapshot) values(test_id(100),test_id(2),'{"requires_recommendation":true}',test_config());
select test_assert((select count(*)=1 from surat_recommendation_tasks where parent_surat_id=test_id(100) and office_id=test_id(1)),'parent insert creates internal Pusat task');
select create_recommendation_task_for_parent(test_id(100));
select test_assert((select count(*)=1 from surat_recommendation_tasks where parent_surat_id=test_id(100)),'factory idempotent');
select test_assert(not can_issue_for_office(test_id(1)),'no access expansion');
select test_denied($q$insert into surat_reservations(entity_id,office_id,reserved_by) values(test_id(20),test_id(1),auth.uid())$q$);
select set_config('sigap.recommendation_internal','true',true);
select test_denied($q$insert into surat_registrasi(office_id) values(test_id(1))$q$);
select test_denied($q$insert into surat_registrasi(office_id) values(test_id(4))$q$);
select test_denied($q$update surat_registrasi set office_id=test_id(3) where id=test_id(100)$q$);
update surat_registrasi set form_input_data=form_input_data where id=test_id(100);
select test_denied('select * from recommendation_numbering_internal.reservation_authorizations');
select test_denied('insert into recommendation_numbering_internal.reservation_authorizations values(null,null,null,null,null)');
select set_config('request.jwt.claim.sub',test_id(11)::text,true);
do $$begin
 begin perform create_recommendation_task_for_parent(test_id(100));exception when others then
  if sqlerrm='Anda tidak diizinkan membuat tugas rekomendasi.' then return;end if;raise;end;
 raise exception 'Other requester accessed parent';end$$;
reset role;
select test_assert((select count(*)=0 from recommendation_numbering_internal.reservation_authorizations),'one-use capabilities consumed');
-- Even a trusted fixture-created capability cannot authorize a different row,
-- actor, connection or transaction. A public GUC is never an authorization.
do $$declare n integer; ctx jsonb;begin
 for n in 1..4 loop
  ctx:=jsonb_build_object('entity_id',test_id(20),'type_id',null,'office_id',test_id(1),
   'project_id',null,'dept_id',null,'year',null,'no_urut',null,'status',null,'reserved_by',test_id(10));
  insert into recommendation_numbering_internal.reservation_authorizations values(
   test_id(200+n),txid_current()+case when n=1 then 1 else 0 end,
   pg_backend_pid()+case when n=2 then 1 else 0 end,
   case when n=3 then test_id(11) else test_id(10) end,
   case when n=4 then ctx||'{"no_urut":999}'::jsonb else ctx end);
 end loop;
end$$;
select set_config('request.jwt.claim.sub',test_id(10)::text,true);
set local role authenticated;
do $$declare n integer;begin for n in 1..4 loop
 perform test_denied(format('insert into surat_reservations(id,entity_id,office_id,reserved_by) values(test_id(%s),test_id(20),test_id(1),auth.uid())',200+n));
end loop;end$$;
reset role;
delete from recommendation_numbering_internal.reservation_authorizations;
select set_config('request.jwt.claim.sub',test_id(10)::text,true);
insert into surat_registrasi(id,office_id) values(test_id(105),test_id(2));
update surat_registrasi set form_input_data='{"requires_recommendation":true}',policy_snapshot=test_config() where id=test_id(105);
update profiles set is_active=false where id=test_id(10);
set local role authenticated;
select test_denied('select create_recommendation_task_for_parent(test_id(105))');
reset role;
update profiles set is_active=true,deleted_at=now() where id=test_id(10);
set local role authenticated;
select test_denied('select create_recommendation_task_for_parent(test_id(105))');
reset role;
update profiles set deleted_at=null where id=test_id(10);
select test_assert(not exists(select 1 from surat_recommendation_tasks where parent_surat_id=test_id(105)),'inactive/deleted cannot allocate');
set local role service_role;
select test_denied('select * from recommendation_numbering_internal.reservation_authorizations');
reset role;
-- Pusat works as before; explicit KC delegation does not imply Pusat access.
select set_config('request.jwt.claim.sub',test_id(12)::text,true);
set local role authenticated;
insert into surat_registrasi(id,office_id,form_input_data,policy_snapshot) values(test_id(101),test_id(1),'{"requires_recommendation":true}',test_config());
reset role;
insert into user_access_grants values(test_id(10),'submission.issue_for_office',test_id(3));
select set_config('request.jwt.claim.sub',test_id(10)::text,true);
set local role authenticated;
insert into surat_registrasi(office_id) values(test_id(3));
select test_assert(not can_issue_for_office(test_id(1)),'delegation still bounded');
reset role;
-- Fail after number insert: no orphan parent, number, task or capability survives.
alter table surat_recommendation_tasks add constraint test_fail check(parent_surat_id<>test_id(102));
set local role authenticated;
do $$begin
 begin insert into surat_registrasi(id,office_id,form_input_data,policy_snapshot) values(test_id(102),test_id(2),'{"requires_recommendation":true}',test_config());
 exception when check_violation then return;end;raise exception 'Expected late failure';end$$;
reset role;
select test_assert(not exists(select 1 from surat_registrasi where id=test_id(102)),'parent rolled back');
select test_assert((select count(*)=2 from surat_reservations),'failed number rolled back');
select test_assert(not exists(select 1 from recommendation_numbering_internal.reservation_authorizations),'failed capability rolled back');
alter table surat_recommendation_tasks drop constraint test_fail;
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select test_denied($q$insert into surat_registrasi(office_id) values(test_id(2))$q$);
reset role;
commit;
`;

const run = (args, input = '') => {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 120000 });
  if (result.status !== 0) throw new Error((result.stderr || '') + (result.stdout || ''));
  return result.stdout;
};
const id = run(['run','-d','-e','POSTGRES_PASSWORD=disposable-test-only','-e','POSTGRES_USER=sigap_fixture_root',
  '--health-cmd','pg_isready -U sigap_fixture_root','--health-interval','1s','--health-retries','30','postgres:17-alpine']).trim();
const psql = ['exec','-i',id,'psql','-U','sigap_fixture_root','-d','postgres','-v','ON_ERROR_STOP=1'];
try {
  let ready = false;
  for (let i=0;i<80;i++) {
    if (run(['inspect','--format','{{.State.Health.Status}}',id]).trim()==='healthy') {ready=true;break;}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,500);
  }
  if (!ready) throw new Error('Disposable Postgres not ready');
  run(psql, fixture);
  if (!process.argv.includes('--baseline')) run(psql, migration + migration + activeActorMigration + activeActorMigration);
  if (revisionUpdate) {
    const rec = read('supabase/migrations/20260810143000_rec03_recommendation_multi_detail_foundation.sql');
    run(psql, `alter table surat_registrasi add column current_step integer default 1, add column status text default 'PROSES', add column data_snapshot jsonb default '{}';
      create schema requester_revision_internal;
      create table requester_revision_internal.permits(transaction_id bigint,surat_id uuid,operation text);
      revoke all on schema requester_revision_internal from public,anon,authenticated,service_role;
      revoke all on requester_revision_internal.permits from public,anon,authenticated,service_role;
      create table surat_revision_events(id uuid,surat_id uuid,status text,target_type text,changes jsonb);
      create table surat_linked_documents(parent_surat_id uuid,child_surat_id uuid,link_type text,status text);
      create table surat_signatures(surat_id uuid,step_order integer,is_signed boolean default false);
      create function recommendation_pdf_is_current(id uuid) returns boolean language sql as $$select coalesce((select status='DONE' from public.surat_registrasi where public.surat_registrasi.id=$1),false)$$;
      ${routine(rec, 'guard_parent_approval_for_recommendation')}
      ${routine(rec, 'guard_parent_signature_for_recommendation')}
      alter function guard_parent_approval_for_recommendation() owner to postgres;
      alter function guard_parent_signature_for_recommendation() owner to postgres;
      grant all on all tables in schema public to postgres;
      grant select,insert,update on surat_signatures to authenticated;
      create trigger recommendation_approval before update of current_step,status on surat_registrasi for each row execute function guard_parent_approval_for_recommendation();
      create trigger recommendation_signature before update of is_signed on surat_signatures for each row execute function guard_parent_signature_for_recommendation();`);
    const patch = read('supabase/migrations/20261104090000_revision_recommendation_task.sql');
    if (!process.argv.includes('--before-rec06')) {
      const active = read('supabase/migrations/20261104100000_revision_recommendation_task_active_only.sql');
      run(psql, patch + patch + active + active);
    }
    run(psql, read('supabase/tests/revision_recommendation_task.integration.sql'));
    const connection = (sql) => new Promise((resolve, reject) => {
      const child = spawn('docker', psql); let error = '';
      child.stdout.resume(); child.stderr.on('data', chunk => { error += chunk; });
      child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(error)));
      child.stdin.end(sql);
    });
    const prefix = `begin; set local statement_timeout='5s'; select set_config('request.jwt.claim.sub',test_id(10)::text,true);set local role authenticated;`;
    await Promise.all([
      connection(`${prefix} select id from surat_registrasi where id=test_id(200) for update; select pg_sleep(0.6);
        update surat_registrasi set form_input_data='{"requires_recommendation":true}' where id=test_id(200);commit;`),
      connection(`${prefix} select pg_sleep(0.2); select create_recommendation_task_for_parent(test_id(200));commit;`),
    ]);
    run(psql, `select test_assert((select count(*)=1 from surat_recommendation_tasks where parent_surat_id=test_id(200)), 'update/direct factory concurrency has one winner');`);
    console.log('Revision recommendation tasks: canonical factory, ownership, rollback, replay and two-connection lock-order assertions passed.');
    process.exitCode = 0;
  } else {
  run(psql, assertions);
  // Separate connections contend on the real factory's department advisory lock.
  const submit = (n) => new Promise((resolve,reject) => {
    const child=spawn('docker',psql);let error='';
    child.stdout.resume();child.stderr.on('data',c=>{error+=c;});
    child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(error)));
    child.stdin.end(`begin; select set_config('request.jwt.claim.sub',test_id(10)::text,true);set local role authenticated;
      insert into surat_registrasi(id,office_id,form_input_data,policy_snapshot) values(test_id(${n}),test_id(2),'{"requires_recommendation":true}',test_config());commit;`);
  });
  await Promise.all([submit(103),submit(104)]);
  run(psql, `select test_assert((select count(*)=4 and count(distinct no_urut)=4 from surat_reservations),'parallel unique numbers');
    select test_assert(not exists(select 1 from recommendation_numbering_internal.reservation_authorizations),'no parallel capability leaks');`);
  console.log('Recommendation office reservation: all assertions passed (real canonical factory/guards, non-superuser owner, migration replay, rollback, authorization, concurrency).');
  }
} finally { run(['rm','-f',id]); }
