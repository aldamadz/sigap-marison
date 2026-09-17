-- ============================================================================
-- Integration tests for CAL-03 F7 Unified Work Calendar dashboard & notifications
--
-- Cakupan:
-- - indeks deduplikasi/batching notifikasi Work Calendar;
-- - generator notifikasi on-demand `generate_work_calendar_notifications()`:
--   tenggat terlewati, pengingat tindak lanjut, eskalasi atasan;
-- - idempotensi dan debounce anti-spam;
-- - hitungan hari kerja mengabaikan akhir pekan dan hari libur;
-- - RPC ringkasan dashboard dan aktivitas terbaru.
-- ============================================================================

do $$
declare
  v_boss uuid := 'c7000000-0000-4000-8000-000000000001';
  v_staff uuid := 'c7000000-0000-4000-8000-000000000002';
  v_dept uuid := 'c7000000-0000-4000-8000-000000000101';
  v_overdue_entry uuid := 'c7000000-0000-4000-8000-000000000201';
  v_today_entry uuid := 'c7000000-0000-4000-8000-000000000202';
  v_done_entry uuid := 'c7000000-0000-4000-8000-000000000203';
  v_blocked_entry uuid := 'c7000000-0000-4000-8000-000000000204';
  v_future_entry uuid := 'c7000000-0000-4000-8000-000000000205';
  v_today date := '2026-03-09'; -- Senin
  v_count integer;
  v_inserted integer;
  v_category text;
  v_title text;
  v_message text;
