create table if not exists public.external_data_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  name text not null,
  description text,
  base_url text not null,
  endpoint_template text not null,
  method text not null default 'GET',
  auth_type text not null default 'marison_token_hmac_sha512',
  auth_config jsonb not null default '{}'::jsonb,
  response_path text not null default 'data',
  value_path text not null default 'code',
  label_path text not null default 'name',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.external_data_sources enable row level security;

create index if not exists idx_external_data_sources_active
  on public.external_data_sources(source_key)
  where is_active = true;

drop policy if exists "Authenticated users can view active external data sources" on public.external_data_sources;
drop policy if exists "Admins can manage external data sources" on public.external_data_sources;

create policy "Authenticated users can view active external data sources"
  on public.external_data_sources
  for select
  to authenticated
  using (is_active = true);

create policy "Admins can manage external data sources"
  on public.external_data_sources
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

insert into public.external_data_sources (
  source_key,
  name,
  description,
  base_url,
  endpoint_template,
  method,
  auth_type,
  auth_config,
  response_path,
  value_path,
  label_path,
  is_active
) values (
  'marison_units_by_project',
  'Marison Units by Project',
  'Mengambil daftar unit Marison Regency berdasarkan kode proyek.',
  'https://external.marisonregency.id/api',
  '/projects/{project_code}/units',
  'GET',
  'marison_token_hmac_sha512',
  '{"client_id_env":"MARISON_EXTERNAL_CLIENT_ID","client_secret_env":"MARISON_EXTERNAL_CLIENT_SECRET","signing_secret_env":"MARISON_EXTERNAL_SIGNING_SECRET"}'::jsonb,
  'data',
  'code',
  'name',
  true
) on conflict (source_key) do update set
  name = excluded.name,
  description = excluded.description,
  base_url = excluded.base_url,
  endpoint_template = excluded.endpoint_template,
  method = excluded.method,
  auth_type = excluded.auth_type,
  auth_config = excluded.auth_config,
  response_path = excluded.response_path,
  value_path = excluded.value_path,
  label_path = excluded.label_path,
  is_active = excluded.is_active,
  updated_at = now();

comment on table public.external_data_sources is 'Reusable non-secret presets for dynamic form fields that read options from external APIs through the SIGAP backend proxy.';
