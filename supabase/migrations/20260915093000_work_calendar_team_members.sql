-- Migration: list_work_calendar_team_members RPC and active hierarchy synchronization for CAL-03 F3
create or replace function public.list_work_calendar_team_members()
returns table (
    id uuid,
    full_name text,
    job_title text
)
language plpgsql
security invoker
as $$
begin
    return query
    with recursive subordinates as (
        select p.id, p.full_name, p.job_title, array[p.id] as path
        from public.profiles p
        where p.parent_id = (select auth.uid())
          and p.id <> (select auth.uid())
          and p.deleted_at is null
          and p.is_active is true
        union
        select child.id, child.full_name, child.job_title, s.path || child.id
        from public.profiles child
        join subordinates s on child.parent_id = s.id
        where not (child.id = any(s.path))
          and child.id <> (select auth.uid())
          and child.deleted_at is null
          and child.is_active is true
    ),
    deduped as (
        select distinct s.id, s.full_name, s.job_title
        from subordinates s
    )
    select d.id, d.full_name, d.job_title
    from deduped d
    order by d.full_name asc nulls last, d.id asc;
end;
$$;

revoke all on function public.list_work_calendar_team_members() from public, anon;
grant execute on function public.list_work_calendar_team_members() to authenticated;

-- Synchronize work_calendar_entries_select policy with active hierarchy
drop policy if exists work_calendar_entries_select on public.work_calendar_entries;

create policy work_calendar_entries_select on public.work_calendar_entries
    for select to authenticated
    using (
        owner_id = (select auth.uid()) or
        owner_id in (
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
            select id from subordinates
        )
    );

-- Synchronize list_work_calendar_team_entries RPC with active hierarchy
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
      and wce.work_date >= p_start_date
      and wce.work_date <= p_end_date
    order by
        wce.work_date asc,
        wce.starts_at asc nulls first,
        wce.created_at asc,
        wce.id asc;
end;
$$;

revoke all on function public.list_work_calendar_team_entries(date, date) from public, anon;
grant execute on function public.list_work_calendar_team_entries(date, date) to authenticated;
