import {readFileSync} from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
const migration=readFileSync('supabase/migrations/20261113110000_standalone_release_notices.sql','utf8');
const archive=readFileSync('supabase/migrations/20261113130000_standalone_release_notices_archive.sql','utf8');
const preferences=readFileSync('supabase/migrations/20261105061000_release_notice_preferences.sql','utf8');
const assertions=readFileSync('supabase/tests/standalone_release_notices.integration.sql','utf8');
const container=`sigap-release-notice-test-${process.pid}-${Date.now()}`;
const run=(args,input)=>{
  const result=spawnSync('docker',args,{input,encoding:'utf8',timeout:120000,maxBuffer:8e6});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error(result.stderr||result.stdout||'Docker fixture failed');
  return String(result.stdout||'')+String(result.stderr||'');
};
const sql=input=>run(['exec','-i',container,'psql','-h','127.0.0.1','-X','-qAt','-U','sigap_fixture_root','-d','postgres','-v','ON_ERROR_STOP=1'],input);
let created=false;
try {
  run(['run','--detach','--name',container,'--network','none','--memory','256m','--cpus','1',
    '-e','POSTGRES_USER=sigap_fixture_root','-e','POSTGRES_PASSWORD=disposable-fixture-only','postgres:17-alpine']);
  created=true;
  let ready=false;
  // initdb's temporary socket-only server restarts before the final TCP listener.
  for(let attempt=0;attempt<40;attempt++){
    const result=spawnSync('docker',['exec',container,'pg_isready','-h','127.0.0.1','-U','sigap_fixture_root'],{stdio:'ignore'});
    if(result.status===0){ready=true;break;}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!ready)throw Error('Disposable PostgreSQL was not ready');
  sql(`create role postgres nologin nosuperuser;create role authenticated;create role anon;create role service_role;
    create schema auth;grant usage on schema public,auth to authenticated,anon,postgres;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function public.release_test_id(n int) returns uuid language sql immutable as $$select lpad(n::text,32,'0')::uuid$$;
    create function public.release_check(ok boolean,message text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',message;end if;end$$;
    create table public.profiles(id uuid primary key,full_name text,role text,is_active boolean default true,deleted_at timestamptz);
    insert into public.profiles values(release_test_id(1),'Admin A','admin',true,null),(release_test_id(2),'Admin B','super_admin',true,null),
      (release_test_id(3),'User','user',true,null),(release_test_id(4),'Inactive','admin',false,null),(release_test_id(5),'Deleted','admin',true,now());
    create table public.maintenance_fixture(status text);insert into public.maintenance_fixture values('completed');
    ${preferences}${migration}${migration}${archive}${archive}
    insert into public.release_notice_preferences(user_id,dismissed_release_id) values(release_test_id(3),release_test_id(90));
    do $$declare r record;begin
      for r in select tablename from pg_tables where schemaname='public' loop execute format('alter table public.%I owner to postgres',r.tablename);end loop;
      for r in select p.oid::regprocedure::text identity from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' loop execute 'alter function '||r.identity||' owner to postgres';end loop;
    end $$;`);
  const result=sql(assertions);
  sql(readFileSync('supabase/tests/standalone_release_notices_archive.integration.sql','utf8'));
  if(!result.includes('Standalone release notice assertions passed'))throw Error('Missing SQL assertions');
  const publish=actor=>new Promise((resolve,reject)=>{
    const child=spawn('docker',['exec','-i',container,'psql','-h','127.0.0.1','-X','-qAt','-U','sigap_fixture_root','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],{stdio:['pipe','pipe','pipe']});
    let output='',error='';child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{error+=chunk;});child.on('error',reject);
    child.on('close',code=>resolve({code,output,error}));
    child.stdin.end(`begin;select set_config('request.jwt.claim.sub',release_test_id(${actor})::text,true);set local role authenticated;
      select public.update_release_notice('publish',0,'Perbaikan: Publikasi bersamaan');select pg_sleep(0.1);commit;`);
  });
  const results=await Promise.all([publish(1),publish(2)]);
  if(results.filter(result=>result.code===0).length!==1||results.filter(result=>result.code!==0&&result.error.includes('40001')).length!==1)throw Error('Concurrent publication did not have exactly one winner');
  sql("select release_check((select count(*)=1 from release_notice_events),'exactly one publication audit');select release_check((select revision=1 from release_notice_state),'one canonical publication');");
  console.log('Standalone release notices: real PostgreSQL authorization, replay-safe migration, drafts, atomic publication, immutable history, expiry, withdrawal, dismissal and two-connection concurrency passed.');
} finally {if(created)run(['rm','--force',container]);}
