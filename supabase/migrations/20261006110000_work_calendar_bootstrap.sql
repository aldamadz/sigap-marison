-- CAL-04 production bootstrap: forward-only, atomic and self-contained.
-- On an entirely absent Calendar catalog only, install the exact seven CAL-03
-- bodies embedded below, with ONLY the F7 unique-index predicate narrowed to
-- the work-calendar: namespace so unrelated business dedupe keys stay unchanged.
-- Shared dependencies are required, never recreated.
-- ORDERED DEPENDENCY for the audited empty production database:
--   1. 20261006110000_work_calendar_bootstrap.sql (this baseline installer)
--   2. EXACT 20261006080000_work_calendar_carryover_deadlines.sql (apply SECOND,
--      despite its earlier timestamp; it replaces five baseline RPC bodies).
--   3. 20261006120000_work_calendar_notification_scope.sql (final notification
--      namespace/active-hierarchy overlay; parent-owned, apply THIRD).
-- Record ONLY those three actually executed files in the migration ledger.
-- Do not fabricate historic CAL-03 ledger versions or replay them in production.
-- Already initialized staging, including CAL-04 carryover, is a strict no-op:
-- never replace its functions, table ACL/RLS/policies, or write business data.
-- No publication expansion: calendar hooks/providers currently subscribe to none
-- of entries/events/holidays. BFF SSE accepts identifier-validated tables under
-- the caller's token, but there is no current Calendar subscription/allowlist
-- contract needing publication. Existing publication membership stays untouched.

do $calendar_bootstrap$
declare
    v_required record;
    v_has_calendar boolean;
    v_index record;
