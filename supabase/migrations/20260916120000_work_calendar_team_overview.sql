-- CAL-03 F4A Director Scale: server-side Team Overview.
--
-- Why this exists: the F4A team view previously loaded every subordinate entry
-- into the browser and built groups client-side. For a Direktur Utama with
-- hundreds of active descendants that is not viable, so the overview is now
-- paginated and aggregated inside the database.
--
-- Canonical organization mapping (verified against the staging schema; do not
-- invent relations):
--   Kantor      -> public.master_offices     (id, code, name, kedudukan, parent_id)
--   Departemen  -> public.master_departments (id, name, code)   -- no office/entity parent
--   Anggota     -> public.profiles           (nik, full_name, job_title, role,
--                                             parent_id, is_active, deleted_at,
--                                             office_id -> master_offices,
--                                             department_id -> master_departments)
--   Entitas     -> public.master_entities    (reachable only via
--                                             master_projects.office_id/entity_id)
--
-- There is no canonical profile/office/department -> entity relation, so the
-- Entitas filter is intentionally NOT exposed here. Emitting an entity filter
-- would require inventing an organization model, which is out of bounds.
--
-- Authorization model: the only source of scope is the recursive parent_id
-- hierarchy rooted at auth.uid(). Filters may only narrow that scope; they can
-- never widen it. Every read is fail-closed on is_active IS TRUE and
-- deleted_at IS NULL, and recursion is cycle-safe via a path array.

-- ---------------------------------------------------------------------------
-- list_work_calendar_team_overview
--
-- Returns one page of authorized team members with per-member metrics, the
-- total number of filtered members, and aggregates computed over the whole
-- filtered result (window functions run before LIMIT), not only the page.
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
          -- Filters only narrow the authorized set.
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
        -- With an active status filter, members without a matching entry are
        -- noise; without one, members without any entry must still appear.
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
    )
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
        count(*) over () as total_count,
        coalesce(sum(e.member_total) over (), 0)::bigint as aggregate_total,
        coalesce(sum(e.member_completed) over (), 0)::bigint as aggregate_completed,
        coalesce(sum(e.member_in_progress) over (), 0)::bigint as aggregate_in_progress,
        coalesce(sum(e.member_planned) over (), 0)::bigint as aggregate_planned,
        coalesce(sum(e.member_blocked) over (), 0)::bigint as aggregate_blocked,
        coalesce(sum(e.member_overdue) over (), 0)::bigint as aggregate_overdue
    from enriched e
    order by
        -- Default: blocked/overdue members first, then lowest completion.
        case
            when v_sort = 'priority'
                then case when e.member_blocked > 0 or e.member_overdue > 0 then 0 else 1 end
        end asc nulls last,
        -- Members without entries carry no progress signal, so they rank last
        -- (nulls last) instead of pretending to be 0% complete.
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
        -- Stable tie-breakers for every sort mode.
        e.full_name asc nulls last,
        e.id asc
    limit v_limit
    offset v_offset;
end;
$$;

revoke all on function public.list_work_calendar_team_overview(
    uuid, uuid, uuid, text, text, date, text, integer, integer
) from public, anon;
grant execute on function public.list_work_calendar_team_overview(
    uuid, uuid, uuid, text, text, date, text, integer, integer
) to authenticated;

-- ---------------------------------------------------------------------------
-- list_work_calendar_team_overview_options
--
-- Filter options (Kantor, Departemen, Anggota) present in the actor's
-- authorized hierarchy. Options are derived from the same recursive scope, so
-- the UI can never offer an office/department that is outside authorization.
-- `member_count` reflects how many authorized members the option covers.
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
        select p.id, p.full_name, p.job_title, p.office_id, p.department_id
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
        null::uuid,
        m.department_id,
        count(*)
    from members m
    left join public.master_departments d on d.id = m.department_id
    where m.department_id is not null
    group by m.department_id, d.name
    union all
    select
        'member'::text,
        m.id,
        m.full_name,
        coalesce(m.job_title, ''),
        m.office_id,
        m.department_id,
        1::bigint
    from members m
    order by 1 asc, 3 asc nulls last, 2 asc;
$$;

revoke all on function public.list_work_calendar_team_overview_options() from public, anon;
grant execute on function public.list_work_calendar_team_overview_options() to authenticated;

-- ---------------------------------------------------------------------------
-- list_work_calendar_member_entries
--
-- Lazy detail: the work of exactly one authorized member on one date. This is
-- what keeps the initial page from loading the whole organization's entries.
-- An unauthorized or out-of-scope member id returns zero rows, never data.
-- ---------------------------------------------------------------------------
create or replace function public.list_work_calendar_member_entries(
    p_member_id uuid,
    p_work_date date
)
returns setof public.work_calendar_entries
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
    if auth.uid() is null then
        raise exception 'Sesi login tidak tersedia.' using errcode = '42501';
    end if;

    if p_member_id is null or p_member_id = auth.uid() then
        raise exception 'Anggota tidak valid.' using errcode = '22023';
    end if;

    if p_work_date is null then
        raise exception 'Tanggal wajib diisi.' using errcode = '22023';
    end if;

    return query
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
    select e.*
    from public.work_calendar_entries e
    where e.owner_id = p_member_id
      and e.deleted_at is null
      and e.work_date = p_work_date
      and exists (select 1 from authorized a where a.id = p_member_id)
    order by
        case e.status
            when 'blocked' then 0
            when 'in_progress' then 1
            when 'planned' then 2
            else 3
        end asc,
        e.starts_at asc nulls first,
        e.created_at asc,
        e.id asc;
end;
$$;

revoke all on function public.list_work_calendar_member_entries(uuid, date) from public, anon;
grant execute on function public.list_work_calendar_member_entries(uuid, date) to authenticated;
