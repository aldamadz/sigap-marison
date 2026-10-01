import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";

const migration = readFileSync(
  "supabase/migrations/20260930150000_letter_number_reuse_policy.sql",
  "utf8",
);
const assertions = readFileSync(
  "supabase/tests/letter_number_reuse.integration.sql",
  "utf8",
);

// Minimal canonical schema: only the tables/columns/constraints the reuse
// migration and the assertion block touch. Mirrors the disposable-PostgreSQL
// pattern used by test-branch-asset-without-project-sql.mjs.
const sql = `
create extension if not exists pgcrypto;

do $$ begin create role anon;           exception when duplicate_object then null; end $$;
do $$ begin create role authenticated;  exception when duplicate_object then null; end $$;
do $$ begin create role service_role;   exception when duplicate_object then null; end $$;

create schema if not exists auth;
create or replace function auth.uid() returns uuid
  language sql stable set search_path = ''
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text
  language sql stable set search_path = ''
as $$ select current_user::text $$;

create table if not exists auth.users ( id uuid primary key );

create table if not exists public.master_entities (
  id uuid primary key, code text not null, name text
);
create table if not exists public.master_departments ( id uuid primary key );
create table if not exists public.master_offices ( id uuid primary key, kedudukan text not null );
create table if not exists public.master_projects ( id uuid primary key, office_id uuid );
create table if not exists public.master_letter_types ( id uuid primary key, name text not null, code text not null );
create table if not exists public.master_dept_letter_types (
  dept_id uuid not null references public.master_departments(id),
  letter_type_id uuid not null references public.master_letter_types(id),
  sort_index integer
);
create table if not exists public.profiles (
  id uuid primary key, role text not null, office_id uuid, department_id uuid,
  is_active boolean default true, deleted_at timestamptz
);
create table if not exists public.form_usages (
  id uuid primary key, form_id uuid, name text not null, request_category text not null,
  scope_type text not null default 'all', status text not null default 'active'
);
create table if not exists public.master_forms (
  id uuid primary key, nama_form text, nomor_form text
);
create table if not exists public.form_usage_steps (
  id uuid primary key,
  usage_id uuid not null references public.form_usages(id) on delete cascade
);
create table if not exists public.form_usage_departments (
  usage_id uuid not null references public.form_usages(id) on delete cascade,
  department_id uuid not null references public.master_departments(id) on delete cascade,
  primary key (usage_id, department_id)
);

-- Current letter_number_counter_configs shape (pusat/cabang/cabang_000).
create table if not exists public.letter_number_counter_configs (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null,
  entity_id uuid not null references public.master_entities(id),
  dept_id uuid references public.master_departments(id),
  project_id uuid references public.master_projects(id),
  office_id uuid references public.master_offices(id),
  year integer not null,
  start_from integer not null default 1,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid,
  constraint letter_number_counter_scope_check check (
    (scope_type = 'pusat'      and dept_id is not null and project_id is null and office_id is null) or
    (scope_type = 'cabang'     and project_id is not null and dept_id is null and office_id is null) or
    (scope_type = 'cabang_000' and office_id is not null and project_id is null and dept_id is null)
  )
);

-- surat_reservations current shape before this migration (office_id,
-- number_scope_type included).
create table if not exists public.surat_reservations (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.master_entities(id),
  type_id uuid references public.master_letter_types(id),
  office_id uuid references public.master_offices(id),
  project_id uuid references public.master_projects(id),
  dept_id uuid references public.master_departments(id),
  year integer not null,
  no_urut integer not null,
  status text not null default 'PENDING',
  reserved_by uuid,
  created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '30 minutes',
  number_scope_type text not null
);

-- surat_registration_drafts (real column set + UNIQUE reservation_id +
-- status check, matching production so create_surat_registration_draft and
-- void_surat_registration_draft behave identically).
create table if not exists public.surat_registration_drafts (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid,
  no_surat text,
  payload jsonb default '{}',
  signer_assignments jsonb default '[]',
  created_by uuid,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'SUBMITTED', 'VOID', 'EXPIRED')),
  expires_at timestamptz default now() + interval '7 days',
  voided_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint surat_registration_drafts_reservation_key unique (reservation_id)
);

-- surat_registrasi (real column set used by create_surat_registrasi).
create table if not exists public.surat_registrasi (
  id uuid primary key default gen_random_uuid(),
  no_surat text,
  entity_id uuid,
  office_id uuid,
  project_id uuid,
  dept_id uuid,
  letter_type_id uuid,
  penggunaan_id uuid,
  form_usage_id uuid,
  judul_surat text,
  file_path text,
  lampiran_path text,
  is_aset boolean default false,
  status text,
  current_step integer default 1,
  created_by uuid,
  requester_nik text,
  request_place text,
  request_date date,
  form_input_data jsonb default '{}',
  requester_snapshot jsonb default '{}',
  location_snapshot jsonb default '{}',
  pdf_path text,
  data_snapshot jsonb default '{}',
  policy_snapshot jsonb default '{}',
  represented_department_id uuid,
  represented_by_admin uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Real submit RPC (20260721143000), verbatim, so the integration exercises the
-- actual PENDING -> USED transition and validation.
create or replace function public.create_surat_registrasi(p_payload jsonb)
returns public.surat_registrasi
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_department_id uuid;
  v_legacy_workflow_id uuid := nullif(p_payload->>'penggunaan_id', '')::uuid;
  v_form_usage_id uuid := nullif(p_payload->>'form_usage_id', '')::uuid;
  v_request_category text := nullif(p_payload->'form_input_data'->>'request_category', '');
  v_usage_validation jsonb;
  v_requester_department_id uuid;
  v_letter_type_id uuid := nullif(p_payload->>'letter_type_id', '')::uuid;
  v_reservation_id uuid := nullif(p_payload->>'reservation_id', '')::uuid;
  v_draft_id uuid := nullif(p_payload->>'draft_id', '')::uuid;
  v_no_urut integer;
  v_reservation public.surat_reservations%rowtype;
  v_row public.surat_registrasi;
begin
  if v_actor is null then
    raise exception 'Sesi login tidak tersedia. Silakan login ulang.';
  end if;

  select profile.department_id
  into v_actor_department_id
  from public.profiles as profile
  where profile.id = v_actor
    and coalesce(profile.is_active, true) = true;

  if not found then
    raise exception 'Akun deaktif.';
  end if;

  if v_request_category not in ('asset', 'unit', 'non_unit', 'non_asset') then
    raise exception 'Klasifikasi dokumen tidak valid.';
  end if;

  if v_form_usage_id is not null then
    v_usage_validation := public.validate_form_usage_for_actor(
      v_form_usage_id,
      nullif(p_payload->>'dept_id', '')::uuid
    );

    if (v_usage_validation->>'request_category') is distinct from v_request_category then
      raise exception 'Klasifikasi dokumen tidak sesuai kegunaan form.';
    end if;
  elsif v_legacy_workflow_id is not null then
    if not exists (
      select 1
      from public.master_penggunaan_detail as workflow
      where workflow.id = v_legacy_workflow_id
        and workflow.request_categories @> array[v_request_category]::text[]
    ) then
      raise exception 'Matrix tidak mendukung klasifikasi dokumen yang dipilih.';
    end if;
  else
    raise exception 'Kegunaan form wajib dipilih.';
  end if;

  v_requester_department_id := case
    when v_form_usage_id is not null
      then nullif(v_usage_validation->>'requester_department_id', '')::uuid
    else nullif(p_payload->>'dept_id', '')::uuid
  end;

  if v_requester_department_id is null then
    raise exception 'Departemen pengaju wajib diisi.';
  end if;

  if v_letter_type_id is null then
    raise exception 'Jenis surat wajib diisi.';
  end if;

  if not exists (
    select 1
    from public.master_dept_letter_types as map
    where map.dept_id = v_requester_department_id
      and map.letter_type_id = v_letter_type_id
  ) then
    raise exception 'Jenis surat tidak tersedia untuk departemen pengaju.';
  end if;

  if v_reservation_id is not null then
    v_no_urut := nullif(split_part(coalesce(p_payload->>'no_surat', ''), '/', 1), '')::integer;
  elsif v_draft_id is not null then
    select draft.reservation_id
    into v_reservation_id
    from public.surat_registration_drafts as draft
    where draft.id = v_draft_id
      and draft.created_by = v_actor
      and draft.status = 'DRAFT';

    if v_reservation_id is null then
      raise exception 'Draft aktif tidak ditemukan.';
    end if;

    v_no_urut := nullif(split_part(coalesce(p_payload->>'no_surat', ''), '/', 1), '')::integer;
  end if;

  if v_reservation_id is not null then
    select reservation.*
    into v_reservation
    from public.surat_reservations as reservation
    where reservation.id = v_reservation_id
    for update;

    if not found then
      raise exception 'Reservasi nomor tidak ditemukan.';
    end if;

    if v_reservation.reserved_by is distinct from v_actor then
      raise exception 'User reservasi tidak sesuai dengan sesi login.';
    end if;

    if v_reservation.status <> 'PENDING' then
      raise exception 'Reservasi nomor sudah tidak aktif.';
    end if;

    if v_no_urut is null or v_reservation.no_urut <> v_no_urut then
      raise exception 'Nomor surat tidak sesuai dengan reservasi.';
    end if;

    if v_reservation.entity_id is distinct from nullif(p_payload->>'entity_id', '')::uuid
      or v_reservation.type_id is distinct from v_letter_type_id
      or v_reservation.office_id is distinct from nullif(p_payload->>'office_id', '')::uuid
      or (
        nullif(p_payload->>'project_id', '')::uuid is not null
        and v_reservation.project_id is distinct from nullif(p_payload->>'project_id', '')::uuid
      )
      or (
        v_reservation.dept_id is not null
        and v_reservation.dept_id is distinct from v_requester_department_id
      )
    then
      raise exception 'Data surat tidak sesuai dengan reservasi nomor.';
    end if;
  end if;

  insert into public.surat_registrasi (
    no_surat,
    entity_id,
    office_id,
    project_id,
    dept_id,
    letter_type_id,
    penggunaan_id,
    form_usage_id,
    judul_surat,
    file_path,
    lampiran_path,
    is_aset,
    status,
    current_step,
    created_by,
    requester_nik,
    request_place,
    request_date,
    form_input_data,
    requester_snapshot,
    location_snapshot,
    pdf_path,
    data_snapshot,
    policy_snapshot,
    represented_department_id,
    represented_by_admin
  )
  values (
    nullif(p_payload->>'no_surat', ''),
    nullif(p_payload->>'entity_id', '')::uuid,
    nullif(p_payload->>'office_id', '')::uuid,
    nullif(p_payload->>'project_id', '')::uuid,
    v_requester_department_id,
    v_letter_type_id,
    v_legacy_workflow_id,
    v_form_usage_id,
    coalesce(nullif(p_payload->>'judul_surat', ''), 'Tanpa Judul'),
    nullif(p_payload->>'file_path', ''),
    nullif(p_payload->>'lampiran_path', ''),
    coalesce(nullif(p_payload->>'is_aset', '')::boolean, false),
    coalesce(nullif(p_payload->>'status', ''), 'PROSES'),
    coalesce(nullif(p_payload->>'current_step', '')::integer, 1),
    v_actor,
    nullif(p_payload->>'requester_nik', ''),
    nullif(p_payload->>'request_place', ''),
    nullif(p_payload->>'request_date', '')::date,
    coalesce(p_payload->'form_input_data', '{}'::jsonb),
    coalesce(p_payload->'requester_snapshot', '{}'::jsonb),
    coalesce(p_payload->'location_snapshot', '{}'::jsonb),
    nullif(p_payload->>'pdf_path', ''),
    coalesce(p_payload->'data_snapshot', '{}'::jsonb),
    coalesce(p_payload->'policy_snapshot', '{}'::jsonb),
    coalesce(
      nullif(p_payload->>'represented_department_id', '')::uuid,
      nullif(v_usage_validation->>'requester_department_id', '')::uuid
    ),
    coalesce(
      nullif(p_payload->>'represented_by_admin', '')::uuid,
      nullif(v_usage_validation->>'represented_by_admin', '')::uuid
    )
  )
  returning * into v_row;

  if v_reservation_id is not null then
    update public.surat_reservations
    set status = 'USED'
    where id = v_reservation_id
      and reserved_by = v_actor
      and status = 'PENDING';
  end if;

  return v_row;
end;
$$;

revoke all on function public.create_surat_registrasi(jsonb) from public, anon;
grant execute on function public.create_surat_registrasi(jsonb) to authenticated, service_role;

set "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';

insert into public.master_entities (id, code, name) values
  ('a0000000-0000-4000-8000-000000000010', 'UAI', 'PT UAI');

insert into public.master_offices (id, kedudukan) values
  ('a0000000-0000-4000-8000-000000000030', 'Pusat'),
  ('a0000000-0000-4000-8000-000000000031', 'KC');

insert into public.master_departments (id) values
  ('a0000000-0000-4000-8000-000000000020');

insert into public.profiles (id, role, office_id, department_id, is_active) values
  ('10000000-0000-4000-8000-000000000001', 'user',   'a0000000-0000-4000-8000-000000000030', 'a0000000-0000-4000-8000-000000000020', true),
  ('20000000-0000-4000-8000-000000000002', 'user',   'a0000000-0000-4000-8000-000000000030', 'a0000000-0000-4000-8000-000000000020', true),
  ('30000000-0000-4000-8000-000000000003', 'admin',  'a0000000-0000-4000-8000-000000000030', 'a0000000-0000-4000-8000-000000000020', true);

insert into public.master_letter_types (id, name, code) values
  ('a0000000-0000-4000-8000-000000000050', 'Permohonan', 'MH');

insert into public.master_dept_letter_types (dept_id, letter_type_id, sort_index) values
  ('a0000000-0000-4000-8000-000000000020', 'a0000000-0000-4000-8000-000000000050', 1);

insert into auth.users (id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000003');

insert into public.letter_number_counter_configs
  (scope_type, entity_id, dept_id, year, start_from, is_active) values
  ('pusat', 'a0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000020', 2026, 1, true);

-- Usage context needed by the real submit RPC (create_surat_registrasi) and by
-- validate_form_usage_for_actor.
create table if not exists public.master_penggunaan_detail (
  id uuid primary key,
  request_categories text[]
);
insert into public.master_penggunaan_detail (id, request_categories) values
  ('a0000000-0000-4000-8000-000000000080', array['non_asset']);

create or replace function public.validate_form_usage_for_actor(
  p_usage_id uuid,
  p_requested_department_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $f$
declare
  v_actor uuid := auth.uid();
  v_profile public.profiles;
  v_usage public.form_usages;
  v_department_id uuid;
  v_step_count integer;
begin
  if v_actor is null then raise exception 'Sesi login tidak tersedia.'; end if;
  select * into v_profile from public.profiles
  where id = v_actor and coalesce(is_active, true) = true;
  if not found then raise exception 'Akun deaktif.'; end if;
  select * into v_usage from public.form_usages
  where id = p_usage_id and status = 'active';
  if not found then raise exception 'Kegunaan form tidak aktif atau tidak ditemukan.'; end if;
  if v_profile.role = 'admin' and p_requested_department_id is not null then
    v_department_id := p_requested_department_id;
  else
    v_department_id := v_profile.department_id;
  end if;
  if v_department_id is null then raise exception 'Departemen pengaju belum ditentukan.'; end if;
  if not exists (
    select 1 from public.form_usage_departments permission
    where permission.usage_id = v_usage.id and permission.department_id = v_department_id
  ) then raise exception 'Departemen tidak diizinkan memakai kegunaan form ini.'; end if;
  select count(*) into v_step_count from public.form_usage_steps where usage_id = v_usage.id;
  if v_step_count < 2 or v_step_count > 8 then
    raise exception 'Kegunaan form harus memiliki 2 sampai 8 tahap.';
  end if;
  return jsonb_build_object(
    'usage_id', v_usage.id,
    'form_id', v_usage.form_id,
    'request_category', v_usage.request_category,
    'requester_department_id', v_department_id,
    'represented_by_admin', null
  );
end;
$f$;

insert into public.form_usages (id, name, request_category, scope_type, status) values
  ('a0000000-0000-4000-8000-000000000064', 'Pengajuan Kas Kecil', 'non_asset', 'pusat', 'active');

insert into public.form_usage_steps (id, usage_id) values
  ('a0000000-0000-4000-8000-000000000078', 'a0000000-0000-4000-8000-000000000064'),
  ('a0000000-0000-4000-8000-000000000079', 'a0000000-0000-4000-8000-000000000064');

insert into public.form_usage_departments (usage_id, department_id) values
  ('a0000000-0000-4000-8000-000000000064', 'a0000000-0000-4000-8000-000000000020');

${migration}

${assertions}
`;

