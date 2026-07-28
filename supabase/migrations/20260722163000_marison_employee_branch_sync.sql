alter table public.master_offices
  add column if not exists marison_branch_id bigint,
  add column if not exists marison_branch_code text,
  add column if not exists marison_synced_at timestamptz;

create unique index if not exists master_offices_marison_branch_id_uidx
  on public.master_offices (marison_branch_id)
  where marison_branch_id is not null;

alter table public.profiles
  add column if not exists marison_employee_id bigint,
  add column if not exists marison_user_id bigint,
  add column if not exists marison_synced_at timestamptz;

create unique index if not exists profiles_marison_employee_id_uidx
  on public.profiles (marison_employee_id)
  where marison_employee_id is not null;

create unique index if not exists profiles_marison_user_id_uidx
  on public.profiles (marison_user_id)
  where marison_user_id is not null;

insert into public.external_data_sources (
  source_key,
  name,
  base_url,
  endpoint_template,
  method,
  auth_type,
  auth_config,
  response_path,
  value_path,
  label_path,
  is_active
)
values
  (
    'marison_branches',
    'Marison Branches',
    'https://external.marisonregency.id/api',
    '/branches?per_page=100&page={page}',
    'GET',
    'marison_token_hmac_sha512',
    '{}'::jsonb,
    'data',
    'id',
    'name',
    true
  ),
  (
    'marison_employees',
    'Marison Employees',
    'https://external.marisonregency.id/api',
    '/employees?per_page=100&page={page}',
    'GET',
    'marison_token_hmac_sha512',
    '{}'::jsonb,
    'data',
    'id',
    'name',
    true
  )
on conflict (source_key) do update
set
  name = excluded.name,
  endpoint_template = excluded.endpoint_template,
  method = excluded.method,
  auth_type = excluded.auth_type,
  response_path = excluded.response_path,
  value_path = excluded.value_path,
  label_path = excluded.label_path,
  is_active = excluded.is_active;
