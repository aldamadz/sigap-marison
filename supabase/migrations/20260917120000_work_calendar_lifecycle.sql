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
