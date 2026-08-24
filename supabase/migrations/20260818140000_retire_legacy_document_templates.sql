-- DOC-09: document generation is PDF-native. Remove the dormant XLSX layout
-- contract while preserving active form input schemas and Form Usage routing.

update public.master_forms form
set input_schema = (
  select coalesce(jsonb_agg(
    field
      - 'cell'
      - 'sheet'
      - 'merge_range'
      - 'mergeRange'
      - 'horizontal'
      - 'vertical'
      - 'wrap'
      - 'shrink'
      - 'font_name'
      - 'fontName'
      - 'font_size'
      - 'fontSize'
      - 'row_height'
      - 'rowHeight'
      - 'prefix'
      - 'suffix'
    order by ordinal
  ), '[]'::jsonb)
  from jsonb_array_elements(form.input_schema) with ordinality as item(field, ordinal)
)
where jsonb_typeof(form.input_schema) = 'array';

update public.master_form_presets preset
set input_schema = (
      select coalesce(jsonb_agg(
        field
          - 'cell'
          - 'sheet'
          - 'merge_range'
          - 'mergeRange'
          - 'horizontal'
          - 'vertical'
          - 'wrap'
          - 'shrink'
          - 'font_name'
          - 'fontName'
          - 'font_size'
          - 'fontSize'
          - 'row_height'
          - 'rowHeight'
          - 'prefix'
          - 'suffix'
        order by ordinal
      ), '[]'::jsonb)
      from jsonb_array_elements(preset.input_schema) with ordinality as item(field, ordinal)
    )
where jsonb_typeof(preset.input_schema) = 'array';

update public.master_form_presets
set form_config = coalesce(form_config, '{}'::jsonb)
  - 'link_form'
  - 'unit_config'
  - 'signature_layout';

alter table public.master_forms
  drop column if exists link_form,
  drop column if exists unit_config,
  drop column if exists signature_layout;

alter table public.surat_signatures
  drop column if exists signature_position_snapshot;

alter table if exists public.document_template_builders
  drop constraint if exists document_template_builders_active_version_fk;

drop table if exists public.document_template_builder_versions;
drop table if exists public.document_template_builders;
drop table if exists public.master_form_presets;

comment on table public.master_forms is
  'Native document definitions: form identity and dynamic input schema. PDF layout is owned by the native renderers.';
