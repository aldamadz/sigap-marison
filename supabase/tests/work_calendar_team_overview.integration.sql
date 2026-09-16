-- ============================================================================
-- Integration tests for CAL-03 F4A Director Scale team overview RPCs
--   public.list_work_calendar_team_overview(...)
--   public.list_work_calendar_team_overview_options()
--   public.list_work_calendar_member_entries(uuid, date)
--
-- Canonical organization model under test:
--   Kantor (master_offices) -> Departemen (master_departments) -> Anggota
--   (profiles). Entitas is intentionally not part of the filter contract.
-- ============================================================================

do $$
declare
  -- Kantor
  v_office_pusat  uuid := 'a0c10000-0000-4000-8000-000000000001';
  v_office_solo   uuid := 'a0c10000-0000-4000-8000-000000000002';
  v_office_bandung uuid := 'a0c10000-0000-4000-8000-000000000003';
  -- Departemen
  v_dept_direksi  uuid := 'a0c20000-0000-4000-8000-000000000001';
  v_dept_ops      uuid := 'a0c20000-0000-4000-8000-000000000002';
  v_dept_keu      uuid := 'a0c20000-0000-4000-8000-000000000003';
  -- Anggota
  v_director uuid := 'a0f00000-0000-4000-8000-000000000001';
  v_m1       uuid := 'a0f00000-0000-4000-8000-000000000002';
  v_m2       uuid := 'a0f00000-0000-4000-8000-000000000003';
  v_m3       uuid := 'a0f00000-0000-4000-8000-000000000004';
  v_inactive uuid := 'a0f00000-0000-4000-8000-000000000901';
  v_nullact  uuid := 'a0f00000-0000-4000-8000-000000000902';
  v_deleted  uuid := 'a0f00000-0000-4000-8000-000000000903';
  v_child_of_inactive uuid := 'a0f00000-0000-4000-8000-000000000904';
  v_outside  uuid := 'a0f00000-0000-4000-8000-000000000905';
  v_cycle1   uuid := 'a0f00000-0000-4000-8000-000000000906';
  v_cycle2   uuid := 'a0f00000-0000-4000-8000-000000000907';
  v_noname   uuid := 'a0f00000-0000-4000-8001-000000000099';

  v_s1 uuid := 'a0f00000-0000-4000-8001-000000000001';
  v_s2 uuid := 'a0f00000-0000-4000-8001-000000000002';
  v_s5 uuid := 'a0f00000-0000-4000-8001-000000000005';
  v_s6 uuid := 'a0f00000-0000-4000-8001-000000000006';
  v_s12 uuid := 'a0f00000-0000-4000-8001-000000000012';
  v_t1 uuid := 'a0f00000-0000-4000-8002-000000000001';
  v_u1 uuid := 'a0f00000-0000-4000-8003-000000000001';

  v_work_date date := '2026-09-15';
  v_overdue_date date := '2000-01-01';

  v_count integer;
  v_count2 integer;
  v_total bigint;
  v_total2 bigint;
  v_agg1 bigint;
  v_agg2 bigint;
  v_first uuid;
  v_threw boolean;
