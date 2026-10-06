import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// No URL/env override: this harness can only reach its own disposable container.
if (process.argv.length !== 2) {
  throw new Error("Usage: node scripts/test-work-calendar-bootstrap-sql.mjs");
}
const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n").trimEnd();
const bootstrap = read("supabase/migrations/20261006110000_work_calendar_bootstrap.sql");
const carryover = read("supabase/migrations/20261006080000_work_calendar_carryover_deadlines.sql");
const notificationScope = read("supabase/migrations/20261006120000_work_calendar_notification_scope.sql");
const baselineFiles = [
  "20260915072607_work_calendar_entries.sql",
  "20260915093000_work_calendar_team_members.sql",
  "20260916170000_work_calendar_team_overview.sql",
  "20260916171000_work_calendar_team_overview_scale.sql",
  "20260917120000_work_calendar_lifecycle.sql",
  "20260918090000_work_calendar_holidays.sql",
  "20260918120000_work_calendar_notifications.sql"
];
const baseline = baselineFiles.map((name, index) => {
  const body = read("supabase/migrations/" + name);
  let expected = body;
  if (name === "20260918120000_work_calendar_notifications.sql") {
    // ONLY this exact canonical index predicate may differ in the bootstrap.
    const original = "create unique index if not exists uq_notifications_work_calendar_dedupe\n" +
      "    on public.notifications ((data->>'dedupe_key'))\n" +
      "    where data ? 'dedupe_key';";
    if (body.split(original).length !== 2) throw new Error("Canonical F7 index anchor changed.");
    expected = body.replace(original, original.replace("where data ? 'dedupe_key';",
      "where data ? 'dedupe_key' and starts_with(data->>'dedupe_key', 'work-calendar:');"));
  }
  const tag = "$cal03_" + (index + 1) + "$";
  const embedded = bootstrap.split("    execute " + tag + "\n")[1]?.split("\n" + tag + ";")[0];
  if (embedded !== expected) throw new Error("Canonical embedded body mismatch: " + name);
  return body;
}).join("\n\n");
if (/\\i(?:r)?\s|alter\s+publication|supabase_migrations\s*\./i.test(bootstrap.replace(/^--.*$/gm, ""))) {
  throw new Error("Bootstrap must be standalone without publication/ledger writes.");
}
const integration = read("supabase/tests/work_calendar_bootstrap.integration.sql");
const carryoverTests = read("supabase/tests/work_calendar_carryover_deadlines.integration.sql");
const notificationScopeTests = read("supabase/tests/work_calendar_notification_scope.integration.sql");

const prelude = `
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


-- Production uses an enum role, while the historic runner uses text.
create type public.user_role as enum ('user', 'admin');
alter table public.profiles alter column role drop default;
alter table public.profiles alter column role type public.user_role using role::public.user_role;
alter table public.profiles alter column role set default 'user'::public.user_role;

-- Production-like shared table. Broad existing ACLs are intentional: RLS,
-- not privilege removal, isolates existing business notification records.
create table public.notifications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id),
 type text not null default 'info',
 title text not null,
 message text not null,
 data jsonb,
 is_read boolean not null default false,
 created_at timestamptz not null default now(),
 link text,
 read_at timestamptz
);
alter table public.notifications enable row level security;
alter table public.notifications force row level security;
grant select, insert, update, delete on public.notifications to anon, authenticated, service_role;
create policy business_notifications_select on public.notifications for select to authenticated
 using (user_id = (select auth.uid()));
create policy business_notifications_update on public.notifications for update to authenticated
 using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy business_notifications_delete on public.notifications for delete to authenticated
 using (user_id = (select auth.uid()));
-- Preserve broad ACLs on profiles too; its existing RLS remains canonical.
grant select, insert, update, delete on public.profiles to anon, authenticated, service_role;
grant select on public.master_offices, public.master_departments to anon, service_role;
insert into public.profiles (id, full_name) values
 ('466c0000-0000-4000-8000-000000000001', 'Shared business owner'),
 ('466c0000-0000-4000-8000-000000000002', 'Shared business other');
insert into public.notifications (id, user_id, title, message, is_read, read_at, data) values
 ('466c0000-0000-4000-8001-000000000001', '466c0000-0000-4000-8000-000000000001',
  'Existing business notification', 'Retain shared business data', true, now() - interval '1 day',
  '{"category":"business","dedupe_key":"business:existing"}'),
 ('466c0000-0000-4000-8001-000000000002', '466c0000-0000-4000-8000-000000000002',
  'Other business notification', 'Retain unread state', false, null, '{"category":"business"}'),
 ('466c0000-0000-4000-8001-000000000003', '466c0000-0000-4000-8000-000000000001',
  'Null key is not a duplicate', 'Postgres unique indexes permit null values', false, null,
  '{"dedupe_key":null}'),
 ('466c0000-0000-4000-8001-000000000004', '466c0000-0000-4000-8000-000000000002',
  'Second null key', 'Do not reject SQL-null dedupe keys', false, null, '{"dedupe_key":null}');
create publication supabase_realtime for table public.notifications, public.agendas;
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations values
 ('20260701000000', array['existing actual deployment'], 'existing_business_migration');
`;

