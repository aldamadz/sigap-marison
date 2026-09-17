-- ============================================================================
-- Integration tests for CAL-03 F5 Unified Work Calendar job lifecycle
--
-- Cakupan:
-- - kolom `due_date` dan `color_swatch` beserta constraint-nya;
-- - trigger `work_calendar_entries_log_event` yang mencatat peristiwa secara
--   atomik (created, status_changed, schedule_changed, due_date_changed);
-- - larangan duplikasi peristiwa `created` per pekerjaan;
-- - RLS `work_calendar_events`: hanya baca, cakupan sendiri + bawahan;
-- - klien `authenticated` tidak dapat menulis peristiwa secara langsung.
-- ============================================================================

do $$
declare
  v_mgr uuid := 'c5000000-0000-4000-8000-000000000001';
  v_staff uuid := 'c5000000-0000-4000-8000-000000000002';
  v_out uuid := 'c5000000-0000-4000-8000-000000000003';
  v_entry uuid;
  v_entry_two uuid;
  v_entry_out uuid;
  v_event public.work_calendar_events%rowtype;
  v_count integer;
  v_threw boolean;
begin
  -- --------------------------------------------------------------------------
  -- 1. Kolom siklus hidup tersedia dengan tipe yang benar
  -- --------------------------------------------------------------------------
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'work_calendar_entries'
      and column_name = 'due_date'
      and data_type = 'date'
  ) then
    raise exception 'Assertion failed: kolom due_date bertipe date tidak ditemukan';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'work_calendar_entries'
      and column_name = 'color_swatch'
      and data_type = 'text'
  ) then
    raise exception 'Assertion failed: kolom color_swatch bertipe text tidak ditemukan';
  end if;

  -- --------------------------------------------------------------------------
  -- 2. Hierarki sederhana: manajer, bawahan, dan pihak di luar subtree
  -- --------------------------------------------------------------------------
  insert into public.profiles (id, email, full_name, role, parent_id, deleted_at) values
    (v_mgr, 'lifecycle-mgr@example.com', 'Lifecycle Manager', 'user', null, null),
    (v_staff, 'lifecycle-staff@example.com', 'Lifecycle Staff', 'user', v_mgr, null),
    (v_out, 'lifecycle-out@example.com', 'Lifecycle Outsider', 'user', null, null)
  on conflict (id) do nothing;

  -- --------------------------------------------------------------------------
  -- 3. Insert sebagai pemilik mencatat tepat satu peristiwa `created`
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_staff::text, true);
  perform set_config('role', 'authenticated', true);

  insert into public.work_calendar_entries (
    owner_id, work_date, title, kind, is_all_day, due_date, color_swatch
  ) values (
    v_staff, '2026-09-10', 'Pekerjaan Siklus Hidup', 'work', true, '2026-09-12', 'blue'
  ) returning id into v_entry;

  select count(*) into v_count
  from public.work_calendar_events
  where entry_id = v_entry;
  if v_count <> 1 then
    raise exception 'Assertion failed: insert harus mencatat 1 peristiwa, dapat %', v_count;
  end if;

  select * into v_event
  from public.work_calendar_events
  where entry_id = v_entry;

  if v_event.event_type <> 'created'
     or v_event.to_status <> 'planned'
     or v_event.to_work_date <> '2026-09-10'::date
     or v_event.from_status is not null
     or v_event.owner_id <> v_staff
     or v_event.actor_id <> v_staff then
    raise exception 'Assertion failed: payload peristiwa created tidak sesuai (type %, to_status %, to_work_date %, actor %)',
      v_event.event_type, v_event.to_status, v_event.to_work_date, v_event.actor_id;
  end if;

  -- --------------------------------------------------------------------------
  -- 4. Update non-siklus hidup tidak menambah peristiwa (anti-duplikasi)
  -- --------------------------------------------------------------------------
  update public.work_calendar_entries
  set title = 'Pekerjaan Siklus Hidup Revisi', notes = 'Catatan baru', location = 'Ruang B'
  where id = v_entry;

  select count(*) into v_count
  from public.work_calendar_events
  where entry_id = v_entry;
  if v_count <> 1 then
    raise exception 'Assertion failed: update non-siklus hidup menambah peristiwa (total %)', v_count;
  end if;

  -- --------------------------------------------------------------------------
  -- 5. Perubahan status mencatat status_changed beserta detail
  -- --------------------------------------------------------------------------
  update public.work_calendar_entries
  set status = 'completed', realization = 'Selesai tepat waktu'
  where id = v_entry;

  select * into v_event
  from public.work_calendar_events
  where entry_id = v_entry and event_type = 'status_changed';

  if v_event.from_status <> 'planned'
     or v_event.to_status <> 'completed'
     or v_event.detail <> 'Selesai tepat waktu' then
    raise exception 'Assertion failed: status_changed planned->completed tidak sesuai (from %, to %, detail %)',
      v_event.from_status, v_event.to_status, v_event.detail;
  end if;

  -- --------------------------------------------------------------------------
  -- 6. Perubahan jadwal dan tenggat mencatat peristiwanya masing-masing
  -- --------------------------------------------------------------------------
  update public.work_calendar_entries
  set work_date = '2026-09-11'
  where id = v_entry;

  select * into v_event
  from public.work_calendar_events
  where entry_id = v_entry and event_type = 'schedule_changed';

  if v_event.from_work_date <> '2026-09-10'::date
     or v_event.to_work_date <> '2026-09-11'::date then
    raise exception 'Assertion failed: schedule_changed 09-10->09-11 tidak sesuai (from %, to %)',
      v_event.from_work_date, v_event.to_work_date;
  end if;

  update public.work_calendar_entries
  set due_date = '2026-09-15'
  where id = v_entry;

  select * into v_event
  from public.work_calendar_events
  where entry_id = v_entry and event_type = 'due_date_changed';

  if v_event.from_due_date <> '2026-09-12'::date
     or v_event.to_due_date <> '2026-09-15'::date then
    raise exception 'Assertion failed: due_date_changed 09-12->09-15 tidak sesuai (from %, to %)',
      v_event.from_due_date, v_event.to_due_date;
  end if;

  -- --------------------------------------------------------------------------
  -- 7. Satu update gabungan menghasilkan tepat satu peristiwa per dimensi
  -- --------------------------------------------------------------------------
  update public.work_calendar_entries
  set status = 'blocked',
      blocked_reason = 'Menunggu data dari cabang',
      work_date = '2026-09-12',
      due_date = '2026-09-20'
  where id = v_entry;

  select count(*) into v_count from public.work_calendar_events where entry_id = v_entry and event_type = 'created';
  if v_count <> 1 then
    raise exception 'Assertion failed: created seharusnya 1, dapat %', v_count;
  end if;

  select count(*) into v_count from public.work_calendar_events where entry_id = v_entry and event_type = 'status_changed';
  if v_count <> 2 then
    raise exception 'Assertion failed: status_changed seharusnya 2, dapat %', v_count;
  end if;

  select count(*) into v_count from public.work_calendar_events where entry_id = v_entry and event_type = 'schedule_changed';
  if v_count <> 2 then
    raise exception 'Assertion failed: schedule_changed seharusnya 2, dapat %', v_count;
  end if;

  select count(*) into v_count from public.work_calendar_events where entry_id = v_entry and event_type = 'due_date_changed';
  if v_count <> 2 then
    raise exception 'Assertion failed: due_date_changed seharusnya 2, dapat %', v_count;
  end if;

  select * into v_event
  from public.work_calendar_events
  where entry_id = v_entry and event_type = 'status_changed' and to_status = 'blocked';

  if v_event.from_status <> 'completed' or v_event.detail <> 'Menunggu data dari cabang' then
    raise exception 'Assertion failed: status_changed completed->blocked tidak sesuai (from %, detail %)',
      v_event.from_status, v_event.detail;
  end if;

  -- --------------------------------------------------------------------------
  -- 8. Soft delete bukan peristiwa siklus hidup dan tidak menghapus riwayat
  -- --------------------------------------------------------------------------
  perform set_config('role', 'postgres', true);
  update public.work_calendar_entries
  set deleted_at = clock_timestamp()
  where id = v_entry;

  select count(*) into v_count
  from public.work_calendar_events
  where entry_id = v_entry;
  if v_count <> 7 then
    raise exception 'Assertion failed: soft delete mengubah riwayat (total % bukan 7)', v_count;
  end if;

  -- --------------------------------------------------------------------------
  -- 9. Constraint warna: nilai di luar palet ditolak, nilai palet diterima
  -- --------------------------------------------------------------------------
  v_threw := false;
  begin
    insert into public.work_calendar_entries (
      owner_id, work_date, title, kind, is_all_day, color_swatch
    ) values (
      v_staff, '2026-09-10', 'Warna tidak dikenal', 'work', true, 'magenta'
    );
  exception
    when check_violation then v_threw := true;
  end;
  if not v_threw then
    raise exception 'Assertion failed: color_swatch di luar palet seharusnya ditolak';
  end if;

  insert into public.work_calendar_entries (
    owner_id, work_date, title, kind, is_all_day, color_swatch
  ) values (
    v_staff, '2026-09-10', 'Warna palet', 'work', true, 'rose'
  ) returning id into v_entry_two;

  select count(*) into v_count
  from public.work_calendar_events
  where entry_id = v_entry_two and event_type = 'created';
  if v_count <> 1 then
    raise exception 'Assertion failed: entry kedua seharusnya punya 1 peristiwa created, dapat %', v_count;
  end if;

  -- --------------------------------------------------------------------------
  -- 10. Duplikasi peristiwa created dan payload tidak valid ditolak database
  -- --------------------------------------------------------------------------
  v_threw := false;
  begin
    insert into public.work_calendar_events (
      entry_id, owner_id, event_type, to_status, to_work_date
    ) values (
      v_entry_two, v_staff, 'created', 'planned', '2026-09-10'
    );
  exception
    when unique_violation then v_threw := true;
  end;
  if not v_threw then
    raise exception 'Assertion failed: peristiwa created ganda seharusnya ditolak';
  end if;

  v_threw := false;
  begin
    insert into public.work_calendar_events (
      entry_id, owner_id, event_type, from_status, to_status
    ) values (
      v_entry_two, v_staff, 'status_changed', 'planned', 'planned'
    );
  exception
    when check_violation then v_threw := true;
  end;
  if not v_threw then
    raise exception 'Assertion failed: status_changed tanpa perubahan status seharusnya ditolak';
  end if;

  v_threw := false;
  begin
    insert into public.work_calendar_events (
      entry_id, owner_id, event_type, from_work_date, to_work_date
    ) values (
      v_entry_two, v_staff, 'schedule_changed', '2026-09-10', '2026-09-10'
    );
  exception
    when check_violation then v_threw := true;
  end;
  if not v_threw then
    raise exception 'Assertion failed: schedule_changed tanpa perubahan tanggal seharusnya ditolak';
  end if;

  -- --------------------------------------------------------------------------
  -- 11. Entry milik pihak di luar subtree untuk uji cakupan RLS
  -- --------------------------------------------------------------------------
  insert into public.work_calendar_entries (
    owner_id, work_date, title, kind, is_all_day
  ) values (
    v_out, '2026-09-10', 'Pekerjaan Outsider', 'work', true
  ) returning id into v_entry_out;

  -- --------------------------------------------------------------------------
  -- 12. RLS baca: pemilik dan manajer dapat membaca, pihak luar tidak
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_staff::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_count
  from public.work_calendar_events
  where entry_id = v_entry;
  if v_count <> 7 then
    raise exception 'Assertion failed: pemilik seharusnya membaca 7 peristiwa, dapat %', v_count;
  end if;

  perform set_config('request.jwt.claim.sub', v_mgr::text, true);
  select count(*) into v_count
  from public.work_calendar_events
  where entry_id = v_entry;
  if v_count <> 7 then
    raise exception 'Assertion failed: manajer seharusnya membaca 7 peristiwa bawahan, dapat %', v_count;
  end if;

  select count(*) into v_count
  from public.work_calendar_events
  where entry_id = v_entry_out;
  if v_count <> 0 then
    raise exception 'Assertion failed: manajer seharusnya tidak membaca peristiwa pihak luar, dapat %', v_count;
  end if;

  perform set_config('request.jwt.claim.sub', v_out::text, true);
  select count(*) into v_count
  from public.work_calendar_events
  where entry_id = v_entry;
  if v_count <> 0 then
    raise exception 'Assertion failed: pihak luar seharusnya tidak membaca peristiwa orang lain, dapat %', v_count;
  end if;

  select count(*) into v_count
  from public.work_calendar_events
  where entry_id = v_entry_out;
  if v_count <> 1 then
    raise exception 'Assertion failed: pemilik luar seharusnya membaca 1 peristiwa sendiri, dapat %', v_count;
  end if;

  -- --------------------------------------------------------------------------
  -- 13. Klien tidak dapat menulis peristiwa secara langsung
  -- --------------------------------------------------------------------------
  v_threw := false;
  begin
    insert into public.work_calendar_events (
      entry_id, owner_id, event_type, to_status, to_work_date
    ) values (
      v_entry_out, v_out, 'created', 'planned', '2026-09-10'
    );
  exception
    when insufficient_privilege then v_threw := true;
  end;
  if not v_threw then
    raise exception 'Assertion failed: authenticated seharusnya tidak boleh insert peristiwa';
  end if;

  v_threw := false;
  begin
    update public.work_calendar_events set detail = 'dipalsukan' where entry_id = v_entry_out;
  exception
    when insufficient_privilege then v_threw := true;
  end;
  if not v_threw then
    raise exception 'Assertion failed: authenticated seharusnya tidak boleh update peristiwa';
  end if;

  v_threw := false;
  begin
    delete from public.work_calendar_events where entry_id = v_entry_out;
  exception
    when insufficient_privilege then v_threw := true;
  end;
  if not v_threw then
    raise exception 'Assertion failed: authenticated seharusnya tidak boleh delete peristiwa';
  end if;

  perform set_config('role', 'postgres', true);
end $$;

select 'CAL-03 work calendar lifecycle integration: all assertions passed' as result;
