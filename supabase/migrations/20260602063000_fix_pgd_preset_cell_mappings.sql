update public.master_form_presets as preset
set input_schema = (
  select jsonb_agg(
    case
      when field->>'key' = 'request_place_date'
        then jsonb_set(field, '{cell}', '"E33"', true)
      when field->>'key' = 'items'
        then jsonb_set(field, '{cell}', '"C11"', true)
      else field
    end
    order by ordinal
  )
  from jsonb_array_elements(preset.input_schema) with ordinality as fields(field, ordinal)
),
updated_at = now()
where preset.id = 'dc3bf33c-53e0-4c37-b374-97968c1b3f4d';

update public.master_forms as form
set input_schema = (
  select jsonb_agg(
    case
      when field->>'key' = 'request_place_date'
        then jsonb_set(field, '{cell}', '"E33"', true)
      else field
    end
    order by ordinal
  )
  from jsonb_array_elements(form.input_schema) with ordinality as fields(field, ordinal)
)
where form.id = '37adf45a-250c-44cf-af4e-8bd96f4bbfeb';
