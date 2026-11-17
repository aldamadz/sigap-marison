import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const run = (args, input) => {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 120000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
};
const id = run(['run', '-d', '--name', `sigap-entities-test-${randomUUID()}`,
  '-e', 'POSTGRES_PASSWORD=disposable-test-only', '-e', 'POSTGRES_USER=sigap_fixture_root',
  '--health-cmd', 'pg_isready -U sigap_fixture_root', '--health-interval', '1s',
  '--health-retries', '30', 'postgres:17-alpine']);
const psql = ['exec', '-i', id, 'psql', '-X', '-U', 'sigap_fixture_root', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
const read = path => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
try {
  let healthy = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (run(['inspect', '--format', '{{.State.Health.Status}}', id]) === 'healthy') { healthy = true; break; }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!healthy) throw new Error('Disposable database did not become healthy');
  run(psql, `
    create role authenticated; create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to authenticated,anon;
    create table public.profiles(id uuid primary key,role text,is_active boolean,deleted_at timestamptz);
    alter table public.profiles enable row level security;
    create policy own_profile_read on public.profiles for select to authenticated using(id=(select auth.uid()));
    grant select on public.profiles to authenticated;
    create table public.master_entities(id uuid primary key default gen_random_uuid(),name text not null,code text not null);
    alter table public.master_entities enable row level security;
    create policy "Allow authenticated read access" on public.master_entities for select to authenticated using(true);
    grant select,insert,update,delete on public.master_entities to authenticated;
    create function public.test_assert(ok boolean,message text) returns void language plpgsql as
      $$begin if ok is distinct from true then raise exception 'Assertion failed: %',message;end if;end$$;
    insert into public.profiles values
      ('10100000-0000-4000-8000-000000000001','admin',true,null),
      ('10100000-0000-4000-8000-000000000002','user',true,null),
      ('10100000-0000-4000-8000-000000000003','admin',false,null),
      ('10100000-0000-4000-8000-000000000004','admin',true,now()),
      ('10100000-0000-4000-8000-000000000005','admin',null,null),
      ('10100000-0000-4000-8000-000000000006','manager',true,null);
    insert into public.master_entities values('10100000-0000-4000-8000-000000000010','Existing entity','KEEP');
  `);
  const preserved = `select jsonb_build_object(
    'rows',(select jsonb_agg(to_jsonb(e) order by id) from public.master_entities e),
    'acl',(select relacl::text from pg_class where oid='public.master_entities'::regclass),
    'read',(select jsonb_agg(jsonb_build_object('name',polname,'roles',polroles,'qual',pg_get_expr(polqual,polrelid)))
      from pg_policy where polrelid='public.master_entities'::regclass and polcmd='r'))`;
  const before = run(psql, preserved);
  if (!process.argv.includes('--before')) {
    const migration = read('supabase/migrations/20261117130000_master_entities_admin_writes.sql');
    run(psql, migration + '\n' + migration);
  }
  run(psql, read('supabase/tests/master_entities_admin_writes.integration.sql'));
  assert.equal(run(psql, preserved), before, 'Replay/tests changed data, read policy or table grants');
  console.log('Master entities: active-admin CRUD, six denied profile classes, metadata spoof, role revocation, anon, RLS and existing data passed.');
} finally {
  run(['rm', '-f', id]);
}
