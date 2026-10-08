begin;

alter table public.form_usage_steps drop constraint if exists form_usage_steps_candidate_fallback_mode_check;
alter table public.form_usage_steps add constraint form_usage_steps_candidate_fallback_mode_check
  check(candidate_fallback_mode is null or candidate_fallback_mode in
    ('request_office_all','related_branch_manager','related_branch_officer'));

create or replace function organization_internal.branch_officer_candidate_ids(
  p_creator uuid,p_office uuid,p_department uuid
) returns uuid[] language plpgsql stable security definer set search_path='' as $$
declare
  v_kc uuid:=organization_internal.related_kc(p_office);
  v_creator_rank integer; v_rank integer; v_office uuid; v_candidates uuid[]; v_department_candidates uuid[];
begin
  if v_kc is null then return '{}'::uuid[]; end if;
  select organization_internal.officer_rank(p.job_title) into v_creator_rank from public.profiles p
    where p.id=p_creator and p.is_active is true and p.deleted_at is null;
  if not found then return '{}'::uuid[]; end if;
  select max(organization_internal.officer_rank(p.job_title)) into v_rank from public.profiles p
    where p.id<>p_creator and p.is_active is true and p.deleted_at is null and p.office_id in(p_office,v_kc)
      and (organization_internal.officer_rank(p.job_title)<3 or p.office_id=v_kc);
  if coalesce(v_rank,0)<=v_creator_rank then return '{}'::uuid[]; end if;
  v_office:=v_kc;
  if v_rank<3 and exists(select 1 from public.profiles p where p.id<>p_creator and p.office_id=p_office
    and p.is_active is true and p.deleted_at is null and organization_internal.officer_rank(p.job_title)=v_rank)
    then v_office:=p_office; end if;
  select array_agg(p.id order by p.id) into v_candidates from public.profiles p where p.id<>p_creator
    and p.office_id=v_office and p.is_active is true and p.deleted_at is null
    and organization_internal.officer_rank(p.job_title)=v_rank;
  if v_rank>1 then
    return case when cardinality(v_candidates)=1 then v_candidates else '{}'::uuid[] end;
  end if;
  select array_agg(p.id order by p.id) into v_department_candidates from public.profiles p
    where p.id=any(v_candidates) and p.department_id=p_department;
  return coalesce(v_department_candidates,v_candidates,'{}'::uuid[]);
end;
$$;
revoke all on function organization_internal.branch_officer_candidate_ids(uuid,uuid,uuid) from public,anon,authenticated;

create or replace function public.is_related_branch_officer(
  p_user_id uuid,p_creator_id uuid,p_office_id uuid,p_department_id uuid
) returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(p_user_id=any(organization_internal.branch_officer_candidate_ids(p_creator_id,p_office_id,p_department_id)),false);
$$;
revoke all on function public.is_related_branch_officer(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.is_related_branch_officer(uuid,uuid,uuid,uuid) to service_role;

create or replace function public.is_contextual_first_maker_candidate(
  p_user_id uuid,p_creator_id uuid,p_office_id uuid,p_department_id uuid
) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p_creator_id is not null and p.id=p_user_id
    and p.is_active is true and p.deleted_at is null and (
      p.id=p_creator_id
      or(p.office_id=p_office_id and coalesce(p.job_title,'') ~* '(^|[^a-z0-9])(spv|supervisor)([^a-z0-9]|$)')
      or(trim(coalesce(p.job_title,'')) ~* '^(asisten|assistant)\s+(manager|mgr\.?)([^a-z0-9]|$)' and p.department_id=p_department_id)
    ));
