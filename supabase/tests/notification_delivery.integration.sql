begin;
select check_ok(not exists(select 1 from notification_push_deliveries),'no historic push backfill');
insert into web_push_subscriptions(id,user_id,endpoint,subscription) values
 (tid(900),tid(1),'https://fcm.googleapis.com/test-a','{"endpoint":"https://fcm.googleapis.com/test-a","keys":{"p256dh":"fixture","auth":"fixture"}}'),
 (tid(901),tid(2),'https://fcm.googleapis.com/test-b','{"endpoint":"https://fcm.googleapis.com/test-b","keys":{"p256dh":"fixture","auth":"fixture"}}');
insert into notifications(id,user_id,title,message,is_read,data) values(tid(910),tid(1),'Private title','Private detail',false,'{}');
select check_ok((select count(*)=1 from notification_push_deliveries),'insert triggers exactly one device delivery');
create temp table claimed as select * from claim_notification_push(20,array[tid(1)]);
select check_ok((select count(*)=1 from claimed),'audience-scoped claim');
select check_ok((select count(*)=0 from claim_notification_push(20,array[tid(1)])),'a lease cannot be claimed twice');
select check_ok(not finish_notification_push((select id from claimed),tid(999),'sent'),'foreign lease token rejected');
select check_ok(finish_notification_push((select id from claimed),(select lease_token from claimed),'retry','503'),'retry acknowledged');
select check_ok((select status='pending' and available_at>now() from notification_push_deliveries where notification_id=tid(910)),'backoff persists');
update notification_push_deliveries set available_at=now()-interval '1 second' where notification_id=tid(910);
truncate claimed;insert into claimed select * from claim_notification_push(20,array[tid(1)]);
select check_ok(finish_notification_push((select id from claimed),(select lease_token from claimed),'sent'),'successful ack');
select check_ok((select not is_read from notifications where id=tid(910)),'delivery never means read');
select check_ok((select status='sent' from notification_push_deliveries where notification_id=tid(910)),'sent retained');

-- Opt-out after enqueue must stop a pending popup without deleting the in-app notification.
insert into notification_preferences(user_id,team_push) values(tid(1),true);
insert into notifications(id,user_id,title,message,is_read,data) values(tid(912),tid(1),'Team','Digest',false,'{"category":"team_digest"}');
select check_ok(exists(select 1 from notification_push_deliveries where notification_id=tid(912)),'team push is explicit opt-in');
update notification_preferences set team_push=false where user_id=tid(1);
select check_ok(not exists(select 1 from claim_notification_push(20,array[tid(1)])),'opt-out cancels queued popup');
select check_ok((select status='skipped' from notification_push_deliveries where notification_id=tid(912)),'opt-out persisted');
select check_ok((select not is_read from notifications where id=tid(912)),'opt-out does not read or delete the notification');
insert into notifications(id,user_id,title,message,is_read,data) values(tid(913),tid(1),'Crash','Expired lease',false,'{}');
truncate claimed;insert into claimed select * from claim_notification_push(20,array[tid(1)]);
update notification_push_deliveries set lease_until=now()-interval '1 second' where notification_id=tid(913);
select check_ok(not finish_notification_push((select id from claimed),(select lease_token from claimed),'sent'),'expired acknowledgement denied');
truncate claimed;insert into claimed select * from claim_notification_push(20,array[tid(1)]);
select check_ok((select attempts=2 from notification_push_deliveries where notification_id=tid(913)),'crashed lease reclaimed once');
update notification_push_deliveries set attempts=4,lease_until=now()-interval '1 second' where notification_id=tid(913);
select check_ok(not exists(select 1 from claim_notification_push(20,array[tid(1)])),'four-attempt budget cannot be reclaimed');
select check_ok((select status='skipped' from notification_push_deliveries where notification_id=tid(913)),'exhausted lease cleaned');

insert into notifications(id,user_id,title,message,is_read,data) values(tid(911),tid(2),'Gone','Gone subscription',false,'{}');
truncate claimed;insert into claimed select * from claim_notification_push(20,array[tid(2)]);
select check_ok(finish_notification_push((select id from claimed),(select lease_token from claimed),'failed','410'),'gone subscription ack');
select check_ok((select disabled_at is not null from web_push_subscriptions where id=tid(901)),'410 disables endpoint');

select set_config('request.jwt.claim.sub',tid(1)::text,true);set local role authenticated;
update notification_preferences set team_notifications=false,calendar_reminders=false where user_id=tid(1);
do $$begin begin insert into notification_preferences(user_id) values(tid(2));exception when insufficient_privilege then return;end;raise exception 'foreign preferences inserted';end$$;
do $$begin begin update notification_preferences set team_notifications=false where user_id=tid(2);exception when insufficient_privilege then return;end;end$$;
select check_ok(not exists(select 1 from notification_preferences where user_id=tid(2)),'own preference scope');
do $$begin begin perform claim_notification_push();exception when insufficient_privilege then return;end;raise exception 'authenticated claim accepted';end$$;
do $$begin begin perform generate_notification_reminders();exception when insufficient_privilege then return;end;raise exception 'authenticated planner accepted';end$$;
do $$begin begin perform generate_notification_reminders_at(now(),null);exception when insufficient_privilege then return;end;raise exception 'client clock accepted';end$$;
reset role;
select check_ok(not has_function_privilege('anon','public.claim_notification_push(integer,uuid[])','execute'),'anonymous queue denied');
select check_ok(not has_function_privilege('service_role','public.generate_notification_reminders_at(timestamptz,uuid[])','execute'),'service cannot supply clock');

