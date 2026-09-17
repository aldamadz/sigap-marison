-- ============================================================================
-- Integration tests for CAL-03 F6 Unified Work Calendar workdays & holidays
--
-- Cakupan:
-- - tabel `holidays` (kolom, unique tanggal, panjang nama, immutable fields);
-- - RLS `holidays`: baca untuk authenticated, tulis hanya admin;
-- - RPC `get_work_calendar_work_settings()` menurunkan hari/jam kerja dari
--   konfigurasi KPI existing dan jatuh ke default Senin-Jumat bila kosong.
-- ============================================================================

do $$
declare
  v_admin uuid := 'c6000000-0000-4000-8000-000000000001';
  v_staff uuid := 'c6000000-0000-4000-8000-000000000002';
  v_dept uuid := 'c6000000-0000-4000-8000-000000000101';
  v_work_days integer[];
  v_work_start time;
  v_work_end time;
  v_break_start time;
  v_break_end time;
  v_timezone text;
  v_count integer;
  v_threw boolean;
begin
  -- --------------------------------------------------------------------------
  -- 1. Bentuk tabel hari libur
  -- --------------------------------------------------------------------------
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'holidays'
      and column_name = 'holiday_date'
      and data_type = 'date'
  ) then
    raise exception 'Assertion failed: kolom holidays.holiday_date bertipe date tidak ditemukan';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'holidays'
      and column_name = 'name'
      and data_type = 'text'
  ) then
    raise exception 'Assertion failed: kolom holidays.name bertipe text tidak ditemukan';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'holidays'
      and column_name = 'is_cuti_bersama'
      and data_type = 'boolean'
  ) then
    raise exception 'Assertion failed: kolom holidays.is_cuti_bersama bertipe boolean tidak ditemukan';
  end if;

  -- --------------------------------------------------------------------------
  -- 2. RLS aktif untuk holidays
  -- --------------------------------------------------------------------------
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'holidays' and c.relrowsecurity = true
  ) then
    raise exception 'Assertion failed: RLS holidays tidak aktif';
  end if;

  -- --------------------------------------------------------------------------
  -- 3. Batas data: nama kosong dan tanggal duplikat ditolak
  -- --------------------------------------------------------------------------
  perform set_config('role', 'postgres', true);
  insert into public.holidays (holiday_date, name, is_cuti_bersama)
  values ('2026-01-01', 'Tahun Baru Masehi', false);

  v_threw := false;
  begin
    insert into public.holidays (holiday_date, name)
    values ('2026-01-02', '   ');
  exception
    when check_violation then v_threw := true;
  end;
  if not v_threw then
    raise exception 'Assertion failed: nama libur kosong seharusnya ditolak';
  end if;

  v_threw := false;
  begin
    insert into public.holidays (holiday_date, name)
    values ('2026-01-01', 'Duplikat');
  exception
    when unique_violation then v_threw := true;
  end;
  if not v_threw then
    raise exception 'Assertion failed: tanggal libur duplikat seharusnya ditolak';
  end if;

  -- --------------------------------------------------------------------------
  -- 4. Field immutable tidak dapat diubah
  -- --------------------------------------------------------------------------
  insert into public.holidays (holiday_date, name, is_cuti_bersama)
  values ('2026-03-20', 'Cuti Bersama Uji', true);

  v_threw := false;
  begin
    update public.holidays set holiday_date = '2026-03-21' where holiday_date = '2026-03-20';
  exception
    when others then v_threw := true;
  end;
  if not v_threw then
    raise exception 'Assertion failed: perubahan holiday_date seharusnya ditolak';
  end if;

  -- --------------------------------------------------------------------------
  -- 5. Hierarki sederhana: admin dan staf biasa
  -- --------------------------------------------------------------------------
  insert into public.master_departments (id, name, code)
  values (v_dept, 'Operasional Uji', 'OPS-UJI')
  on conflict (id) do nothing;

  insert into public.profiles (id, email, full_name, role, department_id, deleted_at) values
    (v_admin, 'holiday-admin@example.com', 'Holiday Admin', 'admin', null, null),
    (v_staff, 'holiday-staff@example.com', 'Holiday Staff', 'user', v_dept, null)
  on conflict (id) do nothing;

  -- --------------------------------------------------------------------------
  -- 6. RLS baca: pengguna terautentikasi dapat membaca seluruh hari libur
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_staff::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_count from public.holidays;
  if v_count <> 2 then
    raise exception 'Assertion failed: staf seharusnya membaca 2 hari libur, dapat %', v_count;
  end if;

  -- --------------------------------------------------------------------------
  -- 7. RLS tulis: staf biasa ditolak, admin diizinkan
  -- --------------------------------------------------------------------------
  v_threw := false;
  begin
    insert into public.holidays (holiday_date, name)
    values ('2026-05-01', 'Hari Buruh');
  exception
    when insufficient_privilege then v_threw := true;
  end;
  if not v_threw then
    raise exception 'Assertion failed: staf seharusnya tidak boleh insert hari libur';
  end if;

  -- UPDATE/DELETE tanpa hak tidak melempar error: RLS hanya membuat nol baris
  -- cocok. Yang wajib dibuktikan adalah tidak ada baris berubah.
  update public.holidays set is_cuti_bersama = false where holiday_date = '2026-01-01';
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'Assertion failed: staf seharusnya tidak boleh update hari libur (% baris)', v_count;
  end if;

  delete from public.holidays where holiday_date = '2026-01-01';
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'Assertion failed: staf seharusnya tidak boleh delete hari libur (% baris)', v_count;
  end if;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  insert into public.holidays (holiday_date, name) values ('2026-05-01', 'Hari Buruh');
  update public.holidays set is_cuti_bersama = true where holiday_date = '2026-05-01';
  delete from public.holidays where holiday_date = '2026-05-01';

  -- --------------------------------------------------------------------------
  -- 8. Pengaturan kerja: default Senin-Jumat bila KPI belum dikonfigurasi
  -- --------------------------------------------------------------------------
  perform set_config('role', 'postgres', true);
  if to_regclass('public.department_kpi_configs') is not null then
    delete from public.department_kpi_configs where dept_id = v_dept;
  end if;

  perform set_config('request.jwt.claim.sub', v_staff::text, true);
  perform set_config('role', 'authenticated', true);

  select work_days, work_start, work_end, break_start, break_end, timezone
    into v_work_days, v_work_start, v_work_end, v_break_start, v_break_end, v_timezone
    from public.get_work_calendar_work_settings();
  if v_work_days <> array[1, 2, 3, 4, 5] then
    raise exception 'Assertion failed: default work_days seharusnya Senin-Jumat, dapat %',
      v_work_days;
  end if;
  if v_work_start <> time '08:00' or v_work_end <> time '17:00' then
    raise exception 'Assertion failed: default jam kerja seharusnya 08:00-17:00, dapat %-%',
      v_work_start, v_work_end;
  end if;
  if v_break_start <> time '12:00' or v_break_end <> time '13:00' then
    raise exception 'Assertion failed: default istirahat seharusnya 12:00-13:00, dapat %-%',
      v_break_start, v_break_end;
  end if;
  if v_timezone <> 'Asia/Jakarta' then
    raise exception 'Assertion failed: default timezone seharusnya Asia/Jakarta, dapat %',
      v_timezone;
  end if;

  -- --------------------------------------------------------------------------
  -- 9. Pengaturan kerja menurunkan konfigurasi KPI departemen pengguna
  -- --------------------------------------------------------------------------
  perform set_config('role', 'postgres', true);
  create table if not exists public.department_kpi_configs (
    dept_id uuid primary key references public.master_departments(id) on delete cascade,
    sla_minutes integer not null default 120 check (sla_minutes > 0),
    work_days integer[] not null default array[1, 2, 3, 4, 5],
    work_start time not null default time '08:00',
    work_end time not null default time '17:00',
    break_start time not null default time '12:00',
    break_end time not null default time '13:00',
    timezone text not null default 'Asia/Jakarta',
    is_active boolean not null default true
  );

  insert into public.department_kpi_configs (
    dept_id, sla_minutes, work_days, work_start, work_end, break_start, break_end, timezone, is_active
  ) values (
    v_dept, 120, array[1, 2, 3, 4, 5, 6], time '07:30', time '16:30', time '11:30', time '12:30',
    'Asia/Makassar', true
  )
  on conflict (dept_id) do update set
    work_days = excluded.work_days,
    work_start = excluded.work_start,
    work_end = excluded.work_end,
    break_start = excluded.break_start,
    break_end = excluded.break_end,
    timezone = excluded.timezone,
    is_active = excluded.is_active;

  perform set_config('request.jwt.claim.sub', v_staff::text, true);
  perform set_config('role', 'authenticated', true);

  select work_days, work_start, work_end, break_start, break_end, timezone
    into v_work_days, v_work_start, v_work_end, v_break_start, v_break_end, v_timezone
    from public.get_work_calendar_work_settings();
  if v_work_days <> array[1, 2, 3, 4, 5, 6] then
    raise exception 'Assertion failed: work_days KPI seharusnya termasuk Sabtu, dapat %',
      v_work_days;
  end if;
  if v_work_start <> time '07:30' or v_work_end <> time '16:30' then
    raise exception 'Assertion failed: jam kerja KPI seharusnya 07:30-16:30, dapat %-%',
      v_work_start, v_work_end;
  end if;
  if v_timezone <> 'Asia/Makassar' then
    raise exception 'Assertion failed: timezone KPI seharusnya Asia/Makassar, dapat %',
      v_timezone;
  end if;

  -- --------------------------------------------------------------------------
  -- 10. Konfigurasi KPI yang tidak aktif diabaikan (fallback default)
  -- --------------------------------------------------------------------------
  perform set_config('role', 'postgres', true);
  update public.department_kpi_configs set is_active = false where dept_id = v_dept;

  perform set_config('request.jwt.claim.sub', v_staff::text, true);
  perform set_config('role', 'authenticated', true);

  select work_days, work_start, work_end, break_start, break_end, timezone
    into v_work_days, v_work_start, v_work_end, v_break_start, v_break_end, v_timezone
    from public.get_work_calendar_work_settings();
  if v_work_days <> array[1, 2, 3, 4, 5] then
    raise exception 'Assertion failed: KPI nonaktif seharusnya jatuh ke default, dapat %',
      v_work_days;
  end if;

  perform set_config('role', 'postgres', true);
end $$;

select 'CAL-03 work calendar holidays integration: all assertions passed' as result;