begin
    -- Serialize this installer without taking a shared-table write lock on no-op.
    perform pg_advisory_xact_lock(466, 110000);

    select exists (
        select 1 from pg_class where relnamespace = 'public'::regnamespace
          and relname ~ '(^work_calendar_|^holidays$|^(idx|uq)_work_calendar_)'
        union all
        select 1 from pg_proc where pronamespace = 'public'::regnamespace
          and (position('work_calendar' in proname) > 0 or proname = 'holidays_before_change')
        union all
        select 1 from pg_type where typnamespace = 'public'::regnamespace
          and typname in ('work_calendar_entries', 'work_calendar_events', 'holidays')
    ) into v_has_calendar;

    if v_has_calendar then
        -- Presence/shape checks only; do not compare to or reinstall historic
        -- bodies, since current staging may have newer carryover definitions.
        if exists (
            select 1 from (values ('work_calendar_entries'), ('work_calendar_events'),
                ('holidays')) r(name)
            where not exists (select 1 from pg_class
                where oid = to_regclass('public.' || r.name) and relkind = 'r' and relrowsecurity)
        ) or exists (
            select 1 from (values
                ('public.work_calendar_entries_before_change()'),
                ('public.soft_delete_work_calendar_entry(uuid,timestamptz)'),
                ('public.list_work_calendar_team_entries(date,date)'),
                ('public.list_work_calendar_team_members()'),
                ('public.list_work_calendar_team_overview(uuid,uuid,uuid,text,text,date,text,integer,integer)'),
                ('public.list_work_calendar_team_overview_options()'),
                ('public.list_work_calendar_member_entries(uuid,date)'),
                ('public.has_work_calendar_team_members()'),
                ('public.search_work_calendar_team_members(text,integer,integer,uuid,uuid)'),
                ('public.get_work_calendar_team_member(uuid)'),
                ('public.work_calendar_entries_log_event()'),
                ('public.holidays_before_change()'),
                ('public.get_work_calendar_work_settings()'),
                ('public.work_calendar_work_days_for_user(uuid)'),
                ('public.work_calendar_count_work_days(date,date,integer[])'),
                ('public.work_calendar_emit_notification(uuid,text,text,text,text,text,text,uuid[],integer)'),
                ('public.generate_work_calendar_notifications(date,integer,integer)'),
                ('public.work_calendar_truncate_titles(text,integer)'),
                ('public.get_work_calendar_dashboard_entries(uuid,date)'),
                ('public.get_my_recent_work_calendar_events(integer)')
            ) r(signature) where to_regprocedure(r.signature) is null
        ) then raise exception 'CAL-04 bootstrap: partial Calendar state'; end if;

        for v_required in
            select * from (values
        ('work_calendar_entries', 'id', 'uuid'),
        ('work_calendar_entries', 'owner_id', 'uuid'),
        ('work_calendar_entries', 'work_date', 'date'),
        ('work_calendar_entries', 'title', 'text'),
        ('work_calendar_entries', 'realization', 'text'),
        ('work_calendar_entries', 'notes', 'text'),
        ('work_calendar_entries', 'location', 'text'),
        ('work_calendar_entries', 'status', 'text'),
        ('work_calendar_entries', 'kind', 'text'),
        ('work_calendar_entries', 'is_all_day', 'boolean'),
        ('work_calendar_entries', 'starts_at', 'timestamptz'),
        ('work_calendar_entries', 'ends_at', 'timestamptz'),
        ('work_calendar_entries', 'blocked_reason', 'text'),
        ('work_calendar_entries', 'completed_at', 'timestamptz'),
        ('work_calendar_entries', 'deleted_at', 'timestamptz'),
        ('work_calendar_entries', 'created_at', 'timestamptz'),
        ('work_calendar_entries', 'updated_at', 'timestamptz'),
        ('work_calendar_events', 'id', 'uuid'),
        ('work_calendar_events', 'entry_id', 'uuid'),
        ('work_calendar_events', 'owner_id', 'uuid'),
        ('work_calendar_events', 'event_type', 'text'),
        ('work_calendar_events', 'from_status', 'text'),
        ('work_calendar_events', 'to_status', 'text'),
        ('work_calendar_events', 'from_work_date', 'date'),
        ('work_calendar_events', 'to_work_date', 'date'),
        ('work_calendar_events', 'from_due_date', 'date'),
        ('work_calendar_events', 'to_due_date', 'date'),
        ('work_calendar_events', 'detail', 'text'),
        ('work_calendar_events', 'actor_id', 'uuid'),
        ('work_calendar_events', 'created_at', 'timestamptz'),
        ('holidays', 'id', 'uuid'),
        ('holidays', 'holiday_date', 'date'),
        ('holidays', 'name', 'text'),
        ('holidays', 'is_cuti_bersama', 'boolean'),
        ('holidays', 'created_at', 'timestamptz'),
        ('holidays', 'updated_at', 'timestamptz'),
        ('work_calendar_entries', 'due_date', 'date'),
        ('work_calendar_entries', 'color_swatch', 'text')
            ) r(table_name, column_name, type_name)
        loop
            if not exists (select 1 from pg_attribute
                where attrelid = to_regclass('public.' || v_required.table_name)
                  and attname = v_required.column_name and not attisdropped
                  and atttypid = v_required.type_name::regtype) then
                raise exception 'CAL-04 bootstrap: partial Calendar column state';
            end if;
        end loop;

        if exists (
            select 1 from (values
                ('work_calendar_entries', 'trg_work_calendar_entries_before_change'),
                ('work_calendar_entries', 'trg_audit_work_calendar_entries'),
                ('work_calendar_entries', 'trg_work_calendar_entries_log_event'),
                ('holidays', 'trg_holidays_before_change'), ('holidays', 'trg_audit_holidays')
            ) r(table_name, name)
            where not exists (select 1 from pg_trigger
                where tgrelid = to_regclass('public.' || r.table_name)
                  and tgname = r.name and not tgisinternal and tgenabled <> 'D')
        ) or exists (
            select 1 from (values
                ('work_calendar_entries', 'work_calendar_entries_select'),
                ('work_calendar_entries', 'work_calendar_entries_insert'),
                ('work_calendar_entries', 'work_calendar_entries_update'),
                ('work_calendar_events', 'work_calendar_events_select'),
                ('holidays', 'holidays_select_authenticated'), ('holidays', 'holidays_admin_write')
            ) r(table_name, name)
            where not exists (select 1 from pg_policy
                where polrelid = to_regclass('public.' || r.table_name) and polname = r.name)
        ) then raise exception 'CAL-04 bootstrap: partial Calendar security state'; end if;

        if exists (
            select 1 from (values
                ('work_calendar_entries', 'work_calendar_entries_title_length'),
                ('work_calendar_entries', 'work_calendar_entries_realization_length'),
                ('work_calendar_entries', 'work_calendar_entries_blocked_reason_length'),
                ('work_calendar_entries', 'work_calendar_entries_notes_length'),
                ('work_calendar_entries', 'work_calendar_entries_location_length'),
                ('work_calendar_entries', 'work_calendar_entries_status_check'),
                ('work_calendar_entries', 'work_calendar_entries_kind_check'),
                ('work_calendar_entries', 'work_calendar_entries_all_day_check'),
                ('work_calendar_entries', 'work_calendar_entries_time_check'),
                ('work_calendar_entries', 'work_calendar_entries_completed_check'),
                ('work_calendar_entries', 'work_calendar_entries_blocked_check'),
                ('work_calendar_entries', 'work_calendar_entries_color_swatch_check'),
                ('work_calendar_events', 'work_calendar_events_type_check'),
                ('work_calendar_events', 'work_calendar_events_payload_check'),
                ('work_calendar_events', 'work_calendar_events_detail_length'),
                ('holidays', 'holidays_name_length'), ('holidays', 'holidays_date_unique')
            ) r(table_name, name)
            where not exists (select 1 from pg_constraint
                where conrelid = to_regclass('public.' || r.table_name)
                  and conname = r.name and convalidated)
        ) or exists (
            select 1 from (values
                ('work_calendar_entries', 'idx_work_calendar_entries_owner_date'),
                ('work_calendar_entries', 'idx_work_calendar_entries_work_date'),
                ('work_calendar_events', 'idx_work_calendar_events_entry_created'),
                ('work_calendar_events', 'uq_work_calendar_events_created'),
                ('work_calendar_events', 'idx_work_calendar_events_owner'),
                ('notifications', 'uq_notifications_work_calendar_dedupe'),
                ('notifications', 'idx_notifications_work_calendar_category')
            ) r(table_name, name)
            where not exists (select 1 from pg_index
                where indexrelid = to_regclass('public.' || r.name)
                  and indrelid = to_regclass('public.' || r.table_name)
                  and indisvalid and indisready)
        ) then raise exception 'CAL-04 bootstrap: partial Calendar constraint/index state'; end if;

        raise notice 'CAL-04 bootstrap: initialized Calendar; unchanged';
        return;
    end if;

    for v_required in
        select name from (values ('profiles'), ('master_offices'),
            ('master_departments'), ('notifications')) as required(name)
    loop
        if not exists (
            select 1 from pg_class
            where oid = to_regclass('public.' || v_required.name) and relkind = 'r'
        ) then
            raise exception 'CAL-04 bootstrap: missing/unsafe dependency %', v_required.name;
        end if;
    end loop;

    if to_regprocedure('auth.uid()') is null
       or to_regprocedure('auth.role()') is null
       or not exists (select 1 from pg_proc
           where oid = to_regprocedure('public.audit_log_table_changes()')
             and prorettype = 'trigger'::regtype)
       or exists (select 1 from (values ('anon'), ('authenticated'), ('service_role')) r(name)
           where not exists (select 1 from pg_roles where rolname = r.name)) then
        raise exception 'CAL-04 bootstrap: missing/unsafe auth roles/functions or audit function';
    end if;

    for v_required in
        select * from (values
            ('profiles', 'id', 'uuid'), ('profiles', 'parent_id', 'uuid'),
            ('profiles', 'full_name', 'text'), ('profiles', 'job_title', 'text'),
            ('profiles', 'office_id', 'uuid'), ('profiles', 'department_id', 'uuid'),
            ('profiles', 'deleted_at', 'timestamptz'), ('profiles', 'is_active', 'boolean'),
            ('master_offices', 'id', 'uuid'), ('master_offices', 'name', 'text'),
            ('master_departments', 'id', 'uuid'), ('master_departments', 'name', 'text'),
            ('notifications', 'id', 'uuid'), ('notifications', 'user_id', 'uuid'),
            ('notifications', 'type', 'text'), ('notifications', 'title', 'text'),
            ('notifications', 'message', 'text'), ('notifications', 'data', 'jsonb'),
            ('notifications', 'is_read', 'boolean'), ('notifications', 'created_at', 'timestamptz'),
            ('notifications', 'link', 'text'), ('notifications', 'read_at', 'timestamptz')
        ) as required(table_name, column_name, type_name)
    loop
        if not exists (
            select 1 from pg_attribute
            where attrelid = to_regclass('public.' || v_required.table_name)
              and attname = v_required.column_name and not attisdropped
              and atttypid = v_required.type_name::regtype
              and attgenerated = '' and attidentity = ''
        ) then
            raise exception 'CAL-04 bootstrap: unsafe dependency column %.%',
                v_required.table_name, v_required.column_name;
        end if;
    end loop;

    if not exists (
        select 1 from pg_attribute a join pg_type t on t.oid = a.atttypid
        where a.attrelid = 'public.profiles'::regclass and a.attname = 'role'
          and not a.attisdropped
          and (a.atttypid = 'text'::regtype or (t.typtype = 'e' and exists (
              select 1 from pg_enum where enumtypid = t.oid and enumlabel = 'admin'
          )))
    ) then raise exception 'CAL-04 bootstrap: unsafe profiles.role'; end if;

    if not (select relrowsecurity from pg_class where oid = 'public.notifications'::regclass)
       or exists (
           select 1 from pg_attribute
           where attrelid = 'public.notifications'::regclass and not attisdropped
             and attname in ('id', 'user_id', 'type', 'title', 'message', 'is_read', 'created_at')
             and not attnotnull
       )
       or exists (
           select 1 from pg_attribute
           where attrelid = 'public.notifications'::regclass and not attisdropped
             and attnum > 0 and attnotnull and not atthasdef
             and attname not in ('user_id', 'type', 'title', 'message', 'data', 'link')
       ) or exists (
           select 1 from pg_attribute
           where attrelid = 'public.notifications'::regclass and not attisdropped
             and attname in ('data', 'link', 'read_at') and attnotnull
       ) or not exists (
           select 1 from pg_constraint c join pg_attribute a
             on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
           where c.conrelid = 'public.notifications'::regclass and c.contype = 'p'
             and cardinality(c.conkey) = 1 and a.attname = 'id'
       ) then
        raise exception 'CAL-04 bootstrap: unsafe notifications shape/RLS';
    end if;

    -- Prevent a concurrent writer introducing duplicates between the check and
    -- canonical unique-index creation. No rows, ACLs or policies are rewritten.
    lock table public.notifications in share row exclusive mode;
    if exists (
        select 1 from public.notifications where data ? 'dedupe_key'
          and starts_with(data->>'dedupe_key', 'work-calendar:')
        group by data->>'dedupe_key' having count(*) > 1
    ) then raise exception 'CAL-04 bootstrap: duplicate notification dedupe keys'; end if;

    -- IF NOT EXISTS must not silently accept an unrelated/wrong same-name index.
    for v_required in select * from (values
        ('uq_notifications_work_calendar_dedupe', true, '(data ->> ''dedupe_key''::text)', '((data ? ''dedupe_key''::text) AND starts_with((data ->> ''dedupe_key''::text), ''work-calendar:''::text))', 1),
        ('idx_notifications_work_calendar_category', false, '(data ->> ''category''::text)', '(data ? ''category''::text)', 2)
    ) r(name, is_unique, expression, predicate, key_count)
    loop
        if to_regclass('public.' || v_required.name) is not null then
            select i.*, pg_get_expr(i.indexprs, i.indrelid) as expression,
                pg_get_expr(i.indpred, i.indrelid) as predicate
            into v_index from pg_index i
            where i.indexrelid = to_regclass('public.' || v_required.name);
            if not found or v_index.indrelid <> 'public.notifications'::regclass
               or v_index.indisunique <> v_required.is_unique
               or not v_index.indisvalid or not v_index.indisready
               or v_index.indnkeyatts <> v_required.key_count
               or v_index.indnatts <> v_required.key_count
               or v_index.indkey[0] <> 0
               or (v_required.key_count = 2 and (
                   v_index.indkey[1] <> (select attnum from pg_attribute
                       where attrelid = 'public.notifications'::regclass and attname = 'created_at')
                   or v_index.indoption[1] <> 3
               ))
               or not exists (select 1 from pg_class c join pg_am a on a.oid = c.relam
                   where c.oid = v_index.indexrelid and a.amname = 'btree')
               or v_index.expression is distinct from v_required.expression
               or v_index.predicate is distinct from v_required.predicate then
                raise exception 'CAL-04 bootstrap: unsafe existing notification index';
            end if;
        end if;
    end loop;

    -- BEGIN CANONICAL CAL-03 20260915072607_work_calendar_entries.sql
    execute $cal03_1$
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
create index if not exists idx_profiles_parent_id on public.profiles (parent_id) where deleted_at is null;

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

    if TG_OP = 'INSERT' then
        NEW.created_at = clock_timestamp();
        NEW.updated_at = clock_timestamp();
        NEW.deleted_at = null;

        if NEW.status = 'completed' then
            NEW.completed_at = clock_timestamp();
        else
            NEW.completed_at = null;
            NEW.realization = null;
        end if;

        if NEW.status <> 'blocked' then
            NEW.blocked_reason = null;
        end if;
    elsif TG_OP = 'UPDATE' then
        -- Once soft-deleted, all updates are strictly rejected
        if OLD.deleted_at is not null then
            raise exception 'Deleted record cannot be modified or restored';
        end if;

        if NEW.id <> OLD.id or NEW.owner_id <> OLD.owner_id or NEW.created_at <> OLD.created_at then
            raise exception 'Immutable fields cannot be changed';
        end if;

        NEW.updated_at = clock_timestamp();

        if NEW.deleted_at is not null then
            NEW.deleted_at = clock_timestamp();
        end if;

        -- State transition rules
        if NEW.status = 'completed' then
            if OLD.status is distinct from 'completed' then
                NEW.completed_at = clock_timestamp();
            else
                NEW.completed_at = OLD.completed_at;
            end if;
        else
            NEW.completed_at = null;
            NEW.realization = null;
        end if;

        if NEW.status <> 'blocked' then
            NEW.blocked_reason = null;
        end if;
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
                select p.id, array[p.id] as path
                from public.profiles p
                where p.parent_id = (select auth.uid())
                  and p.id <> (select auth.uid())
                  and p.deleted_at is null
                union
                select child.id, s.path || child.id
                from public.profiles child
                join subordinates s on child.parent_id = s.id
                where not (child.id = any(s.path))
                  and child.id <> (select auth.uid())
                  and child.deleted_at is null
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

