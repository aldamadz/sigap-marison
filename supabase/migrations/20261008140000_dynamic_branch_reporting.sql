begin;

create schema if not exists organization_internal;
revoke all on schema organization_internal from public, anon, authenticated;

alter table public.profiles add column if not exists reporting_is_automatic boolean not null default false;

create table if not exists public.profile_reporting_events (
  id bigint generated always as identity primary key,
  profile_id uuid not null,
  old_parent_id uuid,
  new_parent_id uuid,
  office_id uuid,
  actor_id uuid,
  occurred_at timestamptz not null default clock_timestamp()
);
alter table public.profile_reporting_events enable row level security;
revoke all on public.profile_reporting_events from public, anon, authenticated;
grant select on public.profile_reporting_events to authenticated;
drop policy if exists profile_reporting_events_admin_read on public.profile_reporting_events;
create policy profile_reporting_events_admin_read on public.profile_reporting_events
  for select to authenticated using (public.is_current_user_admin());

create or replace function organization_internal.is_automatic(p_office uuid, p_title text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.master_offices o where o.id = p_office
      and lower(trim(o.kedudukan)) in ('kc', 'kcp', 'kost')
  ) and trim(coalesce(p_title, '')) !~* '^(branch\s+manager|bm)$'
    and coalesce(p_title, '') !~* '(^|[^a-z0-9])(direktur|director)([^a-z0-9]|$)';
$$;

