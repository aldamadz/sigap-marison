-- Apply together with the frontend release that understands signature_layout.preset = pgd.
update public.master_forms
set signature_layout = coalesce(signature_layout, '{}'::jsonb) || jsonb_build_object(
  'enabled', true,
  'preset', 'pgd',
  'sheet', 1,
  'region', 'D33:N45',
  'max_per_row', 4,
  'show_role', true,
  'show_name', true,
  'show_job_title', true
)
where id = '6afe3b14-e275-4b53-9dda-9e0c3301a56f'::uuid
  and nama_form = 'FORM PERMINTAAN BARANG & JASA';