revoke all on public.work_calendar_entries from public, anon;
grant select, insert, update on public.work_calendar_entries to authenticated;

create or replace function public.soft_delete_work_calendar_entry(
    p_entry_id uuid,
    p_expected_updated_at timestamptz
) returns boolean
language plpgsql
security invoker
as $$
declare
    v_updated_rows int;
begin
    update public.work_calendar_entries
    set deleted_at = clock_timestamp()
    where id = p_entry_id
      and owner_id = (select auth.uid())
      and deleted_at is null
      and updated_at = p_expected_updated_at;

    get diagnostics v_updated_rows = row_count;
    return v_updated_rows > 0;
end;
$$;

revoke all on function public.soft_delete_work_calendar_entry(uuid, timestamptz) from public, anon;
grant execute on function public.soft_delete_work_calendar_entry(uuid, timestamptz) to authenticated;

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
        union
        select child.id, s.path || child.id
        from public.profiles child
        join subordinates s on child.parent_id = s.id
        where not (child.id = any(s.path))
          and child.id <> (select auth.uid())
          and child.deleted_at is null
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
$cal03_1$;
    -- END CANONICAL CAL-03 20260915072607_work_calendar_entries.sql

    -- BEGIN CANONICAL CAL-03 20260915093000_work_calendar_team_members.sql
    execute $cal03_2$
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
$cal03_2$;
    -- END CANONICAL CAL-03 20260915093000_work_calendar_team_members.sql

    -- BEGIN CANONICAL CAL-03 20260916170000_work_calendar_team_overview.sql
    execute $cal03_3$
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
$cal03_3$;
    -- END CANONICAL CAL-03 20260916170000_work_calendar_team_overview.sql

    -- BEGIN CANONICAL CAL-03 20260916171000_work_calendar_team_overview_scale.sql
    execute $cal03_4$
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
$cal03_4$;
    -- END CANONICAL CAL-03 20260916171000_work_calendar_team_overview_scale.sql

    -- BEGIN CANONICAL CAL-03 20260917120000_work_calendar_lifecycle.sql
    execute $cal03_5$
