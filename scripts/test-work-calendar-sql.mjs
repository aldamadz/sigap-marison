import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const migrationsDir = "supabase/migrations";
const carryoverMigration = "20261006080000_work_calendar_carryover_deadlines.sql";
const carryoverTest = "work_calendar_carryover_deadlines.integration.sql";
const mode = process.argv[2] ?? "--all";
if (!["--all", "--baseline", "--carryover"].includes(mode) || process.argv.length > 3) {
  throw new Error("Usage: node scripts/test-work-calendar-sql.mjs [--all|--baseline|--carryover]");
}

// Historic assertions and the new contract need separate disposable databases.
if (mode === "--all") {
  for (const suite of ["--baseline", "--carryover"]) {
    const result = spawnSync(process.execPath, [process.argv[1], suite], { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  process.exit(0);
}

const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.includes("work_calendar") && name.endsWith(".sql"))
  .filter((name) => !name.endsWith("_work_calendar_bootstrap.sql"))
  .filter((name) => !name.endsWith("_work_calendar_notification_scope.sql"))
  .filter((name) => mode !== "--baseline" || name !== carryoverMigration)
  .sort();

if (migrationFiles.length === 0) {
  throw new Error("Could not find work_calendar migration files.");
}

const migrations = migrationFiles
  .filter((file) => file !== carryoverMigration)
  .map((file) => readFileSync(join(migrationsDir, file), "utf8"))
  .join("\n\n");

const testsDir = "supabase/tests";
const testFiles = readdirSync(testsDir)
  .filter((name) => name.includes("work_calendar") && name.endsWith(".sql"))
  .filter((name) => name !== "work_calendar_bootstrap.integration.sql")
  .filter((name) => name !== "work_calendar_notification_scope.integration.sql")
  .filter((name) => mode === "--carryover" ? name === carryoverTest : mode !== "--baseline" || name !== carryoverTest)
  .sort();

const assertions = testFiles
  .map((file) => readFileSync(join(testsDir, file), "utf8"))
  .join("\n\n");

// Replacement/replay must preserve the existing RPC contracts and privileges.
const replacementContractSql = mode === "--baseline" ? "" : `
${mode !== "--carryover" ? "" : `
-- Non-empty preservation fixtures: applying/replaying definitions must not
-- reschedule a task, fill due_date, reset read state or manufacture events.
insert into public.profiles (id, full_name) values
  ('46699999-0000-4000-8000-000000000001', 'Migration preservation fixture');
insert into public.work_calendar_entries (id, owner_id, work_date, title, due_date) values
  ('46699999-0000-4000-8000-000000000002', '46699999-0000-4000-8000-000000000001',
   (now() at time zone 'Asia/Jakarta')::date - 10, 'No implicit deadline', null),
  ('46699999-0000-4000-8000-000000000003', '46699999-0000-4000-8000-000000000001',
   (now() at time zone 'Asia/Jakarta')::date - 10, 'Preserve explicit deadline',
   (now() at time zone 'Asia/Jakarta')::date - 3);
insert into public.notifications (user_id, title, message, is_read, read_at, data) values
  ('46699999-0000-4000-8000-000000000001', 'Preserve read state', 'Existing notification', true,
   now() - interval '1 day', '{"dedupe_key":"work-calendar:test-preservation"}');
`}
create temp table calendar_rpc_contract_before as
select oid, proowner, proacl, prosecdef, provolatile, proconfig,
       pg_get_function_arguments(oid) as arguments,
       pg_get_function_result(oid) as result
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'list_work_calendar_team_entries', 'list_work_calendar_team_overview',
    'list_work_calendar_member_entries', 'get_work_calendar_dashboard_entries',
    'generate_work_calendar_notifications'
  );
create temp table calendar_table_contract_before as
select oid, relacl, relrowsecurity, relforcerowsecurity
from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r';
create temp table calendar_policies_before as select * from pg_policy;
create temp table calendar_data_before as
select 'entries' as source, to_jsonb(e) as row from public.work_calendar_entries e
union all select 'events', to_jsonb(e) from public.work_calendar_events e
union all select 'notifications', to_jsonb(e) from public.notifications e
union all select 'activity_logs', to_jsonb(e) from public.activity_logs e
union all select 'agendas', to_jsonb(e) from public.agendas e;
${readFileSync(join(migrationsDir, carryoverMigration), "utf8")}
${readFileSync(join(migrationsDir, carryoverMigration), "utf8")}
do $$
begin
  if (select count(*) from calendar_rpc_contract_before) <> 5 or exists (
    select 1 from calendar_rpc_contract_before b
    left join pg_proc a on a.oid = b.oid
    where a.oid is null
       or row(a.proowner, a.proacl, a.prosecdef, a.provolatile, a.proconfig,
              pg_get_function_arguments(a.oid), pg_get_function_result(a.oid))
          is distinct from row(b.proowner, b.proacl, b.prosecdef, b.provolatile,
                               b.proconfig, b.arguments, b.result)
  ) then raise exception 'Carryover replacement changed an RPC contract/ACL'; end if;
  if exists (
    select 1 from calendar_table_contract_before b
    left join pg_class a on a.oid = b.oid
    where a.oid is null or row(a.relacl, a.relrowsecurity, a.relforcerowsecurity)
      is distinct from row(b.relacl, b.relrowsecurity, b.relforcerowsecurity)
  ) or exists (
    (select * from pg_policy except select * from calendar_policies_before)
    union all
    (select * from calendar_policies_before except select * from pg_policy)
  ) then raise exception 'Carryover replacement changed table ACL/RLS'; end if;
  if exists (
    with after_data as (
      select 'entries' as source, to_jsonb(e) as row from public.work_calendar_entries e
      union all select 'events', to_jsonb(e) from public.work_calendar_events e
      union all select 'notifications', to_jsonb(e) from public.notifications e
      union all select 'activity_logs', to_jsonb(e) from public.activity_logs e
      union all select 'agendas', to_jsonb(e) from public.agendas e
    )
    (select * from after_data except select * from calendar_data_before)
    union all
    (select * from calendar_data_before except select * from after_data)
  ) then raise exception 'Carryover replacement wrote stored data'; end if;
end $$;
select 'CAL-03 carryover replacement/replay contracts: all assertions passed';
`;

const baseSchemaSql = `
create extension if not exists pgcrypto;

do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

create schema if not exists auth;
grant usage on schema auth to authenticated, anon;
create or replace function auth.uid() returns uuid
  language sql stable set search_path = ''
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text
  language sql stable set search_path = ''
as $$ select current_setting('role', true) $$;
grant execute on function auth.uid() to authenticated, anon;
grant execute on function auth.role() to authenticated, anon;

-- Canonical organization master data. These mirror the staging schema shapes
-- used by CAL-03 F4A team overview: offices and departments are global master
-- data with authenticated read; departments have no office/entity parent.
create table if not exists public.master_offices (
  id uuid primary key,
  code text,
  name text not null,
  kedudukan text null,
  parent_id uuid null references public.master_offices(id)
);
grant select on public.master_offices to authenticated;

create table if not exists public.master_departments (
  id uuid primary key,
  name text not null,
  code text null,
  dept_index integer null
);
grant select on public.master_departments to authenticated;

create table if not exists public.profiles (
  id uuid primary key,
  email text,
  nik text,
  full_name text,
  job_title text,
  role text not null default 'user',
  parent_id uuid references public.profiles(id),
  office_id uuid null references public.master_offices(id),
  department_id uuid null references public.master_departments(id),
  deleted_at timestamptz null,
  is_active boolean null default true
);
alter table public.profiles alter column is_active drop not null;
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
  for select to authenticated
  using (deleted_at is null);
grant select on public.profiles to authenticated;

create type public.activity_action as enum ('INSERT', 'UPDATE', 'DELETE');

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action public.activity_action not null,
  table_name text not null,
  record_id text not null,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz default now()
);

create or replace function public.audit_log_redact_payload(payload jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_object_agg(key, case
    when key ~* '(password|secret|token|hmac|key)' then '"[REDACTED]"'::jsonb
    else value
  end), '{}'::jsonb)
  from jsonb_each(coalesce(payload, '{}'::jsonb));
$$;

create or replace function public.audit_log_table_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_record_id text;
  v_old_values jsonb;
  v_new_values jsonb;
  v_ignored_keys text[] := array['updated_at', 'created_at'];
begin
  if TG_TABLE_NAME = 'activity_logs' then
    if TG_OP = 'DELETE' then return old; else return new; end if;
  end if;

  if TG_OP = 'UPDATE' then
    v_old_values := public.audit_log_redact_payload(to_jsonb(old));
    v_new_values := public.audit_log_redact_payload(to_jsonb(new));

    if (v_old_values - v_ignored_keys) = (v_new_values - v_ignored_keys) then
      return new;
    end if;
  end if;

  v_record_id := coalesce((case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', '');

  insert into public.activity_logs (user_id, action, table_name, record_id, old_values, new_values)
  values (
    v_actor,
    case TG_OP
      when 'INSERT' then 'INSERT'::public.activity_action
      when 'UPDATE' then 'UPDATE'::public.activity_action
      when 'DELETE' then 'DELETE'::public.activity_action
    end,
    TG_TABLE_NAME,
    v_record_id,
    case
      when TG_OP = 'UPDATE' then v_old_values
      when TG_OP = 'DELETE' then public.audit_log_redact_payload(to_jsonb(old))
      else null
    end,
    case
      when TG_OP = 'UPDATE' then v_new_values
      when TG_OP = 'INSERT' then public.audit_log_redact_payload(to_jsonb(new))
      else null
    end
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Legacy agendas table to ensure zero modification
create table if not exists public.agendas (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz default now()
);
insert into public.agendas (id, title) values
  ('b0000000-0000-4000-8000-000000000001', 'Legacy Agenda 1');

-- Apply migrations
${migrations}

${replacementContractSql}

-- Run integration tests
${assertions}
`;

const run = (args, input = "") => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 180_000 });
  if (result.status !== 0) {
    throw new Error(
      `docker ${args.join(" ")} exited ${result.status}\n${result.stderr || ""}\n${result.stdout || ""}`,
    );
  }
  return result.stdout;
};

