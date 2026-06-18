create table if not exists public.workflow_allowed_departments (
  workflow_id uuid not null
    references public.master_penggunaan_detail(id) on delete cascade,
  department_id uuid not null
    references public.master_departments(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid null references public.profiles(id) on delete set null,
  primary key (workflow_id, department_id)
);

create index if not exists workflow_allowed_departments_department_idx
  on public.workflow_allowed_departments(department_id, workflow_id);

insert into public.workflow_allowed_departments (
  workflow_id,
  department_id
)
select distinct
  workflow.id,
  allowed_department.department_id::uuid
from public.master_penggunaan_detail as workflow
join public.master_forms as form
  on form.id = workflow.form_id
cross join lateral jsonb_array_elements_text(
  coalesce(form.unit_config->'allowed_department_ids', '[]'::jsonb)
) as allowed_department(department_id)
where workflow.request_categories @> array['unit']::text[]
  and allowed_department.department_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and exists (
    select 1
    from public.master_departments as department
    where department.id = allowed_department.department_id::uuid
  )
on conflict (workflow_id, department_id) do nothing;

alter table public.workflow_allowed_departments enable row level security;

drop policy if exists workflow_allowed_departments_read_authenticated
  on public.workflow_allowed_departments;
create policy workflow_allowed_departments_read_authenticated
  on public.workflow_allowed_departments
  for select
  to authenticated
  using (true);

drop policy if exists workflow_allowed_departments_admin_insert
  on public.workflow_allowed_departments;
create policy workflow_allowed_departments_admin_insert
  on public.workflow_allowed_departments
  for insert
  to authenticated
  with check (public.is_current_user_admin());

drop policy if exists workflow_allowed_departments_admin_update
  on public.workflow_allowed_departments;
create policy workflow_allowed_departments_admin_update
  on public.workflow_allowed_departments
  for update
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

drop policy if exists workflow_allowed_departments_admin_delete
  on public.workflow_allowed_departments;
create policy workflow_allowed_departments_admin_delete
  on public.workflow_allowed_departments
  for delete
  to authenticated
  using (public.is_current_user_admin());

create or replace function public.create_surat_registrasi(p_payload jsonb)
returns public.surat_registrasi
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_department_id uuid;
  v_workflow_id uuid := nullif(p_payload->>'penggunaan_id', '')::uuid;
  v_request_category text := nullif(p_payload->'form_input_data'->>'request_category', '');
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

  if v_request_category not in ('asset', 'unit', 'non_unit') then
    raise exception 'Klasifikasi dokumen tidak valid.';
  end if;

  if v_workflow_id is null or not exists (
    select 1
    from public.master_penggunaan_detail as workflow
    where workflow.id = v_workflow_id
      and workflow.request_categories @> array[v_request_category]::text[]
  ) then
    raise exception 'Matrix tidak mendukung klasifikasi dokumen yang dipilih.';
  end if;

  if v_request_category = 'unit' then
    if v_actor_department_id is null then
      raise exception 'Departemen akun belum ditentukan sehingga tidak dapat mengajukan Unit.';
    end if;

    if not exists (
      select 1
      from public.workflow_allowed_departments as permission
      where permission.workflow_id = v_workflow_id
        and permission.department_id = v_actor_department_id
    ) then
      raise exception 'Departemen akun Anda tidak diizinkan mengajukan Unit pada matrix ini.';
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
    data_snapshot
  )
  values (
    nullif(p_payload->>'no_surat', ''),
    nullif(p_payload->>'entity_id', '')::uuid,
    nullif(p_payload->>'office_id', '')::uuid,
    nullif(p_payload->>'project_id', '')::uuid,
    nullif(p_payload->>'dept_id', '')::uuid,
    nullif(p_payload->>'letter_type_id', '')::uuid,
    v_workflow_id,
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
    coalesce(p_payload->'data_snapshot', '{}'::jsonb)
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_surat_registrasi(jsonb) from public, anon;
grant execute on function public.create_surat_registrasi(jsonb) to authenticated, service_role;

comment on table public.workflow_allowed_departments is
  'Departemen akun yang diizinkan mengajukan kategori Unit pada setiap matrix alur.';
