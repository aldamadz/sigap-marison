-- ============================================================================
-- Integration tests for CAL-03 Unified Work Calendar Database Layer
-- ============================================================================

do $$
declare
  v_user_a uuid := 'f0000000-0000-4000-8000-000000000001'; -- Root manager
  v_user_b uuid := 'f0000000-0000-4000-8000-000000000002'; -- Subordinate of A
  v_user_c uuid := 'f0000000-0000-4000-8000-000000000003'; -- Subordinate of B (descendant of A)
  v_user_d uuid := 'f0000000-0000-4000-8000-000000000004'; -- Outside subtree manager
  v_user_e uuid := 'f0000000-0000-4000-8000-000000000005'; -- Subordinate of D
  v_user_cycle_x uuid := 'f0000000-0000-4000-8000-000000000006'; -- Cycle test X
  v_user_cycle_y uuid := 'f0000000-0000-4000-8000-000000000007'; -- Cycle test Y
  v_user_deleted_sub uuid := 'f0000000-0000-4000-8000-000000000008'; -- Deleted subordinate of A

  v_entry_b1 uuid;
  v_entry_c1 uuid;
  v_entry_d1 uuid;
  v_entry_x1 uuid;
  v_entry_y1 uuid;
  v_entry_del_sub uuid;
  v_count integer;
  v_row record;
  v_updated_at timestamptz;
  v_old_updated_at timestamptz;
  v_created_at timestamptz;
  v_deleted_at timestamptz;
  v_completed_at timestamptz;
  v_threw boolean;
  v_rpc_res boolean;
  v_activity_count integer;
  v_sub_title text;
  v_sub_owner text;
  v_forged_time timestamptz := '2020-01-01 00:00:00+00'::timestamptz;
