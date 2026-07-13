do $$
declare
  v_department_id uuid;
  v_input_schema jsonb := '[
    {
      "key": "recommendation_items",
      "label": "Daftar Rekomendasi",
      "type": "table",
      "required": true,
      "cell": "A9",
      "sheet": 1,
      "default_source": "manual",
      "table_config": {
        "start_row": 9,
        "end_row": 15,
        "no_column": "A",
        "columns": [
          { "key": "nama_barang", "label": "Nama Barang / Alat Kerja", "column": "B", "required": true, "type": "text" },
          { "key": "no_registrasi", "label": "No Registrasi", "column": "D", "required": false, "type": "text" },
          { "key": "lokasi_pic", "label": "Lokasi / PIC", "column": "E", "required": true, "type": "text" },
          { "key": "kerusakan", "label": "Kerusakan", "column": "F", "required": false, "type": "text" },
          { "key": "service", "label": "Service", "column": "G", "required": false, "type": "text" },
          { "key": "ganti", "label": "Ganti", "column": "H", "required": false, "type": "text" },
          { "key": "uraian", "label": "Uraian Rekomendasi", "column": "I", "required": true, "type": "text" },
          { "key": "keterangan", "label": "Keterangan", "column": "J", "required": false, "type": "text" }
        ]
      }
    },
    {
      "key": "document_number",
      "label": "Nomor Dokumen",
      "type": "text",
      "required": true,
      "cell": "C4",
      "sheet": 1,
      "default_source": "letter_number",
      "merge_range": "C4:J4",
      "horizontal": "left",
      "vertical": "middle",
      "wrap": true,
      "font_name": "Arial",
      "font_size": 11
    },
    {
      "key": "catatan",
      "label": "Catatan",
      "type": "textarea",
      "required": false,
      "cell": "B18",
      "sheet": 1,
      "default_source": "manual",
      "merge_range": "B18:H24",
      "horizontal": "left",
      "vertical": "top",
      "wrap": true,
      "shrink": true,
      "font_name": "Arial",
      "font_size": 11,
      "row_height": 18
    },
    {
      "key": "request_place_date",
      "label": "Tempat, Tanggal",
      "type": "text",
      "required": true,
      "cell": "I17",
      "sheet": 1,
      "default_source": "request_place_date",
      "merge_range": "I17:J17",
      "horizontal": "center",
      "vertical": "middle",
      "wrap": true
    }
  ]'::jsonb;
  v_signature_layout jsonb := '{
    "enabled": true,
    "preset": "adaptive",
    "sheet": 1,
    "region": "I17:J24",
    "max_per_row": 2,
    "show_role": true,
    "show_name": true,
    "show_job_title": true
  }'::jsonb;
  v_form_config jsonb := '{
    "nama_form": "REKOMENDASI PEREMAJAAN BARANG / ALAT KERJA",
    "nomor_form": "FM-UAI.HRD-30-00",
    "department_code": "PBO",
    "unit_config": {
      "request_sentence_cell": "C11"
    },
    "signature_layout": {
      "enabled": true,
      "preset": "adaptive",
      "sheet": 1,
      "region": "I17:J24",
      "max_per_row": 2,
      "show_role": true,
      "show_name": true,
      "show_job_title": true
    }
  }'::jsonb;
begin
  select id
  into v_department_id
  from public.master_departments
  where code = 'PBO'
     or lower(name) = lower('Pengembangan Organisasi')
  order by case when code = 'PBO' then 0 else 1 end
  limit 1;

  update public.master_form_presets
  set description = 'Mapping template rekomendasi terbaru: nomor dokumen C4:J4, tabel row 9-15, catatan B18:H24, tempat/tanggal I17:J17, dan tanda tangan I17:J24.',
      input_schema = v_input_schema,
      form_config = v_form_config,
      updated_at = now()
  where name = 'Rekomendasi Peremajaan Alat';

  insert into public.master_form_presets (
    name,
    description,
    input_schema,
    form_config,
    updated_at
  )
  select
    'Rekomendasi Peremajaan Alat',
    'Mapping template rekomendasi terbaru: nomor dokumen C4:J4, tabel row 9-15, catatan B18:H24, tempat/tanggal I17:J17, dan tanda tangan I17:J24.',
    v_input_schema,
    v_form_config,
    now()
  where not exists (
    select 1 from public.master_form_presets where name = 'Rekomendasi Peremajaan Alat'
  );

  update public.master_forms
  set nomor_form = 'FM-UAI.HRD-30-00',
      link_form = '/template excel/Form Rekomendasi Peremajaan Alat Template 20260619.xlsx',
      department_id = coalesce(v_department_id, department_id),
      input_schema = v_input_schema,
      unit_config = jsonb_build_object('request_sentence_cell', 'C11'),
      signature_layout = v_signature_layout
  where nama_form = 'REKOMENDASI PEREMAJAAN BARANG / ALAT KERJA';
end $$;
