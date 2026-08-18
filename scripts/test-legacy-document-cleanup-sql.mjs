import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const migration = readFileSync(
  "supabase/migrations/20260818140000_retire_legacy_document_templates.sql",
  "utf8",
);

const fixture = `
create table public.master_forms(
  id uuid primary key,
  nama_form text not null,
  input_schema jsonb not null default '[]'::jsonb,
  link_form text,
  unit_config jsonb,
  signature_layout jsonb
);
create table public.form_usages(
  id uuid primary key,
  form_id uuid not null references public.master_forms(id),
  usage_name text not null
);
create table public.surat_signatures(
  id uuid primary key,
  signature_position_snapshot jsonb
);
create table public.master_form_presets(
  id uuid primary key,
  input_schema jsonb,
  form_config jsonb
);
create table public.document_template_builders(
  id uuid primary key,
  active_version_id uuid
);
create table public.document_template_builder_versions(
  id uuid primary key,
  builder_id uuid not null references public.document_template_builders(id)
);
alter table public.document_template_builders
  add constraint document_template_builders_active_version_fk
  foreign key (active_version_id) references public.document_template_builder_versions(id);

insert into public.master_forms(id, nama_form, input_schema, link_form, unit_config, signature_layout)
values (
  '10000000-0000-4000-8000-000000000001',
  'Form native',
  '[{"key":"asset_name","label":"Nama Barang","type":"text","required":true,"cell":"B2","fontSize":11}]',
  'templates/legacy.xlsx',
  '{"sheet":"Unit"}',
  '{"sheet":"Form","range":"A1:D8"}'
);
insert into public.form_usages(id, form_id, usage_name)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Permohonan Aset');
insert into public.master_form_presets(id, input_schema, form_config)
values (
  '30000000-0000-4000-8000-000000000001',
  '[{"key":"asset_name","cell":"B2"}]',
  '{"link_form":"templates/legacy.xlsx","unit_config":{},"signature_layout":{}}'
);

${migration}

do $$
declare
  v_schema jsonb;
begin
  select input_schema into v_schema
  from public.master_forms
  where id = '10000000-0000-4000-8000-000000000001';

  if v_schema <> '[{"key":"asset_name","label":"Nama Barang","type":"text","required":true}]'::jsonb then
    raise exception 'native input schema was not preserved: %', v_schema;
  end if;
  if not exists (select 1 from public.form_usages where usage_name = 'Permohonan Aset') then
    raise exception 'form usage was removed';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'master_forms'
      and column_name in ('link_form', 'unit_config', 'signature_layout')
  ) then
    raise exception 'legacy master form columns still exist';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'surat_signatures'
      and column_name = 'signature_position_snapshot'
  ) then
    raise exception 'legacy signature position column still exists';
  end if;
  if to_regclass('public.master_form_presets') is not null
    or to_regclass('public.document_template_builders') is not null
    or to_regclass('public.document_template_builder_versions') is not null then
    raise exception 'legacy template tables still exist';
  end if;
end;
$$;

select 'ALL LEGACY DOCUMENT CLEANUP SQL TESTS PASSED' as result;
`;

const run = (args, input = "") => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 120_000 });
  if (result.status !== 0) {
    throw new Error(`${result.stderr || ""}\n${result.stdout || ""}`.trim() || "Docker command failed");
  }
  return result.stdout;
};

const containerId = run(["run", "-d", "-e", "POSTGRES_PASSWORD=test", "postgres:17-alpine"]).trim();
try {
  let ready = false;
  for (let attempt = 0; attempt < 30 && !ready; attempt += 1) {
    ready = spawnSync("docker", ["exec", containerId, "pg_isready", "-U", "postgres"], { encoding: "utf8" }).status === 0;
    if (!ready) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready");
  process.stdout.write(run([
    "exec", "-i", containerId, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1",
  ], fixture));
} finally {
  run(["rm", "-f", containerId]);
}
