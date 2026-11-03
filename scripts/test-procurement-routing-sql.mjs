import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = path => readFileSync(path, "utf8");
const run = (args, input = "") => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 120000 });
  if (result.status !== 0) throw Error(result.stderr || result.stdout || "Docker failed");
  return result.stdout;
};
const fixture = `
create schema extensions; create extension pgcrypto with schema extensions;
create role anon; create role authenticated; create role service_role;
create table public.profiles(id uuid primary key,role text,is_active boolean default true,deleted_at timestamptz);
create table public.master_forms(id uuid primary key,nomor_form text);
create table public.form_usages(id uuid primary key,form_id uuid references public.master_forms);
create table public.surat_registrasi(id uuid primary key,status text,form_usage_id uuid references public.form_usages,
  location_snapshot jsonb default '{}',data_snapshot jsonb default '{}',form_input_data jsonb default '{}');
create table public.surat_linked_documents(child_surat_id uuid,link_type text,status text);
create table public.notifications(id uuid default gen_random_uuid(),user_id uuid,type text,title text,message text,data jsonb,link text);
create function public.recommendation_all_items_rejected(uuid) returns boolean language sql as 'select false';
`;
const setup = `
alter table public.marison_outbound_dispatches add column payload_resolution_sources jsonb default '{}';
insert into public.marison_outbound_settings(singleton,environment,enabled) values(true,'staging',true);
insert into public.master_forms values
 ('00000000-0000-0000-0000-000000000001','FM-UAI.PGD-01-00'),
 ('00000000-0000-0000-0000-000000000002','FM-UAI.KEU-01-00'),
 ('00000000-0000-0000-0000-000000000003','FM-MBN.KEU-10-00');
insert into public.form_usages select id,id from public.master_forms;
insert into public.surat_registrasi(id,status,form_usage_id,form_input_data)
 select ('10000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'DONE',
 case when i<=4 then '00000000-0000-0000-0000-000000000001'::uuid
      when i=5 then '00000000-0000-0000-0000-000000000002'::uuid
      else '00000000-0000-0000-0000-000000000003'::uuid end,
 jsonb_build_object('request_category',case i when 1 then 'asset' when 2 then 'unit' when 3 then 'non_unit' else 'non_asset' end)
 from generate_series(1,7) i;
-- Pre-existing unsent KEU queue and previously posted evidence, created before the new boundary.
select public.ensure_marison_outbound_dispatch('10000000-0000-0000-0000-000000000005','staging');
select public.ensure_marison_outbound_dispatch('10000000-0000-0000-0000-000000000006','staging');
update public.marison_outbound_dispatches set status='failed_terminal',payload='{}',payload_body='{}',
 payload_hash=encode(extensions.digest('{}','sha256'),'hex'),payload_built_at=now(),contract_version='old',
 post_started_at=now(),last_attempt_at=now(),response='{"message":"rejected"}',error_code='marison_http_422'
 where surat_id='10000000-0000-0000-0000-000000000006';
create temp table old_posted as select to_jsonb(d) body from public.marison_outbound_dispatches d
 where surat_id='10000000-0000-0000-0000-000000000006';
`;
const id = run(["run", "-d", "--label", "sigap.test=procurement-routing", "-e", "POSTGRES_PASSWORD=test", "postgres:17-alpine"]).trim();
try {
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    ready = spawnSync("docker", ["exec", id, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], {encoding:"utf8"}).status === 0;
    if (!ready) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) throw Error("Disposable database did not start");
  const migration = read("supabase/migrations/20261103160000_procurement_pgd_only.sql");
  const sql = fixture + read("supabase/migrations/20260729103000_durable_marison_outbound_dispatch.sql")
    + read("supabase/migrations/20260803120000_marison_outbound_replacement_jobs.sql")
    + `alter table public.marison_outbound_dispatches add column payload_resolution_sources jsonb default '{}';`
    + read("supabase/migrations/20260811153000_fund_submission_outbound.sql")
    + setup.replace("alter table public.marison_outbound_dispatches add column payload_resolution_sources jsonb default '{}';", "")
    + migration + migration + read("supabase/tests/procurement_routing.integration.sql");
  process.stdout.write(run(["exec", "-i", id, "psql", "-h", "127.0.0.1", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], sql));
} finally {
  run(["rm", "-f", id]);
}
