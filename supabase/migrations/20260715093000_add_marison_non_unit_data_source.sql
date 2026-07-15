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
values (
  'marison_non_units_by_project',
  'Marison Non Units by Project',
  'https://external.marisonregency.id/api',
  '/non-unit?project_id={project_id}&per_page=100',
  'GET',
  'marison_token_hmac_sha512',
  jsonb_build_object(
    'client_id_env', 'MARISON_EXTERNAL_CLIENT_ID',
    'client_secret_env', 'MARISON_EXTERNAL_CLIENT_SECRET'
  ),
  'data',
  'id',
  'name',
  true
)
on conflict (source_key) do update
set
  name = excluded.name,
  base_url = excluded.base_url,
  endpoint_template = excluded.endpoint_template,
  method = excluded.method,
  auth_type = excluded.auth_type,
  auth_config = excluded.auth_config,
  response_path = excluded.response_path,
  value_path = excluded.value_path,
  label_path = excluded.label_path,
  is_active = excluded.is_active;
