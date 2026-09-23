-- Enables the already-shipped Marison master-sync runtime on production without
-- replaying historical staging migrations or changing local UUID identities.

alter table public.master_offices
  add column if not exists marison_branch_id bigint,
  add column if not exists marison_branch_code text,
  add column if not exists marison_synced_at timestamptz,
  add column if not exists marison_last_seen_at timestamptz,
  add column if not exists marison_hierarchy_confirmed boolean not null default true,
  add column if not exists marison_review_required boolean not null default false,
  add column if not exists marison_review_reasons text[] not null default '{}'::text[];

create unique index if not exists master_offices_marison_branch_id_uidx
  on public.master_offices (marison_branch_id)
  where marison_branch_id is not null;

alter table public.profiles
  add column if not exists marison_employee_id bigint,
  add column if not exists marison_user_id bigint,
  add column if not exists marison_synced_at timestamptz,
  add column if not exists marison_last_seen_at timestamptz,
  add column if not exists marison_review_required boolean not null default false,
  add column if not exists marison_review_reasons text[] not null default '{}'::text[];

create unique index if not exists profiles_marison_employee_id_uidx
  on public.profiles (marison_employee_id)
  where marison_employee_id is not null;

create unique index if not exists profiles_marison_user_id_uidx
  on public.profiles (marison_user_id)
  where marison_user_id is not null;

alter table public.master_projects
  add column if not exists marison_project_id bigint,
  add column if not exists marison_project_code text,
  add column if not exists marison_synced_at timestamptz,
  add column if not exists marison_last_seen_at timestamptz,
  add column if not exists marison_review_required boolean not null default false,
  add column if not exists marison_review_reasons text[] not null default '{}'::text[];

create unique index if not exists master_projects_marison_project_id_uidx
  on public.master_projects (marison_project_id)
  where marison_project_id is not null;

create index if not exists master_projects_office_idx
  on public.master_projects (office_id);

create table if not exists public.marison_sync_runs (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('staging', 'production')),
  trigger_type text not null check (trigger_type in ('manual', 'cron')),
  scope text not null check (scope in ('branches', 'directory', 'projects')),
  status text not null check (status in ('running', 'success', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  error_message text,
  initiated_by uuid
);

create unique index if not exists marison_sync_runs_one_active_uidx
  on public.marison_sync_runs (environment)
  where status = 'running';

create index if not exists marison_sync_runs_started_idx
  on public.marison_sync_runs (started_at desc);

create table if not exists public.marison_sync_issues (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('staging', 'production')),
  entity_type text not null check (entity_type in ('branch', 'employee', 'project')),
  external_id text not null,
  reason text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);

create unique index if not exists marison_sync_issues_open_uidx
  on public.marison_sync_issues (environment, entity_type, external_id)
  where status = 'open';

create index if not exists marison_sync_issues_status_idx
  on public.marison_sync_issues (status, entity_type, last_seen_at desc);

alter table public.marison_sync_runs enable row level security;
alter table public.marison_sync_issues enable row level security;

drop policy if exists marison_sync_runs_admin_select on public.marison_sync_runs;
create policy marison_sync_runs_admin_select
on public.marison_sync_runs for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role::text, '')) in ('admin', 'super_admin')
  )
);

drop policy if exists marison_sync_issues_admin_select on public.marison_sync_issues;
create policy marison_sync_issues_admin_select
on public.marison_sync_issues for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role::text, '')) in ('admin', 'super_admin')
  )
);

drop policy if exists marison_sync_issues_admin_update on public.marison_sync_issues;
create policy marison_sync_issues_admin_update
on public.marison_sync_issues for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role::text, '')) in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role::text, '')) in ('admin', 'super_admin')
  )
);

