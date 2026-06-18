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

comment on column public.master_forms.signature_layout is
  'Konfigurasi area tanda tangan dinamis. preset=pgd mengikuti pola workbook referensi PGD 3-6 kotak.';
