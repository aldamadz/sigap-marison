alter table public.master_forms
  add column if not exists input_schema jsonb not null default '[]'::jsonb;

alter table public.surat_registrasi
  add column if not exists requester_nik text,
  add column if not exists request_place text,
  add column if not exists request_date date,
  add column if not exists form_input_data jsonb not null default '{}'::jsonb,
  add column if not exists requester_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists location_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists pdf_path text;

create index if not exists idx_surat_request_date on public.surat_registrasi(request_date);
create index if not exists idx_surat_form_input_data on public.surat_registrasi using gin(form_input_data);

comment on column public.master_forms.input_schema is 'Dynamic system input field definitions and Excel cell mapping for this template.';
comment on column public.surat_registrasi.requester_nik is 'Snapshot of requester NIK at submission time.';
comment on column public.surat_registrasi.request_place is 'Place/location filled by requester at submission time.';
comment on column public.surat_registrasi.request_date is 'Document date filled by requester at submission time.';
comment on column public.surat_registrasi.form_input_data is 'Structured user inputs captured by system and used to fill the Excel template.';
comment on column public.surat_registrasi.requester_snapshot is 'Requester profile snapshot at submission time.';
comment on column public.surat_registrasi.location_snapshot is 'Office, project, department, entity snapshot at submission time.';
comment on column public.surat_registrasi.pdf_path is 'Generated PDF preview path or public URL derived from the Excel document.';
