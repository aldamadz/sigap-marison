update public.master_forms
set signature_layout = coalesce(signature_layout, '{}'::jsonb) || jsonb_build_object(
  'enabled', true,
  'preset', 'pgd',
  'sheet', 1,
  'region', 'D33:N45',
  'max_per_row', 4,
  'show_role', true,
  'show_name', true,
  'show_job_title', true,
  'geometry', 'pgd_reference_v2'
)
where upper(coalesce(nama_form, '')) like '%PERMINTAAN BARANG%'
  and upper(coalesce(nama_form, '')) like '%JASA%';
