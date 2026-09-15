-- Fresh CAL-03 database migration for Unified Work Calendar
create table public.work_calendar_entries (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references public.profiles(id),
    work_date date not null,
    title text not null,
    realization text null,
    notes text null,
    location text null,
    status text not null default 'planned',
    kind text not null default 'work',
    is_all_day boolean not null default true,
    starts_at timestamptz null,
    ends_at timestamptz null,
    blocked_reason text null,
    completed_at timestamptz null,
    deleted_at timestamptz null,
    created_at timestamptz not null default clock_timestamp(),
    updated_at timestamptz not null default clock_timestamp()
);

alter table public.work_calendar_entries
    add constraint work_calendar_entries_title_length check (length(btrim(title)) between 1 and 180),
    add constraint work_calendar_entries_realization_length check (realization is null or length(realization) <= 500),
    add constraint work_calendar_entries_blocked_reason_length check (blocked_reason is null or length(blocked_reason) <= 300),
    add constraint work_calendar_entries_notes_length check (notes is null or length(notes) <= 1000),
    add constraint work_calendar_entries_location_length check (location is null or length(location) <= 120),
    add constraint work_calendar_entries_status_check check (status in ('planned', 'in_progress', 'completed', 'blocked')),
    add constraint work_calendar_entries_kind_check check (kind in ('work', 'event', 'availability')),
    add constraint work_calendar_entries_all_day_check check (
        (is_all_day = true and starts_at is null and ends_at is null) or
        (is_all_day = false and starts_at is not null and ends_at is not null)
    ),
    add constraint work_calendar_entries_time_check check (starts_at is null or ends_at is null or ends_at > starts_at),
    add constraint work_calendar_entries_completed_check check (
        (status = 'completed' and realization is not null and completed_at is not null) or
        (status <> 'completed' and completed_at is null)
    ),
    add constraint work_calendar_entries_blocked_check check (
        (status = 'blocked' and blocked_reason is not null) or
        (status <> 'blocked' and blocked_reason is null)
    );

create index idx_work_calendar_entries_owner_date on public.work_calendar_entries (owner_id, work_date) where deleted_at is null;
create index idx_work_calendar_entries_work_date on public.work_calendar_entries (work_date) where deleted_at is null;

create or replace function public.work_calendar_entries_before_change()
returns trigger
language plpgsql
as $$
begin
    -- Trim and normalize string fields
    NEW.title = nullif(btrim(NEW.title), '');
    NEW.realization = nullif(btrim(NEW.realization), '');
    NEW.notes = nullif(btrim(NEW.notes), '');
    NEW.location = nullif(btrim(NEW.location), '');
    NEW.blocked_reason = nullif(btrim(NEW.blocked_reason), '');

    if TG_OP = 'UPDATE' then
        if NEW.id <> OLD.id or NEW.owner_id <> OLD.owner_id or NEW.created_at <> OLD.created_at then
            raise exception 'Immutable fields cannot be changed';
        end if;
        NEW.updated_at = clock_timestamp();
    end if;

    -- State transition rules
    if NEW.status = 'completed' then
        if TG_OP = 'INSERT' or OLD.status is distinct from 'completed' then
            NEW.completed_at = coalesce(NEW.completed_at, clock_timestamp());
        end if;
    else
        NEW.completed_at = null;
        NEW.realization = null;
    end if;

    if NEW.status <> 'blocked' then
        NEW.blocked_reason = null;
    end if;

    return NEW;
end;
$$;

create trigger trg_work_calendar_entries_before_change
    before insert or update on public.work_calendar_entries
    for each row execute function public.work_calendar_entries_before_change();

create trigger trg_audit_work_calendar_entries
    after insert or update or delete on public.work_calendar_entries
    for each row execute function public.audit_log_table_changes();

alter table public.work_calendar_entries enable row level security;
alter table public.work_calendar_entries force row level security;

create policy work_calendar_entries_select on public.work_calendar_entries
    for select to authenticated
    using (
        owner_id = (select auth.uid()) or
        owner_id in (
            with recursive subordinates as (
                select p.id
                from public.profiles p
                where p.parent_id = (select auth.uid())
                union
                select child.id
                from public.profiles child
                join subordinates s on child.parent_id = s.id
            )
            select id from subordinates
        )
    );

create policy work_calendar_entries_insert on public.work_calendar_entries
    for insert to authenticated
    with check (owner_id = (select auth.uid()));

create policy work_calendar_entries_update on public.work_calendar_entries
    for update to authenticated
    using (owner_id = (select auth.uid()));

create policy work_calendar_entries_delete on public.work_calendar_entries
    for delete to authenticated
    using (owner_id = (select auth.uid()));

revoke all on public.work_calendar_entries from public, anon;
grant select, insert, update, delete on public.work_calendar_entries to authenticated;

create or replace function public.list_work_calendar_team_entries(
    p_start_date date,
    p_end_date date
) returns setof public.work_calendar_entries
language sql
security invoker
as $$
    with recursive subordinates as (
        select p.id
        from public.profiles p
        where p.parent_id = (select auth.uid())
        union
        select child.id
        from public.profiles child
        join subordinates s on child.parent_id = s.id
    )
    select wce.*
    from public.work_calendar_entries wce
    join subordinates s on s.id = wce.owner_id
    where wce.deleted_at is null
      and wce.work_date >= p_start_date
      and wce.work_date <= p_end_date
    order by
        wce.work_date asc,
        wce.starts_at asc nulls first,
        wce.created_at asc,
        wce.id asc;
$$;

revoke all on function public.list_work_calendar_team_entries(date, date) from public, anon;
grant execute on function public.list_work_calendar_team_entries(date, date) to authenticated;
