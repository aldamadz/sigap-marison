-- Attachment requirements are owned exclusively by form usages and their stages.
update public.master_forms
set unit_config = coalesce(unit_config, '{}'::jsonb)
  - 'enabled'
  - 'allowed_department_ids'
  - 'initial_attachment_required'
  - 'allocation_attachment_requirements'
where unit_config is not null;

update public.surat_registrasi
set form_input_data = jsonb_set(
  coalesce(form_input_data, '{}'::jsonb),
  '{unit_config_snapshot}',
  coalesce(form_input_data->'unit_config_snapshot', '{}'::jsonb)
    - 'enabled'
    - 'allowed_department_ids'
    - 'initial_attachment_required'
    - 'allocation_attachment_requirements',
  true
)
where form_input_data ? 'unit_config_snapshot';
