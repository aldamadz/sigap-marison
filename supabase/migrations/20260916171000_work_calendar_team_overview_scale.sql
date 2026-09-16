-- CAL-03 F4A Director Scale — route integration correction.
--
-- Why this exists (follow-up to 20260916170000):
--   1. The bootstrap of the Director Scale team tab eagerly loaded the whole
--      subordinate roster through list_work_calendar_team_members. For a
--      Direktur Utama with hundreds of descendants that is still too much for
--      a first paint, and it is unnecessary: the page only needs to know
--      WHETHER the Tim tab is available.
--   2. list_work_calendar_team_overview_options() returned every authorized
--      member (name + job title). Loading all member names as soon as the
--      page opens repeats the same mistake in a different place.
--   3. A page beyond the filtered range produced zero rows, so the client
--      could not distinguish "no members match" from "offset out of range".
--
-- Canonical organization mapping is unchanged and is NOT extended here:
--   Kantor -> master_offices, Departemen -> master_departments,
--   Anggota -> profiles. Entitas stays unavailable (no canonical per-member
--   relation), so it is still not exposed.
--
-- Authorization is unchanged: scope is always the recursive, cycle-safe
-- parent_id hierarchy rooted at auth.uid(); every read is fail-closed on
-- is_active IS TRUE and deleted_at IS NULL; filters may only narrow.

-- ---------------------------------------------------------------------------
-- has_work_calendar_team_members
--
-- Minimal availability probe: does the actor have at least one authorized,
-- active subordinate? Returns a single boolean and never returns names, so the
-- bootstrap can decide whether to show the Tim tab without loading a roster.
-- ---------------------------------------------------------------------------
create or replace function public.has_work_calendar_team_members()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
    with recursive authorized as (
        select p.id, array[p.id] as path
        from public.profiles p
        where p.parent_id = (select auth.uid())
          and p.id <> (select auth.uid())
          and p.deleted_at is null
          and p.is_active is true
        union all
        select child.id, a.path || child.id
        from public.profiles child
        join authorized a on child.parent_id = a.id
        where not (child.id = any(a.path))
          and child.id <> (select auth.uid())
          and child.deleted_at is null
          and child.is_active is true
    )
    select exists (select 1 from authorized);
$$;

revoke all on function public.has_work_calendar_team_members() from public, anon;
grant execute on function public.has_work_calendar_team_members() to authenticated;