const preservationFixtures = `
insert into public.work_calendar_entries (id, owner_id, work_date, title, due_date) values
 ('466c0000-0000-4000-8002-000000000001', '466c0000-0000-4000-8000-000000000001',
  (now() at time zone 'Asia/Jakarta')::date - 10, 'Carry without implicit deadline', null),
 ('466c0000-0000-4000-8002-000000000002', '466c0000-0000-4000-8000-000000000002',
  (now() at time zone 'Asia/Jakarta')::date - 10, 'Explicit deadline retained',
  (now() at time zone 'Asia/Jakarta')::date - 2);
update public.work_calendar_entries set status = 'in_progress'
 where id = '466c0000-0000-4000-8002-000000000001';
insert into public.holidays (holiday_date, name) values (date '2098-12-28', 'Existing holiday');
`;

const duplicateBusinessFixtures = `
insert into public.notifications (user_id, title, message, data) values
 ('466c0000-0000-4000-8000-000000000002', 'Duplicate unrelated business key',
  'Calendar must not impose global dedupe semantics', '{"dedupe_key":"business:existing"}');
`;

// Snapshots include ALL public/auth functions, not just the five replacements.
// Row and metadata snapshots survive separate psql calls in the same database.
const snapshot = `
create table public.bootstrap_test_functions_before as
 select p.oid, to_jsonb(p) as catalog, pg_get_functiondef(p.oid) as definition
 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public', 'auth') and p.prokind = 'f';
create table public.bootstrap_test_tables_before as
 select oid, relowner, relacl, relrowsecurity, relforcerowsecurity
 from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
   and relname not like 'bootstrap_test_%';
create table public.bootstrap_test_columns_before as
 select a.attrelid, a.attnum, a.attacl
 from pg_attribute a join public.bootstrap_test_tables_before b on b.oid = a.attrelid
 where a.attnum > 0 and not a.attisdropped;
create table public.bootstrap_test_policies_before as
 select * from pg_policy where polrelid in (select oid from public.bootstrap_test_tables_before);
create table public.bootstrap_test_triggers_before as
 select t.oid, to_jsonb(t) as catalog
 from pg_trigger t where tgrelid in (select oid from public.bootstrap_test_tables_before);
create table public.bootstrap_test_defaults_before as select * from pg_default_acl;
create table public.bootstrap_test_constraints_before as
 select c.* from pg_constraint c where conrelid in (select oid from public.bootstrap_test_tables_before);
create table public.bootstrap_test_indexes_before as
 select i.*, pg_get_indexdef(i.indexrelid) as definition from pg_index i
 where indrelid in (select oid from public.bootstrap_test_tables_before);
create table public.bootstrap_test_publication_before as select * from pg_publication;
create table public.bootstrap_test_publication_tables_before as select * from pg_publication_rel;
create table public.bootstrap_test_ledger_before as select * from supabase_migrations.schema_migrations;
create table public.bootstrap_test_data_before (table_oid oid primary key, rows jsonb not null);
do $snapshot$
declare r record;
begin
 for r in select b.oid from public.bootstrap_test_tables_before b loop
   execute format('insert into public.bootstrap_test_data_before select %s, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), ''[]''::jsonb) from %s t',
     r.oid, r.oid::regclass);
 end loop;
end $snapshot$;
`;

