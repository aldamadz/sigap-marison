-- ============================================================================
-- Integration tests for list_work_calendar_team_members RPC (CAL-03 F3)
-- ============================================================================

do $$
declare
  v_user_a uuid := 'e0000000-0000-4000-8000-000000000001'; -- Root Manager A
  v_user_b uuid := 'e0000000-0000-4000-8000-000000000002'; -- Direct sub of A (Staff B)
  v_user_c uuid := 'e0000000-0000-4000-8000-000000000003'; -- Sub of B (Staff C - Alice)
  v_user_d uuid := 'e0000000-0000-4000-8000-000000000004'; -- Sub of A (Staff D - Bob)
  v_user_inactive_direct uuid := 'e0000000-0000-4000-8000-000000000005'; -- Direct sub of A with is_active=false
  v_user_null_direct uuid := 'e0000000-0000-4000-8000-000000000006'; -- Direct sub of A with is_active=null
  v_user_inactive_sub uuid := 'e0000000-0000-4000-8000-000000000007'; -- Sub of B with is_active=false
  v_user_null_sub uuid := 'e0000000-0000-4000-8000-000000000008'; -- Sub of B with is_active=null
  v_user_child_of_inactive uuid := 'e0000000-0000-4000-8000-000000000009'; -- Active child under inactive parent v_user_inactive_direct
  v_user_deleted uuid := 'e0000000-0000-4000-8000-000000000010'; -- Soft-deleted sub of A
  v_user_outside uuid := 'e0000000-0000-4000-8000-000000000011'; -- Unrelated user
  v_user_cycle_1 uuid := 'e0000000-0000-4000-8000-000000000012'; -- Cycle user 1
  v_user_cycle_2 uuid := 'e0000000-0000-4000-8000-000000000013'; -- Cycle user 2

  v_count integer;
  v_rows text[];
  v_first_name text;
  v_second_name text;
  v_threw boolean;