$$;
revoke all on function public.is_contextual_first_maker_candidate(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.is_contextual_first_maker_candidate(uuid,uuid,uuid,uuid) to service_role;

do $patch$
declare
  v_definition text:=replace(pg_get_functiondef('public.validate_form_usage_signature()'::regprocedure),E'\r\n',E'\n');
  v_old text:=$body$    v_is_candidate := public.is_contextual_first_maker_candidate(
      new.user_id, v_registration_creator, v_registration_office_id, v_registration_dept_id
    );$body$;
  v_new text:=$body$    if tg_op='UPDATE' and new.user_id=old.user_id and new.surat_id=old.surat_id
      and new.form_usage_step_id=old.form_usage_step_id then
      v_is_candidate:=true;
    else
      v_is_candidate := public.is_contextual_first_maker_candidate(
        new.user_id, v_registration_creator, v_registration_office_id, v_registration_dept_id
      );
    end if;$body$;
  v_anchor text:=$body$elsif v_step.assignee_mode = 'select' and v_step.candidate_fallback_mode = 'related_branch_manager' then$body$;
  v_guard text:=$body$elsif v_step.assignee_mode='select' and v_step.candidate_fallback_mode='related_branch_officer' then
    if tg_op='UPDATE' and new.user_id=old.user_id and new.surat_id=old.surat_id
      and new.form_usage_step_id=old.form_usage_step_id then
      v_is_candidate:=true;
    else
      v_is_candidate:=public.is_related_branch_officer(new.user_id,v_registration_creator,v_registration_office_id,v_registration_dept_id);
    end if;
  elsif v_step.assignee_mode = 'select' and v_step.candidate_fallback_mode = 'related_branch_manager' then$body$;
  v_label_old text:=$body$new.label_jabatan := case
    when v_step.candidate_fallback_mode = 'request_office_all' then coalesce(v_job_title, v_step.label)$body$;
  v_label_new text:=$body$new.label_jabatan := case
    when v_step.candidate_fallback_mode='related_branch_officer' then
      case when tg_op='UPDATE' and new.user_id=old.user_id and new.surat_id=old.surat_id
        and new.form_usage_step_id=old.form_usage_step_id then old.label_jabatan
        else coalesce(v_job_title,v_step.label) end
    when v_step.candidate_fallback_mode = 'request_office_all' then coalesce(v_job_title, v_step.label)$body$;
begin
  if position(v_new in v_definition)=0 then
    if position(v_old in v_definition)=0 then raise exception 'Unknown contextual maker guard; review before applying.'; end if;
    v_definition:=replace(v_definition,v_old,v_new);
  end if;
  if position(v_guard in v_definition)=0 then
    if position(v_anchor in v_definition)=0 then raise exception 'Unknown related branch guard; review before applying.'; end if;
    v_definition:=replace(v_definition,v_anchor,v_guard);
  end if;
  if position(v_label_new in v_definition)=0 then
    if position(v_label_old in v_definition)=0 then raise exception 'Unknown signer label guard; review before applying.'; end if;
    v_definition:=replace(v_definition,v_label_old,v_label_new);
  end if;
  execute v_definition;
end;
$patch$;

do $patch$
declare
  v_definition text:=pg_get_functiondef('public.save_form_usage_config(uuid,jsonb,uuid[],jsonb,jsonb,jsonb)'::regprocedure);
  v_old text:=$body$not in ('request_office_all', 'related_branch_manager')$body$;
  v_new text:=$body$not in ('request_office_all', 'related_branch_manager', 'related_branch_officer')$body$;
begin
  if position(v_new in v_definition)=0 then
    if position(v_old in v_definition)=0 then raise exception 'Unknown configuration guard; review before applying.'; end if;
    execute replace(v_definition,v_old,v_new);
  end if;
end;
$patch$;

-- Only normal branch workflows opt into fallback. Configured tester and KEU 10 makers stay strict.
update public.form_usage_steps s set candidate_fallback_mode='related_branch_officer',candidate_scope='request_office'
from public.form_usages u where u.id=s.usage_id and u.first_maker_policy='contextual'
  and u.is_system_template is false and u.scope_type='cabang' and s.step_order>1
  and s.assignee_mode='select' and s.action_type='approval' and trim(s.label) ~* '^(branch\s+manager|bm)$';

notify pgrst,'reload schema';
commit;
