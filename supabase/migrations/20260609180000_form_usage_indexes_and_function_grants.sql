create index if not exists approval_route_templates_created_by_idx
  on public.approval_route_templates(created_by);
create index if not exists form_usages_route_id_idx
  on public.form_usages(route_id);
create index if not exists form_usages_created_by_idx
  on public.form_usages(created_by);
create index if not exists form_usage_steps_route_step_id_idx
  on public.form_usage_steps(route_step_id);
create index if not exists form_usage_steps_signer_department_id_idx
  on public.form_usage_steps(signer_department_id);
create index if not exists form_usage_attachment_requirements_step_idx
  on public.form_usage_attachment_requirements(usage_step_id);
create index if not exists surat_registrasi_form_usage_id_idx
  on public.surat_registrasi(form_usage_id);
create index if not exists surat_registrasi_represented_department_id_idx
  on public.surat_registrasi(represented_department_id);
create index if not exists surat_registrasi_represented_by_admin_idx
  on public.surat_registrasi(represented_by_admin);
create index if not exists surat_signatures_form_usage_step_id_idx
  on public.surat_signatures(form_usage_step_id);

revoke all on function public.validate_form_usage_signature() from public, anon, authenticated;
grant execute on function public.validate_form_usage_signature() to service_role;