begin
  -- --------------------------------------------------------------------------
  -- 1. Setup Profiles Hierarchy with cycle scenario and deleted subordinate
  -- --------------------------------------------------------------------------
  insert into public.profiles (id, email, full_name, role, parent_id, deleted_at) values
    (v_user_a, 'usera@example.com', 'Manager A', 'user', null, null),
    (v_user_b, 'userb@example.com', 'Staff B', 'user', v_user_a, null),
    (v_user_c, 'userc@example.com', 'Staff C', 'user', v_user_b, null),
    (v_user_d, 'userd@example.com', 'Manager D', 'user', null, null),
    (v_user_e, 'usere@example.com', 'Staff E', 'user', v_user_d, null),
    (v_user_cycle_x, 'cyclex@example.com', 'Cycle X', 'user', null, null),
    (v_user_cycle_y, 'cycley@example.com', 'Cycle Y', 'user', v_user_cycle_x, null),
    (v_user_deleted_sub, 'deletedsub@example.com', 'Deleted Sub', 'user', v_user_a, now());

  -- Malformed loop for cycle testing: X -> Y -> X
  update public.profiles set parent_id = v_user_cycle_y where id = v_user_cycle_x;

  -- --------------------------------------------------------------------------
  -- 2. Server-owned Timestamps & INSERT constraints
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  perform set_config('role', 'authenticated', true);

  -- 2a. Insert own entry with client attempting to forge timestamps and whitespace
  insert into public.work_calendar_entries (
    owner_id, work_date, title, kind, is_all_day, created_at, updated_at, deleted_at, completed_at, status, realization
  ) values (
    v_user_b, '2026-09-15', '  Pekerjaan Rutin B  ', 'work', true, v_forged_time, v_forged_time, v_forged_time, v_forged_time, 'completed', '  Hasil kerja B1 selesai  '
  ) returning id, created_at, updated_at, deleted_at, completed_at into v_entry_b1, v_created_at, v_updated_at, v_deleted_at, v_completed_at;

  if v_entry_b1 is null then
    raise exception 'Assertion failed: User B could not insert own entry';
  end if;

  -- Verify server-owned timestamps on insert
  if v_created_at = v_forged_time or v_created_at < now() - interval '1 minute' then
    raise exception 'Assertion failed: created_at was not server-owned';
  end if;
  if v_updated_at = v_forged_time or v_updated_at < now() - interval '1 minute' then
    raise exception 'Assertion failed: updated_at was not server-owned';
  end if;
  if v_deleted_at is not null then
    raise exception 'Assertion failed: deleted_at must be null on insert';
  end if;
  if v_completed_at = v_forged_time or v_completed_at < now() - interval '1 minute' then
    raise exception 'Assertion failed: completed_at was not server-owned';
  end if;

  -- Verify whitespace trim
  select title, realization into v_row from public.work_calendar_entries where id = v_entry_b1;
  if v_row.title <> 'Pekerjaan Rutin B' or v_row.realization <> 'Hasil kerja B1 selesai' then
    raise exception 'Assertion failed: title or realization was not trimmed by trigger';
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

  -- 2e. Deleted subordinate user inserts entry (simulated before delete)
  perform set_config('request.jwt.claim.sub', v_user_deleted_sub::text, true);
  insert into public.work_calendar_entries (
    owner_id, work_date, title, kind, is_all_day
  ) values (
    v_user_deleted_sub, '2026-09-15', 'Pekerjaan Sub Deleted', 'work', true
  ) returning id into v_entry_del_sub;

  -- 2f. Cycle users insert entries
  perform set_config('request.jwt.claim.sub', v_user_cycle_x::text, true);
  insert into public.work_calendar_entries (
    owner_id, work_date, title, kind, is_all_day
  ) values (
    v_user_cycle_x, '2026-09-15', 'Pekerjaan Cycle X', 'work', true
  ) returning id into v_entry_x1;

  perform set_config('request.jwt.claim.sub', v_user_cycle_y::text, true);
  insert into public.work_calendar_entries (
    owner_id, work_date, title, kind, is_all_day
  ) values (
    v_user_cycle_y, '2026-09-15', 'Pekerjaan Cycle Y', 'work', true
  ) returning id into v_entry_y1;

  -- --------------------------------------------------------------------------
  -- 3. Physical DELETE Prohibition (Blocker 1)
  -- --------------------------------------------------------------------------
  -- 3a. Owner User D attempts physical DELETE -> MUST FAIL
  perform set_config('request.jwt.claim.sub', v_user_d::text, true);
  v_threw := false;
  begin
    delete from public.work_calendar_entries where id = v_entry_d1;
  exception when others then
    v_threw := true;
  end;
  if not v_threw then
    raise exception 'Assertion failed: Owner was able to execute physical DELETE';
  end if;

  -- Verify row still exists after attempted physical DELETE
  select count(*) into v_count from public.work_calendar_entries where id = v_entry_d1;
  if v_count <> 1 then
    raise exception 'Assertion failed: Row disappeared after attempted physical delete';
  end if;

  -- --------------------------------------------------------------------------
  -- 4. Hierarchy RLS Checks & Peer / Manager Mutation Restrictions
  -- --------------------------------------------------------------------------
  -- 4a. User A (Root) can read descendants (B and C) but not outside (D) or deleted sub
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  select count(*) into v_count from public.work_calendar_entries;
  if v_count <> 2 then
    raise exception 'Assertion failed: User A expected to see 2 descendant entries (B, C), found %', v_count;
  end if;

  -- 4b. User B can read descendant C and own B1, but not D or A
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  select count(*) into v_count from public.work_calendar_entries;
  if v_count <> 2 then
    raise exception 'Assertion failed: User B expected to see 2 entries (B1, C1), found %', v_count;
  end if;

  -- 4c. Peer D cannot read B or C
  perform set_config('request.jwt.claim.sub', v_user_d::text, true);
  select count(*) into v_count from public.work_calendar_entries;
  if v_count <> 1 then
    raise exception 'Assertion failed: User D expected to see 1 entry (D1), found %', v_count;
  end if;

  -- 4d. Manager A cannot update descendant B entry
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  update public.work_calendar_entries set title = 'Hacked by Manager' where id = v_entry_b1;
  select title into v_row from public.work_calendar_entries where id = v_entry_b1;
  if v_row.title = 'Hacked by Manager' then
    raise exception 'Assertion failed: Manager A was able to update subordinate B entry';
  end if;

  -- --------------------------------------------------------------------------
  -- 5. Field Constraints & Validation checks
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);

  -- 5a. Title empty or whitespace-only
  v_threw := false;
  begin
    insert into public.work_calendar_entries (owner_id, work_date, title) values (v_user_b, '2026-09-15', '   ');
  exception when others then
    v_threw := true;
  end;
  if not v_threw then raise exception 'Assertion failed: Empty title was accepted'; end if;

  -- 5b. Title length > 180
  v_threw := false;
  begin
    insert into public.work_calendar_entries (owner_id, work_date, title) values (v_user_b, '2026-09-15', repeat('a', 181));
  exception when others then
    v_threw := true;
  end;
  if not v_threw then raise exception 'Assertion failed: Title > 180 was accepted'; end if;

  -- 5c. Realization length > 500
  v_threw := false;
  begin
    insert into public.work_calendar_entries (owner_id, work_date, title, status, realization)
    values (v_user_b, '2026-09-15', 'Test', 'completed', repeat('r', 501));
  exception when others then
    v_threw := true;
  end;
  if not v_threw then raise exception 'Assertion failed: Realization > 500 was accepted'; end if;

  -- 5d. Blocked reason length > 300
  v_threw := false;
  begin
    insert into public.work_calendar_entries (owner_id, work_date, title, status, blocked_reason)
    values (v_user_b, '2026-09-15', 'Test', 'blocked', repeat('b', 301));
  exception when others then
    v_threw := true;
  end;
  if not v_threw then raise exception 'Assertion failed: Blocked reason > 300 was accepted'; end if;

  -- 5e. Completed without realization
  v_threw := false;
  begin
    insert into public.work_calendar_entries (owner_id, work_date, title, status, realization)
    values (v_user_b, '2026-09-15', 'Test', 'completed', null);
  exception when others then
    v_threw := true;
  end;
  if not v_threw then raise exception 'Assertion failed: Completed without realization was accepted'; end if;

  -- 5f. Blocked without reason
  v_threw := false;
  begin
    insert into public.work_calendar_entries (owner_id, work_date, title, status, blocked_reason)
    values (v_user_b, '2026-09-15', 'Test', 'blocked', null);
  exception when others then
    v_threw := true;
  end;
  if not v_threw then raise exception 'Assertion failed: Blocked without reason was accepted'; end if;

  -- 5g. Time check: all_day=true cannot have starts_at or ends_at
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

  -- 5h. Time check: is_all_day=false must have starts_at and ends_at
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

  -- 5i. Time check: ends_at <= starts_at
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
  -- 6. State Transitions, Field Cleanup, and Server-Owned UPDATE Timestamps
  -- --------------------------------------------------------------------------
  -- 6a. Reopen completed B1 to in_progress -> realization and completed_at cleared
  update public.work_calendar_entries
  set status = 'in_progress'
  where id = v_entry_b1;

  select * into v_row from public.work_calendar_entries where id = v_entry_b1;
  if v_row.status <> 'in_progress' or v_row.completed_at is not null or v_row.realization is not null then
    raise exception 'Assertion failed: realization or completed_at was not cleared on reopening to in_progress';
  end if;

  -- 6b. Set status = blocked with blocked_reason
  update public.work_calendar_entries
  set status = 'blocked', blocked_reason = 'Menunggu approval dokumen'
  where id = v_entry_b1;

  select * into v_row from public.work_calendar_entries where id = v_entry_b1;
  if v_row.status <> 'blocked' or v_row.blocked_reason is null then
    raise exception 'Assertion failed: blocked_reason was not saved';
  end if;

  -- 6c. Unblock to planned -> blocked_reason cleared
  update public.work_calendar_entries
  set status = 'planned'
  where id = v_entry_b1;

  select * into v_row from public.work_calendar_entries where id = v_entry_b1;
  if v_row.status <> 'planned' or v_row.blocked_reason is not null then
    raise exception 'Assertion failed: blocked_reason was not cleared on unblocking';
  end if;

  -- 6d. Transition planned -> completed sets completed_at from DB
  update public.work_calendar_entries
  set status = 'completed', realization = 'Selesai bertahap'
  where id = v_entry_b1
  returning completed_at into v_updated_at;

  select * into v_row from public.work_calendar_entries where id = v_entry_b1;
  if v_row.completed_at is null or v_row.completed_at < now() - interval '1 minute' then
    raise exception 'Assertion failed: completed_at was not set on planned -> completed transition';
  end if;

  -- 6e. Staying completed preserves OLD.completed_at even if client sends forged completed_at
  update public.work_calendar_entries
  set title = 'Pekerjaan B1 updated', completed_at = v_forged_time
  where id = v_entry_b1;

  select * into v_row from public.work_calendar_entries where id = v_entry_b1;
  if v_row.completed_at = v_forged_time or v_row.completed_at <> v_updated_at then
    raise exception 'Assertion failed: client was able to tamper completed_at while staying completed';
  end if;

  -- 6f. Immutable fields update rejected
  v_threw := false;
  begin
    update public.work_calendar_entries set owner_id = v_user_a where id = v_entry_b1;
  exception when others then
    v_threw := true;
  end;
  if not v_threw then raise exception 'Assertion failed: owner_id modification was accepted'; end if;

  -- --------------------------------------------------------------------------
  -- 7. Soft Delete RPC, Row Freezing, & Concurrency Conflict (Blocker 1 & 3)
  -- --------------------------------------------------------------------------
  select updated_at into v_old_updated_at from public.work_calendar_entries where id = v_entry_b1;

  -- 7a. Soft delete with mismatched updated_at -> returns false (conflict)
  v_rpc_res := public.soft_delete_work_calendar_entry(v_entry_b1, v_forged_time);
  if v_rpc_res <> false then
    raise exception 'Assertion failed: soft delete with mismatched timestamp succeeded';
  end if;

  -- 7b. Non-owner User C attempts soft delete on B1 -> returns false
  perform set_config('request.jwt.claim.sub', v_user_c::text, true);
  v_rpc_res := public.soft_delete_work_calendar_entry(v_entry_b1, v_old_updated_at);
  if v_rpc_res <> false then
    raise exception 'Assertion failed: non-owner was able to soft delete B1';
  end if;

  -- 7c. Owner User B soft deletes B1 with matching updated_at -> returns true
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  v_rpc_res := public.soft_delete_work_calendar_entry(v_entry_b1, v_old_updated_at);
  if v_rpc_res <> true then
    raise exception 'Assertion failed: owner soft delete of B1 failed';
  end if;

  -- 7d. Soft delete on already deleted row -> returns false
  v_rpc_res := public.soft_delete_work_calendar_entry(v_entry_b1, v_old_updated_at);
  if v_rpc_res <> false then
    raise exception 'Assertion failed: repeating soft delete returned true';
  end if;

  -- 7e. Modifying title of a deleted row throws exception
  v_threw := false;
  begin
    update public.work_calendar_entries set title = 'Modifikasi setelah delete' where id = v_entry_b1;
  exception when others then
    v_threw := true;
  end;
  if not v_threw then
    raise exception 'Assertion failed: title of deleted record was able to be modified';
  end if;

  -- Verify title did not change
  select title into v_row from public.work_calendar_entries where id = v_entry_b1;
  if v_row.title <> 'Pekerjaan B1 updated' then
    raise exception 'Assertion failed: title was altered on deleted record';
  end if;

  -- 7f. Modifying status of a deleted row throws exception
  v_threw := false;
  begin
    update public.work_calendar_entries set status = 'in_progress' where id = v_entry_b1;
  exception when others then
    v_threw := true;
  end;
  if not v_threw then
    raise exception 'Assertion failed: status of deleted record was able to be modified';
  end if;

  -- 7g. Restoring deleted_at to NULL throws exception
  v_threw := false;
  begin
    update public.work_calendar_entries set deleted_at = null where id = v_entry_b1;
  exception when others then
    v_threw := true;
  end;
  if not v_threw then
    raise exception 'Assertion failed: deleted record was able to be restored to null';
  end if;

  -- --------------------------------------------------------------------------
  -- 8. Team RPC: Date Bounds, Cycle Safety & Caller Exclusion (Blockers 4 & 6)
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);

  -- 8a. Null date bounds fail-closed
  v_threw := false;
  begin
    perform public.list_work_calendar_team_entries(null, '2026-09-30'::date);
  exception when others then
    v_threw := true;
  end;
  if not v_threw then raise exception 'Assertion failed: team RPC accepted null start date'; end if;

  -- 8b. start_date > end_date fail-closed
  v_threw := false;
  begin
    perform public.list_work_calendar_team_entries('2026-09-30'::date, '2026-09-01'::date);
  exception when others then
    v_threw := true;
  end;
  if not v_threw then raise exception 'Assertion failed: team RPC accepted start_date > end_date'; end if;

  -- 8c. range > 366 days fail-closed
  v_threw := false;
  begin
    perform public.list_work_calendar_team_entries('2026-01-01'::date, '2027-01-05'::date);
  exception when others then
    v_threw := true;
  end;
  if not v_threw then raise exception 'Assertion failed: team RPC accepted range > 366 days'; end if;

  -- 8d. Active team RPC returns only undeleted active descendant (C1) and excludes soft-deleted B1 & deleted sub
  select count(*) into v_count
  from public.list_work_calendar_team_entries('2026-09-01'::date, '2026-09-30'::date);
  if v_count <> 1 then
    raise exception 'Assertion failed: list_work_calendar_team_entries expected 1 row (C1), got %', v_count;
  end if;

  -- 8e. Caller exclusion and Cycle Safety with active entries
  -- User Cycle X calls team RPC with loop X <-> Y
  perform set_config('request.jwt.claim.sub', v_user_cycle_x::text, true);
  select count(*), max(title), max(owner_id::text) into v_count, v_sub_title, v_sub_owner
  from public.list_work_calendar_team_entries('2026-09-01'::date, '2026-09-30'::date);
  if v_count <> 1 or v_sub_title <> 'Pekerjaan Cycle Y' or v_sub_owner <> v_user_cycle_y::text then
    raise exception 'Assertion failed: Cycle X team RPC expected only entry Y, got count % title % owner %', v_count, v_sub_title, v_sub_owner;
  end if;

  -- User Cycle Y calls team RPC with loop X <-> Y
  perform set_config('request.jwt.claim.sub', v_user_cycle_y::text, true);
  select count(*), max(title), max(owner_id::text) into v_count, v_sub_title, v_sub_owner
  from public.list_work_calendar_team_entries('2026-09-01'::date, '2026-09-30'::date);
  if v_count <> 1 or v_sub_title <> 'Pekerjaan Cycle X' or v_sub_owner <> v_user_cycle_x::text then
    raise exception 'Assertion failed: Cycle Y team RPC expected only entry X, got count % title % owner %', v_count, v_sub_title, v_sub_owner;
  end if;

  -- --------------------------------------------------------------------------
  -- 9. Audit logs verification (soft-delete recorded as UPDATE)
  -- --------------------------------------------------------------------------
  perform set_config('role', 'postgres', true);
  select count(*) into v_activity_count
  from public.activity_logs
  where table_name = 'work_calendar_entries'
    and action = 'UPDATE'
    and record_id = v_entry_b1::text
    and new_values->>'deleted_at' is not null;

  if v_activity_count < 1 then
    raise exception 'Assertion failed: expected audit log for soft-delete UPDATE on B1, found %', v_activity_count;
  end if;

  -- --------------------------------------------------------------------------
  -- 10. Anon role check
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

  -- --------------------------------------------------------------------------
  -- 11. Legacy agendas table unaffected
  -- --------------------------------------------------------------------------
  select count(*) into v_count from public.agendas;
  if v_count <> 1 then
    raise exception 'Assertion failed: legacy agendas table altered';
  end if;
end;
$$;

select 'CAL-03 work calendar integration: all assertions passed' as result;
