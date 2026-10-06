-- Disposable Postgres only. Relative dates avoid wall-clock-dependent fixtures.
-- Legacy completed/null data is emulated inside a rolled-back transaction;
-- production constraints/triggers are not weakened by the migration.
begin;
set local timezone = 'America/Los_Angeles';

create temp table carryover_cases (
    n integer primary key,
    title text not null,
    kind text not null,
    status text not null,
    original_offset integer not null,
    completion_offset integer,
    deadline_offset integer,
    deleted boolean not null default false,
    carry_through_offset integer,
    expected_overdue boolean not null default false
);
insert into carryover_cases values
 (1, 'planned without deadline', 'work', 'planned', -5, null, null, false, 0, false),
 (2, 'running explicit deadline', 'work', 'in_progress', -5, null, -1, false, 0, true),
 (3, 'blocked without deadline', 'work', 'blocked', -5, null, null, false, 0, false),
 (4, 'completed Jakarta midnight', 'work', 'completed', -5, -2, -3, false, -2, false),
 (5, 'completed on original day', 'work', 'completed', -5, -5, -6, false, -5, false),
 (6, 'legacy completed null', 'work', 'completed', -5, null, -1, false, null, false),
 (7, 'past event', 'event', 'planned', -5, null, null, false, null, false),
 (8, 'past availability', 'availability', 'planned', -5, null, null, false, null, false),
 (9, 'event explicit deadline', 'event', 'planned', -5, null, -1, false, null, true),
 (10, 'future schedule', 'work', 'planned', 2, null, null, false, 0, false),
 (11, 'future completion cap', 'work', 'completed', -5, 2, -1, false, 0, false),
 (12, 'soft deleted', 'work', 'planned', -5, null, -1, true, 0, false),
 (13, 'deadline today', 'work', 'planned', 0, null, 0, false, 0, false),
 (14, 'deadline future', 'work', 'planned', 0, null, 2, false, 0, false),
 (15, 'future blocked', 'work', 'blocked', 2, null, null, false, 0, false),
 (16, 'blocked explicit deadline', 'work', 'blocked', -5, null, -1, false, 0, true),
 (17, 'past blocked event', 'event', 'blocked', -5, null, null, false, null, false),
 (18, 'past blocked availability', 'availability', 'blocked', -5, null, null, false, null, false),
 (19, 'completion before original', 'work', 'completed', 2, -2, null, false, -2, false),
 (20, 'future schedule explicit deadline', 'work', 'planned', 2, null, -1, false, 0, true);
grant select on carryover_cases to authenticated;

insert into public.master_offices (id, name) values
 ('46600000-0000-4000-8000-000000000101', 'Carryover office');
insert into public.master_departments (id, name) values
 ('46600000-0000-4000-8000-000000000102', 'Carryover department');
insert into public.profiles (id, full_name, parent_id, is_active, deleted_at, office_id, department_id) values
 ('46600000-0000-4000-8000-000000000001', 'Boss', null, true, null, null, null),
 ('46600000-0000-4000-8000-000000000002', 'Staff A', '46600000-0000-4000-8000-000000000001', true, null, '46600000-0000-4000-8000-000000000101', '46600000-0000-4000-8000-000000000102'),
 ('46600000-0000-4000-8000-000000000003', 'Staff B', '46600000-0000-4000-8000-000000000002', true, null, null, null),
 ('46600000-0000-4000-8000-000000000004', 'Inactive', '46600000-0000-4000-8000-000000000001', false, null, null, null),
 ('46600000-0000-4000-8000-000000000005', 'Null active', '46600000-0000-4000-8000-000000000001', null, null, null, null),
 ('46600000-0000-4000-8000-000000000006', 'Deleted', '46600000-0000-4000-8000-000000000001', true, now(), null, null),
 ('46600000-0000-4000-8000-000000000007', 'Pruned child', '46600000-0000-4000-8000-000000000004', true, null, null, null),
 ('46600000-0000-4000-8000-000000000008', 'Outside', null, true, null, null, null);

-- Exact timestamps are necessary to exercise Jakarta rather than session dates.
alter table public.work_calendar_entries disable trigger trg_work_calendar_entries_before_change;
alter table public.work_calendar_entries drop constraint work_calendar_entries_completed_check;
insert into public.work_calendar_entries (
 id, owner_id, work_date, title, kind, status, realization, completed_at,
 blocked_reason, due_date, deleted_at, updated_at
)
select ('46600000-0000-4000-8001-' || lpad(c.n::text, 12, '0'))::uuid,
 '46600000-0000-4000-8000-000000000002',
 (now() at time zone 'Asia/Jakarta')::date + c.original_offset,
 c.title, c.kind, c.status,
 case when c.status = 'completed' then 'Done' end,
 case when c.completion_offset is not null then
   (((now() at time zone 'Asia/Jakarta')::date + c.completion_offset)::timestamp
     + interval '5 minutes') at time zone 'Asia/Jakarta' end,
 case when c.status = 'blocked' then 'Awaiting response' end,
 (now() at time zone 'Asia/Jakarta')::date + c.deadline_offset,
 case when c.deleted then now() end,
 now() - interval '20 days'
