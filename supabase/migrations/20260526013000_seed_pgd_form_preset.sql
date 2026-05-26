insert into public.master_form_presets (
  name,
  description,
  input_schema,
  updated_at
)
select
  'Preset Tabel Barang PGD',
  'Preset database untuk PGD: tempat/tanggal, tabel barang row 11-25, unit external, dan catatan B28:N31.',
  '[
    {
      "key": "request_place_date",
      "label": "Tempat, Tanggal",
      "type": "text",
      "required": true,
      "cell": "",
      "sheet": 1,
      "default_source": "request_place_date"
    },
    {
      "key": "items",
      "label": "Daftar Barang/Jasa",
      "type": "table",
      "required": true,
      "cell": "",
      "sheet": 1,
      "default_source": "manual",
      "table_config": {
        "start_row": 11,
        "end_row": 25,
        "no_column": "A",
        "columns": [
          { "key": "kode", "label": "Kode", "column": "B", "required": false, "type": "text" },
          { "key": "nama_barang", "label": "Nama Barang", "column": "C", "required": true, "type": "text" },
          { "key": "sat", "label": "Sat", "column": "J", "required": true, "type": "text" },
          { "key": "jumlah", "label": "Jumlah", "column": "K", "required": true, "type": "number" },
          { "key": "status", "label": "Status", "column": "M", "required": true, "type": "text" },
          { "key": "keterangan", "label": "Keterangan", "column": "N", "required": false, "type": "text" }
        ]
      }
    },
    {
      "key": "unit",
      "label": "Unit",
      "type": "external_select",
      "required": false,
      "cell": "",
      "sheet": 1,
      "default_source": "manual",
      "external_source_key": "marison_units_by_project",
      "external_dependency_key": "project_code",
      "external_value_path": "code",
      "external_label_path": "name"
    },
    {
      "key": "catatan",
      "label": "Catatan",
      "type": "textarea",
      "required": false,
      "cell": "B28",
      "sheet": 1,
      "default_source": "manual",
      "merge_range": "B28:N31",
      "vertical": "top",
      "horizontal": "left",
      "wrap": true,
      "shrink": true,
      "font_name": "Arial",
      "font_size": 11,
      "row_height": 15
    }
  ]'::jsonb,
  now()
 
where not exists (
  select 1
  from public.master_form_presets
  where name = 'Preset Tabel Barang PGD'
);
