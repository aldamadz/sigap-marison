update public.master_form_presets
set input_schema = input_schema || jsonb_build_array(jsonb_build_object(
  'key', 'requested_unit_count',
  'cell', 'C11',
  'type', 'number',
  'label', 'Jumlah Unit Diajukan',
  'sheet', 1,
  'required', false,
  'default_source', 'manual'
)),
updated_at = now()
where id = 'dc3bf33c-53e0-4c37-b374-97968c1b3f4d'
  and not input_schema @> '[{"key":"requested_unit_count"}]'::jsonb;

update public.master_forms
set input_schema = input_schema || jsonb_build_array(jsonb_build_object(
  'key', 'requested_unit_count',
  'cell', 'C11',
  'type', 'number',
  'label', 'Jumlah Unit Diajukan',
  'sheet', 1,
  'required', false,
  'default_source', 'manual'
))
where input_schema @> '[{"key":"items"},{"key":"unit"}]'::jsonb
  and not input_schema @> '[{"key":"requested_unit_count"}]'::jsonb;
