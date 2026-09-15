-- ============================================================================
-- Integration tests for CAL-03 Unified Work Calendar Database Layer
-- ============================================================================

do $$
declare
  v_user_a uuid := 'f0000000-0000-4000-8000-000000000001'; -- Root manager
  v_user_b uuid := 'f0000000-0000-4000-8000-000000000002'; -- Subordinate of A
  v_user_c uuid := 'f0000000-0000-4000-8000-000000000003'; -- Subordinate of B (descendant of A)
  v_user_d uuid := 'f0000000-0000-4000-8000-000000000004'; -- Outside subtree
  v_user_e uuid := 'f0000000-0000-4000-8000-000000000005'; -- Subordinate of D

  v_entry_id uuid;
  v_entry_b1 uuid;
  v_entry_c1 uuid;
  v_entry_d1 uuid;
  v_count integer;
  v_row record;
  v_updated_at timestamptz;
  v_old_updated_at timestamptz;
  v_threw boolean;
  v_activity_count integer;
begin
  -- --------------------------------------------------------------------------
  -- 1. Setup Profiles Hierarchy
  -- --------------------------------------------------------------------------
  insert into public.profiles (id, email, full_name, role, parent_id) values
    (v_user_a, 'usera@example.com', 'Manager A', 'user', null),
    (v_user_b, 'userb@example.com', 'Staff B', 'user', v_user_a),
    (v_user_c, 'userc@example.com', 'Staff C', 'user', v_user_b),
    (v_user_d, 'userd@example.com', 'Manager D', 'user', null),
    (v_user_e, 'usere@example.com', 'Staff E', 'user', v_user_d);

  -- --------------------------------------------------------------------------
  -- 2. Test Own Insert, Select, Update, and Constraints
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  perform set_config('role', 'authenticated', true);

  -- 2a. Insert own entry
  insert into public.work_calendar_entries (
    owner_id, work_date, title, kind, is_all_day
  ) values (
    v_user_b, '2026-09-15', '  Pekerjaan Rutin B  ', 'work', true
  ) returning id, updated_at into v_entry_b1, v_updated_at;

  if v_entry_b1 is null then
    raise exception 'Assertion failed: User B could not insert own entry';
  end if;

  -- Verify whitespace trim
  select title into v_row from public.work_calendar_entries where id = v_entry_b1;
  if v_row.title <> 'Pekerjaan Rutin B' then
    raise exception 'Assertion failed: title was not trimmed by trigger';
  end if;

  -- 2b. Forged owner insert must be rejected by RLS
  v_threw := false;
  begin
    insert into public.work_calendar_entries (
      owner_id, work_date, title, kind, is_all_day
    ) values (
      v_user_a, '2026-09-15', 'Forged entry for A', 'work', true
    );
  exception when others then
    v_threw := true;
  end;
  if not v_threw then
    raise exception 'Assertion failed: User B was able to insert with owner_id = User A';
  end if;

  -- 2c. Subordinate C inserts own entry
  perform set_config('request.jwt.claim.sub', v_user_c::text, true);
  insert into public.work_calendar_entries (
    owner_id, work_date, title, kind, is_all_day
  ) values (
    v_user_c, '2026-09-15', 'Pekerjaan Rutin C', 'work', true
  ) returning id into v_entry_c1;

  -- 2d. Outside user D inserts own entry
  perform set_config('request.jwt.claim.sub', v_user_d::text, true);
  insert into public.work_calendar_entries (
    owner_id, work_date, title, kind, is_all_day
  ) values (
    v_user_d, '2026-09-15', 'Pekerjaan Rutin D', 'work', true
  ) returning id into v_entry_d1;

  -- --------------------------------------------------------------------------
  -- 3. Hierarchy RLS Checks
  -- --------------------------------------------------------------------------
  -- 3a. User A (Root) can read descendants (B and C) but not outside (D)
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  select count(*) into v_count from public.work_calendar_entries;
  if v_count <> 2 then
    raise exception 'Assertion failed: User A expected to see 2 descendant entries (B, C), found %', v_count;
  end if;

  -- 3b. User B can read descendant C and own B1, but not D or A
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  select count(*) into v_count from public.work_calendar_entries;
  if v_count <> 2 then
    raise exception 'Assertion failed: User B expected to see 2 entries (B1, C1), found %', v_count;
  end if;

  -- 3c. User C can only read own C1
  perform set_config('request.jwt.claim.sub', v_user_c::text, true);
  select count(*) into v_count from public.work_calendar_entries;
  if v_count <> 1 then
    raise exception 'Assertion failed: User C expected to see 1 entry (C1), found %', v_count;
  end if;

  -- 3d. User D cannot read B or C
  perform set_config('request.jwt.claim.sub', v_user_d::text, true);
  select count(*) into v_count from public.work_calendar_entries;
  if v_count <> 1 then
    raise exception 'Assertion failed: User D expected to see 1 entry (D1), found %', v_count;
  end if;

  -- 3e. Manager cannot update or delete subordinate entries
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  update public.work_calendar_entries set title = 'Hacked by Manager' where id = v_entry_b1;
  select title into v_row from public.work_calendar_entries where id = v_entry_b1;
  if v_row.title = 'Hacked by Manager' then
    raise exception 'Assertion failed: Manager A was able to update subordinate B entry';
  end if;

  delete from public.work_calendar_entries where id = v_entry_b1;
  select count(*) into v_count from public.work_calendar_entries where id = v_entry_b1;
  if v_count <> 1 then
    raise exception 'Assertion failed: Manager A was able to delete subordinate B entry';
  end if;

  -- --------------------------------------------------------------------------
  -- 4. Constraint validations
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);

  -- 4a. Title empty or whitespace-only
  v_threw := false;
  begin
    insert into public.work_calendar_entries (owner_id, work_date, title) values (v_user_b, '2026-09-15', '   ');
  exception when others then
    v_threw := true;
  end;
  if not v_threw then raise exception 'Assertion failed: Empty title was accepted'; end if;

  -- 4b. Title length > 180
  v_threw := false;
  begin
    insert into public.work_calendar_entries (owner_id, work_date, title) values (v_user_b, '2026-09-15', repeat('a', 181));
  exception when others then
    v_threw := true;
  end;
  if not v_threw then raise exception 'Assertion failed: Title > 180 was accepted'; end if;

  -- 4c. Realization length > 500
  v_threw := false;
  begin
    insert into public.work_calendar_entries (owner_id, work_date, title, status, realization)
    values (v_user_b, '2026-09-15', 'Test', 'completed', repeat('r', 501));
  exception when others then
    v_threw := true;
  end;
  if not v_threw then raise exception 'Assertion failed: Realization > 500 was accepted'; end if;

  -- 4d. Blocked reason length > 300
  v_threw := false;
  begin
    insert into public.work_calendar_entries (owner_id, work_date, title, status, blocked_reason)
    values (v_user_b, '2026-09-15', 'Test', 'blocked', repeat('b', 301));
  exception when others then
    v_threw := true;
  end;
  if not v_threw then raise exception 'Assertion failed: Blocked reason > 300 was accepted'; end if;

  -- 4e. Completed without realization
  v_threw := false;
  begin
    insert into public.work_calendar_entries (owner_id, work_date, title, status, realization)
    values (v_user_b, '2026-09-15', 'Test', 'completed', null);
  exception when others then
    v_threw := true;
  end;
  if not v_threw then raise exception 'Assertion failed: Completed without realization was accepted'; end if;

  -- 4f. Blocked without reason
  v_threw := false;
  begin
    insert into public.work_calendar_entries (owner_id, work_date, title, status, blocked_reason)
    values (v_user_b, '2026-09-15', 'Test', 'blocked', null);
  exception when others then
    v_threw := true;
  end;
  if not v_threw then raise exception 'Assertion failed: Blocked without reason was accepted'; end if;

  -- 4g. Time check: all_day=true cannot have starts_at or ends_at
  v_threw := false;
  begin
    insert into public.work_calendar_entries (
      owner_id, work_date, title, is_all_day, starts_at, ends_at
    ) values (
      v_user_b, '2026-09-15', 'Test', true, '2026-09-15T09:00:00Z', '2026-09-15T10:00:00Z'
    );
  exception when others then
    v_threw := true;
  end;
  if not v_threw then raise exception 'Assertion failed: All-day with time was accepted'; end if;

  -- 4h. Time check: is_all_day=false must have starts_at and ends_at
  v_threw := false;
  begin
    insert into public.work_calendar_entries (
      owner_id, work_date, title, is_all_day, starts_at, ends_at
    ) values (
      v_user_b, '2026-09-15', 'Test', false, null, null
    );
  exception when others then
    v_threw := true;
  end;
  if not v_threw then raise exception 'Assertion failed: Non-all-day without time was accepted'; end if;

  -- 4i. Time check: ends_at <= starts_at
  v_threw := false;
  begin
    insert into public.work_calendar_entries (
      owner_id, work_date, title, is_all_day, starts_at, ends_at
    ) values (
      v_user_b, '2026-09-15', 'Test', false, '2026-09-15T10:00:00Z', '2026-09-15T09:00:00Z'
    );
  exception when others then
    v_threw := true;
  end;
  if not v_threw then raise exception 'Assertion failed: ends_at <= starts_at was accepted'; end if;

  -- --------------------------------------------------------------------------
  -- 5. Trigger Transition & Field Cleanup
  -- --------------------------------------------------------------------------
  -- 5a. Set status = completed with realization -> completed_at auto-filled
  update public.work_calendar_entries
  set status = 'completed', realization = 'Pekerjaan B1 selesai dengan baik'
  where id = v_entry_b1;

  select * into v_row from public.work_calendar_entries where id = v_entry_b1;
  if v_row.status <> 'completed' or v_row.completed_at is null or v_row.realization is null then
    raise exception 'Assertion failed: completed_at was not populated on completed transition';
  end if;

  -- 5b. Reopen status to in_progress -> realization and completed_at cleared
  update public.work_calendar_entries
  set status = 'in_progress'
  where id = v_entry_b1;

  select * into v_row from public.work_calendar_entries where id = v_entry_b1;
  if v_row.status <> 'in_progress' or v_row.completed_at is not null or v_row.realization is not null then
    raise exception 'Assertion failed: realization or completed_at was not cleared on reopening to in_progress';
  end if;

  -- 5c. Set status = blocked with blocked_reason
  update public.work_calendar_entries
  set status = 'blocked', blocked_reason = 'Menunggu approval dokumen'
  where id = v_entry_b1;

  select * into v_row from public.work_calendar_entries where id = v_entry_b1;
  if v_row.status <> 'blocked' or v_row.blocked_reason is null then
    raise exception 'Assertion failed: blocked_reason was not saved';
  end if;

  -- 5d. Unblock to planned -> blocked_reason cleared
  update public.work_calendar_entries
  set status = 'planned'
  where id = v_entry_b1;

  select * into v_row from public.work_calendar_entries where id = v_entry_b1;
  if v_row.status <> 'planned' or v_row.blocked_reason is not null then
    raise exception 'Assertion failed: blocked_reason was not cleared on unblocking';
  end if;

  -- 5e. Immutable fields update rejected
  v_threw := false;
  begin
    update public.work_calendar_entries set owner_id = v_user_a where id = v_entry_b1;
  exception when others then
    v_threw := true;
  end;
  if not v_threw then raise exception 'Assertion failed: owner_id modification was accepted'; end if;

  -- --------------------------------------------------------------------------
  -- 6. Team RPC list_work_calendar_team_entries
  -- --------------------------------------------------------------------------
  -- User A calls RPC -> returns B1 and C1 in deterministic order
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  select count(*) into v_count
  from public.list_work_calendar_team_entries('2026-09-01'::date, '2026-09-30'::date);
  if v_count <> 2 then
    raise exception 'Assertion failed: list_work_calendar_team_entries returned % rows, expected 2', v_count;
  end if;

  -- Subordinate C calls RPC -> 0 rows (has no descendants)
  perform set_config('request.jwt.claim.sub', v_user_c::text, true);
  select count(*) into v_count
  from public.list_work_calendar_team_entries('2026-09-01'::date, '2026-09-30'::date);
  if v_count <> 0 then
    raise exception 'Assertion failed: list_work_calendar_team_entries for C returned % rows, expected 0', v_count;
  end if;

  -- --------------------------------------------------------------------------
  -- 7. Soft Delete and Active Queries
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  update public.work_calendar_entries
  set deleted_at = clock_timestamp()
  where id = v_entry_b1;

  -- In active list (where deleted_at is null), B1 no longer appears to User B
  select count(*) into v_count from public.work_calendar_entries where deleted_at is null;
  if v_count <> 1 then -- only C1 is visible to B
    raise exception 'Assertion failed: active entries count visible to B expected 1 (C1) after soft delete of B1, found %', v_count;
  end if;

  -- In Manager A team RPC, B1 no longer appears
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  select count(*) into v_count
  from public.list_work_calendar_team_entries('2026-09-01'::date, '2026-09-30'::date);
  if v_count <> 1 then -- only C1
    raise exception 'Assertion failed: list_work_calendar_team_entries expected 1 row after soft delete of B1, found %', v_count;
  end if;

  -- --------------------------------------------------------------------------
  -- 8. Audit logs verification
  -- --------------------------------------------------------------------------
  perform set_config('role', 'postgres', true);
  select count(*) into v_activity_count
  from public.activity_logs
  where table_name = 'work_calendar_entries';

  if v_activity_count < 3 then
    raise exception 'Assertion failed: expected at least 3 audit log records for work_calendar_entries, found %', v_activity_count;
  end if;

  -- --------------------------------------------------------------------------
  -- 9. Anon role check
  -- --------------------------------------------------------------------------
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claim.sub', '', true);

  v_threw := false;
  begin
    select count(*) into v_count from public.work_calendar_entries;
  exception when others then
    v_threw := true;
  end;
  if not v_threw and v_count > 0 then
    raise exception 'Assertion failed: anon was able to select from work_calendar_entries';
  end if;

  -- Reset to postgres admin
  perform set_config('role', 'postgres', true);
end;
$$;

select 'CAL-03 work calendar integration: all assertions passed' as result;
