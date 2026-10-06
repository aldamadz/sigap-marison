-- CAL-04 bootstrap integration. Also safe for the historic baseline runner:
-- the baseline RPC assertions use original dates; the dedicated bootstrap runner
-- additionally runs the unchanged carryover suite after its ordered installation.
begin;

insert into public.profiles (id, full_name, role, parent_id) values
 ('466b0000-0000-4000-8000-000000000001', 'Bootstrap manager', 'user', null),
 ('466b0000-0000-4000-8000-000000000002', 'Bootstrap owner', 'user', '466b0000-0000-4000-8000-000000000001'),
 ('466b0000-0000-4000-8000-000000000003', 'Bootstrap foreign', 'user', null),
 ('466b0000-0000-4000-8000-000000000004', 'Bootstrap admin', 'admin', null);

insert into public.work_calendar_entries (id, owner_id, work_date, title, due_date) values
 ('466b0000-0000-4000-8001-000000000001', '466b0000-0000-4000-8000-000000000002',
  (now() at time zone 'Asia/Jakarta')::date - 5, 'Bootstrap old task', null),
 ('466b0000-0000-4000-8001-000000000002', '466b0000-0000-4000-8000-000000000003',
  (now() at time zone 'Asia/Jakarta')::date - 5, 'Foreign explicit deadline',
  (now() at time zone 'Asia/Jakarta')::date - 1),
 ('466b0000-0000-4000-8001-000000000003', '466b0000-0000-4000-8000-000000000004',
  (now() at time zone 'Asia/Jakarta')::date, 'Admin own task', null);

do $bootstrap_rpc_tests$
declare
 v_today date := (now() at time zone 'Asia/Jakarta')::date;
 v_owner uuid := '466b0000-0000-4000-8000-000000000002';
 v_foreign uuid := '466b0000-0000-4000-8000-000000000003';
 v_entry uuid := '466b0000-0000-4000-8001-000000000001';
 v_count integer;
 v_call text;
