begin;

-- Keep the existing RPC signature while sharing the same scoped query and SLA logic.
do $dashboard$
declare
  definition text;
  dashboard_owner name;
  old_header constant text := 'public.get_actionable_dashboard(';
  old_filter constant text := $filter$where c.bucket not in ('completed','rejected') or
   ((p_from is null or c.finished_at>=p_from) and (p_to is null or c.finished_at<p_to))$filter$;
begin
  select replace(pg_get_functiondef(oid),chr(13),''),pg_get_userbyid(proowner)
  into strict definition,dashboard_owner from pg_proc
  where oid='public.get_actionable_dashboard(text,text,timestamptz,timestamptz,text,integer,integer)'::regprocedure;
  if to_regprocedure('public.get_actionable_dashboard_by_period(text,text,timestamptz,timestamptz,text,integer,integer,boolean)') is null then
    if length(definition)-length(replace(definition,old_filter,''))<>length(old_filter)
      or position(old_header in definition)=0 or position(E'\n RETURNS ' in definition)=0 then
      raise exception 'Unknown dashboard date filter; audit the live definition.';
    end if;
    definition := 'CREATE FUNCTION public.get_actionable_dashboard_by_period(p_scope text,p_bucket text,p_from timestamptz,p_to timestamptz,p_search text,p_limit integer,p_offset integer,p_filter_created boolean)'
      || substring(definition from position(E'\n RETURNS ' in definition));
    execute replace(definition,old_filter,$filter$where case when p_filter_created is true then
   (p_from is null or c.created_at>=p_from) and (p_to is null or c.created_at<p_to)
   else c.bucket not in ('completed','rejected') or
   ((p_from is null or c.finished_at>=p_from) and (p_to is null or c.finished_at<p_to)) end$filter$);
    execute format('alter function public.get_actionable_dashboard_by_period(text,text,timestamptz,timestamptz,text,integer,integer,boolean) owner to %I',dashboard_owner);
  end if;
end $dashboard$;

revoke all on function public.get_actionable_dashboard_by_period(text,text,timestamptz,timestamptz,text,integer,integer,boolean) from public,anon,service_role;
grant execute on function public.get_actionable_dashboard_by_period(text,text,timestamptz,timestamptz,text,integer,integer,boolean) to authenticated;

create or replace function public.get_actionable_dashboard(
  p_scope text default 'mine',p_bucket text default 'active',
  p_from timestamptz default null,p_to timestamptz default null,
  p_search text default null,p_limit integer default 12,p_offset integer default 0
) returns jsonb language sql stable security definer set search_path='' as $$
  select public.get_actionable_dashboard_by_period(p_scope,p_bucket,p_from,p_to,p_search,p_limit,p_offset,false);
$$;

create table if not exists public.surat_personal_stars (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  surat_id uuid not null references public.surat_registrasi(id) on delete cascade,
  primary key (user_id,surat_id)
);
create index if not exists surat_personal_stars_surat_id_idx on public.surat_personal_stars(surat_id);
alter table public.surat_personal_stars enable row level security;
revoke all on public.surat_personal_stars from public,anon,authenticated;
grant select,delete on public.surat_personal_stars to authenticated;
grant insert (surat_id) on public.surat_personal_stars to authenticated;

drop policy if exists personal_stars_read_own on public.surat_personal_stars;
create policy personal_stars_read_own on public.surat_personal_stars
for select to authenticated using (user_id=(select auth.uid()) and public.can_monitor_surat_progress(surat_id));
drop policy if exists personal_stars_insert_own on public.surat_personal_stars;
create policy personal_stars_insert_own on public.surat_personal_stars
for insert to authenticated with check (user_id=(select auth.uid()) and public.can_monitor_surat_progress(surat_id));
drop policy if exists personal_stars_delete_own on public.surat_personal_stars;
create policy personal_stars_delete_own on public.surat_personal_stars
for delete to authenticated using (user_id=(select auth.uid()));

-- Filter before counting and paging, with the canonical document visibility predicate intact.
do $monitoring$
declare
  definition text;
  monitoring_owner name;
  anchor constant text := $filter$or surat.status = p_status)$filter$;
  row_anchor constant text := $filter$'id', surat.id, 'no_surat', surat.no_surat, 'judul_surat', surat.judul_surat,$filter$;
begin
  select pg_get_functiondef(oid),pg_get_userbyid(proowner) into strict definition,monitoring_owner
  from pg_proc where oid='public.get_surat_monitoring_page(integer,integer,text,text,timestamptz,timestamptz)'::regprocedure;
  if position('public.surat_personal_stars' in definition)=0 then
    if length(definition)-length(replace(definition,anchor,''))<>length(anchor)
      or length(definition)-length(replace(definition,row_anchor,''))<>length(row_anchor)
      or position('public.can_monitor_surat_progress(surat.id)' in definition)=0 then
      raise exception 'Unknown monitoring status filter; audit the live definition.';
    end if;
    execute format('alter table public.surat_personal_stars owner to %I',monitoring_owner);
    definition := replace(definition,anchor,$filter$or (lower(p_status) = 'marked' and exists (
          select 1 from public.surat_personal_stars star
          where star.user_id = (select auth.uid()) and star.surat_id = surat.id
        ))
        or surat.status = p_status)$filter$);
    execute replace(definition,row_anchor,row_anchor || $row$
        'is_starred', exists (select 1 from public.surat_personal_stars star
          where star.user_id=(select auth.uid()) and star.surat_id=surat.id),$row$);
  end if;
end $monitoring$;

notify pgrst,'reload schema';
commit;
