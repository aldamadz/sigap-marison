import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";

const read = path => readFileSync(path, "utf8");
const hardening = read("supabase/migrations/20260728110000_auth_07_privilege_escalation_hardening.sql");
const selfGuard = hardening.slice(
  hardening.indexOf("create or replace function public.enforce_profile_self_service_fields()"),
  hardening.indexOf("create or replace function public.handle_new_user()"),
);
if (!selfGuard.includes("create trigger enforce_profile_self_service_fields")) throw new Error("Canonical self-service guard missing");
const agendaPolicy = read("supabase/migrations/20260622171000_consolidate_core_rls_policies.sql");
const policy = agendaPolicy.slice(agendaPolicy.indexOf("create policy agendas_select_scope"), agendaPolicy.indexOf("create policy agendas_insert_own"));
const calendar = read("supabase/migrations/20260915093000_work_calendar_team_members.sql");
const calendarScope = calendar.slice(0, calendar.indexOf("-- Synchronize list_work_calendar_team_entries RPC"));
const migration = read("supabase/migrations/20261008140000_dynamic_branch_reporting.sql");
const fixture = `
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;
create table public.master_offices(id uuid primary key, kedudukan text, parent_id uuid references public.master_offices(id));
create table public.profiles(id uuid primary key, job_title text, office_id uuid references public.master_offices(id),
  parent_id uuid references public.profiles(id), role text default 'user', is_active boolean default true,
  deleted_at timestamptz, full_name text, phone text, avatar_url text, theme_preference text, updated_at timestamptz);
create function public.is_current_user_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and is_active is true and deleted_at is null) $$;
alter table public.profiles enable row level security;
grant select, update on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated using(deleted_at is null);
create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid() or public.is_current_user_admin());
${selfGuard}
create table public.agendas(id bigint primary key, created_by uuid);
alter table public.agendas enable row level security;
grant select on public.agendas to authenticated;
${policy}
create table public.work_calendar_entries(id bigint primary key, owner_id uuid);
alter table public.work_calendar_entries enable row level security;
grant select on public.work_calendar_entries to authenticated;
${calendarScope}
create table public.surat_signatures(id bigint primary key, snapshot jsonb);
${migration}
${read("supabase/tests/dynamic_branch_reporting.integration.sql")}
`;
const run = (args, input = "") => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 120000 });
  if (result.status !== 0) throw new Error(result.error?.message || `${result.stderr}\n${result.stdout}`);
  return result.stdout;
};
const container = run(["run", "-d", "-e", "POSTGRES_PASSWORD=test", "postgres:17-alpine"]).trim();
const psql = ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"];
const concurrent = sql => new Promise((resolve, reject) => {
  const child = spawn("docker", psql, { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  child.on("error", reject);
  child.on("close", code => code === 0 ? resolve(output) : reject(new Error(output)));
  child.stdin.end(sql);
});
try {
  let ready = false;
  for (let n = 0; n < 40 && !ready; n += 1) {
    ready = spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], { encoding: "utf8" }).status === 0;
    if (!ready) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  if (!ready) throw new Error("Disposable PostgreSQL not ready");
  process.stdout.write(run(psql, fixture));
  // A second BM arrives while an office transfer is in flight: neither can retain stale access.
  await Promise.all([
    concurrent(`begin; update public.profiles set office_id='00000000-0000-4000-8000-000000000003'
      where id='10000000-0000-4000-8000-000000000005'; select pg_sleep(0.3); commit;`),
    concurrent(`begin; insert into public.profiles(id,job_title,office_id) values
      ('10000000-0000-4000-8000-000000000008','BM','00000000-0000-4000-8000-000000000003'); commit;`),
  ]);
  run(psql, `do $$begin if (select parent_id from public.profiles where id='10000000-0000-4000-8000-000000000005')
    is not null then raise exception 'concurrent second BM left stale parent'; end if; end$$;`);
  process.stdout.write("Concurrent BM/transfer: fail-closed; SQL assertions passed.\n");
  run(psql, `
    alter function organization_internal.refresh_reporting(uuid[]) rename to refresh_reporting_test_original;
    create table public.test_reporting_refresh_calls(id bigint generated always as identity);
    create function organization_internal.refresh_reporting(p_offices uuid[] default null) returns void
      language plpgsql security definer set search_path='' as $$begin
        insert into public.test_reporting_refresh_calls default values;
        perform organization_internal.refresh_reporting_test_original(p_offices);
      end$$;
    do $$begin for i in 1..300 loop
      insert into public.profiles(id,job_title,office_id,parent_id) values
        ('10000000-0000-4000-8000-000000000005','Supervisor Marketing','00000000-0000-4000-8000-000000000003',null)
      on conflict(id) do update set job_title=excluded.job_title,office_id=excluded.office_id,parent_id=excluded.parent_id;
    end loop; end$$;
    do $$begin if (select count(*) from public.test_reporting_refresh_calls)<>0 then
      raise exception 'unchanged sync upsert reconciled organization'; end if; end$$;
  `);
  process.stdout.write("300 unchanged employee sync upserts: zero reconciliations.\n");
  // Applying the migration again must preserve the final state and existing audit history.
  run(psql, migration);
  process.stdout.write("Migration reapply: PASS.\n");
} finally {
  run(["rm", "-f", container]);
}
