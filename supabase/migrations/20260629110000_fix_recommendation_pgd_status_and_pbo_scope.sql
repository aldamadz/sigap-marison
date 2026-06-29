do $$
declare
  v_status_options jsonb := '["1", "2", "3", "4"]'::jsonb;
  v_status_helper text := '1 = H+1, 2 = H+3, 3 = H+7, 4 = H+10';
  v_pbo_department_id uuid;
begin
  select id
  into v_pbo_department_id
  from public.master_departments
  where upper(coalesce(code, '')) = 'PBO'
     or lower(name) = lower('Pengembangan Organisasi')
     or lower(name) = 'po'
  order by case when upper(coalesce(code, '')) = 'PBO' then 0 else 1 end, name
  limit 1;

  update public.master_forms form
  set input_schema = (
    select jsonb_agg(
      case
        when field->>'key' = 'items' and field ? 'table_config' then
          jsonb_set(
            field,
            '{table_config,columns}',
            (
              select jsonb_agg(
                case
                  when column_item->>'key' = 'status' then
                    column_item
                    || jsonb_build_object(
                      'type', 'select',
                      'options', v_status_options,
                      'helper_text', v_status_helper
                    )
                  else column_item
                end
                order by column_ordinal
              )
              from jsonb_array_elements(field #> '{table_config,columns}') with ordinality as columns(column_item, column_ordinal)
            )
          )
        else field
      end
      order by field_ordinal
    )
    from jsonb_array_elements(form.input_schema) with ordinality as fields(field, field_ordinal)
  )
  where form.input_schema @> '[{"key":"items"}]'::jsonb
    and exists (
      select 1
      from jsonb_array_elements(form.input_schema) as schema_field
      where schema_field->>'key' = 'items'
        and schema_field #> '{table_config,columns}' @> '[{"key":"status"}]'::jsonb
    );

  update public.master_form_presets preset
  set input_schema = (
    select jsonb_agg(
      case
        when field->>'key' = 'items' and field ? 'table_config' then
          jsonb_set(
            field,
            '{table_config,columns}',
            (
              select jsonb_agg(
                case
                  when column_item->>'key' = 'status' then
                    column_item
                    || jsonb_build_object(
                      'type', 'select',
                      'options', v_status_options,
                      'helper_text', v_status_helper
                    )
                  else column_item
                end
                order by column_ordinal
              )
              from jsonb_array_elements(field #> '{table_config,columns}') with ordinality as columns(column_item, column_ordinal)
            )
          )
        else field
      end
      order by field_ordinal
    )
    from jsonb_array_elements(preset.input_schema) with ordinality as fields(field, field_ordinal)
  )
  where preset.input_schema @> '[{"key":"items"}]'::jsonb
    and exists (
      select 1
      from jsonb_array_elements(preset.input_schema) as schema_field
      where schema_field->>'key' = 'items'
        and schema_field #> '{table_config,columns}' @> '[{"key":"status"}]'::jsonb
    );

  update public.master_forms form
  set input_schema = (
    select jsonb_agg(
      case
        when field->>'key' = 'document_number' then
          field || jsonb_build_object('cell', 'C4', 'horizontal', 'left', 'vertical', 'middle', 'wrap', true)
        when field->>'key' = 'catatan' then
          field || jsonb_build_object('cell', 'B18', 'merge_range', 'B18:H24', 'horizontal', 'left', 'vertical', 'top', 'wrap', true, 'shrink', true, 'font_name', 'Arial', 'font_size', 11, 'row_height', 18)
        else field
      end
      order by field_ordinal
    )
    from jsonb_array_elements(form.input_schema) with ordinality as fields(field, field_ordinal)
  )
  where form.nama_form = 'REKOMENDASI PEREMAJAAN BARANG / ALAT KERJA';

  update public.master_forms
  set department_id = v_pbo_department_id,
      link_form = '/template excel/Form Rekomendasi Peremajaan Alat Template 20260619.xlsx'
  where v_pbo_department_id is not null
    and nama_form = 'REKOMENDASI PEREMAJAAN BARANG / ALAT KERJA';

  update public.master_form_presets
  set form_config = coalesce(form_config, '{}'::jsonb)
    || jsonb_build_object(
      'department_code', 'PBO',
      'department_id', v_pbo_department_id,
      'link_form', '/template excel/Form Rekomendasi Peremajaan Alat Template 20260619.xlsx'
    ),
      updated_at = now()
  where v_pbo_department_id is not null
    and name = 'Rekomendasi Peremajaan Alat';
end $$;
