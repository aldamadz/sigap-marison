do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.form_usage_steps step
  join public.form_usages usage on usage.id = step.usage_id
  where usage.status = 'active'
    and (
      (usage.name = 'Pengajuan Dana - Kantor Pusat' and step.step_order = 3)
      or (usage.name = 'Pengajuan Dana HRD & GA - Kantor Pusat' and step.step_order = 2)
      or (usage.name = 'Pengajuan Dana - Kantor Cabang' and step.step_order = 3)
    )
    and step.action_type = 'approval'
    and step.verifier_department_id is null
    and step.input_schema = '{}'::jsonb
    and not exists (
      select 1 from public.form_usage_step_verifiers verifier
      where verifier.usage_step_id = step.id
    )
    and not exists (
      select 1 from public.form_usage_attachment_requirements attachment
      where attachment.usage_step_id = step.id and attachment.requirement_key = 'rab'
    );
  if v_count <> 3 then
    raise exception 'Dana manager steps inherited a Planning checker';
  end if;

  if not exists (
    select 1 from public.form_usage_steps step
    join public.form_usages usage on usage.id = step.usage_id
    join public.form_usage_step_verifiers verifier on verifier.usage_step_id = step.id
    where usage.name = 'SPK Unit - Kantor Pusat'
      and step.label = 'Mgr. Perencanaan'
  ) then
    raise exception 'Planning manager lost its own checker team';
  end if;

  raise notice 'Non-Planning checker defaults: all assertions passed';
end;
$$;
