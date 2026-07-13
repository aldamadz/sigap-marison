do $$
declare
  v_template_path text := '/template excel/Form Rekomendasi Peremajaan Alat Template 20260629.xlsx';
begin
  update public.master_forms
  set link_form = v_template_path
  where nama_form = 'REKOMENDASI PEREMAJAAN BARANG / ALAT KERJA';

  update public.master_form_presets
  set form_config = jsonb_set(
        coalesce(form_config, '{}'::jsonb),
        '{template_path}',
        to_jsonb(v_template_path),
        true
      ),
      updated_at = now()
  where name = 'Rekomendasi Peremajaan Alat';
end $$;