create or replace function organization_internal.resolve_bm(p_employee uuid, p_office uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_office uuid := p_office;
  v_scope text;
  v_parent uuid;
  v_seen uuid[] := '{}';
  v_candidates uuid[];
  v_bm uuid;
  v_cursor uuid;
begin
  -- Only KC/KCP/Kost ancestry is accepted; never fall back to an unrelated office.
  while v_office is not null loop
    if v_office = any(v_seen) or cardinality(v_seen) >= 128 then return null; end if;
    v_seen := array_append(v_seen, v_office);
    select lower(trim(o.kedudukan)), o.parent_id into v_scope, v_parent
      from public.master_offices o where o.id = v_office;
    if not found then return null; end if;
    if v_scope = 'kc' then exit; end if;
    if v_scope is null or v_scope not in ('kcp', 'kost') then return null; end if;
    v_office := v_parent;
  end loop;
  if v_office is null then return null; end if;
  select array_agg(p.id) into v_candidates from public.profiles p
    where p.office_id = v_office and p.id <> p_employee
      and p.is_active is true and p.deleted_at is null
      and trim(coalesce(p.job_title, '')) ~* '^(branch\s+manager|bm)$';
  if coalesce(cardinality(v_candidates), 0) <> 1 then return null; end if;
  v_bm := v_candidates[1];

  -- A configured BM/board relation must not create a cycle back through this employee.
  v_cursor := v_bm;
  v_seen := '{}';
  while v_cursor is not null loop
    if v_cursor = p_employee or v_cursor = any(v_seen) or cardinality(v_seen) >= 512 then
      return null;
    end if;
    v_seen := array_append(v_seen, v_cursor);
    select p.parent_id into v_cursor from public.profiles p where p.id = v_cursor;
  end loop;
  return v_bm;
end;
$$;

create or replace function organization_internal.lock_reporting()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Serialize profile and office topology writes before row locks are acquired.
  perform pg_catalog.pg_advisory_xact_lock(820081400);
  return null;
end;
$$;

create or replace function organization_internal.assign_reporting()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.reporting_is_automatic := organization_internal.is_automatic(new.office_id, new.job_title);
  if new.reporting_is_automatic then
    new.parent_id := case when new.is_active is true and new.deleted_at is null
      then organization_internal.resolve_bm(new.id, new.office_id) else null end;
  elsif tg_op = 'UPDATE' and old.reporting_is_automatic
      and new.parent_id is not distinct from old.parent_id then
    -- Leaving a branch must not retain that branch's BM as a configured HQ parent.
    new.parent_id := null;
  end if;
  return new;
end;
$$;

create or replace function organization_internal.refresh_reporting(p_offices uuid[] default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(820081400);
  with recursive affected as (
    select o.id, array[o.id] path from public.master_offices o where o.id = any(p_offices)
    union all
    select o.id, a.path || o.id from public.master_offices o join affected a on o.parent_id = a.id
      where not o.id = any(a.path) and cardinality(a.path) < 128
  ), resolved as materialized (
    select p.id, case when p.is_active is true and p.deleted_at is null
        and organization_internal.is_automatic(p.office_id, p.job_title)
      then organization_internal.resolve_bm(p.id, p.office_id) else null end parent_id,
      organization_internal.is_automatic(p.office_id, p.job_title) automatic
    from public.profiles p
    where (p.reporting_is_automatic or organization_internal.is_automatic(p.office_id, p.job_title))
      and (p_offices is null or p.office_id in (select id from affected))
  )
  update public.profiles p set parent_id = r.parent_id, reporting_is_automatic = r.automatic
    from resolved r where p.id = r.id and (p.parent_id is distinct from r.parent_id
      or p.reporting_is_automatic is distinct from r.automatic);
end;
$$;

create or replace function organization_internal.refresh_after_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if pg_catalog.pg_trigger_depth() <> 1 then return null; end if;
  if tg_table_name = 'master_offices' then
    if tg_op = 'UPDATE' and (new.kedudukan, new.parent_id) is not distinct from (old.kedudukan, old.parent_id) then
      return null;
    end if;
    if tg_op = 'DELETE' then perform organization_internal.refresh_reporting();
    else perform organization_internal.refresh_reporting(array[new.id]); end if;
    return null;
  end if;
  if tg_op = 'UPDATE' and (new.office_id, new.job_title, new.is_active, new.deleted_at, new.parent_id)
    is not distinct from (old.office_id, old.job_title, old.is_active, old.deleted_at, old.parent_id) then
    return null;
  end if;
  if tg_op <> 'DELETE' and trim(coalesce(new.job_title, '')) ~* '^(branch\s+manager|bm)$' then
    perform organization_internal.refresh_reporting(array[new.office_id]);
  end if;
  if tg_op <> 'INSERT' and trim(coalesce(old.job_title, '')) ~* '^(branch\s+manager|bm)$' then
    perform organization_internal.refresh_reporting(array[old.office_id]);
  end if;
  -- Configured edges above a BM can change cycle safety. Ordinary staff moves are
  -- already assigned before their write; unchanged sync upserts never reconcile.
  if tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id
      and (not old.reporting_is_automatic or not new.reporting_is_automatic) then
    perform organization_internal.refresh_reporting();
  end if;
  return null;
end;
$$;

create or replace function organization_internal.audit_reporting()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.parent_id is distinct from old.parent_id then
    insert into public.profile_reporting_events(profile_id, old_parent_id, new_parent_id, office_id, actor_id)
      values (new.id, old.parent_id, new.parent_id, new.office_id, auth.uid());
  end if;
  return null;
end;
$$;

revoke all on all functions in schema organization_internal from public, anon, authenticated;

drop trigger if exists a_org_reporting_lock on public.profiles;
create trigger a_org_reporting_lock before insert or update of office_id, job_title, is_active, deleted_at, parent_id or delete on public.profiles
  for each statement execute function organization_internal.lock_reporting();
drop trigger if exists z_org_reporting_assign on public.profiles;
create trigger z_org_reporting_assign before insert or update of office_id, job_title, is_active, deleted_at, parent_id, reporting_is_automatic on public.profiles
  for each row execute function organization_internal.assign_reporting();
drop trigger if exists org_reporting_refresh on public.profiles;
create trigger org_reporting_refresh after insert or update of office_id, job_title, is_active, deleted_at, parent_id or delete on public.profiles
  for each row execute function organization_internal.refresh_after_change();
drop trigger if exists org_reporting_audit on public.profiles;
create trigger org_reporting_audit after update on public.profiles
  for each row execute function organization_internal.audit_reporting();

drop trigger if exists a_org_reporting_lock on public.master_offices;
create trigger a_org_reporting_lock before insert or update of parent_id, kedudukan or delete on public.master_offices
  for each statement execute function organization_internal.lock_reporting();
drop trigger if exists org_reporting_refresh on public.master_offices;
create trigger org_reporting_refresh after insert or update of parent_id, kedudukan or delete on public.master_offices
  for each row execute function organization_internal.refresh_after_change();

-- Correct existing branch relationships through the same resolver, with an audit trail.
select organization_internal.refresh_reporting();
notify pgrst, 'reload schema';
commit;
