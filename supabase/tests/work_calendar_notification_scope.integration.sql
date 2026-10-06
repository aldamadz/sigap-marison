-- Applied after the bootstrap and carryover; never run against remote data.
begin;
insert into public.profiles(id,full_name,parent_id,is_active) values
 ('466d0000-0000-4000-8000-000000000001','Scope manager',null,true),
 ('466d0000-0000-4000-8000-000000000002','Inactive member','466d0000-0000-4000-8000-000000000001',false),
 ('466d0000-0000-4000-8000-000000000003','Behind inactive member','466d0000-0000-4000-8000-000000000002',true),
 ('466d0000-0000-4000-8000-000000000004','Active member','466d0000-0000-4000-8000-000000000001',true),
 ('466d0000-0000-4000-8000-000000000005','Active descendant','466d0000-0000-4000-8000-000000000004',true);

insert into public.work_calendar_entries(id,owner_id,work_date,title,status,blocked_reason) values
 ('466d0000-0000-4000-8001-000000000002','466d0000-0000-4000-8000-000000000002',
  (now() at time zone 'Asia/Jakarta')::date - 20,'Hidden inactive task','blocked','Fixture'),
 ('466d0000-0000-4000-8001-000000000003','466d0000-0000-4000-8000-000000000003',
  (now() at time zone 'Asia/Jakarta')::date - 20,'Hidden inactive path task','blocked','Fixture'),
 ('466d0000-0000-4000-8001-000000000004','466d0000-0000-4000-8000-000000000004',
  (now() at time zone 'Asia/Jakarta')::date - 20,'Visible active task','blocked','Fixture'),
 ('466d0000-0000-4000-8001-000000000005','466d0000-0000-4000-8000-000000000005',
  (now() at time zone 'Asia/Jakarta')::date - 20,'Visible active descendant task','blocked','Fixture');
insert into public.work_calendar_events(entry_id,owner_id,event_type,from_status,to_status,created_at)
 select id,owner_id,'status_changed','planned','blocked',now()-interval '14 days'
 from public.work_calendar_entries where id::text like '466d0000-%';

-- Same business key across owners remains legal; Calendar keys stay unique.
insert into public.notifications(user_id,title,message,data) values
 ('466d0000-0000-4000-8000-000000000001','Business','Fixture','{"dedupe_key":"other-module:duplicate"}'),
 ('466d0000-0000-4000-8000-000000000002','Business','Fixture','{"dedupe_key":"other-module:duplicate"}'),
 ('466d0000-0000-4000-8000-000000000001','Calendar','Fixture','{"dedupe_key":"work-calendar:test-unique"}');
do $scope_test$
declare v_notification record;
begin
 begin
  insert into public.notifications(user_id,title,message,data) values
   ('466d0000-0000-4000-8000-000000000002','Calendar duplicate','Fixture',
    '{"dedupe_key":"work-calendar:test-unique"}');
  raise exception 'Calendar dedupe uniqueness lost';
 exception when unique_violation then null;
 end;
 perform set_config('request.jwt.claim.sub','466d0000-0000-4000-8000-000000000001',true);
 perform set_config('role','authenticated',true);
 if public.generate_work_calendar_notifications((now() at time zone 'Asia/Jakarta')::date,1,0) <> 1 then
  raise exception 'Active-hierarchy escalation not emitted';
 end if;
 select data,message into v_notification from public.notifications
 where user_id=auth.uid() and data->>'category'='blocked_escalation';
 if v_notification.data is null or
    v_notification.data->'entry_ids' <> '["466d0000-0000-4000-8001-000000000004","466d0000-0000-4000-8001-000000000005"]'::jsonb
    or position('Hidden' in v_notification.message)>0 then
  raise exception 'Inactive hierarchy titles/IDs leaked through privileged notifications';
 end if;
 if public.generate_work_calendar_notifications((now() at time zone 'Asia/Jakarta')::date,1,0) <> 0 then
  raise exception 'Calendar notification replay not idempotent';
 end if;
 perform set_config('role','postgres',true);
end $scope_test$;
rollback;
select 'CAL-04 notification scope integration: all assertions passed';
