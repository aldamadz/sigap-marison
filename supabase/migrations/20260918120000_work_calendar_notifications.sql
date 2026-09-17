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
    where data ? 'dedupe_key';

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
