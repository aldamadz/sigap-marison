import { readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
const read = path => readFileSync(path, 'utf8').replaceAll('\r\n','\n');
const source = read('supabase/migrations/20260604090000_department_kpi_sla.sql');
const start = source.indexOf('create or replace function public.calculate_business_minutes(');
const businessMinutes = source.slice(start, source.indexOf('$$;',start)+3);
const migration = read('supabase/migrations/20261019090000_actionable_role_dashboard.sql');
const labels = read('supabase/migrations/20261019091000_actionable_role_dashboard_stage_labels.sql');
const notifications = process.argv.includes('--notifications');
const actionClock = process.argv.includes('--action-clock');
const receivingAuthority = process.argv.includes('--receiving-authority');
const weekly = process.argv.includes('--weekly') || actionClock || receivingAuthority;
const receiving = process.argv.includes('--receiving') || weekly;
const monitoringDetails = process.argv.includes('--monitoring-details');
const signerScope = process.argv.includes('--signer-scope') || monitoringDetails || receiving || notifications;
const monitoringRecovery = read('supabase/migrations/20260923130000_production_runtime_contract_recovery.sql');
const monitoringSource = read('supabase/migrations/20260814103000_surat_organizational_scope_and_auto_approval.sql');
const monitoringRpcs = monitoringRecovery.slice(monitoringRecovery.indexOf('create or replace function public.get_surat_monitoring_page('),
  monitoringRecovery.indexOf('create or replace function public.get_compact_inbox_count('))
  + monitoringSource.slice(monitoringSource.indexOf('create or replace function public.get_my_surat_monitoring_stats('),
    monitoringSource.indexOf('create or replace function public.enforce_surat_reservation_number_scope()'));
const signerScopeMigration = signerScope ? read('supabase/migrations/20261105050000_signer_organization_monitoring.sql') : '';
const signerScopeSetup = `
alter table profiles add column job_title text,add column avatar_url text;
alter table surat_registrasi add column file_path text,add column lampiran_path text,add column form_input_data jsonb default '{}';
alter table surat_signatures add column label_jabatan text,add column catatan text;
create table surat_attachments(id uuid,surat_id uuid,created_at timestamptz,file_url text);
`;
const signerScopeAssertions = signerScope ? read('supabase/tests/signer_organization_monitoring.integration.sql') : '';
const fixture = `
create role postgres nologin nosuperuser;create role authenticated;create role anon;create role service_role;
create schema auth;grant usage on schema auth to postgres,authenticated,anon;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function public.tid(n int) returns uuid language sql immutable as $$select lpad(n::text,32,'0')::uuid$$;
create table public.master_offices(id uuid primary key,name text,kedudukan text,parent_id uuid);
create table public.master_departments(id uuid primary key,name text);
create table public.profiles(id uuid primary key,full_name text,role text,office_id uuid,department_id uuid,is_active boolean default true,deleted_at timestamptz);
create table public.surat_registrasi(id uuid primary key,created_by uuid,office_id uuid,dept_id uuid,represented_department_id uuid,
 no_surat text,judul_surat text,status text,current_step integer,created_at timestamptz default now()-interval '60 days',updated_at timestamptz default now(),data_snapshot jsonb default '{}');
create table public.surat_signatures(id uuid primary key,surat_id uuid,user_id uuid,step_order integer,is_signed boolean default false,status text default 'PENDING',signed_at timestamptz,available_at timestamptz,
 signer_snapshot jsonb default '{}',verifier_snapshot jsonb default '[]',role_name text,verification_required boolean default false,verification_status text);
create table public.surat_recommendation_tasks(id uuid primary key,parent_surat_id uuid,required_before_step integer,status text);
create table public.surat_revision_events(id uuid primary key,surat_id uuid,status text,reason text,created_at timestamptz default now());
create table public.department_kpi_configs(dept_id uuid,is_active boolean,sla_minutes integer,work_days integer[],work_start time,work_end time,break_start time,break_end time,timezone text);
create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid,type text,title text,message text,data jsonb,link text,created_at timestamptz default now());
${businessMinutes}
insert into master_offices values(tid(1),'Pusat','Pusat',null),(tid(2),'KC Solo','KC',null),
 (tid(3),'KCP Karanganyar','KCP',tid(2)),(tid(4),'KCP Lain','KCP',tid(2)),(tid(5),'KC Jepara','KC',null),(tid(6),'KCP Turunan','KCP',tid(3));
insert into master_departments values(tid(1),'PO'),(tid(2),'Keuangan');
insert into profiles(id,full_name,role,office_id,department_id) values
 (tid(1),'Pemohon','user',tid(1),tid(1)),(tid(2),'Manager','user',tid(1),tid(1)),(tid(3),'Keuangan','user',tid(1),tid(2)),
 (tid(4),'KC Staff','user',tid(2),tid(1)),(tid(5),'KCP Staff','user',tid(3),tid(1)),(tid(6),'Sibling Staff','user',tid(4),tid(1)),
 (tid(7),'Other KC','user',tid(5),tid(1)),(tid(8),'Nested KCP','user',tid(6),tid(1)),(tid(9),'Admin','admin',tid(1),tid(1));
insert into surat_registrasi(id,created_by,office_id,dept_id,no_surat,judul_surat,status,current_step)
 select tid(10+n),tid(n),p.office_id,p.department_id,'ORG-'||n,'Organization '||n,'PROSES',1 from generate_series(1,8)n join profiles p on p.id=tid(n);
insert into surat_registrasi(id,created_by,office_id,dept_id,no_surat,judul_surat,status,current_step)
 select tid(n),tid(1),tid(1),tid(1),'SUR-'||n,'Pengajuan '||n,
  case n when 103 then 'MENUNGGU_PERBAIKAN' when 104 then 'DONE' when 105 then 'REJECTED' else 'PROSES' end,
  case n when 101 then 1 when 104 then 3 else 2 end from generate_series(100,107)n;
insert into surat_signatures(id,surat_id,user_id,step_order,is_signed,status,signed_at,available_at,role_name)
 select tid(n*10+1),tid(n),case n when 101 then tid(3) else tid(1) end,1,n<>101,'APPROVED',
 now()-interval '4 days',now()-interval '5 days','Membuat' from generate_series(100,107)n;
insert into surat_signatures(id,surat_id,user_id,step_order,is_signed,status,signed_at,available_at,role_name,verification_required,verification_status)
 select tid(n*10+2),tid(n),tid(2),2,n in (104,105),case n when 105 then 'REJECTED' when 104 then 'APPROVED' else 'PENDING' end,
 case when n in (104,105) then now() end,
 case n when 101 then null when 106 then now()+interval '1 hour' else now()-interval '3 days' end,
 'Manager',n=102,case n when 102 then 'pending' end from generate_series(100,107)n;
insert into surat_recommendation_tasks values(tid(200),tid(107),2,'waiting');
insert into surat_revision_events values(tid(201),tid(103),'awaiting_requester','Lengkapi spesifikasi',now());
insert into department_kpi_configs values(tid(1),true,60,array[1,2,3,4,5,6,7],'00:00','23:59','12:00','13:00','Asia/Jakarta');
alter table surat_registrasi enable row level security;
grant usage on schema public to authenticated,anon;
grant select on all tables in schema public to authenticated;
create function public.check_ok(ok boolean,message text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',message;end if;end$$;
`;
const assertions = `
create policy document_scope on surat_registrasi for select to authenticated using(public.can_read_surat(id));
do $$declare r record;begin
 for r in select tablename from pg_tables where schemaname='public' loop execute format('alter table public.%I owner to postgres',r.tablename);end loop;
 for r in select p.oid::regprocedure::text as identity from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' loop execute 'alter function '||r.identity||' owner to postgres';end loop;
end$$;
begin;
select set_config('request.jwt.claim.sub',tid(2)::text,true);set local role authenticated;
select check_ok((get_actionable_dashboard('signer','all',now()-interval '1 day',now()+interval '1 day')->'summary') @>
 '{"ready":2,"upcoming":1,"blocked":2,"returned":1,"completed":1,"rejected":1,"active":6}'::jsonb,'signer buckets; old pending survives history range');
select check_ok((get_actionable_dashboard('signer','ready')->>'count')::int=2,'ready drilldown');
select check_ok((get_actionable_dashboard('signer','ready')->'rows'->0->>'current_role')='Manager','stage label is the assigned role, not database CURRENT_ROLE');
select check_ok((get_actionable_dashboard('signer','upcoming')->'rows'->0->>'elapsed_minutes') is null,'upcoming not measured');
select check_ok((get_actionable_dashboard('signer','returned')->'rows'->0->>'elapsed_minutes') is null,'requester revision paused');
select check_ok((get_actionable_dashboard('signer','completed')->'summary'->>'completed_measured')::int=1,'completed has measured SLA');
select check_ok((get_actionable_dashboard('signer','active',null,null,'SUR-106')->'rows'->0->>'elapsed_minutes')::int=0,'future availability not negative');
select check_ok((get_actionable_dashboard('signer','all',null,null,null,1,1)->'rows')::jsonb<> '[]','pagination');
select check_ok((get_actionable_dashboard('signer','all',now()-interval '70 days',now()-interval '50 days')->'summary'->>'completed')::int=0,'completion uses finished date');
select set_config('request.jwt.claim.sub',tid(4)::text,true);
select check_ok(public.can_read_surat(tid(14)) and public.can_read_surat(tid(15)) and public.can_read_surat(tid(16)) and public.can_read_surat(tid(18)),'KC sees its descendants');
select check_ok(not public.can_read_surat(tid(17)) and not public.can_read_surat(tid(11)),'KC cannot see other KC or Pusat');
select check_ok((get_actionable_dashboard('team','active')->>'count')::int=4,'KC team count');
select check_ok((select count(*)=4 from surat_registrasi),'RLS KC detail scope');
select set_config('request.jwt.claim.sub',tid(5)::text,true);
select check_ok((get_actionable_dashboard('team','active')->>'count')::int=1,'KCP exact office only');
select check_ok(not public.can_read_surat(tid(14)) and not public.can_read_surat(tid(16)) and not public.can_read_surat(tid(18)),'KCP cannot escalate to KC/sibling/child');
select set_config('request.jwt.claim.sub',tid(1)::text,true);
select check_ok(not public.can_read_surat(tid(13)),'Pusat cannot read other department');
select check_ok((get_actionable_dashboard('mine','active')->>'count')::int=7,'personal distinct document count');
select check_ok((get_actionable_dashboard('team','all')->>'count')::int=10,'same department only, no office branch leakage');
select check_ok((remind_dashboard_request(tid(100))->>'sent')::boolean,'requester can remind current signer');
select check_ok(not (remind_dashboard_request(tid(100))->>'sent')::boolean,'reminder debounce across senders');
select check_ok((select count(*)=1 from notifications where user_id=tid(2)),'single notification to canonical target');
do $$begin begin perform remind_dashboard_request(tid(102));exception when object_not_in_prerequisite_state then return;end;raise exception 'blocked reminder accepted';end$$;
do $$begin begin perform remind_dashboard_request(tid(104));exception when object_not_in_prerequisite_state then return;end;raise exception 'completed reminder accepted';end$$;
select set_config('request.jwt.claim.sub',tid(7)::text,true);
do $$begin begin perform remind_dashboard_request(tid(100));exception when insufficient_privilege then return;end;raise exception 'unrelated reminder accepted';end$$;
select set_config('request.jwt.claim.sub',tid(2)::text,true);
select check_ok((remind_dashboard_request(tid(103))->>'sent')::boolean,'return reminder targets requester');
select check_ok((select count(*)=1 from notifications where user_id=tid(1)),'requester notification exists');
do $$begin begin perform remind_dashboard_request(tid(100));exception when object_not_in_prerequisite_state then return;end;raise exception 'self reminder accepted';end$$;
reset role;
-- Reparenting is dynamic, and an invalid hierarchy cannot recurse forever.
update master_offices set parent_id=tid(5) where id=tid(3);
select set_config('request.jwt.claim.sub',tid(4)::text,true);set local role authenticated;
select check_ok(not public.can_read_surat(tid(15)) and not public.can_read_surat(tid(18)),'moved offices disappear without grants');
reset role;update master_offices set parent_id=tid(2) where id=tid(3);
update master_offices set parent_id=tid(3) where id=tid(2);
set local role authenticated;select check_ok((select count(*)=4 from dashboard_organization_offices()),'cycle guard');reset role;
update profiles set is_active=false where id=tid(4);set local role authenticated;
select check_ok(not public.can_read_surat(tid(14)),'inactive cannot read');
do $$begin begin perform get_actionable_dashboard();exception when insufficient_privilege then return;end;raise exception 'inactive accepted';end$$;
reset role;update profiles set deleted_at=now() where id=tid(4);update profiles set is_active=true where id=tid(4);set local role authenticated;
select check_ok(not public.can_read_surat(tid(14)),'soft-deleted cannot read');
do $$begin begin perform get_actionable_dashboard();exception when insufficient_privilege then return;end;raise exception 'soft-deleted accepted';end$$;
reset role;select set_config('request.jwt.claim.sub',tid(9)::text,true);set local role authenticated;
do $$begin begin perform get_actionable_dashboard('team','active',null,null,null,1000000);exception when invalid_parameter_value then return;end;raise exception 'unbounded page accepted';end$$;
reset role;select set_config('request.jwt.claim.sub','',true);set local role anon;
do $$begin begin perform get_actionable_dashboard();exception when insufficient_privilege then return;end;raise exception 'anonymous accepted';end$$;
reset role;rollback;
`;
const run = (args,input='') => { const r=spawnSync('docker',args,{input,encoding:'utf8',timeout:120000});if(r.status!==0)throw Error(r.stderr+r.stdout);return r.stdout; };
const container=run(['run','-d','--network','none','--read-only','--cap-drop','ALL','--user','70:70',
 '--security-opt','no-new-privileges','--pids-limit','64','--memory','384m','--cpus','1','--ulimit','fsize=67108864:67108864',
 '--tmpfs','/scratch:rw,size=268435456,uid=70,gid=70','--tmpfs','/var/run/postgresql:rw,size=1048576,uid=70,gid=70',
 '-e','PGDATA=/scratch/data','-e','HOME=/scratch','-e','TMPDIR=/scratch',
 '-e','POSTGRES_PASSWORD=disposable-test-only','-e','POSTGRES_USER=sigap_fixture_root',
 '--health-cmd','pg_isready -h 127.0.0.1 -U sigap_fixture_root','--health-interval','1s','--health-retries','30','postgres:17-alpine']).trim();
try {
 let ready=false;for(let i=0;i<80;i++){if(run(['inspect','--format','{{.State.Health.Status}}',container]).trim()==='healthy'){ready=true;break;}Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,500);}
 if(!ready)throw Error('Disposable PostgreSQL not ready');
 run(['exec','-i',container,'psql','-U','sigap_fixture_root','-d','postgres','-v','ON_ERROR_STOP=1'],fixture+migration+migration+labels+labels
  +(signerScope ? signerScopeSetup+monitoringRpcs+signerScopeMigration+signerScopeMigration : '')+assertions+signerScopeAssertions);
 if(monitoringDetails){
  const patch=process.argv.includes('--baseline') ? '' : read('supabase/migrations/20261112100000_monitoring_readable_details.sql');
  const approvalPolicySource=read('supabase/migrations/20260608093000_harden_surat_approval.sql');
  const mutationPolicy=approvalPolicySource.slice(approvalPolicySource.indexOf('create policy "Creators current signers and admins can update surat"'),
    approvalPolicySource.indexOf('create or replace function public.handle_approve_surat_v2('));
  const result=run(['exec','-i',container,'psql','-U','sigap_fixture_root','-d','postgres','-v','ON_ERROR_STOP=1'],
   patch+patch+mutationPolicy+'grant update on public.surat_registrasi to authenticated;'+read('supabase/tests/monitoring_readable_details.integration.sql'));
  if(!result.includes('Monitoring readable details: all assertions passed'))throw Error('Missing monitoring detail proof');
  console.log('Monitoring readable details: real PostgreSQL RLS, scoped files, hierarchy and unchanged action authority passed.');
 }
 const parallelReminder = () => new Promise((resolve,reject) => {
  const child=spawn('docker',['exec','-i',container,'psql','-U','sigap_fixture_root','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{stdio:['pipe','pipe','pipe']});
  let output='',error='';child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{error+=data;});
  child.on('error',reject);child.on('close',code=>code===0?resolve(output):reject(Error(error)));
  child.stdin.end("begin;select set_config('request.jwt.claim.sub',tid(1)::text,true);set local role authenticated;select remind_dashboard_request(tid(100))->>'sent';select pg_sleep(0.1);commit;");
 });
 const concurrent=await Promise.all([parallelReminder(),parallelReminder()]);
 if(concurrent.filter(output=>/^true$/m.test(output)).length!==1)throw Error('Concurrent reminders must have exactly one sender');
 run(['exec','-i',container,'psql','-U','sigap_fixture_root','-d','postgres','-v','ON_ERROR_STOP=1'],"select check_ok((select count(*)=1 from notifications),'concurrent reminders deduplicated');");
 if(notifications){
  const setup=`alter table notifications add column is_read boolean default false,add column read_at timestamptz;
   create table public.holidays(holiday_date date primary key);
   create table public.work_calendar_entries(id uuid primary key,owner_id uuid references profiles(id),work_date date,due_date date,
    title text,kind text default 'work',status text default 'planned',starts_at timestamptz,realization text,deleted_at timestamptz);`;
  const delivery=read('supabase/migrations/20261105062000_notification_delivery.sql');
  const proof=run(['exec','-i',container,'psql','-U','sigap_fixture_root','-d','postgres','-v','ON_ERROR_STOP=1'],setup
   +read('supabase/migrations/20260626164000_web_push_subscriptions.sql')+delivery+delivery+read('supabase/tests/notification_delivery.integration.sql'));
  if(!proof.includes('NTF06 delivery, planner and authorization assertions passed'))throw Error('Missing notification SQL assertions');
  run(['exec','-i',container,'psql','-U','sigap_fixture_root','-d','postgres','-v','ON_ERROR_STOP=1'],
   "insert into web_push_subscriptions(user_id,endpoint,subscription) values(tid(1),'https://fcm.googleapis.com/concurrent','{\"endpoint\":\"https://fcm.googleapis.com/concurrent\"}');insert into notifications(user_id,title,is_read,data) values(tid(1),'Concurrent',false,'{}');");
  const claim=()=>new Promise((resolve,reject)=>{
   const child=spawn('docker',['exec','-i',container,'psql','-U','sigap_fixture_root','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{stdio:['pipe','pipe','pipe']});let output='',error='';
   child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{error+=data;});child.on('error',reject);child.on('close',code=>code===0?resolve(output):reject(Error(error)));
   child.stdin.end("begin;select count(*) from claim_notification_push(1,array[tid(1)]);select pg_sleep(0.1);commit;");
  });
  const claims=await Promise.all([claim(),claim()]);
  if(claims.filter(output=>/^1$/m.test(output)).length!==1)throw Error('Concurrent queue claims must have exactly one winner');
  console.log('NTF06: notification assertions and two-connection queue concurrency passed.');
 }
 if(receiving){
  const setup=`alter table master_departments add column code text;
   alter table surat_registrasi add column letter_type_id uuid,add column penggunaan_id uuid,add column request_date date,add column requester_snapshot jsonb,add column location_snapshot jsonb;
   alter table surat_signatures add column action_type text,add column requires_unit_allocation boolean,add column attachment_requirements_snapshot jsonb;
   alter table surat_revision_events add column target_user_ids uuid[],add column target_type text,add column target_step integer;
   create table master_letter_types(id uuid,name text);create table master_forms(id uuid,nama_form text);create table master_penggunaan_detail(id uuid,form_id uuid);
   create table surat_linked_documents(parent_surat_id uuid);create table holidays(holiday_date date);
   insert into department_kpi_configs values(tid(2),true,120,array[1,2,3,4,5],'08:00','17:00','12:00','13:00','Asia/Jakarta');`;
  const kpi=read('supabase/migrations/20260706170000_pause_sla_during_process_revision.sql');
  let count=monitoringRecovery.slice(monitoringRecovery.indexOf('create or replace function public.get_compact_inbox_count('),monitoringRecovery.indexOf('create or replace function public.get_user_active_sla_breach_count('));
  if(process.argv.includes('--live-shape'))count=count.replaceAll('where ss.user_id','WHERE ss.user_id').replaceAll('where not coalesce','WHERE NOT COALESCE');
  const policy=read('supabase/migrations/20261105063000_department_receiving_periods.sql');
  const proof=run(['exec','-i',container,'psql','-U','sigap_fixture_root','-d','postgres','-v','ON_ERROR_STOP=1'],setup
   +kpi.slice(kpi.indexOf('create or replace function public.get_department_kpi_summary('))
   +read('supabase/migrations/20260814120000_user_active_sla_breach_count.sql')
   +read('supabase/migrations/20260924090000_restore_production_compact_inbox.sql')+count+policy+policy
   +read('supabase/tests/department_receiving_periods.integration.sql'));
  if(!proof.includes('SLA02 monthly receiving and frozen clocks passed'))throw Error('Missing SLA02 assertions');
  console.log('SLA02: monthly rules, immutable stage snapshots, receiving guards, RLS and clocks passed.');
  if(weekly){
   const weeklyPolicy=read('supabase/migrations/20261106060000_weekly_department_sla_management.sql');
   const relationship=read('supabase/migrations/20261106070000_weekly_department_sla_profile_relationship.sql');
   const result=run(['exec','-i',container,'psql','-U','sigap_fixture_root','-d','postgres','-v','ON_ERROR_STOP=1'],weeklyPolicy+weeklyPolicy+relationship+relationship
    +(process.argv.includes('--weekly') ? read('supabase/tests/weekly_department_sla.integration.sql') : ''));
   if(process.argv.includes('--weekly')) {
    if(!result.includes('SLA02 weekly receiving and delegated management passed'))throw Error('Missing weekly SLA assertions');
    console.log('SLA02: weekly windows, default off, scoped delegation, audit and frozen signer SLA passed.');
   }
   if(receivingAuthority){
    const authority=process.argv.includes('--baseline') ? '' : read('supabase/migrations/20261110080000_department_receiving_authority.sql');
    const proof=run(['exec','-i',container,'psql','-U','sigap_fixture_root','-d','postgres','-v','ON_ERROR_STOP=1'],
     authority+authority+read('supabase/tests/department_receiving_authority.integration.sql'));
    if(!proof.includes('SLA02 authoritative intake department assertions passed'))throw Error('Missing intake authority assertions');
    console.log('SLA02: authoritative profile department, missing profiles/departments, forged snapshots and frozen holds passed.');
   }
   if(actionClock){
    const clockSetup=`alter table surat_linked_documents add column child_surat_id uuid,add column link_type text,add column status text default 'active';
     alter table surat_registrasi add column policy_snapshot jsonb default '{}';
     create function public.recommendation_pdf_is_current(p_id uuid) returns boolean language sql stable as $$
      select coalesce((data_snapshot->>'current_pdf')::boolean,false) from public.surat_registrasi where id=p_id;
     $$;`;
    const clockMigration=read('supabase/migrations/20261109110000_signer_action_sla_clock.sql');
    const clockCompat=read('supabase/migrations/20261109105900_signer_action_sla_clock_compat.sql');
    const compactSetup=`do $compact$ declare definition text;begin
     select pg_get_functiondef('public.get_user_active_sla_breach_count(uuid)'::regprocedure) into definition;
     execute replace(definition,E'public.calculate_business_minutes(\\n      active.started_at,','public.calculate_business_minutes(active.started_at,');
    end $compact$;
    create temp table breach_before as select pg_get_functiondef(oid) definition,proowner,proacl from pg_proc where oid='public.get_user_active_sla_breach_count(uuid)'::regprocedure;`;
    const compatAssertions=`select check_ok((select replace(pg_get_functiondef(p.oid),E'public.calculate_business_minutes(\\n      active.started_at,','public.calculate_business_minutes(active.started_at,')=b.definition
     and p.proowner=b.proowner and p.proacl is not distinct from b.proacl from breach_before b cross join pg_proc p where p.oid='public.get_user_active_sla_breach_count(uuid)'::regprocedure),'production compact compatibility changes whitespace only, preserving owner and ACL');`;
    const result=run(['exec','-i',container,'psql','-U','sigap_fixture_root','-d','postgres','-v','ON_ERROR_STOP=1'],clockSetup+compactSetup+clockCompat+clockCompat+compatAssertions+clockMigration+clockMigration+clockCompat
     +read('supabase/tests/signer_action_sla.integration.sql'));
    if(!result.includes('SLA03 actionable clock assertions passed'))throw Error('Missing SLA03 assertions');
    const authority=read('supabase/migrations/20261109170000_signer_clock_authority.sql');
    const authorityResult=run(['exec','-i',container,'psql','-U','sigap_fixture_root','-d','postgres','-v','ON_ERROR_STOP=1'],
     authority+authority+read('supabase/tests/signer_clock_authority.integration.sql'));
    if(!authorityResult.includes('SLA03 lifecycle authority assertions passed'))throw Error('Missing lifecycle authority assertions');
    const refreshClock=()=>new Promise((resolve,reject)=>{
     const child=spawn('docker',['exec','-i',container,'psql','-U','sigap_fixture_root','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{stdio:['pipe','pipe','pipe']});let output='',error='';
     child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{error+=data;});child.on('error',reject);child.on('close',code=>code===0?resolve(output):reject(Error(error)));
     child.stdin.end("begin;select sla_clock_internal.refresh(tid(9002));select pg_sleep(0.1);commit;");
    });
    await Promise.all([refreshClock(),refreshClock()]);
    run(['exec','-i',container,'psql','-U','sigap_fixture_root','-d','postgres','-v','ON_ERROR_STOP=1'],"select check_ok((select count(*)=1 from sla_clock_internal.periods where signature_id=tid(9002) and ended_at is null),'concurrent refresh keeps one open interval');");
    console.log('SLA03: waiting, resume, accumulated work time, authorization and all SLA read surfaces passed.');
   }
  }
 }
 console.log('Actionable dashboard: all assertions passed (canonical business clock, real PostgreSQL, RLS, hierarchy, queue, history, SLA, authorization).');
} finally {run(['rm','-f',container]);}
