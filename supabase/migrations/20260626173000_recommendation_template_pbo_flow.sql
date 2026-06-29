do $$
declare
  v_pbo_department_id uuid;
  v_recommendation_form_id uuid;
  v_recommendation_usage_id uuid;
  v_recommendation_letter_type_id uuid;
  v_step_id uuid;
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
          { "key": "uraian", "label": "Uraian", "column": "I", "required": true, "type": "text" },
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
begin
  select id
  into v_pbo_department_id
  from public.master_departments
  where upper(coalesce(code, '')) = 'PBO'
     or lower(name) = lower('Pengembangan Organisasi')
  order by case when upper(coalesce(code, '')) = 'PBO' then 0 else 1 end, name
  limit 1;

  if v_pbo_department_id is null then
    raise notice 'Departemen PBO/Pengembangan Organisasi tidak ditemukan. Migration rekomendasi PBO dilewati.';
    return;
  end if;

  select id
  into v_recommendation_form_id
  from public.master_forms
  where nama_form = 'REKOMENDASI PEREMAJAAN BARANG / ALAT KERJA'
  order by created_at desc nulls last
  limit 1;

  select id
  into v_recommendation_letter_type_id
  from public.master_letter_types
  where lower(name) = lower('Rekomendasi')
     or lower(code) = lower('REK')
  limit 1;

  if v_recommendation_letter_type_id is null then
    insert into public.master_letter_types (name, code, type_index)
    values ('Rekomendasi', 'REK', 4)
    returning id into v_recommendation_letter_type_id;
  else
    update public.master_letter_types
    set type_index = 4
    where id = v_recommendation_letter_type_id;
  end if;

  insert into public.master_dept_letter_types (dept_id, letter_type_id, sort_index)
  values (v_pbo_department_id, v_recommendation_letter_type_id, 4)
  on conflict (dept_id, letter_type_id)
  do update set sort_index = excluded.sort_index;

  update public.master_form_presets
  set description = 'Mapping template rekomendasi peremajaan barang/alat kerja PBO: nomor dokumen C4, tabel row 9-15, catatan B18:H24, tempat/tanggal I17:J17, dan tanda tangan I17:J24.',
      input_schema = v_input_schema,
      form_config = jsonb_build_object(
        'nama_form', 'REKOMENDASI PEREMAJAAN BARANG / ALAT KERJA',
        'nomor_form', 'FM-UAI.HRD-30-00',
        'department_code', 'PBO',
        'department_id', v_pbo_department_id,
        'link_form', '/template excel/Form Rekomendasi Peremajaan Alat Template 20260619.xlsx',
        'unit_config', jsonb_build_object('request_sentence_cell', 'C11'),
        'signature_layout', v_signature_layout
      ),
      updated_at = now()
  where name = 'Rekomendasi Peremajaan Alat';

  if v_recommendation_form_id is not null then
    update public.master_forms
    set nomor_form = 'FM-UAI.HRD-30-00',
        link_form = '/template excel/Form Rekomendasi Peremajaan Alat Template 20260619.xlsx',
        department_id = v_pbo_department_id,
        input_schema = v_input_schema,
        unit_config = jsonb_build_object('request_sentence_cell', 'C11'),
        signature_layout = v_signature_layout
    where id = v_recommendation_form_id;
  end if;

  if v_recommendation_form_id is null then
    insert into public.master_forms (
      nama_form,
      nomor_form,
      link_form,
      department_id,
      input_schema,
      unit_config,
      signature_layout,
      created_at
    )
    values (
      'REKOMENDASI PEREMAJAAN BARANG / ALAT KERJA',
      'FM-UAI.HRD-30-00',
      '/template excel/Form Rekomendasi Peremajaan Alat Template 20260619.xlsx',
      v_pbo_department_id,
      v_input_schema,
      jsonb_build_object('request_sentence_cell', 'C11'),
      v_signature_layout,
      now()
    )
    returning id into v_recommendation_form_id;
  end if;

  select id
  into v_recommendation_usage_id
  from public.form_usages
  where name = 'Rekomendasi Peremajaan Aset'
  limit 1;

  if v_recommendation_usage_id is null then
    insert into public.form_usages (
      name,
      description,
      form_id,
      request_category,
      scope_type,
      status,
      sort_order,
      recommendation_config,
      updated_at
    )
    values (
      'Rekomendasi Peremajaan Aset',
      'Dokumen rekomendasi peremajaan barang/alat kerja PBO yang ditautkan ke permohonan aset.',
      v_recommendation_form_id,
      'non_asset',
      'pusat',
      'active',
      30,
      '{}'::jsonb,
      now()
    )
    returning id into v_recommendation_usage_id;
  else
    update public.form_usages
    set form_id = v_recommendation_form_id,
        description = 'Dokumen rekomendasi peremajaan barang/alat kerja PBO yang ditautkan ke permohonan aset.',
        request_category = 'non_asset',
        scope_type = 'pusat',
        status = 'active',
        updated_at = now()
    where id = v_recommendation_usage_id;
  end if;

  delete from public.form_usage_departments where usage_id = v_recommendation_usage_id;
  insert into public.form_usage_departments (usage_id, department_id)
  values (v_recommendation_usage_id, v_pbo_department_id)
  on conflict do nothing;

  delete from public.form_usage_steps where usage_id = v_recommendation_usage_id;

  insert into public.form_usage_steps (
    usage_id,
    step_order,
    role_name,
    label,
    signer_department_id,
    action_type,
    candidate_scope
  )
  values (
    v_recommendation_usage_id,
    1,
    'membuat',
    'Staff IT',
    v_pbo_department_id,
    'approval',
    'head_office'
  )
  returning id into v_step_id;

  insert into public.form_usage_step_users (usage_step_id, user_id)
  select distinct v_step_id, profile.id
  from public.profiles profile
  where profile.is_active is distinct from false
    and profile.department_id = v_pbo_department_id
    and lower(coalesce(profile.job_title, '')) like '%staff it%';

  insert into public.form_usage_steps (
    usage_id,
    step_order,
    role_name,
    label,
    signer_department_id,
    action_type,
    candidate_scope
  )
  values (
    v_recommendation_usage_id,
    2,
    'memeriksa',
    'Mgr. PO',
    v_pbo_department_id,
    'approval',
    'head_office'
  )
  returning id into v_step_id;

  insert into public.form_usage_step_users (usage_step_id, user_id)
  select distinct v_step_id, profile.id
  from public.profiles profile
  where profile.is_active is distinct from false
    and profile.department_id = v_pbo_department_id
    and (
      lower(coalesce(profile.job_title, '')) like 'manager%'
      or lower(coalesce(profile.job_title, '')) like 'mgr%'
      or lower(coalesce(profile.job_title, '')) like '%pengembangan organisasi%'
    );

  update public.form_usages usage
  set recommendation_config = jsonb_build_object(
        'enabled', true,
        'optional', true,
        'required_before_step', 3,
        'form_id', v_recommendation_form_id,
        'usage_id', v_recommendation_usage_id,
        'department_id', v_pbo_department_id,
        'letter_type_id', v_recommendation_letter_type_id,
        'template_name', 'Rekomendasi Peremajaan Aset'
      ),
      updated_at = now()
  where usage.name in ('Permohonan Aset (Pusat)', 'Permohonan Aset (Cabang)');
end $$;
