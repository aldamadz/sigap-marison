import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const migrationsDir = "supabase/migrations";
const migrationFileName = readdirSync(migrationsDir).find((name) =>
  name.endsWith("work_calendar_entries.sql"),
);
if (!migrationFileName) {
  throw new Error("Could not find work_calendar_entries migration file.");
}

const migration = readFileSync(join(migrationsDir, migrationFileName), "utf8");
const assertions = readFileSync(
  "supabase/tests/work_calendar_entries.integration.sql",
  "utf8",
);

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

create table if not exists public.profiles (
  id uuid primary key,
  email text,
  full_name text,
  role text not null default 'user',
  parent_id uuid references public.profiles(id),
  deleted_at timestamptz null
);
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

-- Apply migration
${migration}

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

  if (!output.includes("CAL-03 work calendar integration: all assertions passed")) {
    throw new Error("SQL runner did not see the success marker.\n" + output);
  }
  process.stdout.write(output);
} finally {
  spawnSync("docker", ["rm", "-f", id], { encoding: "utf8" });
}