from carryover_cases c;
insert into public.work_calendar_entries (owner_id, work_date, title)
select p.id, (now() at time zone 'Asia/Jakarta')::date - 5, 'Other owner'
from public.profiles p where p.id::text like '46600000%' and p.id <> '46600000-0000-4000-8000-000000000002';
alter table public.work_calendar_entries enable trigger trg_work_calendar_entries_before_change;

-- Blocked history is old enough for escalation regardless of today's weekday.
insert into public.work_calendar_events (
 entry_id, owner_id, event_type, from_status, to_status, created_at
)
select e.id, e.owner_id, 'status_changed', 'planned', 'blocked', now() - interval '20 days'
from public.work_calendar_entries e
where e.owner_id = '46600000-0000-4000-8000-000000000002' and e.status = 'blocked';

create temp table carryover_stored_before as
select to_jsonb(e) as row from public.work_calendar_entries e;
create temp table carryover_events_before as
select to_jsonb(e) as row from public.work_calendar_events e;

do $$
declare
 v_boss uuid := '46600000-0000-4000-8000-000000000001';
 v_staff uuid := '46600000-0000-4000-8000-000000000002';
 v_today date := (now() at time zone 'Asia/Jakarta')::date;
 v_date date;
 v_day integer;
 v_case record;
 v_row record;
 v_visible boolean;
 v_expected integer;
 v_completed integer;
 v_planned integer;
 v_running integer;
 v_blocked integer;
 v_overdue integer;
 v_count integer;
 v_ids uuid[];
 v_expected_ids uuid[];
 v_entry uuid;
 v_read_at timestamptz;
 v_inserted integer;
