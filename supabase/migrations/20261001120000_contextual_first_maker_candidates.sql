begin;

alter table public.form_usages add column if not exists first_maker_policy text not null default 'contextual'
  check (first_maker_policy in ('contextual', 'configured'));

-- Identify existing fixtures once; runtime authorization uses explicit metadata, not names.
update public.form_usages set first_maker_policy = 'configured'
where is_system_template is true or name like '[UJI STAGING%';

create or replace function public.stamp_registration_first_maker_policy()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_policy text;
begin
  if tg_op = 'UPDATE' then
    new.policy_snapshot := coalesce(new.policy_snapshot, '{}'::jsonb) - 'first_maker_policy';
    if old.policy_snapshot ? 'first_maker_policy' then
      new.policy_snapshot := new.policy_snapshot || jsonb_build_object('first_maker_policy', old.policy_snapshot->'first_maker_policy');
    end if;
    return new;
  end if;
  select case when usage.is_system_template is true then 'configured' else usage.first_maker_policy end
  into v_policy from public.form_usages usage where usage.id = new.form_usage_id;
  new.policy_snapshot := coalesce(new.policy_snapshot, '{}'::jsonb)
    || jsonb_build_object('first_maker_policy', coalesce(v_policy, 'configured'));
  return new;
end;
$$;
revoke all on function public.stamp_registration_first_maker_policy() from public, anon, authenticated;
drop trigger if exists stamp_registration_first_maker_policy on public.surat_registrasi;
create trigger stamp_registration_first_maker_policy before insert or update on public.surat_registrasi
for each row execute function public.stamp_registration_first_maker_policy();

create or replace function public.is_contextual_first_maker_candidate(
  p_user_id uuid, p_creator_id uuid, p_office_id uuid, p_department_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  with recursive ancestors as (
    select office.id, office.parent_id, lower(trim(office.kedudukan)) scope, array[office.id] path, 0 depth
    from public.master_offices office where office.id = p_office_id
    union all
    select office.id, office.parent_id, lower(trim(office.kedudukan)), ancestors.path || office.id, ancestors.depth + 1
    from ancestors join public.master_offices office on office.id = ancestors.parent_id
    where ancestors.scope not in ('kc', 'pusat') and not office.id = any(ancestors.path)
  ), branch as (select id from ancestors where scope = 'kc' order by depth limit 1)
  select exists (
    select 1 from public.profiles profile
    where p_creator_id is not null and profile.id = p_user_id
      and profile.is_active is true and profile.deleted_at is null
      and (
        profile.id = p_creator_id
        or (profile.office_id = p_office_id and coalesce(profile.job_title, '') ~* '(^|[^a-z0-9])(spv|supervisor)([^a-z0-9]|$)')
        or (trim(coalesce(profile.job_title, '')) ~* '^(branch\s+manager|bm)$' and profile.office_id in (select id from branch))
        or (trim(coalesce(profile.job_title, '')) ~* '^(asisten|assistant)\s+(manager|mgr\.?)([^a-z0-9]|$)' and profile.department_id = p_department_id)
      )
  );
$$;
revoke all on function public.is_contextual_first_maker_candidate(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_contextual_first_maker_candidate(uuid, uuid, uuid, uuid) to service_role;

do $patch$
declare
  v_definition text := replace(pg_get_functiondef('public.validate_form_usage_signature()'::regprocedure), E'\r\n', E'\n');
  v_old text := $body$if v_step.assignee_mode = 'requester' then$body$;
  v_new text := $body$if v_step.step_order = 1 and lower(trim(v_step.role_name)) = 'membuat'
     and v_step.action_type = 'approval' and exists (
       select 1 from public.surat_registrasi registration
       where registration.id = new.surat_id
         and registration.policy_snapshot->>'first_maker_policy' = 'contextual'
     ) then
    v_is_candidate := public.is_contextual_first_maker_candidate(
      new.user_id, v_registration_creator, v_registration_office_id, v_registration_dept_id
    );
  elsif v_step.assignee_mode = 'requester' then$body$;
begin
  if position(v_new in v_definition) > 0 then return; end if;
  if position(v_old in v_definition) = 0 then raise exception 'Unknown maker signature guard; review before applying.'; end if;
  execute replace(v_definition, v_old, v_new);
end;
$patch$;

-- Snapshots of already registered documents are intentionally not rewritten.
notify pgrst, 'reload schema';
commit;