const assertPreserved = (exact = false, allowCarryover = false) => `
do $preservation$
declare r record; v_rows jsonb;
begin
 if exists (select 1 from public.bootstrap_test_functions_before b
     left join pg_proc a on a.oid = b.oid
     where ${allowCarryover ? `case when a.proname in (
       'list_work_calendar_team_entries', 'list_work_calendar_team_overview',
       'list_work_calendar_member_entries', 'get_work_calendar_dashboard_entries',
       'generate_work_calendar_notifications') then
         (to_jsonb(a) - 'prosrc') is distinct from (b.catalog - 'prosrc')
       else to_jsonb(a) is distinct from b.catalog
         or pg_get_functiondef(a.oid) is distinct from b.definition end` : `to_jsonb(a) is distinct from b.catalog
       or pg_get_functiondef(a.oid) is distinct from b.definition`})
 then raise exception 'Bootstrap changed an existing function definition/owner/ACL/config'; end if;
 if exists (select 1 from public.bootstrap_test_tables_before b
     left join pg_class a on a.oid = b.oid
     where row(a.relowner, a.relacl, a.relrowsecurity, a.relforcerowsecurity)
       is distinct from row(b.relowner, b.relacl, b.relrowsecurity, b.relforcerowsecurity))
 then raise exception 'Bootstrap changed existing table ownership/ACL/RLS'; end if;
 if exists (select 1 from public.bootstrap_test_columns_before b
     left join pg_attribute a on a.attrelid = b.attrelid and a.attnum = b.attnum
     where a.attrelid is null or a.attacl is distinct from b.attacl)
 then raise exception 'Bootstrap changed existing column ACL'; end if;
 if exists (
   (select * from pg_policy where polrelid in (select oid from public.bootstrap_test_tables_before)
    except select * from public.bootstrap_test_policies_before)
   union all (select * from public.bootstrap_test_policies_before except select * from pg_policy)
 ) or exists (select 1 from public.bootstrap_test_triggers_before b
     left join pg_trigger a on a.oid = b.oid where to_jsonb(a) is distinct from b.catalog)
 then raise exception 'Bootstrap changed existing policies/triggers'; end if;
 if exists (
   (select c.* from pg_constraint c where conrelid in (select oid from public.bootstrap_test_tables_before)
    except select * from public.bootstrap_test_constraints_before)
   union all (select * from public.bootstrap_test_constraints_before except select * from pg_constraint)
 ) or exists (select 1 from public.bootstrap_test_indexes_before b
     left join pg_index a on a.indexrelid = b.indexrelid
     where to_jsonb(a) is distinct from (to_jsonb(b) - 'definition')
       or pg_get_indexdef(a.indexrelid) is distinct from b.definition)
 then raise exception 'Bootstrap changed existing constraints/index definitions'; end if;
 if exists (
   (select * from pg_default_acl except select * from public.bootstrap_test_defaults_before)
   union all (select * from public.bootstrap_test_defaults_before except select * from pg_default_acl)
 ) or exists (
   (select * from pg_publication except select * from public.bootstrap_test_publication_before)
   union all (select * from public.bootstrap_test_publication_before except select * from pg_publication)
 ) or exists (
   (select * from pg_publication_rel except select * from public.bootstrap_test_publication_tables_before)
   union all (select * from public.bootstrap_test_publication_tables_before except select * from pg_publication_rel)
 ) or exists (
   (select * from supabase_migrations.schema_migrations except select * from public.bootstrap_test_ledger_before)
   union all (select * from public.bootstrap_test_ledger_before except select * from supabase_migrations.schema_migrations)
 ) then raise exception 'Bootstrap changed default ACL/publication/migration ledger'; end if;
 for r in select * from public.bootstrap_test_data_before loop
   execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), ''[]''::jsonb) from %s t',
     r.table_oid::regclass) into v_rows;
   if v_rows is distinct from r.rows then raise exception 'Bootstrap wrote stored business data'; end if;
 end loop;
 ${exact ? `
 if exists (
   select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'auth') and p.prokind = 'f'
   except select oid from public.bootstrap_test_functions_before
 ) or exists (
   select oid from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
     and relname not like 'bootstrap_test_%'
   except select oid from public.bootstrap_test_tables_before
 ) then raise exception 'Bootstrap replay/failure added functions/tables'; end if;
 if exists (select to_jsonb(i) from pg_index i where indrelid in (select oid from public.bootstrap_test_tables_before)
     except select to_jsonb(b) - 'definition'
       from public.bootstrap_test_indexes_before b)
 then raise exception 'Bootstrap replay/failure added an index'; end if;
 ` : ""}
end $preservation$;
`;