begin
 perform set_config('request.jwt.claim.sub', v_boss::text, true);
 perform set_config('role', 'authenticated', true);

 -- Every individual row, original/day-before/completion/day-after/today/future,
 -- with both single-date detail and range RPCs returning canonical rows once.
 for v_day in -6..3 loop
   v_date := v_today + v_day;
   for v_case in select * from carryover_cases loop
     v_entry := ('46600000-0000-4000-8001-' || lpad(v_case.n::text, 12, '0'))::uuid;
     v_visible := not v_case.deleted and (
       v_day = v_case.original_offset
       or (v_day > v_case.original_offset and v_day <= coalesce(v_case.carry_through_offset, -100))
     );
     select count(*) into v_count from public.list_work_calendar_member_entries(v_staff, v_date)
       where id = v_entry;
     if v_count <> v_visible::integer then
       raise exception 'Lazy detail case % day % expected % got %', v_case.n, v_day, v_visible, v_count;
     end if;
     select count(*) into v_count from public.list_work_calendar_team_entries(v_date, v_date)
       where id = v_entry;
     if v_count <> v_visible::integer then
       raise exception 'Team range case % day % expected % got %', v_case.n, v_day, v_visible, v_count;
     end if;
   end loop;
   select count(*),
          count(*) filter (where c.status = 'completed'),
          count(*) filter (where c.status = 'planned'),
          count(*) filter (where c.status = 'in_progress'),
          count(*) filter (where c.status = 'blocked'),
          count(*) filter (where c.expected_overdue)
     into v_expected, v_completed, v_planned, v_running, v_blocked, v_overdue
   from carryover_cases c where not c.deleted and (
     v_day = c.original_offset
     or (v_day > c.original_offset and v_day <= coalesce(c.carry_through_offset, -100))
   );
   select * into strict v_row from public.list_work_calendar_team_overview(
     p_member_id => v_staff, p_work_date => v_date
   );
   if row(v_row.member_total, v_row.member_completed, v_row.member_planned,
          v_row.member_in_progress, v_row.member_blocked, v_row.member_overdue)
      is distinct from row(v_expected::bigint, v_completed::bigint, v_planned::bigint,
                           v_running::bigint, v_blocked::bigint, v_overdue::bigint) then
     raise exception 'Overview metrics disagree with detail on day %: %', v_day, row_to_json(v_row);
   end if;
 end loop;

 -- Large overlapping range must not clone a carried row or rewrite work_date.
 select count(*), count(distinct id) into v_count, v_expected
 from public.list_work_calendar_team_entries(v_today - 6, v_today + 3)
 where owner_id = v_staff;
 if v_count <> 19 or v_count <> v_expected then
   raise exception 'Range duplicated/dropped canonical rows: count %, distinct %', v_count, v_expected;
 end if;
 if exists (
   select 1 from public.list_work_calendar_member_entries(v_staff, v_today) e
   join carryover_cases c on e.id = ('46600000-0000-4000-8001-' || lpad(c.n::text, 12, '0'))::uuid
   where e.work_date <> v_today + c.original_offset
 ) then raise exception 'Projection rewrote original work_date'; end if;

 -- Offset clamp and whole-filter aggregates remain the scale RPC contract.
 select * into strict v_row from public.list_work_calendar_team_overview(
   p_work_date => v_today, p_sort => 'name', p_limit => 1, p_offset => 99999
 );
 if v_row.member_id <> '46600000-0000-4000-8000-000000000003'
    or v_row.total_count <> 2 or v_row.aggregate_total <> 8
    or v_row.aggregate_overdue <> 2 then
   raise exception 'Pagination/whole-filter aggregate contract changed: %', row_to_json(v_row);
 end if;
 select * into strict v_row from public.list_work_calendar_team_overview(
   p_office_id => '46600000-0000-4000-8000-000000000101',
   p_department_id => '46600000-0000-4000-8000-000000000102',
   p_search => 'Staff A', p_work_date => v_today, p_status => 'overdue'
 );
 if v_row.member_id <> v_staff or v_row.member_total <> 2 or v_row.member_overdue <> 2
    or v_row.aggregate_overdue <> 2 or v_row.total_count <> 1 then
   raise exception 'Explicit deadline status/organization/search filtering changed';
 end if;

 -- RLS and hierarchy must still exclude outsiders, inactive/null/deleted
 -- members and descendants behind an inactive ancestor.
 for v_day in 4..8 loop
   v_entry := ('46600000-0000-4000-8000-' || lpad(v_day::text, 12, '0'))::uuid;
   if exists (select 1 from public.list_work_calendar_member_entries(v_entry, v_today))
      or exists (select 1 from public.get_work_calendar_dashboard_entries(v_entry, v_today))
      or exists (select 1 from public.list_work_calendar_team_overview(p_member_id => v_entry, p_work_date => v_today)) then
     raise exception 'Unauthorized member % leaked through an invoker RPC', v_day;
   end if;
 end loop;
 if exists (select 1 from public.list_work_calendar_team_entries(v_today, v_today)
   where owner_id not in (v_staff, '46600000-0000-4000-8000-000000000003')) then
   raise exception 'Team range leaked self/unauthorized owner';
 end if;
 begin
   perform public.list_work_calendar_member_entries(v_boss, v_today);
   raise exception 'Self detail was not rejected';
 exception when invalid_parameter_value then null; end;
 begin
   perform public.list_work_calendar_team_entries(v_today, v_today - 1);
   raise exception 'Invalid range was not rejected';
 exception when raise_exception then
   if sqlerrm <> 'Rentang tanggal tidak valid' then raise; end if;
 end;
 begin
   perform public.list_work_calendar_team_entries(v_today, v_today + 367);
   raise exception 'Oversized range was not rejected';
 exception when raise_exception then
   if sqlerrm <> 'Rentang tanggal maksimal 366 hari' then raise; end if;
 end;

 -- Dashboard retains explicit deadline alerts (also for non-work/future
 -- schedule), adds unfinished work carryover, and never returns completed.
 perform set_config('request.jwt.claim.sub', v_staff::text, true);
 for v_day in 0..1 loop
   select array_agg(('46600000-0000-4000-8001-' || lpad(c.n::text, 12, '0'))::uuid order by c.n)
     into v_expected_ids from carryover_cases c
   where not c.deleted and c.status <> 'completed' and (
     v_day = c.original_offset
     or (v_day > c.original_offset and v_day <= coalesce(c.carry_through_offset, -100))
     or c.deadline_offset < v_day
   );
   select array_agg(e.id order by c.n) into v_ids
   from public.get_work_calendar_dashboard_entries(v_staff, v_today + v_day) e
   join carryover_cases c on e.id = ('46600000-0000-4000-8001-' || lpad(c.n::text, 12, '0'))::uuid;
   if v_ids is distinct from v_expected_ids then
     raise exception 'Dashboard visibility day % expected % got %', v_day, v_expected_ids, v_ids;
   end if;
 end loop;
 if exists (select 1 from public.get_work_calendar_dashboard_entries(v_boss, v_today)) then
   raise exception 'Staff dashboard bypassed RLS';
 end if;

 -- On-demand generation, explicit deadline membership, blocked work
 -- carryover, no old event/availability or prematurely scheduled follow-up.
 v_inserted := public.generate_work_calendar_notifications(v_today, 2, 6);
 if v_inserted <> 2 then raise exception 'Expected deadline + follow-up, got %', v_inserted; end if;
 if public.generate_work_calendar_notifications(v_today, 2, 6) <> 0 then
   raise exception 'Notification generation lost idempotence';
 end if;
 if public.generate_work_calendar_notifications(v_today - 1, 2, 6) <> 0 then
   raise exception 'Notification generation lost debounce';
 end if;
 perform set_config('role', 'postgres', true);
 select array_agg(x::uuid order by x) into v_ids
 from public.notifications n cross join lateral jsonb_array_elements_text(n.data->'entry_ids') x
 where n.user_id = v_staff and n.data->>'category' = 'deadline_overdue';
 select array_agg(('46600000-0000-4000-8001-' || lpad(c.n::text, 12, '0'))::uuid order by c.n)
 into v_expected_ids from carryover_cases c where c.expected_overdue and not c.deleted;
 if v_ids is distinct from v_expected_ids then
   raise exception 'Deadline notifications expected % got %', v_expected_ids, v_ids;
 end if;
 select array_agg(x::uuid order by x) into v_ids
 from public.notifications n cross join lateral jsonb_array_elements_text(n.data->'entry_ids') x
 where n.user_id = v_staff and n.data->>'category' = 'follow_up_reminder';
 v_expected_ids := array['46600000-0000-4000-8001-000000000003'::uuid, '46600000-0000-4000-8001-000000000016'::uuid];
 if v_ids is distinct from v_expected_ids then raise exception 'Follow-up membership incorrect: %', v_ids; end if;

 -- Read/delete state is not rewritten on generator replay.
 update public.notifications set is_read = true, read_at = now() where user_id = v_staff;
 v_read_at := now();
 perform set_config('role', 'authenticated', true);
 if public.generate_work_calendar_notifications(v_today, 2, 0) <> 0 then
   raise exception 'Replayed read notification was duplicated';
 end if;
 perform set_config('request.jwt.claim.sub', v_boss::text, true);
 if public.generate_work_calendar_notifications(v_today, 2, 6) <> 1 then
   raise exception 'Expected one blocked escalation batch';
 end if;
 perform set_config('role', 'postgres', true);
 select array_agg(x::uuid order by x) into v_ids
 from public.notifications n cross join lateral jsonb_array_elements_text(n.data->'entry_ids') x
 where n.user_id = v_boss and n.data->>'category' = 'blocked_escalation';
 if v_ids is distinct from v_expected_ids then raise exception 'Escalation membership incorrect: %', v_ids; end if;
 if exists (select 1 from public.notifications where user_id = v_staff
   and (not is_read or read_at is distinct from v_read_at)) then
   raise exception 'Generator replay reset read state';
 end if;

 -- ACLs are inherited, not broadened, and auth-null calls remain rejected.
 for v_row in select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace
   and p.proname in ('list_work_calendar_team_entries', 'list_work_calendar_team_overview',
     'list_work_calendar_member_entries', 'get_work_calendar_dashboard_entries', 'generate_work_calendar_notifications') loop
   if has_function_privilege('anon', v_row.oid, 'EXECUTE')
      or not has_function_privilege('authenticated', v_row.oid, 'EXECUTE') then
     raise exception 'RPC execute permissions changed';
   end if;
 end loop;
 perform set_config('request.jwt.claim.sub', '', true);
 perform set_config('role', 'authenticated', true);
 begin
   perform public.list_work_calendar_team_overview(p_work_date => v_today);
   raise exception 'Auth-null overview not rejected';
 exception when insufficient_privilege then null; end;
 begin
   perform public.list_work_calendar_member_entries(v_staff, v_today);
   raise exception 'Auth-null detail not rejected';
 exception when insufficient_privilege then null; end;
 begin
   perform public.generate_work_calendar_notifications(v_today);
   raise exception 'Auth-null generator not rejected';
 exception when raise_exception then
   if sqlerrm <> 'Authentication required' then raise; end if;
 end;
 if exists (select 1 from public.list_work_calendar_team_entries(v_today, v_today))
    or exists (select 1 from public.get_work_calendar_dashboard_entries(v_staff, v_today)) then
   raise exception 'Auth-null invoker read leaked data';
 end if;
 perform set_config('role', 'postgres', true);
 if exists (
   (select to_jsonb(e) from public.work_calendar_entries e except select row from carryover_stored_before)
   union all
   (select row from carryover_stored_before except select to_jsonb(e) from public.work_calendar_entries e)
 ) or exists (
   (select to_jsonb(e) from public.work_calendar_events e except select row from carryover_events_before)
   union all
   (select row from carryover_events_before except select to_jsonb(e) from public.work_calendar_events e)
 ) then raise exception 'Reads/notification generation rewrote entries/history'; end if;
end $$;

rollback;
select 'CAL-03 carryover deadlines integration: all assertions passed' as result;
