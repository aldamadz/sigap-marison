update public.master_form_presets
set input_schema = (
  select coalesce(jsonb_agg(field order by ordinal), '[]'::jsonb)
  from jsonb_array_elements(input_schema) with ordinality as fields(field, ordinal)
  where field->>'key' <> 'requested_unit_count'
),
updated_at = now()
where id = 'dc3bf33c-53e0-4c37-b374-97968c1b3f4d';

update public.master_forms
set input_schema = (
  select coalesce(jsonb_agg(field order by ordinal), '[]'::jsonb)
  from jsonb_array_elements(input_schema) with ordinality as fields(field, ordinal)
  where field->>'key' <> 'requested_unit_count'
),
unit_config = jsonb_set(coalesce(unit_config, '{}'::jsonb), '{request_sentence_cell}', '"C11"', true)
where input_schema @> '[{"key":"unit"}]'::jsonb
   or coalesce(unit_config->>'enabled', 'false') = 'true';
