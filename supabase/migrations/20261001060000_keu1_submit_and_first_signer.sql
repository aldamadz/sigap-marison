-- Narrow corrections to the deployed canonical triggers. Refuse unknown bodies
-- rather than silently replacing a different workflow implementation.
begin;
do $patch$
declare
  v_definition text := replace(pg_get_functiondef('public.enforce_surat_registration_branch_project()'::regprocedure), E'\r\n', E'\n');
  v_old text := 'and reservation.no_urut = new.no_urut';
  v_new text := $body$and reservation.type_id = new.letter_type_id
            and reservation.no_urut = case
              when split_part(new.no_surat, '/', 1) ~ '^[0-9]{1,9}$'
              then split_part(new.no_surat, '/', 1)::integer
              else null
            end$body$;
begin
  if position(v_old in v_definition) > 0 then
    execute replace(v_definition, v_old, v_new);
  elsif position(v_new in v_definition) = 0 then
    raise exception 'Unknown KEU 1 registration guard; review before applying.';
  end if;
end;
$patch$;

create or replace function public.is_keu1_first_signer_candidate(
  p_usage_id uuid, p_step_id uuid, p_user_id uuid, p_creator_id uuid, p_office_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.form_usage_steps step
    join public.form_usages usage on usage.id = step.usage_id
    join public.master_forms form on form.id = usage.form_id
    join public.master_offices office on office.id = p_office_id
    join public.profiles profile on profile.id = p_user_id
    where usage.id = p_usage_id and step.id = p_step_id
      and usage.request_category = 'non_asset'
      and upper(trim(form.nomor_form)) = 'FM-UAI.KEU-01-00'
      and step.step_order = 1 and step.assignee_mode = 'requester'
      and step.action_type = 'approval'
      and profile.is_active is true and profile.deleted_at is null
      and (profile.id = p_creator_id or (
        lower(office.kedudukan) <> 'pusat' and profile.office_id = p_office_id
        and coalesce(profile.job_title, '') ~* '(^|[^a-z0-9])(spv|supervisor)([^a-z0-9]|$)'
      ))
  );
$$;
revoke all on function public.is_keu1_first_signer_candidate(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_keu1_first_signer_candidate(uuid, uuid, uuid, uuid, uuid) to service_role;

do $patch$
declare
  v_definition text := replace(pg_get_functiondef('public.validate_form_usage_signature()'::regprocedure), E'\r\n', E'\n');
  v_old text := $body$if v_step.assignee_mode = 'requester' then
    v_is_candidate := new.user_id = v_registration_creator;$body$;
  v_new text := $body$if v_step.assignee_mode = 'requester' then
    if v_step.step_order = 1 and exists (
      select 1 from public.form_usages usage
      join public.master_forms form on form.id = usage.form_id
      where usage.id = v_usage_id and usage.request_category = 'non_asset'
        and upper(trim(form.nomor_form)) = 'FM-UAI.KEU-01-00'
    ) then
      v_is_candidate := public.is_keu1_first_signer_candidate(
        v_usage_id, v_step.id, new.user_id, v_registration_creator, v_registration_office_id
      );
    else
      v_is_candidate := new.user_id = v_registration_creator;
    end if;$body$;
begin
  if position(v_old in v_definition) > 0 then
    execute replace(v_definition, v_old, v_new);
  elsif position(v_new in v_definition) = 0 then
    raise exception 'Unknown first-signer guard; review before applying.';
  end if;
end;
$patch$;
notify pgrst, 'reload schema';
commit;