const run = (args, input = "") => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 240_000 });
  if (result.status !== 0) {
    throw new Error(
      `docker ${args.join(" ")} exited ${result.status}\n${result.stderr || ""}\n${result.stdout || ""}`,
    );
  }
  return `${result.stdout || ""}\n${result.stderr || ""}`;
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
      const sab = new SharedArrayBuffer(4);
      Atomics.wait(new Int32Array(sab), 0, 0, 500);
    }
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready.");
  const output = run([
    "exec", "-i", id,
    "psql", "-h", "127.0.0.1", "-v", "ON_ERROR_STOP=1", "-U", "postgres",
  ], sql);
  if (!output.includes("Letter number reuse: all assertions passed")) {
    throw new Error("SQL runner did not see the success marker.\n" + output);
  }
  process.stdout.write(output);

  // ── Concurrency: two parallel connections race for the same in-window VOID
  // ── number. The advisory lock must let exactly one win.
  run([
    "exec", "-i", id,
    "psql", "-h", "127.0.0.1", "-v", "ON_ERROR_STOP=1", "-U", "postgres",
  ], `
    insert into public.surat_reservations (id, entity_id, type_id, office_id, dept_id, year, no_urut, status, number_scope_type, reserved_by, voided_at, reuse_until)
    values (gen_random_uuid(), 'a0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000050',
            'a0000000-0000-4000-8000-000000000030', 'a0000000-0000-4000-8000-000000000020',
            2026, 10, 'VOID', 'pusat', '20000000-0000-4000-8000-000000000002', now(), now() + interval '1 day');
  `);

  const claimSql = "select public.claim_reusable_letter_number(" +
    "'a0000000-0000-4000-8000-000000000010', 2026, 'pusat', null, null, " +
    "'a0000000-0000-4000-8000-000000000020', 1, 'a0000000-0000-4000-8000-000000000050', " +
    "'20000000-0000-4000-8000-000000000002')";
  const runClaim = (actor) => new Promise((resolve) => {
    const child = spawn(
      "docker",
      ["exec", "-i", id, "psql", "-h", "127.0.0.1", "-Atq", "-U", "postgres"],
    );
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", () => {});
    child.on("close", (code) => resolve({ code, out }));
    child.stdin.end(`set "request.jwt.claim.sub" = '${actor}';\n${claimSql};\n`);
  });

  const [r1, r2] = await Promise.all([runClaim("20000000-0000-4000-8000-000000000002"), runClaim("20000000-0000-4000-8000-000000000002")]);
  const winners = [r1, r2].filter((r) => r.code === 0 && r.out.trim() === "10").length;
  if (winners !== 1) {
    throw new Error(`Concurrency race: expected exactly one winner, got ${winners}\nr1=${JSON.stringify(r1)}\nr2=${JSON.stringify(r2)}`);
  }
  process.stdout.write(`Concurrency: 2 parallel connections -> exactly 1 winner for number 10.\n`);
} finally {
  spawnSync("docker", ["rm", "-f", id], { encoding: "utf8" });
}