begin
  -- --------------------------------------------------------------------------
  -- 1. Indeks deduplikasi notifikasi tersedia
  -- --------------------------------------------------------------------------
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'notifications'
      and indexname = 'uq_notifications_work_calendar_dedupe'
  ) then
    raise exception 'Assertion failed: indeks dedupe notifikasi tidak ditemukan';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'generate_work_calendar_notifications'
  ) then
    raise exception 'Assertion failed: RPC generate_work_calendar_notifications tidak ditemukan';
  end if;

  -- --------------------------------------------------------------------------
  -- 2. Fixture hierarki: atasan dan bawahan
  -- --------------------------------------------------------------------------
  perform set_config('role', 'postgres', true);

  insert into public.master_departments (id, name, code)
  values (v_dept, 'Notifikasi Uji', 'NOTIF-UJI')
  on conflict (id) do nothing;

  insert into public.profiles (id, email, full_name, role, parent_id, department_id, deleted_at) values
    (v_boss, 'notif-boss@example.com', 'Notif Boss', 'user', null, v_dept, null),
    (v_staff, 'notif-staff@example.com', 'Notif Staff', 'user', v_boss, v_dept, null)
  on conflict (id) do nothing;

  -- Pekerjaan milik bawahan.
  insert into public.work_calendar_entries (
    id, owner_id, work_date, title, status, kind, is_all_day, due_date
  ) values
    (v_overdue_entry, v_staff, '2026-03-02', 'Overdue bawahan', 'in_progress', 'work', true, '2026-03-04'),
    (v_today_entry, v_staff, v_today, 'Pekerjaan hari ini', 'planned', 'work', true, null),
    (v_done_entry, v_staff, v_today, 'Sudah selesai', 'planned', 'work', true, null),
    (v_blocked_entry, v_staff, '2026-03-05', 'Terhambat bawahan', 'planned', 'work', true, null),
    (v_future_entry, v_staff, '2026-03-20', 'Pekerjaan mendatang', 'planned', 'work', true, null)
  on conflict (id) do nothing;

  -- Selesaikan satu pekerjaan (constraint completed butuh realization + completed_at).
  update public.work_calendar_entries
     set status = 'completed', realization = 'Selesai', completed_at = now()
   where id = v_done_entry;

  -- Tandai pekerjaan terhambat dengan alasan. Transisi ini juga menghasilkan
  -- peristiwa `blocked` ber-`created_at` sekarang lewat trigger F5; peristiwa
  -- tersebut dihapus supaya uji memakai waktu historis yang deterministik.
  update public.work_calendar_entries
     set status = 'blocked', blocked_reason = 'Menunggu berkas'
   where id = v_blocked_entry;

  delete from public.work_calendar_events where entry_id = v_blocked_entry;

  -- Peristiwa `blocked` historis pada Kamis 2026-03-05 (untuk hitungan hari kerja).
  insert into public.work_calendar_events (
    entry_id, owner_id, event_type, from_status, to_status, actor_id, created_at
  ) values (
    v_blocked_entry, v_staff, 'status_changed', 'planned', 'blocked', v_staff,
    timestamptz '2026-03-05 09:00:00+07'
  );

  -- --------------------------------------------------------------------------
  -- 3. Hitungan hari kerja mengabaikan akhir pekan dan hari libur
  -- --------------------------------------------------------------------------
  -- Rentang (Kamis 2026-03-05, Senin 2026-03-09] = Jumat + Senin = 2 hari kerja.
  v_count := public.work_calendar_count_work_days(
    '2026-03-05', v_today, array[1, 2, 3, 4, 5]
  );
  if v_count <> 2 then
    raise exception 'Assertion failed: hari kerja 2026-03-05..2026-03-09 seharusnya 2, dapat %', v_count;
  end if;

  -- Hari libur pada Jumat mengurangi hitungan.
  insert into public.holidays (holiday_date, name)
  values ('2026-03-06', 'Libur Uji Jumat')
  on conflict (holiday_date) do nothing;

  v_count := public.work_calendar_count_work_days(
    '2026-03-05', v_today, array[1, 2, 3, 4, 5]
  );
  if v_count <> 1 then
    raise exception 'Assertion failed: libur Jumat seharusnya mengurangi hitungan menjadi 1, dapat %', v_count;
  end if;

  -- Hari libur pada Senin mengurangi hitungan lagi.
  insert into public.holidays (holiday_date, name)
  values ('2026-03-09', 'Libur Uji Senin')
  on conflict (holiday_date) do nothing;

  v_count := public.work_calendar_count_work_days(
    '2026-03-05', v_today, array[1, 2, 3, 4, 5]
  );
  if v_count <> 0 then
    raise exception 'Assertion failed: libur Senin seharusnya mengurangi hitungan menjadi 0, dapat %', v_count;
  end if;

  -- Akhir pekan saja tidak pernah dihitung.
  v_count := public.work_calendar_count_work_days(
    '2026-03-06', '2026-03-08', array[1, 2, 3, 4, 5]
  );
  if v_count <> 0 then
    raise exception 'Assertion failed: Sabtu-Minggu seharusnya 0 hari kerja, dapat %', v_count;
  end if;

  delete from public.holidays where holiday_date in ('2026-03-06', '2026-03-09');

  -- --------------------------------------------------------------------------
  -- 4. Generator: tenggat terlewati + pengingat tindak lanjut untuk pemilik
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_staff::text, true);
  perform set_config('role', 'authenticated', true);

  v_inserted := public.generate_work_calendar_notifications(v_today, 2, 6);
  if v_inserted <> 2 then
    raise exception 'Assertion failed: generator bawahan seharusnya membuat 2 notifikasi, dapat %', v_inserted;
  end if;

  -- Verifikasi baris dilakukan sebagai pemilik tabel: tabel `notifications`
  -- pada database nyata memakai RLS baca-sendiri, sedangkan harness
  -- menyediakan tabel kompatibilitas tanpa policy.
  perform set_config('role', 'postgres', true);

  select count(*) into v_count
  from public.notifications
  where user_id = v_staff and data->>'category' = 'deadline_overdue';
  if v_count <> 1 then
    raise exception 'Assertion failed: notifikasi tenggat terlewati seharusnya 1, dapat %', v_count;
  end if;

  select title into v_title
  from public.notifications
  where user_id = v_staff and data->>'category' = 'deadline_overdue';
  if v_title <> 'Tenggat pekerjaan terlewati' then
    raise exception 'Assertion failed: judul notifikasi tenggat salah: %', v_title;
  end if;

  select data->>'category', message into v_category, v_message
  from public.notifications
  where user_id = v_staff and data->>'category' = 'follow_up_reminder';
  if v_category is null then
    raise exception 'Assertion failed: notifikasi pengingat tindak lanjut tidak dibuat';
  end if;
  if v_message not like '%Terhambat bawahan%' then
    raise exception 'Assertion failed: pesan pengingat tidak menyebut pekerjaan terhambat: %', v_message;
  end if;

  -- --------------------------------------------------------------------------
  -- 5. Idempotensi: panggilan kedua tidak menggandakan notifikasi
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_staff::text, true);
  perform set_config('role', 'authenticated', true);

  v_inserted := public.generate_work_calendar_notifications(v_today, 2, 6);
  if v_inserted <> 0 then
    raise exception 'Assertion failed: pemanggilan ulang seharusnya idempotent, dapat %', v_inserted;
  end if;

  perform set_config('role', 'postgres', true);
  select count(*) into v_count
  from public.notifications
  where user_id = v_staff and data->>'category' = 'deadline_overdue';
  if v_count <> 1 then
    raise exception 'Assertion failed: notifikasi tenggat terduplikasi, dapat %', v_count;
  end if;

  -- --------------------------------------------------------------------------
  -- 6. Eskalasi atasan dihitung dari hari kerja (akhir pekan + libur diabaikan)
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_boss::text, true);
  perform set_config('role', 'authenticated', true);

  -- Terhambat Kamis 2026-03-05, hari ini Senin 2026-03-09 => 2 hari kerja
  -- (Jumat + Senin). Ambang 2 => eskalasi dibuat.
  v_inserted := public.generate_work_calendar_notifications(v_today, 2, 6);
  if v_inserted <> 1 then
    raise exception 'Assertion failed: eskalasi atasan seharusnya dibuat, dapat %', v_inserted;
  end if;

  perform set_config('role', 'postgres', true);
  select data->>'category', message into v_category, v_message
  from public.notifications
  where user_id = v_boss and data->>'category' = 'blocked_escalation';
  if v_category is null then
    raise exception 'Assertion failed: notifikasi eskalasi atasan tidak dibuat';
  end if;
  if v_message not like '%2 hari kerja%' then
    raise exception 'Assertion failed: pesan eskalasi tidak menyebut ambang hari kerja: %', v_message;
  end if;

  -- Bila hari libur menutup Jumat dan Senin, hitungan menjadi 0 sehingga
  -- eskalasi berikutnya tidak dibuat.
  perform set_config('role', 'postgres', true);
  insert into public.holidays (holiday_date, name) values
    ('2026-03-06', 'Libur Eskalasi Jumat'),
    ('2026-03-09', 'Libur Eskalasi Senin')
  on conflict (holiday_date) do nothing;

  perform set_config('role', 'postgres', true);
  delete from public.notifications
   where data->>'category' = 'blocked_escalation';

  perform set_config('request.jwt.claim.sub', v_boss::text, true);
  perform set_config('role', 'authenticated', true);

  v_inserted := public.generate_work_calendar_notifications(v_today, 2, 6);
  if v_inserted <> 0 then
    raise exception 'Assertion failed: eskalasi saat semua hari kerja libur seharusnya tidak dibuat, dapat %', v_inserted;
  end if;

  perform set_config('role', 'postgres', true);
  delete from public.holidays where holiday_date in ('2026-03-06', '2026-03-09');

  -- --------------------------------------------------------------------------
  -- 7. Debounce anti-spam: kategori sama tidak spam dalam jendela waktu
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_staff::text, true);
  perform set_config('role', 'authenticated', true);

  -- Tanggal acuan berbeda menghasilkan kunci dedupe berbeda, tetapi kategori
  -- yang sama masih berada dalam jendela debounce sehingga tidak dibuat ulang.
  v_inserted := public.generate_work_calendar_notifications('2026-03-10', 2, 6);
  if v_inserted <> 0 then
    raise exception 'Assertion failed: debounce kategori sama seharusnya memblokir, dapat %', v_inserted;
  end if;

  -- Tanpa jendela debounce, tanggal acuan baru membuat notifikasi baru.
  v_inserted := public.generate_work_calendar_notifications('2026-03-10', 2, 0);
  if v_inserted <> 2 then
    raise exception 'Assertion failed: tanpa debounce seharusnya membuat 2 notifikasi, dapat %', v_inserted;
  end if;

  -- --------------------------------------------------------------------------
  -- 8. Widget ringkasan dashboard: hari ini + tertunda, bukan selesai/mendatang
  -- --------------------------------------------------------------------------
  select count(*) into v_count
  from public.get_work_calendar_dashboard_entries(v_staff, v_today);
  if v_count <> 3 then
    raise exception 'Assertion failed: widget dashboard seharusnya 3 baris, dapat %', v_count;
  end if;

  if exists (
    select 1 from public.get_work_calendar_dashboard_entries(v_staff, v_today)
    where id = v_done_entry
  ) then
    raise exception 'Assertion failed: pekerjaan selesai tidak boleh muncul di widget';
  end if;

  if not exists (
    select 1 from public.get_work_calendar_dashboard_entries(v_staff, v_today)
    where id = v_overdue_entry
  ) then
    raise exception 'Assertion failed: pekerjaan tertunda harus muncul di widget';
  end if;

  if not exists (
    select 1 from public.get_work_calendar_dashboard_entries(v_staff, v_today)
    where id = v_today_entry
  ) then
    raise exception 'Assertion failed: pekerjaan hari ini harus muncul di widget';
  end if;

  -- --------------------------------------------------------------------------
  -- 9. Aktivitas Terbaru: peristiwa milik pemanggil
  -- --------------------------------------------------------------------------
  select count(*) into v_count
  from public.get_my_recent_work_calendar_events(20);
  if v_count < 1 then
    raise exception 'Assertion failed: aktivitas terbaru seharusnya memuat peristiwa pemanggil';
  end if;

  perform set_config('request.jwt.claim.sub', v_boss::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_count
  from public.get_my_recent_work_calendar_events(20);
  if v_count <> 0 then
    raise exception 'Assertion failed: atasan seharusnya tidak melihat aktivitas pribadi bawahan, dapat %', v_count;
  end if;

  perform set_config('role', 'postgres', true);
end $$;

select 'CAL-03 work calendar notifications integration: all assertions passed' as result;