-- CAL-03 F5: siklus hidup pekerjaan Unified Work Calendar.
--
-- Perubahan:
-- 1. Kolom `due_date` (tenggat, opsional) dan `color_swatch` (penanda warna
--    statis, opsional) pada `work_calendar_entries`.
-- 2. Tabel `work_calendar_events` sebagai histori progress dan perubahan
--    jadwal. Baris hanya ditulis oleh trigger `security definer`; klien
--    tidak pernah mendapat hak INSERT/UPDATE/DELETE.
-- 3. Trigger `after insert or update` yang mencatat peristiwa secara atomik.
--    Satu update yang tidak mengubah status/tanggal tidak menghasilkan
--    peristiwa, sehingga tidak ada duplikasi.

-- ---------------------------------------------------------------------------
-- 1. Kolom siklus hidup pada work_calendar_entries
-- ---------------------------------------------------------------------------
alter table public.work_calendar_entries
    add column if not exists due_date date null,
    add column if not exists color_swatch text null;

do $$
begin
    alter table public.work_calendar_entries
        add constraint work_calendar_entries_color_swatch_check
        check (
            color_swatch is null
            or color_swatch in ('slate', 'blue', 'teal', 'amber', 'rose', 'violet')
        );
exception
    when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Tabel histori peristiwa