-- A new subscription from another login must not be disabled by a late old failure.
update web_push_subscriptions set disabled_at=null where id=tid(901);
insert into notifications(id,user_id,title,message,is_read,data) values(tid(914),tid(2),'Repair','Fixture',false,'{}');
truncate claimed;insert into claimed select * from claim_notification_push(20,array[tid(2)]);
update web_push_subscriptions set updated_at=now()+interval '1 second' where id=tid(901);
select check_ok(finish_notification_push((select id from claimed),(select lease_token from claimed),'failed','410'),'old provider rejection recorded');
select check_ok((select disabled_at is null from web_push_subscriptions where id=tid(901)),'fresh subscription not disabled by old response');

-- Fixed private clock proves workdays, holidays, category dedupe and no implicit overdue.
update department_kpi_configs set work_days=array[1,2,3,4,5],work_start='08:00',work_end='17:00',break_start='12:00',break_end='13:00',timezone='Asia/Jakarta';
insert into work_calendar_entries(id,owner_id,work_date,title,starts_at) values
 (tid(920),tid(2),'2026-11-05','Scheduled','2026-11-05T08:10:00+07:00'),
 (tid(921),tid(2),'2026-11-04','Carried without deadline',null);
select check_ok(generate_notification_reminders_at('2026-11-05T08:00:00+07:00',array[tid(2)])>=1,'scheduled reminder produced');
select check_ok((select count(*)=1 from notifications where user_id=tid(2) and data->>'category'='calendar_scheduled'),'single scheduled reminder');
select check_ok(generate_notification_reminders_at('2026-11-05T08:01:00+07:00',array[tid(2)])=0,'same event not duplicated');
select check_ok(not exists(select 1 from notifications where data->>'category'='calendar_deadline'),'missing deadline is never overdue');
select check_ok(generate_notification_reminders_at('2026-11-05T12:30:00+07:00',array[tid(2)])=0,'lunch is quiet');
insert into holidays values('2026-11-06');
select check_ok(generate_notification_reminders_at('2026-11-06T16:45:00+07:00',array[tid(2)])=0,'holiday is quiet');
select check_ok(generate_notification_reminders_at('2026-11-07T16:45:00+07:00',array[tid(2)])=0,'weekend is quiet');
update work_calendar_entries set status='completed',realization='Done' where id=tid(920);
update work_calendar_entries set due_date='2026-11-05' where id=tid(921);
select check_ok(generate_notification_reminders_at('2026-11-05T16:45:00+07:00',array[tid(2)])>=2,'deadline and missing result produced');
select check_ok((select count(*)=1 from notifications where data->>'category'='calendar_deadline'),'one explicit deadline reminder');
select check_ok((select count(*)=1 from notifications where data->>'category'='calendar_result'),'no reminder for completed entry');
select check_ok(generate_notification_reminders_at('2026-11-05T16:46:00+07:00',array[tid(2)])=0,'end of day dedupe');

select check_ok(not exists(select 1 from notification_team_members(tid(2)) where user_id in(tid(3),tid(4),tid(5),tid(7))),'department digest does not cross office/dept');
select check_ok(exists(select 1 from notification_team_members(tid(5)) where user_id=tid(4)),'KC gets KCP signer digest');
select check_ok(not exists(select 1 from notification_team_members(tid(5)) where user_id=tid(6)),'sibling KCP does not get digest');
insert into surat_signatures(id,surat_id,user_id,step_order,role_name,available_at)
 values(tid(930),tid(15),tid(5),1,'BM','2026-11-05T09:01:00+07:00');
select check_ok(generate_notification_reminders_at('2026-11-05T09:00:00+07:00',array[tid(4)])=0,'future stage receives no team digest');
update surat_signatures set available_at='2026-11-05T08:59:00+07:00' where id=tid(930);
select check_ok(generate_notification_reminders_at('2026-11-05T09:00:00+07:00',array[tid(4)])=1,'KC member receives the KCP signer digest');
select check_ok((select count(*)=1 from notifications where user_id=tid(4) and data->>'category'='team_digest'),'single team digest');
select check_ok(not exists(select 1 from notification_push_deliveries d join notifications n on n.id=d.notification_id where n.data->>'category'='team_digest' and d.user_id=tid(4)),'team popup default remains off');
select check_ok(generate_notification_reminders_at('2026-11-05T09:01:00+07:00',array[tid(4)])=0,'team digest hourly dedupe');
select check_ok(generate_notification_reminders_at('2026-11-05T09:00:00+07:00',array[tid(6)])=0,'sibling KCP receives no digest');
update department_kpi_configs set work_days=array[7];
insert into work_calendar_entries(id,owner_id,work_date,title,starts_at) values(tid(940),tid(2),'2026-11-08','Sunday shift','2026-11-08T08:10:00+07:00');
select check_ok(generate_notification_reminders_at('2026-11-08T08:00:00+07:00',array[tid(2)])>=1,'ISO Sunday seven matches configured workdays');
select 'NTF06 delivery, planner and authorization assertions passed';
rollback;
