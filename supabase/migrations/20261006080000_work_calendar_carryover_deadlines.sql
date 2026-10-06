-- CAL-03 / issue #466: forward-only carryover and explicit deadlines.
-- Dependencies (apply in order; no historical migration is edited):
-- 20260915072607_work_calendar_entries.sql
-- 20260915093000_work_calendar_team_members.sql
-- 20260916170000_work_calendar_team_overview.sql
-- 20260916171000_work_calendar_team_overview_scale.sql
-- 20260917120000_work_calendar_lifecycle.sql
-- 20260918090000_work_calendar_holidays.sql
-- 20260918120000_work_calendar_notifications.sql
--
-- Latest checked-in production recovery (20260923130000) does not override
-- these RPCs. Retain the canonical signatures, authorization CTEs, security
-- modes, search paths, ordering and pagination. CREATE OR REPLACE preserves
-- existing owners and ACLs: no grants, table changes, backfill or scheduled writes.
-- Return each stored row once with its original work_date. Only work carries,
-- never past Jakarta today or its Jakarta completion day. A completed row
-- without completed_at is visible only on its original day.
-- Only due_date is a deadline. Notification writes remain on-demand through
-- the existing generator/helper; applying this migration does not call them.

begin;

create or replace function public.list_work_calendar_team_entries(
    p_start_date date,
    p_end_date date
) returns setof public.work_calendar_entries
language plpgsql
security invoker
as $$
begin
    if p_start_date is null or p_end_date is null then
        raise exception 'Parameter tanggal wajib diisi';
    end if;

    if p_start_date > p_end_date then
        raise exception 'Rentang tanggal tidak valid';
    end if;

    if (p_end_date - p_start_date) > 366 then
        raise exception 'Rentang tanggal maksimal 366 hari';
    end if;

    return query
    with recursive subordinates as (
        select p.id, array[p.id] as path
        from public.profiles p
        where p.parent_id = (select auth.uid())
          and p.id <> (select auth.uid())
          and p.deleted_at is null
          and p.is_active is true
        union
        select child.id, s.path || child.id
        from public.profiles child
        join subordinates s on child.parent_id = s.id
        where not (child.id = any(s.path))
          and child.id <> (select auth.uid())
          and child.deleted_at is null
          and child.is_active is true
    )
    select wce.*
    from public.work_calendar_entries wce
    join subordinates s on s.id = wce.owner_id
    where wce.deleted_at is null
      and wce.owner_id <> (select auth.uid())
      and wce.work_date <= p_end_date
      and (
          wce.work_date >= p_start_date
          or (
              wce.kind = 'work'
              and p_start_date <= (now() at time zone 'Asia/Jakarta')::date
              and (
                  wce.status <> 'completed'
                  or (wce.completed_at at time zone 'Asia/Jakarta')::date >= p_start_date
              )
          )
      )
    order by
        wce.work_date asc,
        wce.starts_at asc nulls first,
        wce.created_at asc,
        wce.id asc;