-- ---------------------------------------------------------------------------
create table if not exists public.work_calendar_events (
    id uuid primary key default gen_random_uuid(),
    entry_id uuid not null references public.work_calendar_entries(id) on delete cascade,
    owner_id uuid not null references public.profiles(id),
    event_type text not null,
    from_status text null,
    to_status text null,
    from_work_date date null,
    to_work_date date null,
    from_due_date date null,
    to_due_date date null,
    detail text null,
    actor_id uuid null,
    created_at timestamptz not null default clock_timestamp(),
    constraint work_calendar_events_type_check check (
        event_type in ('created', 'status_changed', 'schedule_changed', 'due_date_changed')
    ),
    constraint work_calendar_events_payload_check check (
        (
            event_type = 'created'
            and from_status is null
            and to_status is not null
            and from_work_date is null
            and to_work_date is not null
            and from_due_date is null
        )
        or (
            event_type = 'status_changed'
            and from_status is not null
            and to_status is not null
            and from_status <> to_status
            and from_work_date is null
            and to_work_date is null
            and from_due_date is null
            and to_due_date is null
        )
        or (
            event_type = 'schedule_changed'
            and from_work_date is not null
            and to_work_date is not null
            and from_work_date <> to_work_date
            and from_status is null
            and to_status is null
            and from_due_date is null
            and to_due_date is null
        )
        or (
            event_type = 'due_date_changed'
            and from_status is null
            and to_status is null
            and from_work_date is null
            and to_work_date is null
            and from_due_date is distinct from to_due_date
        )
    ),
    constraint work_calendar_events_detail_length check (detail is null or length(detail) <= 500)
);

create index if not exists idx_work_calendar_events_entry_created
    on public.work_calendar_events (entry_id, created_at, id);

-- Satu pekerjaan hanya boleh punya satu peristiwa `created`. Ini menjadi
-- jaminan database bahwa pekerjaan tidak pernah terduplikasi di sumber riwayat.
create unique index if not exists uq_work_calendar_events_created
    on public.work_calendar_events (entry_id)
    where event_type = 'created';

create index if not exists idx_work_calendar_events_owner
    on public.work_calendar_events (owner_id);

-- ---------------------------------------------------------------------------
-- 3. Trigger pencatat peristiwa (atomik, tidak dapat dipalsukan klien)
-- ---------------------------------------------------------------------------
create or replace function public.work_calendar_entries_log_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor uuid := auth.uid();
    v_detail text;
begin
    if TG_OP = 'INSERT' then
        insert into public.work_calendar_events (
            entry_id, owner_id, event_type, to_status, to_work_date, actor_id, detail
        ) values (
            NEW.id, NEW.owner_id, 'created', NEW.status, NEW.work_date, v_actor, null
        );
        return NEW;
    end if;

    -- Soft delete bukan perubahan siklus hidup: cukup dicatat oleh audit log.
    if NEW.deleted_at is not null and OLD.deleted_at is null then
        return NEW;
    end if;

    if NEW.status is distinct from OLD.status then
        v_detail := case
            when NEW.status = 'completed' then NEW.realization
            when NEW.status = 'blocked' then NEW.blocked_reason
            else null
        end;
        insert into public.work_calendar_events (
            entry_id, owner_id, event_type, from_status, to_status, actor_id, detail
        ) values (
            NEW.id, NEW.owner_id, 'status_changed', OLD.status, NEW.status, v_actor, v_detail
        );
    end if;

    if NEW.work_date is distinct from OLD.work_date then
        insert into public.work_calendar_events (
            entry_id, owner_id, event_type, from_work_date, to_work_date, actor_id
        ) values (
            NEW.id, NEW.owner_id, 'schedule_changed', OLD.work_date, NEW.work_date, v_actor
        );
    end if;

    if NEW.due_date is distinct from OLD.due_date then
        insert into public.work_calendar_events (
            entry_id, owner_id, event_type, from_due_date, to_due_date, actor_id
        ) values (
            NEW.id, NEW.owner_id, 'due_date_changed', OLD.due_date, NEW.due_date, v_actor
        );
    end if;

    return NEW;
end;
$$;

drop trigger if exists trg_work_calendar_entries_log_event on public.work_calendar_entries;
create trigger trg_work_calendar_entries_log_event
    after insert or update on public.work_calendar_entries
    for each row execute function public.work_calendar_entries_log_event();

