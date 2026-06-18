alter table public.master_forms
  add column if not exists signature_layout jsonb not null default '{
    "enabled": false,
    "sheet": 1,
    "region": "",
    "max_per_row": 4,
    "show_role": true,
    "show_name": true,
    "show_job_title": true
  }'::jsonb;

create table if not exists public.approval_route_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.approval_route_steps (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.approval_route_templates(id) on delete cascade,
  step_order integer not null check (step_order between 1 and 8),
  role_name text not null check (role_name in ('membuat', 'memeriksa', 'menyetujui')),
  label text not null,
  action_type text not null default 'approval'
    check (action_type in ('approval', 'unit_allocation')),
  created_at timestamptz not null default now(),
  unique (route_id, step_order)
);

create table if not exists public.form_usages (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.master_forms(id) on delete restrict,
  route_id uuid references public.approval_route_templates(id) on delete restrict,
  name text not null,
  description text,
  request_category text not null
    check (request_category in ('asset', 'unit', 'non_unit')),
  scope_type text not null default 'all'
    check (scope_type in ('all', 'pusat', 'cabang')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.form_usage_departments (
  usage_id uuid not null references public.form_usages(id) on delete cascade,
  department_id uuid not null references public.master_departments(id) on delete cascade,
  primary key (usage_id, department_id)
);

create table if not exists public.form_usage_steps (
  id uuid primary key default gen_random_uuid(),
  usage_id uuid not null references public.form_usages(id) on delete cascade,
  route_step_id uuid references public.approval_route_steps(id) on delete set null,
  step_order integer not null check (step_order between 1 and 8),
  role_name text not null check (role_name in ('membuat', 'memeriksa', 'menyetujui')),
  label text not null,
  signer_department_id uuid references public.master_departments(id) on delete restrict,
  action_type text not null default 'approval'
    check (action_type in ('approval', 'unit_allocation')),
  created_at timestamptz not null default now(),
  unique (usage_id, step_order)
);

create table if not exists public.form_usage_step_users (
  usage_step_id uuid not null references public.form_usage_steps(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (usage_step_id, user_id)
);

create table if not exists public.form_usage_attachment_requirements (
  id uuid primary key default gen_random_uuid(),
  usage_id uuid not null references public.form_usages(id) on delete cascade,
  usage_step_id uuid references public.form_usage_steps(id) on delete cascade,
  stage_order integer not null default 0 check (stage_order between 0 and 8),
  requirement_key text not null,
  label text not null,
  is_required boolean not null default true,
  allow_multiple boolean not null default false,
  min_files integer not null default 1 check (min_files >= 0),
  max_files integer not null default 1 check (max_files >= 1),
  allowed_types text[] not null default array[]::text[],
  max_size_bytes bigint,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (usage_id, stage_order, requirement_key),
  check (max_files >= min_files)
);

create index if not exists form_usages_form_category_status_idx
  on public.form_usages(form_id, request_category, status, sort_order);
create index if not exists form_usage_departments_department_idx
  on public.form_usage_departments(department_id, usage_id);
create index if not exists form_usage_steps_usage_idx
  on public.form_usage_steps(usage_id, step_order);
create index if not exists form_usage_step_users_user_idx
  on public.form_usage_step_users(user_id, usage_step_id);
create index if not exists form_usage_attachment_requirements_usage_idx
  on public.form_usage_attachment_requirements(usage_id, stage_order, sort_order);

alter table public.surat_registrasi
  add column if not exists form_usage_id uuid references public.form_usages(id) on delete set null,
  add column if not exists policy_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists represented_department_id uuid references public.master_departments(id) on delete set null,
  add column if not exists represented_by_admin uuid references public.profiles(id) on delete set null;

alter table public.surat_signatures
  add column if not exists form_usage_step_id uuid references public.form_usage_steps(id) on delete set null,
  add column if not exists action_type text not null default 'approval'
    check (action_type in ('approval', 'unit_allocation')),
  add column if not exists attachment_requirements_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists signature_position_snapshot jsonb not null default '{}'::jsonb;

create or replace function public.can_read_form_usage(p_usage_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_current_user_admin()
    or exists (
      select 1
      from public.form_usages usage
      join public.form_usage_departments permission on permission.usage_id = usage.id
      join public.profiles profile on profile.id = auth.uid()
      where usage.id = p_usage_id
        and usage.status = 'active'
        and permission.department_id = profile.department_id
        and coalesce(profile.is_active, true) = true
    );
$$;

revoke all on function public.can_read_form_usage(uuid) from public, anon;
grant execute on function public.can_read_form_usage(uuid) to authenticated, service_role;

alter table public.approval_route_templates enable row level security;
alter table public.approval_route_steps enable row level security;
alter table public.form_usages enable row level security;
alter table public.form_usage_departments enable row level security;
alter table public.form_usage_steps enable row level security;
alter table public.form_usage_step_users enable row level security;
alter table public.form_usage_attachment_requirements enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'approval_route_templates',
    'approval_route_steps',
    'form_usages',
    'form_usage_departments',
    'form_usage_steps',
    'form_usage_step_users',
    'form_usage_attachment_requirements'
  ]
  loop
    execute format('drop policy if exists %I_read_authenticated on public.%I', table_name, table_name);
    execute format(
      'create policy %I_read_authenticated on public.%I for select to authenticated using (true)',
      table_name,
      table_name
    );
    execute format('drop policy if exists %I_admin_insert on public.%I', table_name, table_name);
    execute format(
      'create policy %I_admin_insert on public.%I for insert to authenticated with check (public.is_current_user_admin())',
      table_name,
      table_name
    );
    execute format('drop policy if exists %I_admin_update on public.%I', table_name, table_name);
    execute format(
      'create policy %I_admin_update on public.%I for update to authenticated using (public.is_current_user_admin()) with check (public.is_current_user_admin())',
      table_name,
      table_name
    );
    execute format('drop policy if exists %I_admin_delete on public.%I', table_name, table_name);
    execute format(
      'create policy %I_admin_delete on public.%I for delete to authenticated using (public.is_current_user_admin())',
      table_name,
      table_name
    );
  end loop;
end;
$$;

drop policy if exists approval_route_templates_read_authenticated on public.approval_route_templates;
create policy approval_route_templates_read_authenticated
on public.approval_route_templates for select to authenticated
using (status = 'active' or public.is_current_user_admin());

drop policy if exists approval_route_steps_read_authenticated on public.approval_route_steps;
create policy approval_route_steps_read_authenticated
on public.approval_route_steps for select to authenticated
using (
  public.is_current_user_admin()
  or exists (
    select 1
    from public.approval_route_templates route
    where route.id = approval_route_steps.route_id
      and route.status = 'active'
  )
);

drop policy if exists form_usages_read_authenticated on public.form_usages;
create policy form_usages_read_authenticated
on public.form_usages for select to authenticated
using (
  public.can_read_form_usage(id)
);

drop policy if exists form_usage_departments_read_authenticated on public.form_usage_departments;
create policy form_usage_departments_read_authenticated
on public.form_usage_departments for select to authenticated
using (
  public.can_read_form_usage(usage_id)
);

drop policy if exists form_usage_steps_read_authenticated on public.form_usage_steps;
create policy form_usage_steps_read_authenticated
on public.form_usage_steps for select to authenticated
using (
  public.can_read_form_usage(usage_id)
);

drop policy if exists form_usage_step_users_read_authenticated on public.form_usage_step_users;
create policy form_usage_step_users_read_authenticated
on public.form_usage_step_users for select to authenticated
using (
  public.is_current_user_admin()
  or public.can_read_form_usage((
    select step.usage_id
    from public.form_usage_steps step
    where step.id = form_usage_step_users.usage_step_id
  ))
);

drop policy if exists form_usage_attachment_requirements_read_authenticated on public.form_usage_attachment_requirements;
create policy form_usage_attachment_requirements_read_authenticated
on public.form_usage_attachment_requirements for select to authenticated
using (
  public.can_read_form_usage(usage_id)
);

create or replace function public.validate_form_usage_for_actor(
  p_usage_id uuid,
  p_requested_department_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_profile public.profiles;
  v_usage public.form_usages;
  v_department_id uuid;
  v_step_count integer;
begin
  if v_actor is null then
    raise exception 'Sesi login tidak tersedia.';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_actor and coalesce(is_active, true) = true;

  if not found then
    raise exception 'Akun deaktif.';
  end if;

  select * into v_usage
  from public.form_usages
  where id = p_usage_id and status = 'active';

  if not found then
    raise exception 'Kegunaan form tidak aktif atau tidak ditemukan.';
  end if;

  if v_profile.role = 'admin' and p_requested_department_id is not null then
    v_department_id := p_requested_department_id;
  else
    v_department_id := v_profile.department_id;
  end if;

  if v_department_id is null then
    raise exception 'Departemen pengaju belum ditentukan.';
  end if;

  if not exists (
    select 1
    from public.form_usage_departments permission
    where permission.usage_id = v_usage.id
      and permission.department_id = v_department_id
  ) then
    raise exception 'Departemen tidak diizinkan memakai kegunaan form ini.';
  end if;

  select count(*) into v_step_count
  from public.form_usage_steps
  where usage_id = v_usage.id;

  if v_step_count < 2 or v_step_count > 8 then
    raise exception 'Kegunaan form harus memiliki 2 sampai 8 tahap.';
  end if;

  return jsonb_build_object(
    'usage_id', v_usage.id,
    'form_id', v_usage.form_id,
    'request_category', v_usage.request_category,
    'requester_department_id', v_department_id,
    'represented_by_admin', case when v_profile.role = 'admin' and v_department_id is distinct from v_profile.department_id then v_actor else null end
  );
end;
$$;

revoke all on function public.validate_form_usage_for_actor(uuid, uuid) from public, anon;
grant execute on function public.validate_form_usage_for_actor(uuid, uuid) to authenticated, service_role;

comment on table public.form_usages is
  'Kegunaan bisnis dari sebuah form. Satu form dapat memiliki banyak kegunaan dengan kategori dan approval berbeda.';
comment on column public.master_forms.signature_layout is
  'Area Excel yang sepenuhnya dikelola sistem untuk membuat layout tanda tangan dinamis 2-8 tahap.';
