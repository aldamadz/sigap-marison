-- Migration: list_work_calendar_team_members RPC for CAL-03 F3
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