begin
  -- ==========================================================================
  -- 1. Master data
  -- ==========================================================================
  insert into public.master_offices (id, code, name, kedudukan, parent_id) values
    (v_office_pusat, '000', 'Kantor Pusat', 'Pusat', null),
    (v_office_solo, 'SKT', 'Solo', 'KC', null),
    (v_office_bandung, 'SOR', 'Bandung', 'KC', null);

  insert into public.master_departments (id, name, code, dept_index) values
    (v_dept_direksi, 'Direksi', 'DIR', 1),
    (v_dept_ops, 'Operasional', 'OPS', 2),
    (v_dept_keu, 'Keuangan', 'KEU', 3);

  -- Root director (not a team member; must never appear in its own overview)
  insert into public.profiles (id, email, nik, full_name, job_title, role, parent_id, office_id, department_id, deleted_at, is_active) values
    (v_director, 'director@example.com', '3200000000000000', 'Direktur Utama', 'Direktur Utama', 'user', null, v_office_pusat, v_dept_direksi, null, true),
    (v_m1, 'm1@example.com', '3200000000000101', 'Manager Operasional', 'Manager Operasional', 'user', v_director, v_office_solo, v_dept_ops, null, true),
    (v_m2, 'm2@example.com', '3200000000000102', 'Manager Keuangan', 'Manager Keuangan', 'user', v_director, v_office_bandung, v_dept_keu, null, true),
    (v_m3, 'm3@example.com', '3200000000000103', 'Manager Cabang', 'Manager Cabang', 'user', v_director, v_office_pusat, v_dept_ops, null, true),
    (v_inactive, 'inactive@example.com', '3200000000000901', 'Pegawai Nonaktif', 'Staf', 'user', v_m1, v_office_solo, v_dept_ops, null, false),
    (v_nullact, 'nullact@example.com', '3200000000000902', 'Pegawai Null Aktif', 'Staf', 'user', v_m1, v_office_solo, v_dept_ops, null, null),
    (v_deleted, 'deleted@example.com', '3200000000000903', 'Pegawai Terhapus', 'Staf', 'user', v_m1, v_office_solo, v_dept_ops, now(), true),
    (v_child_of_inactive, 'childinactive@example.com', '3200000000000904', 'Anak Dari Nonaktif', 'Staf', 'user', v_inactive, v_office_solo, v_dept_ops, null, true),
    (v_outside, 'outside@example.com', '3200000000000905', 'Pegawai Luar', 'Staf', 'user', null, v_office_bandung, v_dept_keu, null, true),
    (v_cycle1, 'cycle1@example.com', '3200000000000906', 'Cycle Satu', 'Staf', 'user', v_m1, v_office_solo, v_dept_ops, null, true),
    (v_cycle2, 'cycle2@example.com', '3200000000000907', 'Cycle Dua', 'Staf', 'user', v_cycle1, v_office_solo, v_dept_ops, null, true),
    (v_noname, 'noname@example.com', '3200000000000099', null, 'Staf Pusat', 'user', v_m3, v_office_pusat, v_dept_ops, null, true);

  -- 12 staff under m1 (Solo / Operasional)
  insert into public.profiles (id, email, nik, full_name, job_title, role, parent_id, office_id, department_id, deleted_at, is_active)
  select
    ('a0f00000-0000-4000-8001-' || lpad(i::text, 12, '0'))::uuid,
    'solo' || i || '@example.com',
    '320000000001' || lpad(i::text, 4, '0'),
    case when i = 1 then 'Staff Satu'
         when i = 2 then 'Staff Dua'
         else 'Anggota Solo ' || i end,
    case when i = 1 then 'Staf Operasional'
         when i = 2 then 'Analis Khusus'
         else 'Staf Operasional' end,
    'user', v_m1, v_office_solo, v_dept_ops, null, true
  from generate_series(1, 12) as i;

  -- 10 staff under m2 (Bandung / Keuangan)
  insert into public.profiles (id, email, nik, full_name, job_title, role, parent_id, office_id, department_id, deleted_at, is_active)
  select
    ('a0f00000-0000-4000-8002-' || lpad(i::text, 12, '0'))::uuid,
    'bdg' || i || '@example.com',
    '320000000002' || lpad(i::text, 4, '0'),
    'Anggota Bandung ' || i,
    'Staf Keuangan',
    'user', v_m2, v_office_bandung, v_dept_keu, null, true
  from generate_series(1, 10) as i;

  -- 5 staff under m3 (Pusat / Operasional)
  insert into public.profiles (id, email, nik, full_name, job_title, role, parent_id, office_id, department_id, deleted_at, is_active)
  select
    ('a0f00000-0000-4000-8003-' || lpad(i::text, 12, '0'))::uuid,
    'pst' || i || '@example.com',
    '320000000003' || lpad(i::text, 4, '0'),
    'Anggota Pusat ' || i,
    'Staf Pusat',
    'user', v_m3, v_office_pusat, v_dept_ops, null, true
  from generate_series(1, 5) as i;

  -- Close an intentional cycle that must never be traversed.
  update public.profiles set parent_id = v_cycle2 where id = v_cycle1;

  -- ==========================================================================
  -- 2. Entries on the reference date 2026-09-15
  -- ==========================================================================
  insert into public.work_calendar_entries (owner_id, work_date, title, status, realization, completed_at, blocked_reason) values
    (v_m1, v_work_date, 'Rencana mingguan operasional', 'planned', null, null, null),
    (v_m2, v_work_date, 'Tutup buku keuangan', 'completed', 'Buku ditutup.', '2026-09-15T09:00:00Z', null),
    (v_m3, v_work_date, 'Supervisi cabang pusat', 'in_progress', null, null, null),
    (v_s1, v_work_date, 'Pekerjaan terhambat', 'blocked', null, null, 'Menunggu berkas.'),
    (v_s2, v_work_date, 'Analisis khusus berjalan', 'in_progress', null, null, null),
    (v_s12, v_work_date, 'Pekerjaan anggota terakhir', 'planned', null, null, null),
    (v_t1, v_work_date, 'Pekerjaan terhambat bandung', 'blocked', null, null, 'Menunggu vendor.'),
    (v_u1, v_work_date, 'Pekerjaan pusat direncanakan', 'planned', null, null, null);

  -- Deterministic overdue fixtures on a far-past date.
  insert into public.work_calendar_entries (owner_id, work_date, title, status, realization, completed_at, blocked_reason) values
    (v_s5, v_overdue_date, 'Terlambat lima', 'planned', null, null, null),
    (v_s6, v_overdue_date, 'Terlambat enam', 'in_progress', null, null, null);

  -- ==========================================================================
  -- 3. Director full overview: authorization + fail-closed exclusions
  -- ==========================================================================
  perform set_config('request.jwt.claim.sub', v_director::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*), max(total_count) into v_count, v_total
  from public.list_work_calendar_team_overview(
    null, null, null, null, null, v_work_date, 'priority', 100, 0
  );

  -- 3 managers + 12 Solo + 10 Bandung + 5 Pusat + 1 null-name = 31
  if v_count <> 31 or v_total <> 31 then
    raise exception 'Assertion failed: director overview expected 31 rows/total_count, got rows=% total=%', v_count, v_total;
  end if;

  if exists (
    select 1 from public.list_work_calendar_team_overview(
      null, null, null, null, null, v_work_date, 'priority', 100, 0
    )
    where member_id in (
      v_director, v_inactive, v_nullact, v_deleted,
      v_child_of_inactive, v_outside, v_cycle1, v_cycle2
    )
  ) then
    raise exception 'Assertion failed: overview leaked actor/inactive/null/deleted/pruned/outside/cycle members';
  end if;

  -- Raw UUID must never be used as a display name.
  if exists (
    select 1 from public.list_work_calendar_team_overview(
      null, null, null, null, null, v_work_date, 'priority', 100, 0
    )
    where full_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-'
  ) then
    raise exception 'Assertion failed: overview exposed a raw UUID as display name';
  end if;

  -- ==========================================================================
  -- 4. Pagination: no duplicate, no loss
  -- ==========================================================================
  select count(*) into v_count from public.list_work_calendar_team_overview(
    null, null, null, null, null, v_work_date, 'priority', 25, 0
  );
  if v_count <> 25 then
    raise exception 'Assertion failed: page 1 expected 25 rows, got %', v_count;
  end if;

  select count(*) into v_count2 from public.list_work_calendar_team_overview(
    null, null, null, null, null, v_work_date, 'priority', 25, 25
  );
  if v_count2 <> 6 then
    raise exception 'Assertion failed: page 2 expected 6 rows, got %', v_count2;
  end if;

  select count(distinct member_id) into v_total
  from (
    select member_id from public.list_work_calendar_team_overview(
      null, null, null, null, null, v_work_date, 'priority', 25, 0
    )
    union all
    select member_id from public.list_work_calendar_team_overview(
      null, null, null, null, null, v_work_date, 'priority', 25, 25
    )
  ) paged;
  if v_total <> 31 then
    raise exception 'Assertion failed: paged members distinct expected 31, got %', v_total;
  end if;

  if exists (
    select 1 from (
      select member_id, count(*) c from (
        select member_id from public.list_work_calendar_team_overview(
          null, null, null, null, null, v_work_date, 'priority', 25, 0
        )
        union all
        select member_id from public.list_work_calendar_team_overview(
          null, null, null, null, null, v_work_date, 'priority', 25, 25
        )
      ) u group by member_id
    ) d where c <> 1
  ) then
    raise exception 'Assertion failed: paginated members overlapped between pages';
  end if;

  -- ==========================================================================
  -- 5. Header aggregates cover the whole filtered result, not just the page
  -- ==========================================================================
  select aggregate_total into v_agg1 from public.list_work_calendar_team_overview(
    null, null, null, null, null, v_work_date, 'priority', 25, 0
  ) limit 1;

  select aggregate_total into v_agg2 from public.list_work_calendar_team_overview(
    null, null, null, null, null, v_work_date, 'priority', 25, 25
  ) limit 1;

  select coalesce(sum(member_total), 0) into v_total
  from public.list_work_calendar_team_overview(
    null, null, null, null, null, v_work_date, 'priority', 100, 0
  );

  if v_agg1 <> v_agg2 or v_agg1 <> v_total then
    raise exception 'Assertion failed: aggregate_total not stable across pages (page1=%, page2=%, full=%)', v_agg1, v_agg2, v_total;
  end if;
  -- Eight entries exist on the reference date across all 31 members; the
  -- header aggregate must equal the full-result sum, not just the first page.
  if v_agg1 <> 8 then
    raise exception 'Assertion failed: aggregate_total expected 8, got %', v_agg1;
  end if;

  -- ==========================================================================
  -- 6. Cascading filters narrow scope only
  -- ==========================================================================
  select count(*), max(total_count) into v_count, v_total
  from public.list_work_calendar_team_overview(
    v_office_solo, null, null, null, null, v_work_date, 'priority', 100, 0
  );
  if v_count <> 13 or v_total <> 13 then
    raise exception 'Assertion failed: office Solo expected 13 (m1 + 12 staff), got rows=% total=%', v_count, v_total;
  end if;

  select count(*) into v_count from public.list_work_calendar_team_overview(
    null, v_dept_keu, null, null, null, v_work_date, 'priority', 100, 0
  );
  if v_count <> 11 then
    raise exception 'Assertion failed: department Keuangan expected 11, got %', v_count;
  end if;

  select count(*) into v_count from public.list_work_calendar_team_overview(
    null, null, v_s1, null, null, v_work_date, 'priority', 100, 0
  );
  if v_count <> 1 then
    raise exception 'Assertion failed: member filter expected 1 row, got %', v_count;
  end if;

  -- Combined office + department is an intersection (Solo + Keuangan = none).
  select count(*) into v_count from public.list_work_calendar_team_overview(
    v_office_solo, v_dept_keu, null, null, null, v_work_date, 'priority', 100, 0
  );
  if v_count <> 0 then
    raise exception 'Assertion failed: combined Solo+Keuangan expected 0, got %', v_count;
  end if;

  -- Search by job title, NIK, and name.
  select count(*) into v_count from public.list_work_calendar_team_overview(
    null, null, null, 'Analis Khusus', null, v_work_date, 'priority', 100, 0
  );
  if v_count <> 1 then
    raise exception 'Assertion failed: search by job title expected 1, got %', v_count;
  end if;

  select count(*) into v_count from public.list_work_calendar_team_overview(
    null, null, null, '3200000000010002', null, v_work_date, 'priority', 100, 0
  );
  if v_count <> 1 then
    raise exception 'Assertion failed: search by NIK expected 1, got %', v_count;
  end if;

  select count(*) into v_count from public.list_work_calendar_team_overview(
    null, null, null, 'Staff Satu', null, v_work_date, 'priority', 100, 0
  );
  if v_count <> 1 then
    raise exception 'Assertion failed: search by name expected 1, got %', v_count;
  end if;

  select count(*) into v_count from public.list_work_calendar_team_overview(
    null, null, null, 'zzz-tidak-ada', null, v_work_date, 'priority', 100, 0
  );
  if v_count <> 0 then
    raise exception 'Assertion failed: no-result search expected 0, got %', v_count;
  end if;

  -- Status filter also removes members without a matching entry.
  select count(*) into v_count from public.list_work_calendar_team_overview(
    null, null, null, null, 'blocked', v_work_date, 'priority', 100, 0
  );
  if v_count <> 2 then
    raise exception 'Assertion failed: status blocked expected 2, got %', v_count;
  end if;

  select count(*) into v_count from public.list_work_calendar_team_overview(
    null, null, null, null, 'completed', v_work_date, 'priority', 100, 0
  );
  if v_count <> 1 then
    raise exception 'Assertion failed: status completed expected 1, got %', v_count;
  end if;

  -- ==========================================================================
  -- 7. Members without entries
  -- ==========================================================================
  select member_total into v_agg1 from public.list_work_calendar_team_overview(
    null, null, null, null, null, v_work_date, 'priority', 100, 0
  ) where member_id = v_s5 limit 1;
  if v_agg1 <> 0 then
    raise exception 'Assertion failed: member without entry expected member_total 0, got %', v_agg1;
  end if;

  if exists (
    select 1 from public.list_work_calendar_team_overview(
      null, null, null, null, 'blocked', v_work_date, 'priority', 100, 0
    ) where member_id = v_s5
  ) then
    raise exception 'Assertion failed: member without entry must be excluded by an active status filter';
  end if;

  -- ==========================================================================
  -- 8. Unauthorized filter ids cannot widen scope
  -- ==========================================================================
  select count(*) into v_count from public.list_work_calendar_team_overview(
    'a0d90000-0000-4000-8000-000000000001', null, null, null, null, v_work_date, 'priority', 100, 0
  );
  if v_count <> 0 then
    raise exception 'Assertion failed: unknown office filter expected 0, got %', v_count;
  end if;

  select count(*) into v_count from public.list_work_calendar_team_overview(
    null, null, v_outside, null, null, v_work_date, 'priority', 100, 0
  );
  if v_count <> 0 then
    raise exception 'Assertion failed: outside member filter expected 0, got %', v_count;
  end if;

  select count(*) into v_count from public.list_work_calendar_team_overview(
    null, null, v_inactive, null, null, v_work_date, 'priority', 100, 0
  );
  if v_count <> 0 then
    raise exception 'Assertion failed: inactive member filter expected 0, got %', v_count;
  end if;

  -- ==========================================================================
  -- 9. Stable sorting
  -- ==========================================================================
  select member_id into v_first from public.list_work_calendar_team_overview(
    null, null, null, null, null, v_work_date, 'priority', 100, 0
  ) limit 1;
  -- Blocked members rank first.
  if not exists (
    select 1 from public.list_work_calendar_team_overview(
      null, null, null, null, null, v_work_date, 'priority', 100, 0
    ) where member_id = v_first and member_blocked > 0
  ) then
    raise exception 'Assertion failed: priority sort should place a blocked member first';
  end if;

  -- Deterministic across repeated calls.
  declare
    v_order1 text;
    v_order2 text;
  begin
    select string_agg(member_id::text, ',' order by ord) into v_order1
    from (
      select member_id, row_number() over () as ord
      from public.list_work_calendar_team_overview(
        null, null, null, null, null, v_work_date, 'priority', 100, 0
      )
    ) a;

    select string_agg(member_id::text, ',' order by ord) into v_order2
    from (
      select member_id, row_number() over () as ord
      from public.list_work_calendar_team_overview(
        null, null, null, null, null, v_work_date, 'priority', 100, 0
      )
    ) b;

    if v_order1 is distinct from v_order2 then
      raise exception 'Assertion failed: overview ordering is not stable across calls';
    end if;
  end;

  -- ==========================================================================
  -- 10. Overdue derived state + overdue status filter
  -- ==========================================================================
  select coalesce(aggregate_overdue, -1) into v_agg1
  from public.list_work_calendar_team_overview(
    null, null, null, null, null, v_overdue_date, 'priority', 100, 0
  ) limit 1;
  if v_agg1 <> 2 then
    raise exception 'Assertion failed: overdue aggregate expected 2, got %', v_agg1;
  end if;

  select count(*) into v_count from public.list_work_calendar_team_overview(
    null, null, null, null, 'overdue', v_overdue_date, 'priority', 100, 0
  );
  if v_count <> 2 then
    raise exception 'Assertion failed: overdue status filter expected 2, got %', v_count;
  end if;

  -- ==========================================================================
  -- 11. Organization options are scoped to the authorized hierarchy
  -- ==========================================================================
  select count(*) into v_count from public.list_work_calendar_team_overview_options();
  -- 3 offices (Solo, Bandung, Pusat) + 2 departments (Operasional, Keuangan)
  -- + 31 members = 36. Direksi has no authorized member, so it is absent.
  if v_count <> 36 then
    raise exception 'Assertion failed: authorized options expected 36, got %', v_count;
  end if;

  select member_count into v_total from public.list_work_calendar_team_overview_options()
  where option_kind = 'office' and option_id = v_office_solo;
  if v_total <> 13 then
    raise exception 'Assertion failed: office option Solo expected 13 members, got %', v_total;
  end if;

  if exists (
    select 1 from public.list_work_calendar_team_overview_options()
    where option_kind = 'member' and option_id = v_outside
  ) then
    raise exception 'Assertion failed: options leaked an out-of-scope member';
  end if;

  -- ==========================================================================
  -- 12. Supervisor scope: manager m1 sees only its own branch
  -- ==========================================================================
  perform set_config('request.jwt.claim.sub', v_m1::text, true);
  select count(*), max(total_count) into v_count, v_total
  from public.list_work_calendar_team_overview(
    null, null, null, null, null, v_work_date, 'priority', 100, 0
  );
  if v_count <> 12 or v_total <> 12 then
    raise exception 'Assertion failed: manager m1 expected 12 members, got rows=% total=%', v_count, v_total;
  end if;

  if exists (
    select 1 from public.list_work_calendar_team_overview(
      null, null, null, null, null, v_work_date, 'priority', 100, 0
    ) where member_id not in (
      select ('a0f00000-0000-4000-8001-' || lpad(i::text, 12, '0'))::uuid
      from generate_series(1, 12) as i
    )
  ) then
    raise exception 'Assertion failed: manager m1 saw members outside its branch';
  end if;

  -- Filters cannot widen: m1 asking for the Bandung office gets nothing.
  select count(*) into v_count from public.list_work_calendar_team_overview(
    v_office_bandung, null, null, null, null, v_work_date, 'priority', 100, 0
  );
  if v_count <> 0 then
    raise exception 'Assertion failed: m1 must not see Bandung (filter widened scope), got %', v_count;
  end if;

  -- ==========================================================================
  -- 13. Leaf user has no team
  -- ==========================================================================
  perform set_config('request.jwt.claim.sub', v_s1::text, true);
  select count(*) into v_count from public.list_work_calendar_team_overview(
    null, null, null, null, null, v_work_date, 'priority', 100, 0
  );
  if v_count <> 0 then
    raise exception 'Assertion failed: leaf user expected 0 members, got %', v_count;
  end if;

  -- ==========================================================================
  -- 14. Lazy member detail: authorized only, no leak
  -- ==========================================================================
  perform set_config('request.jwt.claim.sub', v_director::text, true);

  select count(*) into v_count from public.list_work_calendar_member_entries(v_s1, v_work_date);
  if v_count <> 1 then
    raise exception 'Assertion failed: authorized member detail expected 1 entry, got %', v_count;
  end if;

  -- Out-of-scope member returns nothing, never data.
  select count(*) into v_count from public.list_work_calendar_member_entries(v_outside, v_work_date);
  if v_count <> 0 then
    raise exception 'Assertion failed: out-of-scope member detail leaked % entries', v_count;
  end if;

  -- As m1, a Bandung member is outside its scope.
  perform set_config('request.jwt.claim.sub', v_m1::text, true);
  select count(*) into v_count from public.list_work_calendar_member_entries(v_t1, v_work_date);
  if v_count <> 0 then
    raise exception 'Assertion failed: m1 detail leaked Bandung member entries (%)', v_count;
  end if;

  -- Self / null member id is rejected.
  perform set_config('request.jwt.claim.sub', v_director::text, true);
  v_threw := false;
  begin
    perform public.list_work_calendar_member_entries(v_director, v_work_date);
  exception when others then
    v_threw := true;
  end;
  if not v_threw then
    raise exception 'Assertion failed: member detail must reject the actor itself';
  end if;

  -- ==========================================================================
  -- 15. Anonymous rejection
  -- ==========================================================================
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claim.sub', '', true);

  v_threw := false;
  begin
    perform public.list_work_calendar_team_overview(
      null, null, null, null, null, v_work_date, 'priority', 25, 0
    );
  exception when others then
    v_threw := true;
  end;
  if not v_threw then
    raise exception 'Assertion failed: anon role was able to execute team overview';
  end if;

  v_threw := false;
  begin
    perform public.list_work_calendar_team_overview_options();
  exception when others then
    v_threw := true;
  end;
  if not v_threw then
    raise exception 'Assertion failed: anon role was able to execute team overview options';
  end if;

  perform set_config('role', 'postgres', true);
end;
$$;

select 'CAL-03 team overview integration: all assertions passed' as result;
