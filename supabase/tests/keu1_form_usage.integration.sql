do $$
declare
  v_form_id uuid;
  v_count integer;
begin
  select id into v_form_id from public.master_forms
  where nomor_form = 'FM-UAI.KEU-01-00';
  if v_form_id is null then raise exception 'KEU 1 master form missing'; end if;

  select count(*) into v_count from public.form_usages
  where form_id = v_form_id and status = 'active';
  if v_count <> 2 then raise exception 'KEU 1 must have one Pusat and one Cabang usage'; end if;

  select count(*) into v_count
  from public.form_usage_steps step
  join public.form_usages usage on usage.id = step.usage_id
  where usage.form_id = v_form_id;
  if v_count <> 8 then raise exception 'KEU 1 must have four steps per usage'; end if;

  if exists (
    select 1 from public.form_usage_steps step
    join public.form_usages usage on usage.id = step.usage_id
    where usage.form_id = v_form_id and step.step_order between 2 and 4
      and (step.role_name <> 'memeriksa' or step.action_type <> 'approval'
        or step.verifier_department_id is not null)
  ) then raise exception 'KEU 1 managers must review without inherited checker teams'; end if;

  if exists (
    select 1 from public.form_usage_steps step
    join public.form_usages usage on usage.id = step.usage_id
    where usage.form_id = v_form_id and step.step_order in (3, 4)
      and not exists (
        select 1 from public.form_usage_step_users candidate
        join public.profiles profile on profile.id = candidate.user_id
        where candidate.usage_step_id = step.id
          and profile.department_id = step.signer_department_id
      )
  ) then raise exception 'KEU 1 HRD/Finance managers lack department-bound candidates'; end if;

  raise notice 'KEU 1 workflow: all assertions passed';
end;
$$;
