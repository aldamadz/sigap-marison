-- ============================================================================
-- Integration tests for the CAL-03 F4A Director Scale route correction:
--   public.has_work_calendar_team_members()
--   public.list_work_calendar_team_overview_options()  (roster removed)
--   public.search_work_calendar_team_members(text, integer, integer, uuid, uuid)
--   public.get_work_calendar_team_member(uuid)
--   public.list_work_calendar_team_overview(...)       (offset clamp + counted)
--
-- Focus: the Tim tab must be able to bootstrap without loading a roster, must
-- search members through a bounded/paginated RPC, and must never treat an
-- out-of-range page as "zero members".
-- ============================================================================

do $$
declare
  v_office_solo    uuid := 'b0d10000-0000-4000-8000-000000000001';
  v_office_bandung uuid := 'b0d10000-0000-4000-8000-000000000002';
  v_dept_ops       uuid := 'b0d20000-0000-4000-8000-000000000001';
  v_dept_keu       uuid := 'b0d20000-0000-4000-8000-000000000002';

  v_root    uuid := 'b0f00000-0000-4000-8000-000000000001';
  v_m1      uuid := 'b0f00000-0000-4000-8000-000000000002';
  v_m2      uuid := 'b0f00000-0000-4000-8000-000000000003';
  v_outside uuid := 'b0f00000-0000-4000-8000-000000000004';
  v_leaf    uuid := 'b0f00000-0000-4000-8009-000000000001';

  v_work_date date := '2026-09-15';

  v_count integer;
  v_total bigint;
  v_limit integer;
  v_threw boolean;
  v_first uuid;
  v_second uuid;