-- ---------------------------------------------------------------------------
-- list_work_calendar_team_overview_options
--
-- Replaced to return ONLY the small organization dimensions (Kantor and
-- Departemen) with member counts. Member rows are intentionally removed: a
-- roster of every authorized member must be searched, bounded, and paginated,
-- never dumped as filter options. Signature is unchanged so existing grants
-- remain valid.
-- ---------------------------------------------------------------------------
create or replace function public.list_work_calendar_team_overview_options()
returns table (
    option_kind text,
    option_id uuid,
    option_label text,
    option_sublabel text,
    office_id uuid,
    department_id uuid,
    member_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
    with recursive authorized as (
        select p.id, array[p.id] as path
        from public.profiles p
        where p.parent_id = (select auth.uid())
          and p.id <> (select auth.uid())
          and p.deleted_at is null
          and p.is_active is true
        union all
        select child.id, a.path || child.id
        from public.profiles child
        join authorized a on child.parent_id = a.id
        where not (child.id = any(a.path))
          and child.id <> (select auth.uid())
          and child.deleted_at is null
          and child.is_active is true
    ),
    members as (
        select p.id, p.office_id, p.department_id
        from public.profiles p
        join (select distinct a.id from authorized a) a on a.id = p.id
        where p.deleted_at is null
          and p.is_active is true
    )
    select
        'office'::text as option_kind,
        m.office_id as option_id,
        coalesce(o.name, '') as option_label,
        ''::text as option_sublabel,
        m.office_id,
        null::uuid as department_id,
        count(*) as member_count
    from members m
    left join public.master_offices o on o.id = m.office_id
    where m.office_id is not null
    group by m.office_id, o.name
    union all
    select
        'department'::text,
        m.department_id,
        coalesce(d.name, ''),
        '',
        -- Departments are global master data with no office parent, so the
        -- canonical office<->department relation is only observable through
        -- members. Emitting office_id per (department, office) pair lets the UI
        -- cascade Kantor -> Departemen without inventing a relation, and each
        -- row's member_count stays scoped to that office.
        m.office_id,
        m.department_id,
        count(*)
    from members m
    left join public.master_departments d on d.id = m.department_id
    where m.department_id is not null
    group by m.department_id, d.name, m.office_id
    order by 1 asc, 3 asc nulls last, 2 asc;
$$;

revoke all on function public.list_work_calendar_team_overview_options() from public, anon;
grant execute on function public.list_work_calendar_team_overview_options() to authenticated;

-- ---------------------------------------------------------------------------
-- search_work_calendar_team_members
--
-- Authorized, bounded member search for the Anggota filter. Never returns more
-- than the requested page (hard-capped at 50) and always reports total_count so
-- the UI can say "showing X of Y" without ever loading the full roster.
-- ---------------------------------------------------------------------------
create or replace function public.search_work_calendar_team_members(
    p_search text default null,
    p_limit integer default 25,
    p_offset integer default 0,
    p_office_id uuid default null,
    p_department_id uuid default null
)
returns table (
    member_id uuid,
    full_name text,
    job_title text,
    office_id uuid,
    department_id uuid,
    total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_actor uuid := auth.uid();
    v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
    v_offset integer := greatest(coalesce(p_offset, 0), 0);
    v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
    if v_actor is null then
        raise exception 'Sesi login tidak tersedia.' using errcode = '42501';
    end if;

    return query
    with recursive authorized as (
        select p.id, array[p.id] as path
        from public.profiles p
        where p.parent_id = v_actor
          and p.id <> v_actor
          and p.deleted_at is null
          and p.is_active is true
        union all
        select child.id, a.path || child.id
        from public.profiles child
        join authorized a on child.parent_id = a.id
        where not (child.id = any(a.path))
          and child.id <> v_actor
          and child.deleted_at is null
          and child.is_active is true
    ),
    matched as (
        select p.id, p.full_name, p.job_title, p.office_id, p.department_id
        from public.profiles p
        join (select distinct a.id from authorized a) a on a.id = p.id
        where p.deleted_at is null
          and p.is_active is true
          and (p_office_id is null or p.office_id = p_office_id)
          and (p_department_id is null or p.department_id = p_department_id)
          and (
            v_search is null
            or p.full_name ilike '%' || v_search || '%'
            or coalesce(p.nik, '') ilike '%' || v_search || '%'
            or coalesce(p.job_title, '') ilike '%' || v_search || '%'
          )
    )
    select
        m.id as member_id,
        m.full_name,
        m.job_title,
        m.office_id,
        m.department_id,
        count(*) over () as total_count
    from matched m
    order by m.full_name asc nulls last, m.id asc
    limit v_limit
    offset v_offset;
end;
$$;

revoke all on function public.search_work_calendar_team_members(
    text, integer, integer, uuid, uuid
) from public, anon;
grant execute on function public.search_work_calendar_team_members(
    text, integer, integer, uuid, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- get_work_calendar_team_member
--
-- Resolves exactly one authorized member by id. Used to validate a member id
-- coming from the URL so a deep link cannot introduce a name or an id outside
-- the actor's hierarchy. Returns zero rows when the id is not authorized.
-- ---------------------------------------------------------------------------
create or replace function public.get_work_calendar_team_member(
    p_member_id uuid
)
returns table (
    member_id uuid,
    full_name text,
    job_title text,
    office_id uuid,
    department_id uuid
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_actor uuid := auth.uid();
begin
    if v_actor is null then
        raise exception 'Sesi login tidak tersedia.' using errcode = '42501';
    end if;

    if p_member_id is null then
        return;
    end if;

    return query
    with recursive authorized as (
        select p.id, array[p.id] as path
        from public.profiles p
        where p.parent_id = v_actor
          and p.id <> v_actor
          and p.deleted_at is null
          and p.is_active is true
        union all
        select child.id, a.path || child.id
        from public.profiles child
        join authorized a on child.parent_id = a.id
        where not (child.id = any(a.path))
          and child.id <> v_actor
          and child.deleted_at is null
          and child.is_active is true
    )
    select
        p.id as member_id,
        p.full_name,
        p.job_title,
        p.office_id,
        p.department_id
    from public.profiles p
    where p.id = p_member_id
      and p.deleted_at is null
      and p.is_active is true
      and exists (select 1 from authorized a where a.id = p.id);
end;
$$;

revoke all on function public.get_work_calendar_team_member(uuid) from public, anon;
grant execute on function public.get_work_calendar_team_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- list_work_calendar_team_overview (replaced)
--
-- Same contract as 20260916170000, with one correction: the offset is clamped
-- to the last available page of the filtered set. Before this, requesting a
-- page beyond the range returned zero rows, which the client could not tell
-- apart from "no members match" and therefore reported total_count = 0.
-- total_count is now read from a dedicated count CTE that survives LIMIT, and
-- aggregates remain window functions over the whole filtered result.
-- ---------------------------------------------------------------------------
create or replace function public.list_work_calendar_team_overview(
    p_office_id uuid default null,
    p_department_id uuid default null,
    p_member_id uuid default null,
    p_search text default null,
    p_status text default null,
    p_work_date date default null,
    p_sort text default 'priority',
    p_limit integer default 25,
    p_offset integer default 0
)
returns table (
    member_id uuid,
    full_name text,
    job_title text,
    office_id uuid,
    office_name text,
    department_id uuid,
    department_name text,
    member_total bigint,
    member_completed bigint,
    member_in_progress bigint,
    member_planned bigint,
    member_blocked bigint,
    member_overdue bigint,
    total_count bigint,
    aggregate_total bigint,
    aggregate_completed bigint,
    aggregate_in_progress bigint,
    aggregate_planned bigint,
    aggregate_blocked bigint,
    aggregate_overdue bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_actor uuid := auth.uid();
    v_today date := (now() at time zone 'Asia/Jakarta')::date;
    v_selected_date date := coalesce(p_work_date, (now() at time zone 'Asia/Jakarta')::date);
    v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
    v_offset integer := greatest(coalesce(p_offset, 0), 0);
    v_search text := nullif(btrim(coalesce(p_search, '')), '');
    v_status text := nullif(btrim(lower(coalesce(p_status, ''))), '');
    v_sort text := lower(coalesce(p_sort, 'priority'));
begin
    if v_actor is null then
        raise exception 'Sesi login tidak tersedia.' using errcode = '42501';
    end if;

    if v_status is not null
       and v_status not in ('planned', 'in_progress', 'completed', 'blocked', 'overdue') then
        raise exception 'Filter status tidak valid.' using errcode = '22023';
    end if;

    if v_sort not in ('priority', 'progress_asc', 'progress_desc', 'name') then
        v_sort := 'priority';
    end if;

    return query
    with recursive authorized as (
        select p.id, array[p.id] as path
        from public.profiles p
        where p.parent_id = v_actor
          and p.id <> v_actor
          and p.deleted_at is null
          and p.is_active is true
        union all
        select child.id, a.path || child.id
        from public.profiles child
        join authorized a on child.parent_id = a.id
        where not (child.id = any(a.path))
          and child.id <> v_actor
          and child.deleted_at is null
          and child.is_active is true
    ),
    scope_members as (
        select p.id, p.full_name, p.job_title, p.office_id, p.department_id
        from public.profiles p
        join (select distinct a.id from authorized a) a on a.id = p.id
        where p.deleted_at is null
          and p.is_active is true
          and (p_office_id is null or p.office_id = p_office_id)
          and (p_department_id is null or p.department_id = p_department_id)
          and (p_member_id is null or p.id = p_member_id)
          and (
            v_search is null
            or p.full_name ilike '%' || v_search || '%'
            or coalesce(p.nik, '') ilike '%' || v_search || '%'
            or coalesce(p.job_title, '') ilike '%' || v_search || '%'
          )
    ),
    entry_scope as (
        select e.owner_id, e.status, e.work_date
        from public.work_calendar_entries e
        join scope_members m on m.id = e.owner_id
        where e.deleted_at is null
          and e.work_date = v_selected_date
          and (
            v_status is null
            or (v_status = 'overdue' and e.status <> 'completed' and e.work_date < v_today)
            or (v_status <> 'overdue' and e.status = v_status)
          )
    ),
    member_metrics as (
        select
            m.id,
            m.full_name,
            m.job_title,
            m.office_id,
            m.department_id,
            count(e.owner_id) as member_total,
            count(*) filter (where e.status = 'completed') as member_completed,
            count(*) filter (where e.status = 'in_progress') as member_in_progress,
            count(*) filter (where e.status = 'planned') as member_planned,
            count(*) filter (where e.status = 'blocked') as member_blocked,
            count(*) filter (
                where e.status <> 'completed' and e.work_date < v_today
            ) as member_overdue
        from scope_members m
        left join entry_scope e on e.owner_id = m.id
        group by m.id, m.full_name, m.job_title, m.office_id, m.department_id
    ),
    filtered as (
        select f.* from member_metrics f
        where v_status is null or f.member_total > 0
    ),
    enriched as (
        select
            f.*,
            coalesce(o.name, '') as office_name,
            coalesce(d.name, '') as department_name
        from filtered f
        left join public.master_offices o on o.id = f.office_id
        left join public.master_departments d on d.id = f.department_id
    ),
    counted as (
        select count(*) as total_count from enriched
    ),
    ranked as (
        select
            e.id as member_id,
            e.full_name,
            e.job_title,
            e.office_id,
            e.office_name,
            e.department_id,
            e.department_name,
            e.member_total,
            e.member_completed,
            e.member_in_progress,
            e.member_planned,
            e.member_blocked,
            e.member_overdue,
            c.total_count,
            coalesce(sum(e.member_total) over (), 0)::bigint as aggregate_total,
            coalesce(sum(e.member_completed) over (), 0)::bigint as aggregate_completed,
            coalesce(sum(e.member_in_progress) over (), 0)::bigint as aggregate_in_progress,
            coalesce(sum(e.member_planned) over (), 0)::bigint as aggregate_planned,
            coalesce(sum(e.member_blocked) over (), 0)::bigint as aggregate_blocked,
            coalesce(sum(e.member_overdue) over (), 0)::bigint as aggregate_overdue,
            row_number() over (
                order by
                    case
                        when v_sort = 'priority'
                            then case when e.member_blocked > 0 or e.member_overdue > 0 then 0 else 1 end
                    end asc nulls last,
                    case
                        when v_sort = 'priority'
                            then case when e.member_total = 0 then null
                                      else e.member_completed::numeric / e.member_total end
                    end asc nulls last,
                    case
                        when v_sort = 'progress_asc'
                            then case when e.member_total = 0 then null
                                      else e.member_completed::numeric / e.member_total end
                    end asc nulls last,
                    case
                        when v_sort = 'progress_desc'
                            then case when e.member_total = 0 then null
                                      else e.member_completed::numeric / e.member_total end
                    end desc nulls last,
                    case when v_sort = 'name' then e.full_name end asc nulls last,
                    e.full_name asc nulls last,
                    e.id asc
            ) as rn
        from enriched e
        cross join counted c
    )
    select
        r.member_id,
        r.full_name,
        r.job_title,
        r.office_id,
        r.office_name,
        r.department_id,
        r.department_name,
        r.member_total,
        r.member_completed,
        r.member_in_progress,
        r.member_planned,
        r.member_blocked,
        r.member_overdue,
        r.total_count,
        r.aggregate_total,
        r.aggregate_completed,
        r.aggregate_in_progress,
        r.aggregate_planned,
        r.aggregate_blocked,
        r.aggregate_overdue
    from ranked r
    -- Clamp an out-of-range offset to the last page so a non-empty result is
    -- returned whenever at least one member matches. The clamp is applied in
    -- WHERE (not OFFSET) because OFFSET cannot reference query columns, and
    -- window aggregates are already computed over the whole filtered set.
    where r.rn > least(
              v_offset,
              greatest((r.total_count - 1) / v_limit, 0) * v_limit
          )
      and r.rn <= least(
              v_offset,
              greatest((r.total_count - 1) / v_limit, 0) * v_limit
          ) + v_limit
    order by r.rn asc;
end;
$$;

revoke all on function public.list_work_calendar_team_overview(
    uuid, uuid, uuid, text, text, date, text, integer, integer
) from public, anon;
grant execute on function public.list_work_calendar_team_overview(
    uuid, uuid, uuid, text, text, date, text, integer, integer
) to authenticated;
