update public.master_forms
set link_form = '/template excel/Form Rekomendasi Peremajaan Alat Template 20260619.xlsx'
where nama_form = 'REKOMENDASI PEREMAJAAN BARANG / ALAT KERJA';

update public.master_form_presets
set form_config = jsonb_set(
      coalesce(form_config, '{}'::jsonb),
      '{link_form}',
      to_jsonb('/template excel/Form Rekomendasi Peremajaan Alat Template 20260619.xlsx'::text),
      true
    ),
    updated_at = now()
where name = 'Rekomendasi Peremajaan Alat';
