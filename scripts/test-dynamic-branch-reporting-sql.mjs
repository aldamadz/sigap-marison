import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

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
const preserveKost = read("supabase/migrations/20261008150000_dynamic_branch_reporting_preserve_kost.sql");
const officerFallback = read("supabase/migrations/20261008160000_dynamic_branch_reporting_officer_fallback.sql");
const audit = read("supabase/migrations/20260604145000_ignore_seen_fields_in_audit_logs.sql");
const fixture = `
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;
create table public.master_offices(id uuid primary key, kedudukan text, parent_id uuid references public.master_offices(id));
create table public.profiles(id uuid primary key, job_title text, office_id uuid references public.master_offices(id),
  department_id uuid, parent_id uuid references public.profiles(id), role text default 'user', is_active boolean default true,
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
create type public.activity_action as enum ('INSERT','UPDATE','DELETE');
create table public.activity_logs(user_id uuid,action public.activity_action,table_name text,record_id text,old_values jsonb,new_values jsonb);
create function public.audit_log_redact_payload(payload jsonb) returns jsonb language sql as $$select payload$$;
${audit}
create trigger trg_audit_profiles after insert or update or delete on public.profiles
  for each row execute function public.audit_log_table_changes();
insert into public.master_offices(id,kedudukan) values
 ('00000000-0000-4000-8000-000000000098','Pusat'),('00000000-0000-4000-8000-000000000099','Kost');
insert into public.profiles(id,job_title,office_id,parent_id) values
 ('10000000-0000-4000-8000-000000000098','Supervisor Operasional Kost','00000000-0000-4000-8000-000000000098',null),
 ('10000000-0000-4000-8000-000000000099','Penjaga Kost','00000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000098');
${migration}
-- A former branch employee has prior branch audit history before moving to Kost.
insert into public.master_offices(id,kedudukan) values ('00000000-0000-4000-8000-000000000097','KC');
insert into public.profiles(id,job_title,office_id,parent_id) values
 ('10000000-0000-4000-8000-000000000096','Staff','00000000-0000-4000-8000-000000000098','10000000-0000-4000-8000-000000000098');
update public.profiles set office_id='00000000-0000-4000-8000-000000000097' where id='10000000-0000-4000-8000-000000000096';
update public.profiles set office_id='00000000-0000-4000-8000-000000000099' where id='10000000-0000-4000-8000-000000000096';
${preserveKost}
do $$begin if (select parent_id from public.profiles where id='10000000-0000-4000-8000-000000000099')
  is distinct from '10000000-0000-4000-8000-000000000098'::uuid then raise exception 'configured Kost parent not preserved'; end if;
  if (select reporting_is_automatic from public.profiles where id='10000000-0000-4000-8000-000000000099') then
    raise exception 'Kost treated as branch'; end if;
  if (select parent_id from public.profiles where id='10000000-0000-4000-8000-000000000096') is not null then
    raise exception 'transferred branch employee received ancient parent'; end if; end$$;
${read("supabase/tests/dynamic_branch_reporting.integration.sql")}
`;
const execute = (command, args, input = "", options = {}) => {
  const result = spawnSync(command, args, { input, encoding: "utf8", timeout: 120000, windowsHide: true, ...options });
  if (result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout || `${command} exited ${result.status}`);
  return result.stdout;
};
const run = (args, input = "") => execute("docker", ["--context", "default", ...args], input);
// Opt in to an installed PostgreSQL binary directory when local Docker is unavailable.
const nativeBin = process.env.DYNAMIC_BRANCH_REPORTING_PG_BIN;
const nativeCommand = name => join(nativeBin, process.platform === "win32" ? `${name}.exe` : name);
const freePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.on("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const port = server.address().port;
    server.close(error => error ? reject(error) : resolve(port));
  });
});
let container;
let nativeDirectory;
let psql;
const psqlCommand = nativeBin ? nativeCommand("psql") : "docker";
const sql = input => execute(psqlCommand, psql, input);
const concurrent = sql => new Promise((resolve, reject) => {
  const child = spawn(psqlCommand, psql, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  child.on("error", reject);
  child.on("close", code => code === 0 ? resolve(output) : reject(new Error(output)));
  child.stdin.end(sql);
});
try {
  if (nativeBin) {
    nativeDirectory = mkdtempSync(join(tmpdir(), "sigap-branch-reporting-pg-"));
    const data = join(nativeDirectory, "data");
    const port = await freePort();
    execute(nativeCommand("initdb"), ["-D", data, "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--no-locale"]);
    execute(nativeCommand("pg_ctl"), ["-D", data, "-l", join(nativeDirectory, "postgres.log"), "-w", "start", "-o", `-h 127.0.0.1 -p ${port}`], "", { stdio: "ignore" });
    psql = ["-X", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
  } else {
    const endpoint = execute("docker", ["context", "inspect", "default", "--format", "{{.Endpoints.docker.Host}}"]);
    if (!/^(npipe|unix):/.test(endpoint.trim())) throw new Error("Tests require a local Docker endpoint");
    container = run(["run", "--network=none", "-d", "-e", "POSTGRES_PASSWORD=test", "postgres:17-alpine"]).trim();
    psql = ["--context", "default", "exec", "-i", container, "psql", "-X", "-h", "127.0.0.1", "-U", "postgres", "-v", "ON_ERROR_STOP=1"];
    let ready = false;
    for (let n = 0; n < 40 && !ready; n += 1) {
      ready = spawnSync("docker", ["--context", "default", "exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], { encoding: "utf8", windowsHide: true }).status === 0;
      if (!ready) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
    if (!ready) throw new Error("Disposable PostgreSQL not ready");
  }
  process.stdout.write(sql(fixture));
  process.stdout.write("Prior BM-only SQL assertions: PASS (before officer fallback migration).\n");
  process.stdout.write(sql(officerFallback));
  let fallbackFailure;
  try {
    process.stdout.write(sql(read("supabase/tests/dynamic_branch_reporting_fallback.integration.sql")));
  } catch (error) {
    // The separate psql session rolls back its fixture transaction even on failure.
    fallbackFailure = error;
    process.stderr.write(`${error.message}\n`);
  }
  // A second BM arrives while an office transfer is in flight: neither can retain stale access.
  await Promise.all([
    concurrent(`begin; update public.profiles set office_id='00000000-0000-4000-8000-000000000003'
      where id='10000000-0000-4000-8000-000000000005'; select pg_sleep(0.3); commit;`),
    concurrent(`begin; insert into public.profiles(id,job_title,office_id) values
      ('10000000-0000-4000-8000-000000000008','BM','00000000-0000-4000-8000-000000000003'); commit;`),
  ]);
  sql(`do $$begin if (select parent_id from public.profiles where id='10000000-0000-4000-8000-000000000005')
    is not null then raise exception 'concurrent second BM left stale parent'; end if; end$$;`);
  process.stdout.write("Concurrent BM/transfer: fail-closed; SQL assertions passed.\n");
  sql(`
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
  sql(`
    create table public.test_reporting_before_reapply as
      select id,parent_id,reporting_is_automatic from public.profiles;
    create table public.test_reporting_audit_before_reapply as
      select count(*) as total from public.profile_reporting_events;
  `);
  sql(preserveKost);
  sql(officerFallback);
  sql(`do $$begin
    if exists(select 1 from public.test_reporting_before_reapply b full join public.profiles p using(id)
      where b.id is null or p.id is null or (p.parent_id,p.reporting_is_automatic)
        is distinct from(b.parent_id,b.reporting_is_automatic)) then
      raise exception 'migration reapply changed profile reporting state'; end if;
    if (select count(*) from public.profile_reporting_events)
      <> (select total from public.test_reporting_audit_before_reapply) then
      raise exception 'migration reapply changed reporting audit history'; end if;
  end$$;`);
  process.stdout.write("Migration reapply: PASS.\n");
  if (fallbackFailure) throw fallbackFailure;
} finally {
  if (container) run(["rm", "-f", container]);
  if (nativeDirectory && existsSync(join(nativeDirectory, "data", "postmaster.pid"))) {
    execute(nativeCommand("pg_ctl"), ["-D", join(nativeDirectory, "data"), "-w", "stop", "-m", "immediate"]);
  }
  if (nativeDirectory) {
    const target = resolve(nativeDirectory);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("sigap-branch-reporting-pg-")) {
      throw new Error("Refusing cleanup outside disposable PostgreSQL directory");
    }
    rmSync(target, { recursive: true, force: true });
  }
}