begin
 perform set_config('request.jwt.claim.sub', v_owner::text, true);
 perform set_config('role', 'authenticated', true);

 if (select count(*) from public.work_calendar_entries) <> 1
    or (select count(*) from public.work_calendar_events) <> 1
    or (select count(*) from public.get_my_recent_work_calendar_events(20)) <> 1 then
   raise exception 'Bootstrap owner RLS/events RPC scope failed';
 end if;
 if (select count(*) from public.get_work_calendar_work_settings()) <> 1
    or (select count(*) from public.get_work_calendar_dashboard_entries(v_owner, v_today - 5)) <> 1
    or (select count(*) from public.get_work_calendar_dashboard_entries(v_foreign, v_today)) <> 0
    or public.has_work_calendar_team_members()
    or (select count(*) from public.list_work_calendar_team_entries(v_today - 5, v_today)) <> 0
    or (select count(*) from public.list_work_calendar_member_entries(v_foreign, v_today - 5)) <> 0 then
   raise exception 'Bootstrap owner RPC foreign scope failed';
 end if;

 update public.work_calendar_entries set status = 'in_progress' where id = v_entry;
 update public.work_calendar_entries set status = 'completed', realization = 'Verified' where id = v_entry;
 if (select count(*) from public.work_calendar_events where entry_id = v_entry) <> 3
    or not exists (select 1 from public.work_calendar_entries where id = v_entry
      and status = 'completed' and completed_at is not null and work_date = v_today - 5) then
   raise exception 'Bootstrap lifecycle mutated identity/date or failed event history';
 end if;
 begin
   insert into public.work_calendar_events (entry_id, owner_id, event_type, to_status, to_work_date)
   values (v_entry, v_owner, 'created', 'planned', v_today);
   raise exception 'Bootstrap event forgery accepted';
 exception when insufficient_privilege then null;
 end;
 begin
   insert into public.holidays (holiday_date, name) values (date '2098-12-29', 'Unauthorized');
   raise exception 'Bootstrap regular-user holiday write accepted';
 exception when insufficient_privilege then null;
 end;

 perform set_config('request.jwt.claim.sub', v_foreign::text, true);
 if (select count(*) from public.work_calendar_entries) <> 1
    or exists (select 1 from public.work_calendar_events where owner_id = v_owner)
    or exists (select 1 from public.get_my_recent_work_calendar_events(20) where owner_id <> v_foreign)
    or (select count(*) from public.get_work_calendar_dashboard_entries(v_owner, v_today)) <> 0
    or (select count(*) from public.list_work_calendar_member_entries(v_owner, v_today - 5)) <> 0 then
   raise exception 'Bootstrap foreign RLS/RPC leak';
 end if;
 update public.work_calendar_entries set title = 'Forbidden' where id = v_entry;
 get diagnostics v_count = row_count;
 if v_count <> 0 then raise exception 'Bootstrap foreign update accepted'; end if;
 begin
   insert into public.work_calendar_entries (owner_id, work_date, title) values (v_owner, v_today, 'Forged');
   raise exception 'Bootstrap foreign insert accepted';
 exception when insufficient_privilege then null;
 end;
 if public.soft_delete_work_calendar_entry(v_entry, now()) then
   raise exception 'Bootstrap foreign delete RPC accepted';
 end if;
 if public.generate_work_calendar_notifications(v_today, 2, 0) < 1
    or public.generate_work_calendar_notifications(v_today, 2, 0) <> 0 then
   raise exception 'Bootstrap real notification generation/dedupe failed';
 end if;
 -- The dedicated harness has the real shared RLS contract; historic CAL-03
 -- fixtures did not model notifications RLS. Never change its policies here.
 if (select relrowsecurity from pg_class where oid = 'public.notifications'::regclass) then
   if exists (select 1 from public.notifications where user_id <> v_foreign)
      or not exists (select 1 from public.notifications where user_id = v_foreign
          and data->>'category' = 'deadline_overdue') then
     raise exception 'Bootstrap shared notification RLS scope failed';
   end if;
 end if;
 begin
   perform public.work_calendar_emit_notification(v_owner, 'forged', 'info', 'Forgery',
       'Forgery', '/calendar', 'forged', array[v_entry], 0);
   raise exception 'Bootstrap internal notification helper exposed';
 exception when insufficient_privilege then null;
 end;

 perform set_config('request.jwt.claim.sub', '466b0000-0000-4000-8000-000000000001', true);
 if not public.has_work_calendar_team_members()
    or (select count(*) from public.list_work_calendar_team_members()) <> 1
    or (select count(*) from public.search_work_calendar_team_members(null, 25, 0, null, null)) <> 1
    or (select count(*) from public.get_work_calendar_team_member(v_owner)) <> 1
    or (select count(*) from public.list_work_calendar_team_overview(null, null, null, null, null, v_today - 5, 'priority', 25, 0)) <> 1
    or (select count(*) from public.list_work_calendar_member_entries(v_owner, v_today - 5)) <> 1
    or (select count(*) from public.list_work_calendar_team_entries(v_today - 5, v_today)) <> 1
    or (select count(*) from public.work_calendar_events) <> 3 then
   raise exception 'Bootstrap manager real team RPC/RLS scope failed';
 end if;
 perform * from public.list_work_calendar_team_overview_options();
 if (select count(*) from public.get_my_recent_work_calendar_events(20)) <> 0 then
   raise exception 'Bootstrap personal activity RPC leaked descendant events';
 end if;
 update public.work_calendar_entries set title = 'Manager forbidden' where id = v_entry;
 get diagnostics v_count = row_count;
 if v_count <> 0 then raise exception 'Bootstrap manager wrote descendant task'; end if;

 perform set_config('request.jwt.claim.sub', '466b0000-0000-4000-8000-000000000004', true);
 if (select count(*) from public.work_calendar_entries) <> 1
    or exists (select 1 from public.work_calendar_events where owner_id <> auth.uid())
    or (select count(*) from public.get_work_calendar_dashboard_entries(v_foreign, v_today)) <> 0
    or (select count(*) from public.list_work_calendar_member_entries(v_owner, v_today - 5)) <> 0 then
   raise exception 'Bootstrap admin improperly bypassed Calendar ownership';
 end if;
 update public.work_calendar_entries set title = 'Admin forbidden' where id = v_entry;
 get diagnostics v_count = row_count;
 if v_count <> 0 then raise exception 'Bootstrap admin wrote foreign task'; end if;
 insert into public.holidays (holiday_date, name) values (date '2098-12-29', 'Admin holiday');
 if not exists (select 1 from public.holidays where holiday_date = date '2098-12-29') then
   raise exception 'Bootstrap admin holiday write failed';
 end if;

 perform set_config('role', 'anon', true);
 perform set_config('request.jwt.claim.sub', '', true);
 -- Actual invocation, not just has_function_privilege metadata.
 foreach v_call in array array[
   'select * from public.work_calendar_entries',
   'select * from public.work_calendar_events',
   'select * from public.holidays',
   'select * from public.list_work_calendar_team_members()',
   'select * from public.has_work_calendar_team_members()',
   'select * from public.search_work_calendar_team_members(null, 25, 0, null, null)',
   'select * from public.get_work_calendar_team_member(''466b0000-0000-4000-8000-000000000002'')',
   'select * from public.list_work_calendar_team_entries(current_date - 5, current_date)',
   'select * from public.list_work_calendar_team_overview(null, null, null, null, null, current_date, ''priority'', 25, 0)',
   'select * from public.list_work_calendar_team_overview_options()',
   'select * from public.list_work_calendar_member_entries(''466b0000-0000-4000-8000-000000000002'', current_date)',
   'select * from public.get_work_calendar_dashboard_entries(''466b0000-0000-4000-8000-000000000002'', current_date)',
   'select * from public.get_my_recent_work_calendar_events(20)',
   'select * from public.get_work_calendar_work_settings()',
   'select public.generate_work_calendar_notifications(current_date, 2, 0)',
   'select public.soft_delete_work_calendar_entry(''466b0000-0000-4000-8001-000000000001'', now())'
 ] loop
   begin
     execute v_call;
     raise exception 'Bootstrap anon table/RPC call accepted';
   exception when insufficient_privilege then null;
   end;
 end loop;
 if (select relrowsecurity from pg_class where oid = 'public.notifications'::regclass)
    and (select count(*) from public.notifications) <> 0 then
   raise exception 'Bootstrap anon shared notifications leaked';
 end if;
 perform set_config('role', 'postgres', true);
end
$bootstrap_rpc_tests$;

rollback;
select 'CAL-04 work calendar bootstrap integration: all assertions passed';