end;
$$;

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
        select e.owner_id, e.status, e.due_date
        from public.work_calendar_entries e
        join scope_members m on m.id = e.owner_id
        where e.deleted_at is null
          and (
              e.work_date = v_selected_date
              or (
                  e.kind = 'work'
                  and e.work_date < v_selected_date
                  and v_selected_date <= v_today
                  and (
                      e.status <> 'completed'
                      or (e.completed_at at time zone 'Asia/Jakarta')::date >= v_selected_date
                  )
              )
          )
          and (
            v_status is null
            or (v_status = 'overdue' and e.status <> 'completed' and e.due_date is not null and e.due_date < v_today)
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
                where e.status <> 'completed' and e.due_date is not null and e.due_date < v_today
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
      and (
          e.work_date = p_work_date
          or (
              e.kind = 'work'
              and e.work_date < p_work_date
              and p_work_date <= (now() at time zone 'Asia/Jakarta')::date
              and (
                  e.status <> 'completed'
                  or (e.completed_at at time zone 'Asia/Jakarta')::date >= p_work_date
              )
          )
      )
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

create or replace function public.get_work_calendar_dashboard_entries(
    p_owner_id uuid,
    p_today date
)
returns setof public.work_calendar_entries
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
    if p_owner_id is null or p_today is null then
        raise exception 'Parameter pemilik dan tanggal wajib diisi';
    end if;

    return query
    select e.*
    from public.work_calendar_entries e
    where e.owner_id = p_owner_id
      and e.deleted_at is null
      and e.status <> 'completed'
      and (
          e.work_date = p_today
          or (
              e.kind = 'work'
              and e.work_date < p_today
              and p_today <= (now() at time zone 'Asia/Jakarta')::date
          )
          or (e.due_date is not null and e.due_date < p_today)
      )
    order by
        e.work_date asc,
        e.starts_at asc nulls first,
        e.created_at asc,
        e.id asc;
end;
$$;

create or replace function public.generate_work_calendar_notifications(
    p_today date default null,
    p_escalation_work_days integer default 2,
    p_debounce_hours integer default 6
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user uuid := auth.uid();
    v_today date := coalesce(p_today, (now() at time zone 'Asia/Jakarta')::date);
    v_threshold integer := greatest(coalesce(p_escalation_work_days, 2), 1);
    v_inserted integer := 0;
    v_count integer;
    v_titles text;
    v_entry_ids uuid[];
    v_message text;
begin
    if v_user is null then
        raise exception 'Authentication required';
    end if;

    -- (a) Tenggat terlewati untuk pekerjaan pemanggil.
    select
        count(*)::integer,
        string_agg(e.title, ', ' order by e.due_date, e.id),
        array_agg(e.id order by e.due_date, e.id)
      into v_count, v_titles, v_entry_ids
      from public.work_calendar_entries e
     where e.owner_id = v_user
       and e.deleted_at is null
       and e.status <> 'completed'
       and e.due_date is not null
       and e.due_date < v_today;

    if v_count > 0 then
        v_message := v_count || ' pekerjaan melewati tenggat: ' || public.work_calendar_truncate_titles(v_titles, v_count);
        if public.work_calendar_emit_notification(
            v_user,
            'deadline_overdue',
            'warning',
            'Tenggat pekerjaan terlewati',
            v_message,
            '/calendar',
            'work-calendar:deadline_overdue:' || v_user::text || ':' || v_today::text,
            v_entry_ids,
            p_debounce_hours
        ) then
            v_inserted := v_inserted + 1;
        end if;
    end if;

    -- (b) Pengingat tindak lanjut untuk pekerjaan terhambat milik pemanggil.
    select
        count(*)::integer,
        string_agg(e.title, ', ' order by be.blocked_at, e.id),
        array_agg(e.id order by be.blocked_at, e.id)
      into v_count, v_titles, v_entry_ids
      from public.work_calendar_entries e
      left join lateral (
          select max(ev.created_at) as blocked_at
            from public.work_calendar_events ev
           where ev.entry_id = e.id
             and ev.event_type = 'status_changed'
             and ev.to_status = 'blocked'
      ) be on true
     where e.owner_id = v_user
       and e.deleted_at is null
       and e.status = 'blocked'
       and (
           e.work_date = v_today
           or (
               e.kind = 'work'
               and e.work_date < v_today
               and v_today <= (now() at time zone 'Asia/Jakarta')::date
           )
       )
       and public.work_calendar_count_work_days(
               (coalesce(be.blocked_at, e.updated_at) at time zone 'Asia/Jakarta')::date,
               v_today,
               public.work_calendar_work_days_for_user(v_user)
           ) >= 1;

    if v_count > 0 then
        v_message := v_count || ' pekerjaan terhambat perlu ditindaklanjuti: ' || public.work_calendar_truncate_titles(v_titles, v_count);
        if public.work_calendar_emit_notification(
            v_user,
            'follow_up_reminder',
            'info',
            'Pengingat tindak lanjut',
            v_message,
            '/calendar',
            'work-calendar:follow_up_reminder:' || v_user::text || ':' || v_today::text,
            v_entry_ids,
            p_debounce_hours
        ) then
            v_inserted := v_inserted + 1;
        end if;
    end if;

    -- (c) Eskalasi ke atasan untuk pekerjaan bawahan yang terhambat melewati
    --     ambang hari kerja. Atasan yang memanggil generator ini menerima
    --     satu notifikasi ter-batch.
    with recursive subordinates as (
        select p.id, array[p.id] as path
        from public.profiles p
        where p.parent_id = v_user
          and p.id <> v_user
          and p.deleted_at is null
        union
        select child.id, s.path || child.id
        from public.profiles child
        join subordinates s on child.parent_id = s.id
        where not (child.id = any(s.path))
          and child.id <> v_user
          and child.deleted_at is null
    ),
    blocked as (
        select
            e.id,
            e.title,
            coalesce(be.blocked_at, e.updated_at) as blocked_at,
            public.work_calendar_work_days_for_user(e.owner_id) as work_days
        from public.work_calendar_entries e
        join subordinates s on s.id = e.owner_id
        left join lateral (
            select max(ev.created_at) as blocked_at
              from public.work_calendar_events ev
             where ev.entry_id = e.id
               and ev.event_type = 'status_changed'
               and ev.to_status = 'blocked'
        ) be on true
        where e.deleted_at is null
          and e.status = 'blocked'
          and (
              e.work_date = v_today
              or (
                  e.kind = 'work'
                  and e.work_date < v_today
                  and v_today <= (now() at time zone 'Asia/Jakarta')::date
              )
          )
    )
    select
        count(*)::integer,
        string_agg(b.title, ', ' order by b.blocked_at, b.id),
        array_agg(b.id order by b.blocked_at, b.id)
      into v_count, v_titles, v_entry_ids
      from blocked b
     where public.work_calendar_count_work_days(
               (b.blocked_at at time zone 'Asia/Jakarta')::date,
               v_today,
               b.work_days
           ) >= v_threshold;

    if v_count > 0 then
        v_message := v_count || ' pekerjaan bawahan terhambat >= ' || v_threshold
            || ' hari kerja: ' || public.work_calendar_truncate_titles(v_titles, v_count);
        if public.work_calendar_emit_notification(
            v_user,
            'blocked_escalation',
            'error',
            'Eskalasi: pekerjaan bawahan terhambat',
            v_message,
            '/calendar',
            'work-calendar:blocked_escalation:' || v_user::text || ':' || v_today::text,
            v_entry_ids,
            p_debounce_hours
        ) then
            v_inserted := v_inserted + 1;
        end if;
    end if;

    return v_inserted;
end;
$$;

commit;
