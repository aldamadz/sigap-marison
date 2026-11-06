begin;

-- A bounded identity scope shared by every calendar read. Existing reporting
-- access is retained; peers gain read access, never owner mutation privileges.
create or replace function public.work_calendar_visible_members()
returns table(member_id uuid)
language sql stable security definer set search_path = '' as $$
 with recursive actor as (
  select p.id,p.office_id,p.department_id,o.kedudukan
  from public.profiles p join public.master_offices o on o.id=p.office_id
  where p.id=auth.uid() and p.is_active is true and p.deleted_at is null
 ), descendants as (
  select p.id,array[p.id] path from public.profiles p
  where p.parent_id=auth.uid() and p.id<>auth.uid() and p.is_active is true and p.deleted_at is null
   and exists(select 1 from public.profiles a where a.id=auth.uid() and a.is_active is true and a.deleted_at is null)
  union all
  select p.id,d.path||p.id from public.profiles p join descendants d on p.parent_id=d.id
  where not(p.id=any(d.path)) and p.id<>auth.uid() and p.is_active is true and p.deleted_at is null
 ), offices as (
  select a.office_id id,array[a.office_id] path from actor a where a.kedudukan in ('KC','KCP')
  union all
  select o.id,s.path||o.id from public.master_offices o join offices s on o.parent_id=s.id
  where exists(select 1 from actor where kedudukan='KC') and o.kedudukan='KCP' and not(o.id=any(s.path))
 ), peers as (
  select p.id from public.profiles p join public.master_offices o on o.id=p.office_id cross join actor a
  where p.id<>a.id and p.is_active is true and p.deleted_at is null
   and ((a.kedudukan='Pusat' and o.kedudukan='Pusat' and a.department_id is not null and p.department_id=a.department_id)
    or (a.kedudukan in ('KC','KCP') and o.kedudukan<>'Pusat' and p.office_id in(select id from offices)))
 ) select id from descendants union select id from peers;
$$;
revoke all on function public.work_calendar_visible_members() from public,anon;
grant execute on function public.work_calendar_visible_members() to authenticated,service_role;

create or replace function public.list_work_calendar_team_members()
returns table(id uuid,full_name text,job_title text)
language sql stable security invoker set search_path='' as $$
 select p.id,p.full_name,p.job_title from public.profiles p
 join public.work_calendar_visible_members() s on s.member_id=p.id
 order by p.full_name asc nulls last,p.id;
$$;
create or replace function public.has_work_calendar_team_members()
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.work_calendar_visible_members());
$$;

-- Replace only the audited authorization CTE, retaining pagination, carryover,
-- date validation, sorting, aggregates and each RPC's existing ACL/owner.
do $migration$
declare identity text; definition text; patched text; cte_name text; start_at integer; end_at integer; old_cte text;
begin
 foreach identity in array array[
  'public.list_work_calendar_team_entries(date,date)',
  'public.list_work_calendar_member_entries(uuid,date)',
  'public.list_work_calendar_team_overview_options()',
  'public.search_work_calendar_team_members(text,integer,integer,uuid,uuid)',
  'public.get_work_calendar_team_member(uuid)',
  'public.list_work_calendar_team_overview(uuid,uuid,uuid,text,text,date,text,integer,integer)'
 ] loop
  definition:=replace(pg_get_functiondef(identity::regprocedure),E'\r\n',E'\n');
  if position('public.work_calendar_visible_members()' in definition)>0 then continue;end if;
  cte_name:=case when position('with recursive authorized as (' in lower(definition))>0 then 'authorized' else 'subordinates' end;
  start_at:=position('with recursive '||cte_name||' as (' in lower(definition));
  end_at:=position(E'\n    )' in substring(definition from start_at));
  old_cte:=substring(definition from start_at for end_at+5);
  if start_at=0 or end_at=0 or position('parent_id' in old_cte)=0 or position('union' in lower(old_cte))=0 then
   raise exception 'Unknown calendar scope CTE: %; audit before applying',identity;
  end if;
  patched:=left(definition,start_at-1)||'with '||cte_name||' as (select scope.member_id as id,array[scope.member_id] as path from public.work_calendar_visible_members() scope)'
   ||substring(definition from start_at+end_at+5);
  execute patched;
 end loop;
end $migration$;

drop policy if exists work_calendar_entries_select on public.work_calendar_entries;
create policy work_calendar_entries_select on public.work_calendar_entries for select to authenticated
 using(owner_id=(select auth.uid()) or owner_id in(select member_id from public.work_calendar_visible_members()));
drop policy if exists work_calendar_events_select on public.work_calendar_events;
create policy work_calendar_events_select on public.work_calendar_events for select to authenticated
 using(owner_id=(select auth.uid()) or owner_id in(select member_id from public.work_calendar_visible_members()));

notify pgrst,'reload schema';
commit;
