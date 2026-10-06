-- CAL-04: narrow notification dedupe to the Calendar namespace and match
-- escalation descendants to the active-profile team/event-RLS contract.
-- Forward-only overlay: apply AFTER bootstrap (if absent) and exact carryover.
-- Shared notification rows, policies and grants are never rewritten.

begin;

lock table public.notifications in share row exclusive mode;
do $calendar_notification_index$
declare v_index record;
begin
    select i.*, pg_get_expr(i.indexprs, i.indrelid) as expression,
           pg_get_expr(i.indpred, i.indrelid) as predicate
      into v_index from pg_index i
     where i.indexrelid = to_regclass('public.uq_notifications_work_calendar_dedupe');
    if not found or v_index.indrelid <> 'public.notifications'::regclass
       or not v_index.indisunique or not v_index.indisvalid
       or v_index.indnkeyatts <> 1 or v_index.indnatts <> 1
       or v_index.expression is distinct from '(data ->> ''dedupe_key''::text)'
       or v_index.predicate is null or v_index.predicate not in (
           '(data ? ''dedupe_key''::text)',
           '((data ? ''dedupe_key''::text) AND starts_with((data ->> ''dedupe_key''::text), ''work-calendar:''::text))'
       ) then
        raise exception 'CAL-04: notification dedupe index differs from reviewed baseline';
    end if;
end $calendar_notification_index$;

drop index public.uq_notifications_work_calendar_dedupe;
create unique index uq_notifications_work_calendar_dedupe
    on public.notifications ((data->>'dedupe_key'))
    where data ? 'dedupe_key' and starts_with(data->>'dedupe_key', 'work-calendar:');

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
          and p.is_active is true
        union
        select child.id, s.path || child.id
        from public.profiles child
        join subordinates s on child.parent_id = s.id
        where not (child.id = any(s.path))
          and child.id <> v_user
          and child.deleted_at is null
          and child.is_active is true
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

