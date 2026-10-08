begin;

create or replace function organization_internal.officer_rank(p_title text)
returns integer language sql immutable set search_path='' as $$
  select case
    when trim(coalesce(p_title,'')) ~* '^(branch\s+manager|bm)$' then 3
    when trim(coalesce(p_title,'')) ~* '^((assistant|asisten|assistent)\s+(branch\s+manager|bm)|abm)$' then 2
    when coalesce(p_title,'') ~* '(^|[^a-z0-9])(spv|supervisor)([^a-z0-9]|$)' then 1
    else 0 end;
$$;

create or replace function organization_internal.related_kc(p_office uuid)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_id uuid:=p_office; v_parent uuid; v_scope text; v_seen uuid[]:='{}';
begin
  while v_id is not null loop
    if v_id=any(v_seen) or cardinality(v_seen)>=128 then return null; end if;
    v_seen:=array_append(v_seen,v_id);
    select lower(trim(o.kedudukan)),o.parent_id into v_scope,v_parent from public.master_offices o where o.id=v_id;
    if not found then return null; end if;
    if v_scope='kc' then return v_id; end if;
    if v_scope is null or v_scope not in('kcp','kost') then return null; end if;
    v_id:=v_parent;
  end loop;
  return null;
end;
$$;

create or replace function organization_internal.resolve_office_superior(
  p_employee uuid,p_office uuid,p_title text,p_department uuid
) returns uuid language plpgsql volatile security definer set search_path='' as $$
declare
  v_kc uuid:=organization_internal.related_kc(p_office);
  v_rank integer; v_office uuid; v_candidates uuid[]; v_parent uuid; v_cursor uuid; v_seen uuid[]:='{}';
  v_next uuid; v_cursor_title text; v_cursor_office uuid; v_next_rank integer;
begin
  if v_kc is null then return null; end if;
  select max(organization_internal.officer_rank(p.job_title)) into v_rank from public.profiles p
    where p.id<>p_employee and p.is_active is true and p.deleted_at is null
      and p.office_id in(p_office,v_kc)
      and (organization_internal.officer_rank(p.job_title)<3 or p.office_id=v_kc);
  if coalesce(v_rank,0)<=organization_internal.officer_rank(p_title) then return null; end if;
  -- At equal rank KCP staff use their own office first, then the related KC.
  v_office:=v_kc;
  if v_rank<3 and exists(select 1 from public.profiles p where p.id<>p_employee
    and p.office_id=p_office and p.is_active is true and p.deleted_at is null
    and organization_internal.officer_rank(p.job_title)=v_rank) then v_office:=p_office; end if;
  select array_agg(p.id) into v_candidates from public.profiles p
    where p.id<>p_employee and p.office_id=v_office and p.is_active is true and p.deleted_at is null
      and organization_internal.officer_rank(p.job_title)=v_rank;
  -- Duplicate managers are configuration conflicts, not an excuse to delegate lower.
  if cardinality(v_candidates)>1 and v_rank=1 and p_department is not null then
    select array_agg(p.id) into v_candidates from public.profiles p
      where p.id=any(v_candidates) and p.department_id=p_department;
  end if;
  if coalesce(cardinality(v_candidates),0)<>1 then return null; end if;
  v_parent:=v_candidates[1]; v_cursor:=v_parent;
  while v_cursor is not null loop
    if v_cursor=p_employee or v_cursor=any(v_seen) or cardinality(v_seen)>=512 then return null; end if;
    v_seen:=array_append(v_seen,v_cursor);
    select p.parent_id,p.job_title,p.office_id,organization_internal.officer_rank(parent.job_title)
      into v_next,v_cursor_title,v_cursor_office,v_next_rank from public.profiles p
      left join public.profiles parent on parent.id=p.parent_id where p.id=v_cursor;
    -- A demotion can leave an old automatic edge until AFTER-row reconciliation.
    -- Such a non-increasing rank edge cannot exist in the derived hierarchy.
    if organization_internal.is_automatic(v_cursor_office,v_cursor_title)
      and coalesce(v_next_rank,0)<=organization_internal.officer_rank(v_cursor_title) then v_cursor:=null;
    else v_cursor:=v_next; end if;
  end loop;
  return v_parent;
end;
$$;

-- Retain the old private signature for metadata checks and existing callers.
create or replace function organization_internal.resolve_bm(p_employee uuid,p_office uuid)
returns uuid language sql volatile security definer set search_path='' as $$
  select organization_internal.resolve_office_superior(p_employee,p_office,p.job_title,p.department_id)
  from public.profiles p where p.id=p_employee;
$$;

create or replace function organization_internal.assign_reporting()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  new.reporting_is_automatic:=organization_internal.is_automatic(new.office_id,new.job_title);
  if new.reporting_is_automatic then
    new.parent_id:=case when new.is_active is true and new.deleted_at is null
      then organization_internal.resolve_office_superior(new.id,new.office_id,new.job_title,new.department_id) else null end;
  elsif tg_op='UPDATE' and old.reporting_is_automatic and new.parent_id is not distinct from old.parent_id then
    new.parent_id:=null;
  end if;
  return new;
end;
$$;

create or replace function organization_internal.refresh_after_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if pg_catalog.pg_trigger_depth()<>1 then return null; end if;
  if tg_table_name='master_offices' then
    if tg_op='UPDATE' and (new.kedudukan,new.parent_id) is not distinct from(old.kedudukan,old.parent_id) then return null; end if;
    if tg_op='DELETE' then perform organization_internal.refresh_reporting();
    else perform organization_internal.refresh_reporting(array[new.id]); end if;
    return null;
  end if;
  if tg_op='UPDATE' and (new.office_id,new.job_title,new.department_id,new.is_active,new.deleted_at,new.parent_id)
    is not distinct from(old.office_id,old.job_title,old.department_id,old.is_active,old.deleted_at,old.parent_id) then return null; end if;
  if tg_op<>'DELETE' and organization_internal.officer_rank(new.job_title)>0 then
    perform organization_internal.refresh_reporting(array[new.office_id,organization_internal.related_kc(new.office_id)]);
  end if;
  if tg_op<>'INSERT' and organization_internal.officer_rank(old.job_title)>0 then
    perform organization_internal.refresh_reporting(array[old.office_id,organization_internal.related_kc(old.office_id)]);
  end if;
  if tg_op='UPDATE' and new.parent_id is distinct from old.parent_id
    and(not old.reporting_is_automatic or not new.reporting_is_automatic) then perform organization_internal.refresh_reporting(); end if;
  return null;
end;
$$;

revoke all on all functions in schema organization_internal from public,anon,authenticated;
drop trigger if exists a_org_reporting_lock on public.profiles;
create trigger a_org_reporting_lock before insert or update of office_id,job_title,department_id,is_active,deleted_at,parent_id or delete on public.profiles
  for each statement execute function organization_internal.lock_reporting();
drop trigger if exists z_org_reporting_assign on public.profiles;
create trigger z_org_reporting_assign before insert or update of office_id,job_title,department_id,is_active,deleted_at,parent_id,reporting_is_automatic on public.profiles
  for each row execute function organization_internal.assign_reporting();
drop trigger if exists org_reporting_refresh on public.profiles;
create trigger org_reporting_refresh after insert or update of office_id,job_title,department_id,is_active,deleted_at,parent_id or delete on public.profiles
  for each row execute function organization_internal.refresh_after_change();

select organization_internal.refresh_reporting();
notify pgrst,'reload schema';
commit;