create or replace function public.refresh_marison_office_review()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_reasons text[] := '{}'::text[];
begin
  if new.marison_branch_id is null then
    new.marison_review_required := false;
    new.marison_review_reasons := '{}'::text[];
    return new;
  end if;
  if nullif(btrim(coalesce(new.code, '')), '') is null then
    v_reasons := array_append(v_reasons, 'Kode kantor belum diisi');
  end if;
  if nullif(btrim(coalesce(new.name, '')), '') is null then
    v_reasons := array_append(v_reasons, 'Nama kantor belum diisi');
  end if;
  if coalesce(new.kedudukan, '') not in ('Pusat', 'KC', 'KCP', 'Kost') then
    v_reasons := array_append(v_reasons, 'Kedudukan kantor belum valid');
  end if;
  if new.kedudukan in ('KCP', 'Kost') and new.parent_id is null then
    v_reasons := array_append(v_reasons, 'Kantor induk belum dipilih');
  end if;
  if not coalesce(new.marison_hierarchy_confirmed, false) then
    v_reasons := array_append(v_reasons, 'Hirarki hasil deteksi nama belum dikonfirmasi');
  end if;
  new.marison_review_reasons := v_reasons;
  new.marison_review_required := cardinality(v_reasons) > 0;
  return new;
end;
$$;

drop trigger if exists refresh_marison_office_review_trg on public.master_offices;
create trigger refresh_marison_office_review_trg
before insert or update of code, name, kedudukan, parent_id, marison_branch_id, marison_hierarchy_confirmed
on public.master_offices
for each row execute function public.refresh_marison_office_review();

create or replace function public.refresh_marison_profile_review()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_reasons text[] := '{}'::text[];
begin
  if new.marison_employee_id is null then
    new.marison_review_required := false;
    new.marison_review_reasons := '{}'::text[];
    return new;
  end if;
  if nullif(btrim(coalesce(new.full_name, '')), '') is null then
    v_reasons := array_append(v_reasons, 'Nama belum diisi');
  end if;
  if nullif(btrim(coalesce(new.nik, '')), '') is null or new.nik like 'EXT-%' then
    v_reasons := array_append(v_reasons, 'NIK belum diisi');
  end if;
  if nullif(btrim(coalesce(new.email, '')), '') is null
     or new.email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    v_reasons := array_append(v_reasons, 'Email belum valid');
  end if;
  if new.office_id is null then
    v_reasons := array_append(v_reasons, 'Kantor belum dipetakan');
  end if;
  if new.department_id is null then
    v_reasons := array_append(v_reasons, 'Departemen belum dipetakan');
  end if;
  if nullif(btrim(coalesce(new.job_title, '')), '') is null or new.job_title = 'Karyawan' then
    v_reasons := array_append(v_reasons, 'Jabatan belum dilengkapi');
  end if;
  new.marison_review_reasons := v_reasons;
  new.marison_review_required := cardinality(v_reasons) > 0;
  return new;
end;
$$;

drop trigger if exists refresh_marison_profile_review_trg on public.profiles;
create trigger refresh_marison_profile_review_trg
before insert or update of full_name, nik, email, office_id, department_id, job_title, join_date, marison_employee_id
on public.profiles
for each row execute function public.refresh_marison_profile_review();

create or replace function public.refresh_marison_project_review()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_reasons text[] := '{}'::text[];
begin
  if new.marison_project_id is null then
    new.marison_review_required := false;
    new.marison_review_reasons := '{}'::text[];
    return new;
  end if;
  if nullif(btrim(coalesce(new.code, '')), '') is null then
    v_reasons := array_append(v_reasons, 'Kode proyek belum diisi');
  end if;
  if nullif(btrim(coalesce(new.name, '')), '') is null then
    v_reasons := array_append(v_reasons, 'Nama proyek belum diisi');
  end if;
  if new.office_id is null then
    v_reasons := array_append(v_reasons, 'Kantor proyek belum dipetakan');
  elsif not exists (
    select 1 from public.master_offices o
    where o.id = new.office_id and o.marison_branch_id is not null
  ) then
    v_reasons := array_append(v_reasons, 'Kantor proyek belum memiliki ID branch external');
  end if;
  if new.entity_id is null then
    v_reasons := array_append(v_reasons, 'Entitas proyek belum dipilih');
  end if;
  new.marison_review_reasons := v_reasons;
  new.marison_review_required := cardinality(v_reasons) > 0;
  return new;
end;
$$;

drop trigger if exists refresh_marison_project_review_trg on public.master_projects;
create trigger refresh_marison_project_review_trg
before insert or update of code, name, office_id, entity_id, marison_project_id, marison_review_reasons
on public.master_projects
for each row execute function public.refresh_marison_project_review();