-- ---------------------------------------------------------------------------
-- 4. RLS: klien hanya boleh membaca; penulisan hanya lewat trigger definer.
--    Catatan: RLS sengaja tidak `force` supaya fungsi `security definer`
--    (pemilik tabel) tetap dapat menulis peristiwa.
-- ---------------------------------------------------------------------------
alter table public.work_calendar_events enable row level security;

drop policy if exists work_calendar_events_select on public.work_calendar_events;
create policy work_calendar_events_select on public.work_calendar_events
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

revoke all on public.work_calendar_events from public, anon, authenticated;
grant select on public.work_calendar_events to authenticated;
$cal03_5$;
    -- END CANONICAL CAL-03 20260917120000_work_calendar_lifecycle.sql

    -- BEGIN CANONICAL CAL-03 20260918090000_work_calendar_holidays.sql
    execute $cal03_6$
-- CAL-03 F6: hari kerja, jam kerja, dan hari libur Unified Work Calendar.
--
-- Perubahan:
-- 1. Tabel `public.holidays` (tanggal, nama libur, is_cuti_bersama) sebagai
--    referensi global. Baris dikelola admin; seluruh pengguna terautentikasi
--    hanya boleh membaca.
-- 2. RPC `get_work_calendar_work_settings()` yang menurunkan hari kerja dan
--    jam kerja dari konfigurasi KPI existing (`department_kpi_configs`) milik
--    departemen pengguna, dengan default Senin-Jumat 08:00-17:00 bila belum
--    dikonfigurasi. RPC ini tidak pernah menulis konfigurasi KPI.
-- 3. Audit trigger untuk perubahan `holidays`.
--
-- Catatan implementasi:
-- - Tubuh fungsi memakai `language plpgsql` dan `to_regclass(...)` supaya
--   migration tetap aman pada database yang belum memiliki tabel KPI
--   (mis. harness SQL) dan tidak mengunci urutan migration.
-- - `security definer` + `set search_path = public` supaya pembacaan hanya
--   berdasarkan `auth.uid()` dan tidak bergantung pada RLS tabel referensi.

-- ---------------------------------------------------------------------------
-- 1. Tabel hari libur
-- ---------------------------------------------------------------------------
create table if not exists public.holidays (
    id uuid primary key default gen_random_uuid(),
    holiday_date date not null,
    name text not null,
    is_cuti_bersama boolean not null default false,
    created_at timestamptz not null default clock_timestamp(),
    updated_at timestamptz not null default clock_timestamp(),
    constraint holidays_name_length check (length(btrim(name)) between 1 and 180),
    constraint holidays_date_unique unique (holiday_date)
);

create or replace function public.holidays_before_change()
returns trigger
language plpgsql
as $$
begin
    NEW.name = btrim(NEW.name);

    if TG_OP = 'INSERT' then
        NEW.created_at = clock_timestamp();
        NEW.updated_at = clock_timestamp();
        return NEW;
    end if;

    if NEW.id <> OLD.id
       or NEW.holiday_date <> OLD.holiday_date
       or NEW.created_at <> OLD.created_at then
        raise exception 'Immutable fields cannot be changed';
    end if;

    NEW.updated_at = clock_timestamp();
    return NEW;
end;
$$;

drop trigger if exists trg_holidays_before_change on public.holidays;
create trigger trg_holidays_before_change
    before insert or update on public.holidays
    for each row execute function public.holidays_before_change();

drop trigger if exists trg_audit_holidays on public.holidays;
create trigger trg_audit_holidays
    after insert or update or delete on public.holidays
    for each row execute function public.audit_log_table_changes();

alter table public.holidays enable row level security;

-- Hak tabel diberikan ke `authenticated`, tetapi RLS di bawah membatasi
-- penulisan hanya untuk admin. `service_role` (dipakai script impor) memakai
-- bypass RLS pada Supabase.
revoke all on public.holidays from public, anon;
grant select, insert, update, delete on public.holidays to authenticated;
grant select, insert, update, delete on public.holidays to service_role;

drop policy if exists holidays_select_authenticated on public.holidays;
create policy holidays_select_authenticated
on public.holidays for select
to authenticated
using (true);

-- Penulisan hanya untuk admin; pengguna biasa tidak pernah dapat mengubah
-- kalender libur maupun menyisipkan tanggal melalui klien.
drop policy if exists holidays_admin_write on public.holidays;
create policy holidays_admin_write
on public.holidays for all
to authenticated
using (
    exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'admin'
    )
)
with check (
    exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'admin'
    )
);

