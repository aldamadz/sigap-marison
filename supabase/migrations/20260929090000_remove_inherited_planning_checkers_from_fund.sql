-- Manager non-Perencanaan tidak mewarisi tim Perencanaan.
-- Signature yang sudah dibuat menyimpan verifier_snapshot sendiri.
begin;

do $$
declare
  v_planning_id uuid;
begin
  select id into v_planning_id
  from public.master_departments
  where name = 'Perencanaan'
  limit 1;

  if v_planning_id is null then
    raise exception 'Departemen Perencanaan tidak ditemukan.';
  end if;

  create temporary table inherited_fund_checker_steps on commit drop as
  select step.id, step.usage_id, step.step_order
  from public.form_usage_steps step
  join public.form_usages usage on usage.id = step.usage_id
  where usage.status = 'active'
    and (
      (usage.name = 'Pengajuan Dana - Kantor Pusat' and step.step_order = 3)
      or (usage.name = 'Pengajuan Dana HRD & GA - Kantor Pusat' and step.step_order = 2)
      or (usage.name = 'Pengajuan Dana - Kantor Cabang' and step.step_order = 3)
    )
    and step.action_type = 'configured_input'
    and step.verifier_department_id = v_planning_id
    and not exists (
      select 1
      from public.form_usage_step_verifiers verifier
      join public.profiles profile on profile.id = verifier.user_id
      where verifier.usage_step_id = step.id
        and profile.department_id is distinct from v_planning_id
    );

  delete from public.form_usage_attachment_requirements attachment
  using inherited_fund_checker_steps target
  where attachment.usage_step_id = target.id
    and attachment.requirement_key = 'rab'
    and attachment.label = 'RAB hasil pemeriksaan';

  delete from public.form_usage_step_verifiers verifier
  using inherited_fund_checker_steps target
  where verifier.usage_step_id = target.id;

  update public.form_usage_steps step
  set action_type = 'approval',
      input_schema = '{}'::jsonb,
      verifier_department_id = null,
      verifier_scope = 'request_office'
  from inherited_fund_checker_steps target
  where step.id = target.id;
end;
$$;

commit;
