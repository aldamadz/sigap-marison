import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const migration = readFileSync(
  "supabase/migrations/20260818120000_native_document_pdf_cache_invalidation.sql",
  "utf8",
);

const fixture = `
create schema auth;
create role anon;
create role authenticated;
create role service_role;
create function auth.uid() returns uuid language sql stable set search_path = '' as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.profiles(
  id uuid primary key,
  is_active boolean not null default true
);
create table public.surat_registrasi(
  id uuid primary key,
  created_by uuid references public.profiles(id),
  no_surat text,
  judul_surat text,
  status text,
  current_step integer,
  file_path text,
  pdf_path text,
  updated_at timestamptz default now()
);
create table public.surat_signatures(
  id uuid primary key,
  surat_id uuid references public.surat_registrasi(id),
  user_id uuid references public.profiles(id),
  step_order integer,
  is_signed boolean default false,
  signed_at timestamptz,
  catatan text,
  file_path_snap text,
  pdf_path_snap text,
  status text,
  verification_required boolean default false,
  verification_status text default 'not_required',
  available_at timestamptz
);
create table public.surat_linked_documents(
  id uuid primary key,
  child_surat_id uuid,
  link_type text,
  status text
);
create table public.notifications(
  id bigint generated always as identity primary key,
  user_id uuid,
  type text,
  title text,
  message text,
  data jsonb,
  link text
);
grant select on public.surat_registrasi, public.surat_signatures to authenticated;

${migration}

begin;
insert into public.profiles(id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003');
insert into public.surat_registrasi(
  id, created_by, no_surat, judul_surat, status, current_step, file_path, pdf_path
) values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'DOC-NATIVE-001',
  'Native document test',
  'PROSES',
  1,
  'native://document/old',
  'https://storage.test/stale.pdf'
);
insert into public.surat_signatures(
  id, surat_id, user_id, step_order, pdf_path_snap
) values
  ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,'https://storage.test/stale-step.pdf'),
  ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',2,null),
  ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003',3,null);

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);

do $$
begin
  begin
    perform public.handle_approve_surat_v2(
      '30000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      null,
      'legacy.xlsx'
    );
    raise exception 'legacy XLSX source was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  perform public.handle_approve_surat_v2(
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'approved',
    'native://document/20000000-0000-4000-8000-000000000001/approval/1'
  );

  if not exists (
    select 1 from public.surat_registrasi
    where id = '20000000-0000-4000-8000-000000000001'
      and status = 'PROSES'
      and current_step = 2
      and file_path like 'native://document/%'
      and pdf_path is null
  ) then
    raise exception 'document cache was not invalidated';
  end if;
  if not exists (
    select 1 from public.surat_signatures
    where id = '30000000-0000-4000-8000-000000000001'
      and is_signed
      and file_path_snap like 'native://document/%'
      and pdf_path_snap is null
  ) then
    raise exception 'signature cache was not invalidated';
  end if;
end;
$$;
rollback;
select 'ALL NATIVE DOCUMENT SQL TESTS PASSED' as result;
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
  let consecutiveReadyProbes = 0;
  for (let attempt = 0; attempt < 60 && consecutiveReadyProbes < 3; attempt += 1) {
    const probe = spawnSync(
      "docker",
      ["exec", containerId, "psql", "-h", "127.0.0.1", "-U", "postgres", "-Atqc", "select 1"],
      { encoding: "utf8" },
    );
    consecutiveReadyProbes = probe.status === 0 && probe.stdout.trim() === "1"
      ? consecutiveReadyProbes + 1
      : 0;
    if (consecutiveReadyProbes < 3) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
  }
  if (consecutiveReadyProbes < 3) {
    throw new Error("Disposable PostgreSQL did not become stably ready");
  }
  process.stdout.write(run([
    "exec", "-i", containerId, "psql", "-h", "127.0.0.1", "-U", "postgres", "-v", "ON_ERROR_STOP=1",
  ], fixture));
} finally {
  run(["rm", "-f", containerId]);
}
