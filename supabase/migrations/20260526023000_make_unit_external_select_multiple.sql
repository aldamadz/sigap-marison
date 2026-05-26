update public.master_forms mf
set input_schema = (
  select jsonb_agg(
    case
      when field ->> 'key' = 'unit' and field ->> 'type' = 'external_select'
        then field || '{"multiple": true}'::jsonb
      else field
    end
    order by ordinality
  )
  from jsonb_array_elements(coalesce(mf.input_schema, '[]'::jsonb)) with ordinality as fields(field, ordinality)
)
where exists (
  select 1
  from jsonb_array_elements(coalesce(mf.input_schema, '[]'::jsonb)) field
  where field ->> 'key' = 'unit'
    and field ->> 'type' = 'external_select'
);

update public.master_form_presets preset
set input_schema = (
  select jsonb_agg(
    case
      when field ->> 'key' = 'unit' and field ->> 'type' = 'external_select'
        then field || '{"multiple": true}'::jsonb
      else field
    end
    order by ordinality
  )
  from jsonb_array_elements(coalesce(preset.input_schema, '[]'::jsonb)) with ordinality as fields(field, ordinality)
)
where exists (
  select 1
  from jsonb_array_elements(coalesce(preset.input_schema, '[]'::jsonb)) field
  where field ->> 'key' = 'unit'
    and field ->> 'type' = 'external_select'
);