begin
  -- ==========================================================================
  -- 1. Fixtures: root -> 2 managers -> 30 staff = 32 authorized descendants
  -- ==========================================================================
  insert into public.master_offices (id, code, name, kedudukan, parent_id) values
    (v_office_solo, 'SKL', 'Solo Skala', 'KC', null),
    (v_office_bandung, 'BDG', 'Bandung Skala', 'KC', null);

  insert into public.master_departments (id, name, code, dept_index) values
    (v_dept_ops, 'Operasional Skala', 'OPS', 11),
    (v_dept_keu, 'Keuangan Skala', 'KEU', 12);

  insert into public.profiles (id, email, nik, full_name, job_title, role, parent_id, office_id, department_id, deleted_at, is_active) values
    (v_root, 'root.scale@example.com', '3300000000000000', 'Direktur Skala', 'Direktur Utama', 'user', null, v_office_solo, v_dept_ops, null, true),
    (v_m1, 'm1.scale@example.com', '3300000000000101', 'Manajer Operasional Skala', 'Manajer', 'user', v_root, v_office_solo, v_dept_ops, null, true),
    (v_m2, 'm2.scale@example.com', '3300000000000102', 'Manajer Keuangan Skala', 'Manajer', 'user', v_root, v_office_bandung, v_dept_keu, null, true),
    (v_outside, 'outside.scale@example.com', '3300000000000901', 'Orang Luar Skala', 'Staf', 'user', null, v_office_bandung, v_dept_keu, null, true),
    (v_leaf, 'leaf.scale@example.com', '3300000000000902', 'Staf Tanpa Bawahan', 'Staf', 'user', null, v_office_solo, v_dept_ops, null, true);

  -- 30 staff under m1, alternating office so the office filter is meaningful.
  insert into public.profiles (id, email, nik, full_name, job_title, role, parent_id, office_id, department_id, deleted_at, is_active)
  select
    ('b0f00000-0000-4000-8001-' || lpad(i::text, 12, '0'))::uuid,
    'scale' || i || '@example.com',
    '330000000001' || lpad(i::text, 4, '0'),
    'Anggota Skala ' || lpad(i::text, 2, '0'),
    'Staf Skala',
    'user', v_m1,
    case when i % 2 = 0 then v_office_bandung else v_office_solo end,
    case when i % 2 = 0 then v_dept_keu else v_dept_ops end,
    null, true
  from generate_series(1, 30) as i;

  insert into public.work_calendar_entries (owner_id, work_date, title, status, realization, completed_at, blocked_reason) values
    (v_m1, v_work_date, 'Rencana skala operasional', 'planned', null, null, null),
    (v_m2, v_work_date, 'Tutup buku skala', 'completed', 'Selesai.', '2026-09-15T08:00:00Z', null),
    (v_leaf, v_work_date, 'Pekerjaan terhambat skala', 'blocked', null, null, 'Menunggu berkas.');

  perform set_config('request.jwt.claim.sub', v_root::text, true);
  perform set_config('role', 'authenticated', true);

  -- ==========================================================================
  -- 2. Availability probe: boolean only, never a roster
  -- ==========================================================================
  if public.has_work_calendar_team_members() is not true then
    raise exception 'Assertion failed: director must be reported as having team members';
  end if;

  perform set_config('request.jwt.claim.sub', v_m1::text, true);
  if public.has_work_calendar_team_members() is not true then
    raise exception 'Assertion failed: manager with subordinates must report team members';
  end if;

  perform set_config('request.jwt.claim.sub', v_leaf::text, true);
  if public.has_work_calendar_team_members() is not false then
    raise exception 'Assertion failed: leaf user must report no team members';
  end if;

  perform set_config('request.jwt.claim.sub', v_outside::text, true);
  if public.has_work_calendar_team_members() is not false then
    raise exception 'Assertion failed: user without descendants must report no team members';
  end if;

  -- ==========================================================================
  -- 3. Bounded member search: paginated, hard-capped, hierarchically scoped
  -- ==========================================================================
  perform set_config('request.jwt.claim.sub', v_root::text, true);

  select count(*), max(total_count) into v_count, v_total
  from public.search_work_calendar_team_members(null, 10, 0, null, null);
  if v_count <> 10 or v_total <> 32 then
    raise exception 'Assertion failed: bounded search page 1 expected 10 rows of 32, got rows=% total=%', v_count, v_total;
  end if;

  -- A caller asking for more than the cap never gets more than 50 rows.
  select count(*) into v_count
  from public.search_work_calendar_team_members(null, 100, 0, null, null);
  if v_count <> 32 then
    raise exception 'Assertion failed: capped search expected all 32 rows (cap 50), got %', v_count;
  end if;

  select count(*), max(total_count) into v_count, v_total
  from public.search_work_calendar_team_members(null, 5, 30, null, null);
  if v_count <> 2 or v_total <> 32 then
    raise exception 'Assertion failed: bounded search last page expected 2 rows of 32, got rows=% total=%', v_count, v_total;
  end if;

  -- Search is scoped: the outsider is never returned.
  if exists (
    select 1 from public.search_work_calendar_team_members(null, 50, 0, null, null)
    where member_id = v_outside
  ) then
    raise exception 'Assertion failed: member search leaked an out-of-hierarchy profile';
  end if;

  -- Actor itself is never part of its own team.
  if exists (
    select 1 from public.search_work_calendar_team_members(null, 50, 0, null, null)
    where member_id = v_root
  ) then
    raise exception 'Assertion failed: member search leaked the actor itself';
  end if;

  select member_id into v_first
  from public.search_work_calendar_team_members('Anggota Skala 07', 25, 0, null, null)
  limit 1;
  if v_first is null then
    raise exception 'Assertion failed: search by name must match a member';
  end if;

  -- Office narrowing is honoured inside the search.
  select count(*), max(total_count) into v_count, v_total
  from public.search_work_calendar_team_members(null, 50, 0, v_office_bandung, null);
  if v_count <> 16 or v_total <> 16 then
    raise exception 'Assertion failed: office-narrowed search expected 16 rows, got rows=% total=%', v_count, v_total;
  end if;

  select count(*), max(total_count) into v_count, v_total
  from public.search_work_calendar_team_members(null, 50, 0, null, v_dept_keu);
  if v_count <> 16 or v_total <> 16 then
    raise exception 'Assertion failed: department-narrowed search expected 16 rows, got rows=% total=%', v_count, v_total;
  end if;

  -- An unauthorized filter combination narrows to nothing, never widens.
  select count(*) into v_count
  from public.search_work_calendar_team_members(null, 50, 0, 'b0d90000-0000-4000-8000-000000000001', null);
  if v_count <> 0 then
    raise exception 'Assertion failed: unknown office in search expected 0, got %', v_count;
  end if;

  -- ==========================================================================
  -- 4. get_work_calendar_team_member: one authorized member, fail closed
  -- ==========================================================================
  select count(*) into v_count from public.get_work_calendar_team_member(v_m1);
  if v_count <> 1 then
    raise exception 'Assertion failed: get member for an authorized subordinate expected 1, got %', v_count;
  end if;

  if exists (
    select 1 from public.get_work_calendar_team_member(v_outside)
  ) then
    raise exception 'Assertion failed: get member leaked an out-of-hierarchy profile';
  end if;

  if exists (
    select 1 from public.get_work_calendar_team_member(v_root)
  ) then
    raise exception 'Assertion failed: get member must not resolve the actor itself';
  end if;

  select count(*) into v_count from public.get_work_calendar_team_member(null);
  if v_count <> 0 then
    raise exception 'Assertion failed: get member with null id expected 0 rows, got %', v_count;
  end if;

  -- ==========================================================================
  -- 5. Options never carry a roster, departments cascade per office
  -- ==========================================================================
  select count(*) into v_count from public.list_work_calendar_team_overview_options();
  -- 2 offices (Solo, Bandung) + 2 (department, office) pairs
  -- (Operasional@Solo, Keuangan@Bandung) = 4. Every authorized member sits in
  -- exactly one office/department pair here.
  if v_count <> 4 then
    raise exception 'Assertion failed: scale options expected 4 rows, got %', v_count;
  end if;

  if exists (
    select 1 from public.list_work_calendar_team_overview_options()
    where option_kind = 'member'
  ) then
    raise exception 'Assertion failed: options must not return member rows';
  end if;

  select count(*) into v_count from public.list_work_calendar_team_overview_options()
  where option_kind = 'department' and option_id = v_dept_ops and office_id = v_office_solo;
  if v_count <> 1 then
    raise exception 'Assertion failed: Operasional@Solo department option missing';
  end if;

  select member_count into v_total from public.list_work_calendar_team_overview_options()
  where option_kind = 'department' and option_id = v_dept_ops and office_id = v_office_solo;
  if v_total <> 16 then
    raise exception 'Assertion failed: Operasional@Solo expected 16 members, got %', v_total;
  end if;

  -- ==========================================================================
  -- 6. Offset beyond range is clamped, not reported as an empty team
  -- ==========================================================================
  select count(*), max(total_count) into v_count, v_total
  from public.list_work_calendar_team_overview(
    null, null, null, null, null, v_work_date, 'priority', 25, 0
  );
  if v_count <> 25 or v_total <> 32 then
    raise exception 'Assertion failed: overview page 1 expected 25 of 32, got rows=% total=%', v_count, v_total;
  end if;

  select count(*), max(total_count) into v_count, v_total
  from public.list_work_calendar_team_overview(
    null, null, null, null, null, v_work_date, 'priority', 25, 25
  );
  if v_count <> 7 or v_total <> 32 then
    raise exception 'Assertion failed: overview page 2 expected 7 of 32, got rows=% total=%', v_count, v_total;
  end if;

  -- The regression: a far page must still report the real total_count.
  select count(*), max(total_count) into v_count, v_total
  from public.list_work_calendar_team_overview(
    null, null, null, null, null, v_work_date, 'priority', 25, 1000
  );
  if v_count <> 7 or v_total <> 32 then
    raise exception 'Assertion failed: clamped offset expected last page 7 rows of 32, got rows=% total=%', v_count, v_total;
  end if;

  -- Empty result set keeps total_count at 0 (no phantom page).
  select count(*), max(total_count) into v_count, v_total
  from public.list_work_calendar_team_overview(
    null, null, null, 'zzz-tidak-ada-sama-sekali', null, v_work_date, 'priority', 25, 0
  );
  if v_count <> 0 or v_total is not null then
    raise exception 'Assertion failed: empty overview expected 0 rows / no total, got rows=% total=%', v_count, v_total;
  end if;

  -- ==========================================================================
  -- 7. Supervisor scope still holds for the new RPCs
  -- ==========================================================================
  perform set_config('request.jwt.claim.sub', v_m1::text, true);

  select count(*), max(total_count) into v_count, v_total
  from public.search_work_calendar_team_members(null, 50, 0, null, null);
  if v_count <> 30 or v_total <> 30 then
    raise exception 'Assertion failed: m1 bounded search expected 30 rows, got rows=% total=%', v_count, v_total;
  end if;

  if exists (
    select 1 from public.search_work_calendar_team_members(null, 50, 0, null, null)
    where member_id in (v_m2, v_outside)
  ) then
    raise exception 'Assertion failed: m1 member search leaked another branch';
  end if;

  if public.has_work_calendar_team_members() is not true then
    raise exception 'Assertion failed: m1 still has a team after scope checks';
  end if;

  -- ==========================================================================
  -- 8. Anonymous rejection for every new entry point
  -- ==========================================================================
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claim.sub', '', true);

  v_threw := false;
  begin
    perform public.has_work_calendar_team_members();
  exception when others then
    v_threw := true;
  end;
  if not v_threw then
    raise exception 'Assertion failed: anon role was able to execute the availability probe';
  end if;

  v_threw := false;
  begin
    perform public.search_work_calendar_team_members(null, 25, 0, null, null);
  exception when others then
    v_threw := true;
  end;
  if not v_threw then
    raise exception 'Assertion failed: anon role was able to execute member search';
  end if;

  v_threw := false;
  begin
    perform public.get_work_calendar_team_member(v_m1);
  exception when others then
    v_threw := true;
  end;
  if not v_threw then
    raise exception 'Assertion failed: anon role was able to execute get_work_calendar_team_member';
  end if;

  perform set_config('role', 'postgres', true);
end;
$$;

select 'CAL-03 team overview scale integration: all assertions passed' as result;