-- ---------------------------------------------------------------------------
-- 2. Pengaturan hari kerja dan jam kerja dari konfigurasi KPI existing
-- ---------------------------------------------------------------------------
create or replace function public.get_work_calendar_work_settings()
returns table (
    work_days integer[],
    work_start time,
    work_end time,
    break_start time,
    break_end time,
    timezone text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_dept_id uuid;
    v_work_days integer[] := array[1, 2, 3, 4, 5];
    v_work_start time := time '08:00';
    v_work_end time := time '17:00';
    v_break_start time := time '12:00';
    v_break_end time := time '13:00';
    v_timezone text := 'Asia/Jakarta';
begin
    select p.department_id
      into v_dept_id
      from public.profiles p
     where p.id = (select auth.uid());

    if v_dept_id is not null
       and to_regclass('public.department_kpi_configs') is not null then
        execute
            'select k.work_days, k.work_start, k.work_end, k.break_start, k.break_end, k.timezone
               from public.department_kpi_configs k
              where k.dept_id = $1
                and k.is_active = true'
        into v_work_days, v_work_start, v_work_end, v_break_start, v_break_end, v_timezone
        using v_dept_id;
    end if;

    return query
        select
            coalesce(v_work_days, array[1, 2, 3, 4, 5]),
            coalesce(v_work_start, time '08:00'),
            coalesce(v_work_end, time '17:00'),
            coalesce(v_break_start, time '12:00'),
            coalesce(v_break_end, time '13:00'),
            coalesce(v_timezone, 'Asia/Jakarta');
end;
$$;

revoke all on function public.get_work_calendar_work_settings() from public, anon;
grant execute on function public.get_work_calendar_work_settings() to authenticated;
$cal03_6$;
    -- END CANONICAL CAL-03 20260918090000_work_calendar_holidays.sql

    -- BEGIN CANONICAL CAL-03 20260918120000_work_calendar_notifications.sql
    -- Intentional narrow adaptation: ONLY the dedupe index predicate below
    -- adds the calendar namespace. All remaining canonical F7 bytes are retained.
    execute $cal03_7$
-- CAL-03 F7: ringkasan dashboard dan notifikasi Unified Work Calendar.
--
-- Perubahan:
-- 1. Notifikasi Work Calendar memakai tabel `notifications` yang sudah ada
--    supaya badge lonceng, penandaan dibaca, dan penghapusan langsung bekerja
--    tanpa sumber data kedua. Deduplikasi dan batching dijaga indeks unik
--    parsial pada `data->>'dedupe_key'`.
-- 2. RPC `generate_work_calendar_notifications()` menghasilkan notifikasi
--    secara on-demand dan idempotent untuk:
--    - tenggat terlewati (`deadline_overdue`),
--    - pengingat tindak lanjut pekerjaan terhambat (`follow_up_reminder`),
--    - eskalasi pekerjaan bawahan yang terhambat ke atasan
--      (`blocked_escalation`).
--    Eskalasi dihitung berdasarkan hari kerja: Sabtu/Minggu dan hari libur
--    pada tabel `holidays` diabaikan.
-- 3. RPC `get_work_calendar_dashboard_entries()` untuk widget ringkasan
--    (pekerjaan hari ini dan pekerjaan tertunda).
-- 4. RPC `get_my_recent_work_calendar_events()` untuk mengintegrasikan
--    `work_calendar_events` ke modul Aktivitas Terbaru.
--
-- Catatan implementasi:
-- - `create table if not exists public.notifications` hanya guard kompatibilitas
--   (harness SQL yang belum memiliki tabel bersama). Pada database nyata tabel
--   dan RLS-nya sudah ada sehingga blok ini tidak mengubah apa pun.
-- - Seluruh fungsi bersifat `stable`/`security definer` dengan
--   `set search_path = public`, dan hanya membuat notifikasi yang benar-benar
--   berasal dari data pekerjaan milik pemanggil atau bawahannya.

-- ---------------------------------------------------------------------------
-- 1. Guard tabel notifikasi bersama + indeks deduplikasi/batching
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    type text not null default 'info',
    title text not null,
    message text not null,
    data jsonb null,
    is_read boolean not null default false,
    created_at timestamptz not null default now(),
    link text null,
    read_at timestamptz null
);

-- Satu notifikasi per kunci deduplikasi (batching per kategori per hari).
create unique index if not exists uq_notifications_work_calendar_dedupe
    on public.notifications ((data->>'dedupe_key'))
    where data ? 'dedupe_key' and starts_with(data->>'dedupe_key', 'work-calendar:');

-- Mempercepat debounce per kategori dan pemeriksaan batching.
create index if not exists idx_notifications_work_calendar_category
    on public.notifications ((data->>'category'), created_at desc)
    where data ? 'category';

