with unit_field as (
  select jsonb_build_object(
    'key', 'unit',
    'cell', '',
    'type', 'external_select',
    'label', 'Unit',
    'sheet', 1,
    'required', false,
    'defaultSource', 'manual',
    'default_source', 'manual',
    'external_source_key', 'marison_units_by_project',
    'external_dependency_key', 'project_code',
    'external_value_path', 'code',
    'external_label_path', 'name'
  ) as value
)
update public.master_forms mf
set input_schema = coalesce(mf.input_schema, '[]'::jsonb) || unit_field.value
from unit_field
where (mf.nama_form ilike '%PGD%' or mf.nomor_form ilike '%PGD%')
  and not exists (
    select 1
    from jsonb_array_elements(coalesce(mf.input_schema, '[]'::jsonb)) field
    where field ->> 'key' = 'unit'
  );