const id = run([
  "run", "-d",
  "--label", "sigap.disposable-test=work-calendar",
  "-e", "POSTGRES_PASSWORD=test",
  "postgres:17-alpine",
]).trim();

try {
  let ready = false;
  for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
    const probe = spawnSync(
      "docker",
      ["exec", id, "psql", "-h", "127.0.0.1", "-U", "postgres", "-Atqc", "select 1"],
      { encoding: "utf8" },
    );
    ready = probe.status === 0 && probe.stdout.trim() === "1";
    if (!ready) {
      const ms = 500;
      const sab = new SharedArrayBuffer(4);
      Atomics.wait(new Int32Array(sab), 0, 0, ms);
    }
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready.");
  const output = run([
    "exec", "-i", id,
    "psql", "-h", "127.0.0.1", "-v", "ON_ERROR_STOP=1", "-U", "postgres",
  ], baseSchemaSql);

  if (mode !== "--carryover" && (
    !output.includes("CAL-03 work calendar integration: all assertions passed") ||
    !output.includes("CAL-03 work calendar lifecycle integration: all assertions passed") ||
    !output.includes("CAL-03 work calendar holidays integration: all assertions passed") ||
    !output.includes("CAL-03 work calendar notifications integration: all assertions passed") ||
    !output.includes("CAL-03 team members integration: all assertions passed") ||
    !output.includes("CAL-03 team overview integration: all assertions passed") ||
    !output.includes("CAL-03 team overview scale integration: all assertions passed")
  )) {
    throw new Error("SQL runner did not see all success markers.\n" + output);
  }
  if (mode !== "--baseline" &&
      !output.includes("CAL-03 carryover deadlines integration: all assertions passed")) {
    throw new Error("SQL runner did not see the carryover success marker.\n" + output);
  }
  process.stdout.write(output);
} finally {
  spawnSync("docker", ["rm", "-f", id], { encoding: "utf8" });
}