-- ---------------------------------------------------------------------------
-- 2. Helper: hari kerja efektif dan hitungan hari kerja
-- ---------------------------------------------------------------------------
create or replace function public.work_calendar_work_days_for_user(p_user_id uuid)
returns integer[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_dept_id uuid;
    v_work_days integer[];
begin
    select p.department_id
      into v_dept_id
      from public.profiles p
     where p.id = p_user_id;

    if v_dept_id is not null
       and to_regclass('public.department_kpi_configs') is not null then
        execute
            'select k.work_days
               from public.department_kpi_configs k
              where k.dept_id = $1
                and k.is_active = true'
        into v_work_days
        using v_dept_id;
    end if;

    return coalesce(v_work_days, array[1, 2, 3, 4, 5]);
end;
$$;

-- Menghitung hari kerja pada rentang (p_from, p_to]. Hari libur dan akhir
-- pekan (sesuai hari kerja pengguna) tidak dihitung.
create or replace function public.work_calendar_count_work_days(
    p_from date,
    p_to date,
    p_work_days integer[]
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
    select count(*)::integer
    from generate_series(p_from + 1, p_to, interval '1 day') as day
    where extract(isodow from day)::integer
            = any (coalesce(p_work_days, array[1, 2, 3, 4, 5]))
      and not exists (
          select 1
          from public.holidays h
          where h.holiday_date = day::date
      );
$$;

-- ---------------------------------------------------------------------------
-- 3. Helper: tulis satu notifikasi ter-batch dengan debounce + dedupe
-- ---------------------------------------------------------------------------
create or replace function public.work_calendar_emit_notification(
    p_user_id uuid,
    p_category text,
    p_type text,
    p_title text,
    p_message text,
    p_link text,
    p_dedupe_key text,
    p_entry_ids uuid[],
    p_debounce_hours integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_user_id is null or p_dedupe_key is null then
        return false;
    end if;

    -- Dedupe: kunci yang sama tidak pernah ditulis dua kali.
    if exists (
        select 1
        from public.notifications n
        where n.user_id = p_user_id
          and n.data->>'dedupe_key' = p_dedupe_key
    ) then
        return false;
    end if;

    -- Debounce: cegah spam untuk kategori yang sama pada jendela waktu dekat.
    if greatest(coalesce(p_debounce_hours, 0), 0) > 0
       and exists (
           select 1
           from public.notifications n
           where n.user_id = p_user_id
             and n.data->>'category' = p_category
             and n.created_at > now() - make_interval(hours => greatest(p_debounce_hours, 0))
       ) then
        return false;
    end if;

    begin
        insert into public.notifications (user_id, type, title, message, data, link)
        values (
            p_user_id,
            coalesce(p_type, 'info'),
            p_title,
            p_message,
            jsonb_build_object(
                'category', p_category,
                'dedupe_key', p_dedupe_key,
                'entry_ids', to_jsonb(coalesce(p_entry_ids, array[]::uuid[]))
            ),
            p_link
        );
    exception
        when unique_violation then
            return false;
    end;

    return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Generator notifikasi Work Calendar (on-demand, idempotent)
-- ---------------------------------------------------------------------------
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
        string_agg(e.title, ', ' order by coalesce(e.due_date, e.work_date), e.id),
        array_agg(e.id order by coalesce(e.due_date, e.work_date), e.id)
      into v_count, v_titles, v_entry_ids
      from public.work_calendar_entries e
     where e.owner_id = v_user
       and e.deleted_at is null
       and e.status <> 'completed'
       and coalesce(e.due_date, e.work_date) < v_today;

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

-- Ringkas daftar judul: maksimal tiga judul, sisanya dihitung.
create or replace function public.work_calendar_truncate_titles(p_titles text, p_count integer)
returns text
language sql
immutable
as $$
    select case
        when p_titles is null then ''
        when p_count <= 3 then p_titles
        else split_part(p_titles, ', ', 1) || ', ' || split_part(p_titles, ', ', 2)
             || ', ' || split_part(p_titles, ', ', 3) || ' dan ' || (p_count - 3)::text || ' lainnya'
    end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Widget ringkasan dashboard
-- ---------------------------------------------------------------------------
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
          or coalesce(e.due_date, e.work_date) < p_today
      )
    order by
        e.work_date asc,
        e.starts_at asc nulls first,
        e.created_at asc,
        e.id asc;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Aktivitas Terbaru: peristiwa Work Calendar milik pemanggil
-- ---------------------------------------------------------------------------
create or replace function public.get_my_recent_work_calendar_events(p_limit integer default 20)
returns table (
    id uuid,
    entry_id uuid,
    owner_id uuid,
    event_type text,
    from_status text,
    to_status text,
    detail text,
    created_at timestamptz,
    entry_title text,
    owner_full_name text
)
language sql
stable
security definer
set search_path = public
as $$
    select
        ev.id,
        ev.entry_id,
        ev.owner_id,
        ev.event_type,
        ev.from_status,
        ev.to_status,
        ev.detail,
        ev.created_at,
        e.title as entry_title,
        p.full_name as owner_full_name
    from public.work_calendar_events ev
    join public.work_calendar_entries e on e.id = ev.entry_id
    left join public.profiles p on p.id = ev.owner_id
    where ev.owner_id = auth.uid()
    order by ev.created_at desc, ev.id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- ---------------------------------------------------------------------------
-- 7. Hak akses
-- ---------------------------------------------------------------------------
-- Helper internal sengaja TIDAK diberi hak ke `authenticated`:
-- `work_calendar_emit_notification` menerima `p_user_id`, sehingga bila dapat
-- dipanggil klien siapa pun bisa memalsukan notifikasi pengguna lain. Helper
-- ini hanya dipakai oleh generator `security definer` di bawah.
revoke all on function public.work_calendar_work_days_for_user(uuid) from public, anon, authenticated;
revoke all on function public.work_calendar_count_work_days(date, date, integer[]) from public, anon, authenticated;
revoke all on function public.work_calendar_truncate_titles(text, integer) from public, anon, authenticated;
revoke all on function public.work_calendar_emit_notification(uuid, text, text, text, text, text, text, uuid[], integer) from public, anon, authenticated;

revoke all on function public.generate_work_calendar_notifications(date, integer, integer) from public, anon;
grant execute on function public.generate_work_calendar_notifications(date, integer, integer) to authenticated;

revoke all on function public.get_work_calendar_dashboard_entries(uuid, date) from public, anon;
grant execute on function public.get_work_calendar_dashboard_entries(uuid, date) to authenticated;

revoke all on function public.get_my_recent_work_calendar_events(integer) from public, anon;
grant execute on function public.get_my_recent_work_calendar_events(integer) to authenticated;
$cal03_7$;
    -- END CANONICAL CAL-03 20260918120000_work_calendar_notifications.sql

    raise notice 'CAL-04 bootstrap: canonical CAL-03 baseline installed; apply carryover second';
end
$calendar_bootstrap$;
