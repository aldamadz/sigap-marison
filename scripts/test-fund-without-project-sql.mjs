import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const migration = readFileSync(
  "supabase/migrations/20260820100000_fund_without_project.sql",
  "utf8",
);
const sql = `
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

create table public.marison_outbound_dispatches (
  id uuid primary key,
  status text not null,
  lease_token uuid,
  post_started_at timestamptz,
  payload_resolution_sources jsonb not null default '{}'::jsonb,
  kind text,
  endpoint text,
  contract_version text,
  payload jsonb,
  payload_body text,
  payload_hash text,
  updated_at timestamptz not null default clock_timestamp()
);

create or replace function public.prepare_marison_outbound_dispatch(
  p_job_id uuid, p_lease_token uuid, p_kind text, p_endpoint text,
  p_contract_version text, p_payload jsonb, p_payload_body text, p_payload_hash text
) returns void language plpgsql as $$
begin
  update public.marison_outbound_dispatches
  set kind = p_kind, endpoint = p_endpoint, contract_version = p_contract_version,
      payload = p_payload, payload_body = p_payload_body, payload_hash = p_payload_hash
  where id = p_job_id and lease_token = p_lease_token;
end;
$$;

${migration}

insert into public.marison_outbound_dispatches(id, status, lease_token) values
  ('10000000-0000-0000-0000-000000000001', 'processing', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', 'processing', '20000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003', 'processing', '20000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000004', 'processing', '20000000-0000-0000-0000-000000000004');

select * from public.prepare_marison_outbound_dispatch_with_sources(
  '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
  'fund', '/fund-submissions', 'test', '{"approvals":[]}', '{}', repeat('a', 64),
  '{}'
);

select * from public.prepare_marison_outbound_dispatch_with_sources(
  '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002',
  'fund', '/fund-submissions', 'test', '{"approvals":[]}', '{}', repeat('b', 64),
  '{"projectId":"external_source"}'
);

do $$
begin
  perform public.prepare_marison_outbound_dispatch_with_sources(
    '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003',
    'fund', '/fund-submissions', 'test', '{"approvals":[]}', '{}', repeat('c', 64),
    '{"projectId":"bogus"}'
  );
  raise exception 'fund with invalid projectId should fail';
exception when sqlstate '22023' then null;
end;
$$;

do $$
begin
  perform public.prepare_marison_outbound_dispatch_with_sources(
    '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000004',
    'unit', '/unit-submissions', 'test', '{"approvals":[]}', '{}', repeat('d', 64),
    '{"requesterNik":"external_source","branchId":"external_source"}'
  );
  raise exception 'unit with missing projectId should fail';
exception when sqlstate '22023' then null;
end;
$$;

select 'FUND-01 fund-without-project SQL passed' as result;
`;

const run = (args, input = "") => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 120_000 });
  if (result.status !== 0) throw new Error(`${result.stderr || ""}\n${result.stdout || ""}`);
  return result.stdout;
};

const id = run(["run", "-d", "-e", "POSTGRES_PASSWORD=test", "postgres:17-alpine"]).trim();
try {
  let ready = false;
  for (let attempt = 0; attempt < 30 && !ready; attempt += 1) {
    ready = spawnSync("docker", ["exec", id, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], { encoding: "utf8" }).status === 0;
    if (!ready) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready.");
  const output = run(["exec", "-i", id, "psql", "-h", "127.0.0.1", "-v", "ON_ERROR_STOP=1", "-U", "postgres"], sql);
  if (!output.includes("FUND-01 fund-without-project SQL passed")) throw new Error("SQL assertion result missing.");
  process.stdout.write(output);
} finally {
  spawnSync("docker", ["rm", "-f", id], { encoding: "utf8" });
}