const clearSnapshot = `
drop table public.bootstrap_test_functions_before, public.bootstrap_test_tables_before,
 public.bootstrap_test_columns_before, public.bootstrap_test_policies_before,
 public.bootstrap_test_triggers_before, public.bootstrap_test_defaults_before,
 public.bootstrap_test_constraints_before, public.bootstrap_test_indexes_before,
 public.bootstrap_test_publication_before, public.bootstrap_test_publication_tables_before,
 public.bootstrap_test_ledger_before, public.bootstrap_test_data_before;
`;

const run = (args, input = "") => {
  const result = spawnSync("docker", args, {
    input, encoding: "utf8", timeout: 180_000, maxBuffer: 32 * 1024 * 1024, cwd: root,
  });
  if (result.error) throw new Error("Disposable Docker command failed: " + result.error.message);
  if (result.status !== 0) throw new Error("Disposable PostgreSQL command failed:\n" + result.stderr + result.stdout);
  return result.stdout;
};

const id = run([
  "run", "-d", "--label", "sigap.disposable-test=work-calendar-bootstrap",
  "-e", "POSTGRES_PASSWORD=test", "postgres:17-alpine", "-c", "wal_level=logical",
]).trim();
let databaseNumber = 0;
const sqlArgs = (database) => [
  "exec", "-i", id, "psql", "-X", "-h", "127.0.0.1", "-v", "ON_ERROR_STOP=1",
  "-U", "postgres", "-d", database,
];
const sql = (database, text) => run(sqlArgs(database), text);
const database = () => {
  const name = "calendar_bootstrap_" + (++databaseNumber);
  sql("postgres", "create database " + name + ";");
  sql(name, prelude);
  return name;
};
const marked = (database, text, marker) => {
  const output = sql(database, text);
  if (!output.includes(marker)) throw new Error("Missing SQL assertion marker: " + marker);
};
const integrationMarker = "CAL-04 work calendar bootstrap integration: all assertions passed";
const carryoverMarker = "CAL-03 carryover deadlines integration: all assertions passed";
const scopeMarker = "CAL-04 notification scope integration: all assertions passed";
let failures = 0;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
    const result = spawnSync("docker", [
      "exec", id, "psql", "-X", "-h", "127.0.0.1", "-U", "postgres", "-Atqc", "select 1",
    ], { encoding: "utf8", timeout: 10_000 });
    ready = result.status === 0 && result.stdout.trim() === "1";
    if (!ready) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready.");

  const fresh = database();
  sql(fresh, duplicateBusinessFixtures + snapshot + bootstrap + assertPreserved());
  sql(fresh, clearSnapshot + preservationFixtures + snapshot);
  // Baseline replay must also be no-op with nonempty tasks/events/holidays.
  sql(fresh, bootstrap + assertPreserved(true));
  sql(fresh, clearSnapshot + snapshot + carryover + assertPreserved(true, true) + clearSnapshot);
  sql(fresh, notificationScope);
  marked(fresh, integration, integrationMarker);
  marked(fresh, carryoverTests, carryoverMarker);
  marked(fresh, notificationScopeTests, scopeMarker);
  sql(fresh, snapshot + bootstrap + bootstrap + assertPreserved(true));
  process.stdout.write("PASS fresh production-like: bootstrap -> exact carryover -> notification scope; RPC/RLS; replay; duplicate business keys retained\n");

  const staging = database();
  sql(staging, baseline + carryover + preservationFixtures + `
    -- A newer deployed definition must not be overwritten by historic bodies.
    do $staging$
    begin
      execute replace(pg_get_functiondef('public.get_work_calendar_dashboard_entries(uuid,date)'::regprocedure),
        E'begin\\n', E'begin\\n-- staging carryover preservation marker\\n');
      if position('staging carryover preservation marker' in
          pg_get_functiondef('public.get_work_calendar_dashboard_entries(uuid,date)'::regprocedure)) = 0 then
        raise exception 'Staging preservation fixture was not installed';
      end if;
    end $staging$;
  ` + snapshot + bootstrap + bootstrap + assertPreserved(true));
  // First prove the bootstrap retained staging's global index/carryover bodies.
  // Only the explicitly ordered final overlay is allowed to change that index.
  sql(staging, clearSnapshot + notificationScope + duplicateBusinessFixtures + snapshot + bootstrap + bootstrap + assertPreserved(true));
  marked(staging, integration, integrationMarker);
  marked(staging, carryoverTests, carryoverMarker);
  marked(staging, notificationScopeTests, scopeMarker);
  process.stdout.write("PASS initialized staging: ALL function definitions/ACL/RLS/policies/data/publication/ledger unchanged\n");

  const indexed = database();
  sql(indexed, `
    create unique index uq_notifications_work_calendar_dedupe
      on public.notifications ((data->>'dedupe_key'))
      where data ? 'dedupe_key' and starts_with(data->>'dedupe_key', 'work-calendar:');
    create index idx_notifications_work_calendar_category
      on public.notifications ((data->>'category'), created_at desc) where data ? 'category';
    create index idx_profiles_parent_id on public.profiles(parent_id) where deleted_at is null;
  ` + duplicateBusinessFixtures + snapshot + bootstrap + assertPreserved() + clearSnapshot + carryover + notificationScope);
  marked(indexed, integration, integrationMarker);
  marked(indexed, notificationScopeTests, scopeMarker);
  process.stdout.write("PASS fresh with existing canonical shared indexes: definitions and shared business data retained\n");

  const unsafeOverlay = database();
  sql(unsafeOverlay, baseline + carryover + preservationFixtures + `
    drop index public.uq_notifications_work_calendar_dedupe;
    create unique index uq_notifications_work_calendar_dedupe on public.notifications(id);
    do $overlay_fixture$
    begin
      if not exists (select 1 from pg_index
          where indexrelid = 'public.uq_notifications_work_calendar_dedupe'::regclass
            and indisunique and indexprs is null and indpred is null) then
        raise exception 'Overlay NULL expression/predicate fixture was not installed';
      end if;
    end $overlay_fixture$;
  ` + snapshot);
  const overlayRejected = spawnSync("docker", sqlArgs(unsafeOverlay), {
    input: notificationScope, encoding: "utf8", timeout: 180_000, maxBuffer: 32 * 1024 * 1024,
  });
  if (overlayRejected.error || overlayRejected.status === 0 || !overlayRejected.stderr.includes(
    "CAL-04: notification dedupe index differs from reviewed baseline",
  )) {
    throw new Error("Overlay did not reject NULL index expression/predicate:\n" + overlayRejected.stderr);
  }
  // Includes the original index OID, full pg_index catalog and exact definition.
  sql(unsafeOverlay, assertPreserved(true));
  failures += 1;
  process.stdout.write("PASS fail-closed: notification overlay NULL expression/predicate unique index (original index and all state unchanged)\n");

  const rejects = [
    ["missing profiles", "drop table public.profiles cascade;", "missing/unsafe dependency profiles"],
    ["missing offices", "drop table public.master_offices cascade;", "missing/unsafe dependency master_offices"],
    ["missing departments", "drop table public.master_departments cascade;", "missing/unsafe dependency master_departments"],
    ["missing notifications", "drop table public.notifications cascade;", "missing/unsafe dependency notifications"],
    ["missing audit", "drop function public.audit_log_table_changes();", "missing/unsafe auth"],
    ["wrong audit return", "drop function public.audit_log_table_changes(); create function public.audit_log_table_changes() returns boolean language sql as $$ select true $$;", "missing/unsafe auth"],
    ["missing auth uid", "drop function auth.uid() cascade;", "missing/unsafe auth"],
    ["unsafe profile shape", "alter table public.profiles drop column is_active;", "unsafe dependency column"],
    ["notifications RLS disabled", "alter table public.notifications disable row level security;", "unsafe notifications shape/RLS"],
    ["notifications wrong data type", "alter table public.notifications alter column data type text using data::text;", "unsafe dependency column"],
    ["notifications missing column", "alter table public.notifications drop column read_at;", "unsafe dependency column"],
    ["notifications missing default", "alter table public.notifications alter column id drop default;", "unsafe notifications shape/RLS"],
    ["notifications missing primary key", "alter table public.notifications drop constraint notifications_pkey;", "unsafe notifications shape/RLS"],
    ["notifications nullable user", "alter table public.notifications alter column user_id drop not null;", "unsafe notifications shape/RLS"],
    ["notifications extra mandatory field", "alter table public.notifications add column unsafe_required text not null default 'x'; alter table public.notifications alter column unsafe_required drop default;", "unsafe notifications shape/RLS"],
    ["duplicate calendar dedupe across owners", `
      insert into public.notifications (user_id, title, message, data) values
       ('466c0000-0000-4000-8000-000000000001', 'Duplicate calendar', 'Must fail closed',
        '{"dedupe_key":"work-calendar:duplicate-test"}'),
       ('466c0000-0000-4000-8000-000000000002', 'Duplicate', 'Must fail closed',
        '{"dedupe_key":"work-calendar:duplicate-test"}');`, "duplicate notification dedupe keys"],
    ["unsafe named dedupe index", "create index uq_notifications_work_calendar_dedupe on public.notifications(user_id);", "unsafe existing notification index"],
    ["global index on absent Calendar catalog", "create unique index uq_notifications_work_calendar_dedupe on public.notifications ((data->>'dedupe_key')) where data ? 'dedupe_key';", "unsafe existing notification index"],
    ["unsafe named category index", "create index idx_notifications_work_calendar_category on public.notifications ((data->>'category'), user_id) where data ? 'category';", "unsafe existing notification index"],
    ["partial entries table", "create table public.work_calendar_entries (id uuid);", "partial Calendar state"],
    ["partial events table", "create table public.work_calendar_events (id uuid);", "partial Calendar state"],
    ["partial holidays table", "create table public.holidays (id uuid);", "partial Calendar state"],
    ["orphan Calendar RPC", "create function public.has_work_calendar_team_members() returns boolean language sql as $$ select false $$;", "partial Calendar state"],
    ["partial initialized RPC", baseline + "drop function public.get_work_calendar_work_settings();", "partial Calendar state"],
    ["partial initialized column", baseline + "alter table public.work_calendar_entries drop column due_date;", "partial Calendar column state"],
    ["partial initialized policy", baseline + "drop policy work_calendar_events_select on public.work_calendar_events;", "partial Calendar security state"],
    ["partial initialized trigger", baseline + "drop trigger trg_work_calendar_entries_log_event on public.work_calendar_entries;", "partial Calendar security state"],
    ["partial initialized constraint", baseline + "alter table public.work_calendar_entries drop constraint work_calendar_entries_status_check;", "partial Calendar constraint/index state"],
    ["partial initialized index", baseline + "drop index public.uq_notifications_work_calendar_dedupe;", "partial Calendar constraint/index state"],
  ];
  for (const [name, mutate, expected] of rejects) {
    const target = database();
    sql(target, mutate + snapshot);
    const result = spawnSync("docker", sqlArgs(target), {
      input: bootstrap, encoding: "utf8", timeout: 180_000, maxBuffer: 32 * 1024 * 1024,
    });
    if (result.error || result.status === 0 || !result.stderr.includes("CAL-04 bootstrap: " + expected)) {
      throw new Error("Fail-closed case did not reject correctly: " + name + "\n" + result.stderr);
    }
    sql(target, assertPreserved(true));
    failures += 1;
    process.stdout.write("PASS fail-closed: " + name + " (no changes)\n");
  }
  process.stdout.write("CAL-04 work calendar bootstrap SQL harness: all assertions passed (" + failures + " fail-closed cases)\n");
} finally {
  const removed = spawnSync("docker", ["rm", "-f", id], { encoding: "utf8", timeout: 30_000 });
  if (removed.error || removed.status !== 0) throw new Error("Disposable PostgreSQL cleanup failed.");
}
