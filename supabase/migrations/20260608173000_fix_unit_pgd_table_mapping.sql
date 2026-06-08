update public.master_forms
set input_schema = '[
  {
    "key": "request_place_date",
    "cell": "E33",
    "type": "text",
    "label": "Tempat, Tanggal",
    "sheet": 1,
    "required": true,
    "vertical": "middle",
    "horizontal": "center",
    "merge_range": "E33:N33",
    "defaultSource": "request_place_date",
    "default_source": "request_place_date"
  },
  {
    "key": "items",
    "cell": "C11",
    "type": "table",
    "label": "Daftar Barang/Jasa",
    "sheet": 1,
    "required": true,
    "defaultSource": "manual",
    "default_source": "manual",
    "table_config": {
      "start_row": 11,
      "end_row": 25,
      "no_column": "A",
      "columns": [
        { "key": "kode", "type": "text", "label": "Kode", "column": "B", "required": false },
        { "key": "nama_barang", "type": "text", "label": "Nama Barang", "column": "C", "required": true },
        { "key": "sat", "type": "text", "label": "Sat", "column": "J", "required": true },
        { "key": "jumlah", "type": "number", "label": "Jumlah", "column": "K", "required": true },
        { "key": "status", "type": "text", "label": "Status", "column": "M", "required": true },
        { "key": "keterangan", "type": "text", "label": "Keterangan", "column": "N", "required": false }
      ]
    }
  },
  {
    "key": "catatan",
    "cell": "B28",
    "type": "textarea",
    "label": "Catatan",
    "sheet": 1,
    "required": false,
    "defaultSource": "manual",
    "default_source": "manual",
    "merge_range": "B28:N31",
    "font_name": "Arial",
    "font_size": 11,
    "vertical": "top",
    "horizontal": "left",
    "wrap": true,
    "shrink": true
  }
]'::jsonb
where nama_form = 'Form PGD 5 Kotak Membuat 1';
