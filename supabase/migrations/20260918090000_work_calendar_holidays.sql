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
