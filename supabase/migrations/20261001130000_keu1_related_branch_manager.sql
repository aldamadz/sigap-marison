begin;

alter table public.form_usage_steps drop constraint if exists form_usage_steps_candidate_fallback_mode_check;
alter table public.form_usage_steps add constraint form_usage_steps_candidate_fallback_mode_check
  check (candidate_fallback_mode is null or candidate_fallback_mode in ('request_office_all', 'related_branch_manager'));

create or replace function public.is_related_branch_manager(p_user_id uuid, p_office_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
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
    where profile.id = p_user_id and profile.is_active is true and profile.deleted_at is null
      and trim(coalesce(profile.job_title, '')) ~* '^(branch\s+manager|bm)$'
      and profile.office_id in (select id from branch)
  );
$$;
revoke all on function public.is_related_branch_manager(uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_related_branch_manager(uuid, uuid) to service_role;

do $patch$
declare
  v_definition text := replace(pg_get_functiondef('public.validate_form_usage_signature()'::regprocedure), E'\r\n', E'\n');
  v_old text := $body$elsif v_step.assignee_mode = 'select' then$body$;
  v_new text := $body$elsif v_step.assignee_mode = 'select' and v_step.candidate_fallback_mode = 'related_branch_manager' then
    -- Keep the original identity on historical approvals; reassignment must pass the current role guard.
    if tg_op = 'UPDATE' and new.user_id = old.user_id and new.surat_id = old.surat_id
       and new.form_usage_step_id = old.form_usage_step_id then
      v_is_candidate := true;
    else
      v_is_candidate := public.is_related_branch_manager(new.user_id, v_registration_office_id);
    end if;
  elsif v_step.assignee_mode = 'select' then$body$;
begin
  if position(v_new in v_definition) = 0 then
    if position(v_old in v_definition) = 0 then raise exception 'Unknown signature candidate guard; review before applying.'; end if;
    execute replace(v_definition, v_old, v_new);
  end if;
end;
$patch$;

do $patch$
declare
  v_definition text := replace(pg_get_functiondef('public.save_form_usage_config(uuid,jsonb,uuid[],jsonb,jsonb,jsonb)'::regprocedure), E'\r\n', E'\n');
  v_old text := $body$v_step->>'candidate_fallback_mode' <> 'request_office_all'$body$;
  v_new text := $body$v_step->>'candidate_fallback_mode' not in ('request_office_all', 'related_branch_manager')$body$;
  v_anchor text := $body$if coalesce(v_step->>'action_type', 'approval') = 'configured_input'$body$;
  v_validation text := $body$if nullif(v_step->>'candidate_fallback_mode', '') is not null and (
      v_step->>'candidate_fallback_mode' not in ('request_office_all', 'related_branch_manager')
      or coalesce(v_step->>'candidate_scope', 'manual') <> 'request_office'
      or coalesce(v_step->>'assignee_mode', 'select') <> 'select'
    ) then
      raise exception 'Mode kandidat kantor tidak valid.' using errcode = '22023';
    end if;
    if coalesce(v_step->>'action_type', 'approval') = 'configured_input'$body$;
begin
  if position(v_new in v_definition) = 0 then
    if position(v_old in v_definition) > 0 then
      execute replace(v_definition, v_old, v_new);
    elsif position(v_anchor in v_definition) > 0 then
      execute replace(v_definition, v_anchor, v_validation);
    else
      raise exception 'Unknown configuration candidate guard; review before applying.';
    end if;
  end if;
end;
$patch$;

update public.form_usage_steps step set candidate_fallback_mode = 'related_branch_manager'
from public.form_usages usage join public.master_forms form on form.id = usage.form_id
where step.usage_id = usage.id and upper(trim(form.nomor_form)) = 'FM-UAI.KEU-01-00'
  and usage.scope_type = 'cabang' and usage.first_maker_policy = 'contextual'
  and usage.is_system_template is false and step.step_order = 2
  and step.assignee_mode = 'select' and step.candidate_scope = 'request_office';

notify pgrst, 'reload schema';
commit;
