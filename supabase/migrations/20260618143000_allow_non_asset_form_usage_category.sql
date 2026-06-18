alter table public.form_usages
  drop constraint if exists form_usages_request_category_check;

alter table public.form_usages
  add constraint form_usages_request_category_check
  check (request_category in ('asset', 'unit', 'non_unit', 'non_asset'));