begin
  -- --------------------------------------------------------------------------
  -- 1. Setup Profiles
  -- Fail-closed policy:
  -- - Only is_active IS TRUE is included.
  -- - is_active = false and is_active IS NULL must be excluded.
  -- - Active child under an inactive parent is NOT included because recursion
  --   prunes the inactive parent's branch (fail-closed subtree pruning).
  -- --------------------------------------------------------------------------
  insert into public.profiles (id, email, full_name, job_title, role, parent_id, deleted_at, is_active) values
    (v_user_a, 'managera@example.com', 'Manager A', 'Engineering Head', 'user', null, null, true),
    (v_user_b, 'userb@example.com', 'Staff B (Zack)', 'Tech Lead', 'user', v_user_a, null, true),
    (v_user_c, 'userc@example.com', 'Staff C (Alice)', 'Software Engineer', 'user', v_user_b, null, true),
    (v_user_d, 'userd@example.com', 'Staff D (Bob)', 'QA Engineer', 'user', v_user_a, null, true),
    (v_user_inactive_direct, 'inactivedirect@example.com', 'Inactive Direct Sub', 'Intern', 'user', v_user_a, null, false),
    (v_user_null_direct, 'nulldirect@example.com', 'Null Direct Sub', 'Intern', 'user', v_user_a, null, null),
    (v_user_inactive_sub, 'inactivesub@example.com', 'Inactive Recursive Sub', 'Intern', 'user', v_user_b, null, false),
    (v_user_null_sub, 'nullsub@example.com', 'Null Recursive Sub', 'Intern', 'user', v_user_b, null, null),
    (v_user_child_of_inactive, 'childofinactive@example.com', 'Child of Inactive Parent', 'Junior Dev', 'user', v_user_inactive_direct, null, true),
    (v_user_deleted, 'deleted@example.com', 'Deleted Sub', 'Contractor', 'user', v_user_a, now(), true),
    (v_user_outside, 'outside@example.com', 'Outside User', 'External', 'user', null, null, true),
    (v_user_cycle_1, 'cycle1@example.com', 'Cycle User 1', 'Lead', 'user', null, null, true),
    (v_user_cycle_2, 'cycle2@example.com', 'Cycle User 2', 'Staff', 'user', v_user_cycle_1, null, true);

  -- Setup loop: Cycle 1 <-> Cycle 2
  update public.profiles set parent_id = v_user_cycle_2 where id = v_user_cycle_1;

  -- --------------------------------------------------------------------------
  -- 2. Root Manager A calls list_work_calendar_team_members()
  -- Expected: exactly 3 active descendants (B, C, D).
  -- Excluded:
  --   - Caller A (auth.uid exclusion)
  --   - Inactive direct sub (is_active=false)
  --   - Null direct sub (is_active=null)
  --   - Inactive recursive sub (is_active=false under B)
  --   - Null recursive sub (is_active=null under B)
  --   - Child of inactive parent (pruned because parent is inactive)
  --   - Soft-deleted sub
  --   - Outside user
  --   - Cycle users
  -- Ordering: deterministic by full_name asc nulls last, id asc:
  --   1. Staff B (Zack)
  --   2. Staff C (Alice)
  --   3. Staff D (Bob)
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_count from public.list_work_calendar_team_members();
  if v_count <> 3 then
    raise exception 'Assertion failed: Manager A expected 3 team members, got %', v_count;
  end if;

  -- Verify deterministic ordering
  select array_agg(t.full_name order by t.full_name asc nulls last, t.id asc) into v_rows
  from public.list_work_calendar_team_members() t;

  if (v_rows)[1] <> 'Staff B (Zack)' or (v_rows)[2] <> 'Staff C (Alice)' or (v_rows)[3] <> 'Staff D (Bob)' then
    raise exception 'Assertion failed: Unexpected ordering %', v_rows;
  end if;

  -- Verify specific exclusions by checking no excluded ID appears in results
  if exists (
    select 1 from public.list_work_calendar_team_members()
    where id in (
      v_user_a,
      v_user_inactive_direct,
      v_user_null_direct,
      v_user_inactive_sub,
      v_user_null_sub,
      v_user_child_of_inactive,
      v_user_deleted,
      v_user_outside,
      v_user_cycle_1,
      v_user_cycle_2
    )
  ) then
    raise exception 'Assertion failed: list_work_calendar_team_members returned inactive/null/pruned/caller/unrelated user';
  end if;

  -- Verify columns returned (id, full_name, job_title)
  declare
    v_member record;
  begin
    select id, full_name, job_title into v_member
    from public.list_work_calendar_team_members()
    where id = v_user_c;

    if v_member.full_name <> 'Staff C (Alice)' or v_member.job_title <> 'Software Engineer' then
      raise exception 'Assertion failed: Subordinate C fields mismatched: name=%, title=%', v_member.full_name, v_member.job_title;
    end if;
  end;

  -- --------------------------------------------------------------------------
  -- 3. Intermediate Manager B calls list_work_calendar_team_members()
  -- Expected: only 1 descendant (C / Alice). B, A, D, inactive/null sub excluded.
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  select count(*) into v_count from public.list_work_calendar_team_members();
  if v_count <> 1 then
    raise exception 'Assertion failed: Staff B expected 1 team member, got %', v_count;
  end if;

  -- --------------------------------------------------------------------------
  -- 4. Leaf user C calls list_work_calendar_team_members()
  -- Expected: 0 team members.
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_user_c::text, true);
  select count(*) into v_count from public.list_work_calendar_team_members();
  if v_count <> 0 then
    raise exception 'Assertion failed: Leaf C expected 0 team members, got %', v_count;
  end if;

  -- --------------------------------------------------------------------------
  -- 5. Cycle test safety & caller exclusion
  -- Cycle 1 calls RPC -> only Cycle 2 returned, Cycle 1 excluded, no infinite loop
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_user_cycle_1::text, true);
  select count(*), max(id::text), max(full_name) into v_count, v_first_name, v_second_name
  from public.list_work_calendar_team_members();
  if v_count <> 1 or v_first_name <> v_user_cycle_2::text or v_second_name <> 'Cycle User 2' then
    raise exception 'Assertion failed: Cycle 1 expected 1 team member (Cycle 2), got % (id=%, name=%)', v_count, v_first_name, v_second_name;
  end if;

  -- --------------------------------------------------------------------------
  -- 6. Anonymous / Unauthenticated access rejection
  -- --------------------------------------------------------------------------
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claim.sub', '', true);

  v_threw := false;
  begin
    perform public.list_work_calendar_team_members();
  exception when others then
    v_threw := true;
  end;
  if not v_threw then
    raise exception 'Assertion failed: anon role was able to execute list_work_calendar_team_members';
  end if;

  -- Reset to postgres
  perform set_config('role', 'postgres', true);
end;
$$;

select 'CAL-03 team members integration: all assertions passed' as result;
