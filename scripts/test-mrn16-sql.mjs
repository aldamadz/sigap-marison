import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const migration = readFileSync("supabase/migrations/20260731100000_marison_outbound_payload_mappings.sql", "utf8");
const auditActionFixMigration = readFileSync("supabase/migrations/20260731145000_fix_marison_payload_mapping_audit_action.sql", "utf8");
const externalIdentityReadinessMigration = readFileSync("supabase/migrations/20260731170000_mrn16_external_identity_readiness.sql", "utf8");
const sql = `
create extension if not exists pgcrypto;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create table public.profiles (
  id uuid primary key, role text not null, is_active boolean not null default true, deleted_at timestamptz,
  full_name text, nik text, marison_employee_id bigint, marison_synced_at timestamptz, marison_review_required boolean not null default false
);
create table public.master_offices (
  id uuid primary key, name text, code text, kedudukan text, marison_branch_id bigint, marison_synced_at timestamptz, marison_review_required boolean not null default false
);
create table public.master_projects (
  id uuid primary key, name text, code text, office_id uuid references public.master_offices(id), marison_project_id bigint, marison_synced_at timestamptz, marison_review_required boolean not null default false
);
create type public.activity_action as enum ('CREATE', 'INSERT', 'UPDATE', 'DELETE');
create table public.activity_logs (id uuid default gen_random_uuid(), user_id uuid, action public.activity_action, table_name text, record_id text, old_values jsonb, new_values jsonb);
create or replace function public.is_current_user_admin() returns boolean language sql as $$ select false $$;
create or replace function public.mask_marison_override_nik(value text) returns text language sql immutable as $$ select case when value is null then null else left(value, 2) || '***' || right(value, 2) end $$;
insert into public.profiles(id, role, full_name, nik, marison_employee_id, marison_synced_at) values
 ('00000000-0000-0000-0000-000000000001', 'admin', 'Admin', 'ADMIN', 1, now()),
 ('00000000-0000-0000-0000-000000000002', 'user', 'User', 'TRIAL-001', null, null),
 ('00000000-0000-0000-0000-000000000003', 'user', 'Agung', 'A 114', 114, now()),
 ('00000000-0000-0000-0000-000000000004', 'user', 'Signer B', 'A 115', 115, now()),
 ('00000000-0000-0000-0000-000000000005', 'user', 'Trial Two', 'TRIAL-002', null, null),
 ('00000000-0000-0000-0000-000000000006', 'user', 'Inactive Mirror', 'A 116', 116, now());
insert into public.master_offices(id, name, code, kedudukan, marison_branch_id, marison_synced_at) values
 ('10000000-0000-0000-0000-000000000001', 'KC External', 'EXT', 'KC', 12, now()),
 ('10000000-0000-0000-0000-000000000002', 'KC Trial', 'TRIAL', 'KC', null, null),
 ('10000000-0000-0000-0000-000000000003', 'KC External B', 'EXT-B', 'KC', 13, now());
insert into public.master_projects(id, name, code, office_id, marison_project_id, marison_synced_at) values
 ('20000000-0000-0000-0000-000000000001', 'External Project', 'EXT-P', '10000000-0000-0000-0000-000000000001', 25, now()),
 ('20000000-0000-0000-0000-000000000002', 'Trial Project', 'TRIAL-P', '10000000-0000-0000-0000-000000000002', null, null),
 ('20000000-0000-0000-0000-000000000003', 'External Project B', 'EXT-P-B', '10000000-0000-0000-0000-000000000003', 26, now());
${migration}
${auditActionFixMigration}
${externalIdentityReadinessMigration}
update public.master_offices set marison_branch_id = 999, marison_synced_at = null where id = '10000000-0000-0000-0000-000000000002';
do $$ begin if public.marison_payload_effective_branch_id('10000000-0000-0000-0000-000000000002') is not null then raise exception 'stale source branch must fail closed without mapping'; end if; end $$;
update public.profiles set marison_review_required = true where id in ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004');
update public.master_offices set marison_review_required = true where id in ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003');
update public.master_projects set marison_review_required = true where id in ('20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003');
update public.profiles set is_active = false where id = '00000000-0000-0000-0000-000000000006';
do $$ begin if not public.marison_payload_profile_source_valid('00000000-0000-0000-0000-000000000003') or not public.marison_payload_office_source_valid('10000000-0000-0000-0000-000000000001') or not public.marison_payload_project_source_valid('20000000-0000-0000-0000-000000000001') then raise exception 'source-only external identity must ignore operational review'; end if; end $$;
do $$ begin raise notice 'create mapping A'; perform public.configure_marison_payload_mapping('00000000-0000-0000-0000-000000000001','staging','profile','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','map trial user'); end $$;
do $$ begin raise notice 'create mapping B'; perform public.configure_marison_payload_mapping('00000000-0000-0000-0000-000000000001','staging','profile','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000003','many to one'); end $$;
do $$ begin perform public.configure_marison_payload_mapping('00000000-0000-0000-0000-000000000002','staging','profile','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000003','non admin'); raise exception 'non-admin guard failed'; exception when others then if sqlerrm not like '%Active admin%' then raise; end if; end $$;
do $$ declare c int; begin select count(*) into c from public.marison_outbound_record_mappings where target_record_id = '00000000-0000-0000-0000-000000000003'; if c <> 2 then raise exception 'many-to-one failed'; end if; end $$;
do $$ begin perform public.configure_marison_payload_mapping('00000000-0000-0000-0000-000000000001','production','profile','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','production blocked'); raise exception 'production guard failed'; exception when others then if sqlerrm not like '%staging-only%' then raise; end if; end $$;
do $$ begin perform public.configure_marison_payload_mapping('00000000-0000-0000-0000-000000000001','staging','profile','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000009','missing target'); raise exception 'missing target guard failed'; exception when others then if sqlerrm not like '%Target mapping%' then raise; end if; end $$;
do $$ begin perform public.configure_marison_payload_mapping('00000000-0000-0000-0000-000000000001','staging','profile','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000006','inactive target'); raise exception 'inactive target guard failed'; exception when others then if sqlerrm not like '%Target mapping employee%' then raise; end if; end $$;
do $$ begin perform public.configure_marison_payload_mapping('00000000-0000-0000-0000-000000000001','staging','profile','00000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','wrong entity target'); raise exception 'wrong entity guard failed'; exception when others then if sqlerrm not like '%Target mapping%' then raise; end if; end $$;
do $$ begin perform public.configure_marison_payload_mapping('00000000-0000-0000-0000-000000000001','staging','profile','00000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000003','missing source'); raise exception 'missing source guard failed'; exception when others then if sqlerrm not like '%Source profile%' then raise; end if; end $$;
do $$ begin perform public.configure_marison_payload_mapping('00000000-0000-0000-0000-000000000001','staging','office','00000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000001','missing office source'); raise exception 'missing office guard failed'; exception when others then if sqlerrm not like '%Source office%' then raise; end if; end $$;
do $$ begin perform public.configure_marison_payload_mapping('00000000-0000-0000-0000-000000000001','staging','project','00000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000001','missing project source'); raise exception 'missing project guard failed'; exception when others then if sqlerrm not like '%Source project%' then raise; end if; end $$;
do $$ begin perform public.configure_marison_payload_mapping('00000000-0000-0000-0000-000000000001','staging','office','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','valid office mapping'); end $$;
do $$ begin perform public.configure_marison_payload_mapping('00000000-0000-0000-0000-000000000001','staging','project','20000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','valid project mapping'); end $$;
do $$ declare is_valid boolean; begin select mapping_valid into is_valid from public.get_marison_payload_mappings('00000000-0000-0000-0000-000000000001','staging') where entity_type = 'project' and record_id = '20000000-0000-0000-0000-000000000002'; if is_valid is not true then raise exception 'project mapping should initially be valid'; end if; end $$;
do $$ declare v timestamptz; begin select updated_at into v from public.marison_outbound_record_mappings where environment = 'staging' and entity_type = 'office' and record_id = '10000000-0000-0000-0000-000000000002'; perform public.configure_marison_payload_mapping('00000000-0000-0000-0000-000000000001','staging','office','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','change effective branch',v); end $$;
do $$ declare is_valid boolean; begin select mapping_valid into is_valid from public.get_marison_payload_mappings('00000000-0000-0000-0000-000000000001','staging') where entity_type = 'project' and record_id = '20000000-0000-0000-0000-000000000002'; if is_valid is not false then raise exception 'project mapping must become invalid after office mapping changes'; end if; end $$;
do $$ declare v timestamptz; begin select updated_at into v from public.marison_outbound_record_mappings where environment = 'staging' and entity_type = 'project' and record_id = '20000000-0000-0000-0000-000000000002'; perform public.configure_marison_payload_mapping('00000000-0000-0000-0000-000000000001','staging','project','20000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000003','align project to changed branch',v); end $$;
do $$ declare is_valid boolean; begin select mapping_valid into is_valid from public.get_marison_payload_mappings('00000000-0000-0000-0000-000000000001','staging') where entity_type = 'project' and record_id = '20000000-0000-0000-0000-000000000002'; if is_valid is not true then raise exception 'project mapping should be valid after remapping to effective branch'; end if; end $$;
do $$ declare r jsonb; v timestamptz; begin select updated_at into v from public.marison_outbound_record_mappings where environment = 'staging' and entity_type = 'profile' and record_id = '00000000-0000-0000-0000-000000000002'; raise notice 'reset version=%', v; select public.configure_marison_payload_mapping(p_actor_id => '00000000-0000-0000-0000-000000000001', p_environment => 'staging', p_entity_type => 'profile', p_record_id => '00000000-0000-0000-0000-000000000002', p_target_record_id => null, p_reason => 'reset', p_expected_updated_at => v) into r; if not (r->>'deleted')::boolean then raise exception 'reset failed'; end if; end $$;
do $$ begin perform public.configure_marison_payload_mapping('00000000-0000-0000-0000-000000000001','staging','profile','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000003','stale','2000-01-01'); raise exception 'stale guard failed'; exception when others then if sqlstate <> '40001' then raise; end if; end $$;
do $$ declare c int; begin select count(*) into c from public.activity_logs where table_name = 'marison_outbound_record_mappings' and old_values is not null and new_values is not null; if c < 1 then raise exception 'audit before/after failed'; end if; end $$;
delete from public.profiles where id = '00000000-0000-0000-0000-000000000003';
do $$ declare c int; begin select count(*) into c from public.marison_outbound_record_mappings where target_record_id = '00000000-0000-0000-0000-000000000003'; if c <> 0 then raise exception 'target cleanup failed'; end if; end $$;
select 'MRN-16 SQL integration passed' as result;
`;

const run = (args, input = "") => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 120000 });
  if (result.status !== 0) throw new Error(`${result.stderr || ''}\n${result.stdout || ''}` || "Docker command failed");
  return result.stdout;
};

const id = run(["run", "-d", "-e", "POSTGRES_PASSWORD=test", "postgres:17-alpine" ]).trim();
try {
  let ready = false;
  for (let attempt = 0; attempt < 30 && !ready; attempt += 1) {
    const result = spawnSync("docker", ["exec", id, "pg_isready", "-U", "postgres"], { encoding: "utf8" });
    ready = result.status === 0;
    if (!ready) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready");
  process.stdout.write(run(["exec", "-i", id, "psql", "-U", "postgres", "-a", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"], sql));
} finally {
  run(["rm", "-f", id]);
}
