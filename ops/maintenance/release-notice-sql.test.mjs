import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const run=(args,input)=>{
  const result=spawnSync('docker',args,{input,encoding:'utf8',timeout:120000});
  assert.equal(result.status,0,result.stderr+'\n'+result.stdout);return result.stdout;
};
test('release dismissal uses actual account RLS, one bounded preference and no direct/anonymous writes',async()=>{
  const id=run(['run','-d','--label','sigap.disposable-test=release-notice','-e','POSTGRES_PASSWORD=test','postgres:17-alpine']).trim();
  try {
    let ready=false;
    for(let i=0;i<60;i++){
      const result=spawnSync('docker',['exec',id,'psql','-h','127.0.0.1','-U','postgres','-Atqc','select 1'],{encoding:'utf8'});
      if(result.status===0 && result.stdout.trim()==='1'){ready=true;break;}
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    assert(ready,'PostgreSQL readiness');
    const migration=readFileSync('supabase/migrations/20261105061000_release_notice_preferences.sql','utf8');
    const sql=`create role anon;create role authenticated;create role service_role;
      create schema auth;grant usage on schema auth to authenticated,anon;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.profiles(id uuid primary key,is_active boolean default true,deleted_at timestamptz);
      insert into profiles(id) values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
      ${migration}\n${migration}
      begin;
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
      set local role authenticated;
      select public.dismiss_release_notice('00000000-0000-4000-8000-000000000101');
      select public.dismiss_release_notice('00000000-0000-4000-8000-000000000101');
      select public.dismiss_release_notice('00000000-0000-4000-8000-000000000102');
      do $$begin
       if (select count(*) from public.release_notice_preferences)<>1 then raise exception 'Unbounded account rows';end if;
       if (select dismissed_release_id from public.release_notice_preferences)<>'00000000-0000-4000-8000-000000000102'::uuid then raise exception 'Preference did not update';end if;
       begin update public.release_notice_preferences set user_id='00000000-0000-4000-8000-000000000002';raise exception 'Direct write accepted';exception when insufficient_privilege then null;end;
      end$$;
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
      do $$begin if exists(select 1 from public.release_notice_preferences) then raise exception 'Foreign preference leak';end if;end$$;
      select public.dismiss_release_notice('00000000-0000-4000-8000-000000000101');
      reset role;
      update profiles set is_active=false where id='00000000-0000-4000-8000-000000000002';
      set local role authenticated;
      do $$begin
       begin perform public.dismiss_release_notice('00000000-0000-4000-8000-000000000103');raise exception 'Inactive actor accepted';exception when insufficient_privilege then null;end;
      end$$;
      reset role;set local role anon;
      do $$begin
       begin perform public.dismiss_release_notice('00000000-0000-4000-8000-000000000103');raise exception 'Anonymous accepted';exception when insufficient_privilege then null;end;
       begin perform * from public.release_notice_preferences;raise exception 'Anonymous table read';exception when insufficient_privilege then null;end;
      end$$;
      reset role;rollback;
      select 'OPS18 dismissal RLS passed';`;
    assert.match(run(['exec','-i',id,'psql','-h','127.0.0.1','-U','postgres','-v','ON_ERROR_STOP=1'],sql),/OPS18 dismissal RLS passed/);
  } finally {run(['rm','-f',id]);}
});
