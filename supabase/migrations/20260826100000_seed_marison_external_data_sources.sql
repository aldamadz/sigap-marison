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
    'marison_projects',
    'Marison Projects',
    'https://external.marisonregency.id/api',
    '/projects?per_page=100',
    'GET',
    'marison_token_hmac_sha512',
    '{}'::jsonb,
    'data',
    'id',
    'name',
    true
  ),
  (
    'marison_units_by_project',
    'Marison Units by Project',
    'https://external.marisonregency.id/api',
    '/unit?project_id={project_id}&per_page=100',
    'GET',
    'marison_token_hmac_sha512',
    '{}'::jsonb,
    'data',
    'code',
    'name',
    true
  ),
  (
    'marison_non_units_by_project',
    'Marison Non Units by Project',
    'https://external.marisonregency.id/api',
    '/non-unit?project_id={project_id}&per_page=100',
    'GET',
    'marison_token_hmac_sha512',
    '{}'::jsonb,
    'data',
    'id',
    'name',
    true
  ),
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
  auth_config = excluded.auth_config,
  response_path = excluded.response_path,
  value_path = excluded.value_path,
  label_path = excluded.label_path,
  is_active = excluded.is_active;
