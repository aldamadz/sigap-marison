import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const baseMigration = readFileSync("supabase/migrations/20260729103000_durable_marison_outbound_dispatch.sql", "utf8");
const replacementMigration = readFileSync("supabase/migrations/20260803120000_marison_outbound_replacement_jobs.sql", "utf8");

const fixtureSql = `
create extension if not exists pgcrypto;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

create table public.profiles (
  id uuid primary key,
  role text not null,
  is_active boolean not null default true,
  deleted_at timestamptz
);
create table public.surat_registrasi (
  id uuid primary key,
  status text not null,
  data_snapshot jsonb not null default '{}'::jsonb,
  form_input_data jsonb not null default '{}'::jsonb
);
create table public.surat_linked_documents (
  id uuid primary key default gen_random_uuid(),
  child_surat_id uuid not null references public.surat_registrasi(id),
  link_type text,
  status text
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  type text,
  title text,
  message text,
  data jsonb,
  link text
);
`;

const assertionsSql = `
insert into public.profiles(id, role) values
  ('00000000-0000-0000-0000-000000000001', 'admin'),
  ('00000000-0000-0000-0000-000000000002', 'user');
insert into public.marison_outbound_settings(singleton, environment, enabled)
values (true, 'staging', true);
insert into public.surat_registrasi(id, status, form_input_data) values
  ('10000000-0000-0000-0000-000000000001', 'SELESAI', '{"request_category":"unit"}'),
  ('10000000-0000-0000-0000-000000000002', 'SELESAI', '{"request_category":"unit"}'),
  ('10000000-0000-0000-0000-000000000003', 'SELESAI', '{"request_category":"unit"}');

do $$
declare v_id uuid;
begin
  v_id := public.ensure_marison_outbound_dispatch('10000000-0000-0000-0000-000000000001', 'staging');
  update public.marison_outbound_dispatches
  set status = 'failed_terminal', attempt_count = 1,
      contract_version = 'test', payload = '{}'::jsonb, payload_body = '{}',
      payload_hash = repeat('a', 64), payload_built_at = now(),
      post_started_at = now(), last_attempt_at = now(), completed_at = now(),
      error_code = 'marison_http_422', error_message = 'rejected'
  where id = v_id;
end $$;

do $$
declare v_old uuid; v_new uuid; v_ensure uuid; v_key text;
begin
  select id into v_old from public.marison_outbound_dispatches
  where surat_id = '10000000-0000-0000-0000-000000000001' and generation = 1;
  v_new := public.create_marison_outbound_replacement(v_old, '00000000-0000-0000-0000-000000000001', 'fix mapping');
  select idempotency_key into v_key from public.marison_outbound_dispatches where id = v_new;
  if v_key <> 'sigap:staging:unit:10000000-0000-0000-0000-000000000001:g2' then
    raise exception 'replacement idempotency key is not deterministic';
  end if;
  v_ensure := public.ensure_marison_outbound_dispatch('10000000-0000-0000-0000-000000000001', 'staging');
  if v_ensure <> v_new then raise exception 'ensure did not return latest generation'; end if;
  begin
    perform public.create_marison_outbound_replacement(v_old, '00000000-0000-0000-0000-000000000001', 'duplicate');
    raise exception 'duplicate replacement was accepted';
  exception when serialization_failure then null;
  end;
end $$;

do $$
declare v_parent uuid; v_child uuid;
begin
  select id into v_parent from public.marison_outbound_dispatches
  where surat_id = '10000000-0000-0000-0000-000000000001' and generation = 2;
  update public.marison_outbound_dispatches
  set status = 'failed_terminal', attempt_count = 1,
      contract_version = 'test', payload = '{}'::jsonb, payload_body = '{}',
      payload_hash = repeat('b', 64), payload_built_at = now(),
      post_started_at = now(), last_attempt_at = now(), completed_at = now(),
      error_code = 'marison_http_422', error_message = 'rejected again'
  where id = v_parent;
  v_child := public.create_marison_outbound_replacement(v_parent, '00000000-0000-0000-0000-000000000001', 'second correction');
  if not exists (
    select 1 from public.marison_outbound_dispatches
    where id = v_child and generation = 3 and replacement_of_dispatch_id = v_parent
  ) then raise exception 'replacement chain is invalid'; end if;
end $$;

do $$
declare v_id uuid;
begin
  v_id := public.ensure_marison_outbound_dispatch('10000000-0000-0000-0000-000000000002', 'staging');
  update public.marison_outbound_dispatches
  set status = 'failed_terminal', error_code = 'marison_http_422', completed_at = now()
  where id = v_id;
  begin
    perform public.create_marison_outbound_replacement(v_id, '00000000-0000-0000-0000-000000000001', 'must reject pre-post');
    raise exception 'pre-POST replacement was accepted';
  exception when sqlstate '55000' then null;
  end;
end $$;

do $$
declare v_id uuid;
begin
  select id into v_id from public.marison_outbound_dispatches
  where surat_id = '10000000-0000-0000-0000-000000000001' and generation = 1;
  begin
    perform public.create_marison_outbound_replacement(v_id, '00000000-0000-0000-0000-000000000002', 'non admin');
    raise exception 'non-admin replacement was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

do $$
declare v_count integer;
begin
  select count(*) into v_count from public.marison_outbound_dispatches
  where surat_id = '10000000-0000-0000-0000-000000000001';
  if v_count <> 3 then raise exception 'unexpected generation count: %', v_count; end if;
  select count(*) into v_count from public.marison_outbound_replacement_events
  where surat_id = '10000000-0000-0000-0000-000000000001';
  if v_count <> 2 then raise exception 'replacement audit is incomplete: %', v_count; end if;
end $$;

select 'Outbound replacement SQL integration passed' as result;
`;

const run = (args, input = "") => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 120000 });
  if (result.status !== 0) throw new Error(`${result.stderr || ""}\n${result.stdout || ""}`.trim() || "Docker command failed");
  return result.stdout;
};

const id = run(["run", "-d", "-e", "POSTGRES_PASSWORD=test", "postgres:17-alpine"]).trim();
try {
  let ready = false;
  for (let attempt = 0; attempt < 30 && !ready; attempt += 1) {
    ready = spawnSync("docker", ["exec", id, "pg_isready", "-U", "postgres"], { encoding: "utf8" }).status === 0;
    if (!ready) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready");
  process.stdout.write(run(
    ["exec", "-i", id, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"],
    fixtureSql + baseMigration + replacementMigration + assertionsSql
  ));
} finally {
  run(["rm", "-f", id]);
}
