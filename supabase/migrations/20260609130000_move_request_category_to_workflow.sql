alter table public.master_penggunaan_detail
  add column if not exists request_categories text[] not null
  default array['asset', 'non_unit']::text[];

update public.master_penggunaan_detail as workflow
set request_categories = case
  when coalesce((form.unit_config->>'enabled')::boolean, false)
    then array['asset', 'unit', 'non_unit']::text[]
  else array['asset', 'non_unit']::text[]
end
from public.master_forms as form
where form.id = workflow.form_id
  and (
    workflow.request_categories is null
    or workflow.request_categories = array['asset', 'non_unit']::text[]
  );

alter table public.master_penggunaan_detail
  drop constraint if exists master_penggunaan_detail_request_categories_check;

alter table public.master_penggunaan_detail
  add constraint master_penggunaan_detail_request_categories_check
  check (
    cardinality(request_categories) > 0
    and request_categories <@ array['asset', 'unit', 'non_unit']::text[]
  );

comment on column public.master_penggunaan_detail.request_categories is
  'Kategori registrasi yang didukung matrix: asset, unit, non_unit. Pemilihan kategori dilakukan sebelum memilih matrix/form.';
