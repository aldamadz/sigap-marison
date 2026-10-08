-- Run after the canonical department KPI table/calculate_business_minutes and SLA migration.
-- Uses only disposable keu10_test fixtures; rolls back every test mutation.
begin;
set role postgres;
insert into public.department_kpi_configs(dept_id,sla_minutes) values
  (keu10_test.id(105),75),(keu10_test.id(101),10),(keu10_test.id(102),15)
  on conflict(dept_id) do update set sla_minutes=excluded.sla_minutes,is_active=true;
insert into public.surat_registrasi(id,no_surat,created_by,judul_surat,status,created_at,data_snapshot) values
  (keu10_test.id(9801),'SLA/DISPOSABLE/2026',keu10_test.id(1),'SLA requester fixture',
   'MENUNGGU_PERBAIKAN',now()-interval '30 days',
   jsonb_build_object('revision',jsonb_build_object('event_id',keu10_test.id(9802))));
insert into public.surat_revision_events(id,surat_id,actor_id,target_type,target_user_ids,reason,created_at) values
  (keu10_test.id(9802),keu10_test.id(9801),keu10_test.id(3),'requester',array[keu10_test.id(1)],
   'SLA fixture',now()-interval '5 days');

select keu10_test.assert(not has_function_privilege('anon','public.get_requester_follow_up_sla(uuid)','EXECUTE'),
  'Anonymous role has no SLA execute grant');
select keu10_test.assert(not has_function_privilege('service_role','public.get_requester_follow_up_sla(uuid)','EXECUTE'),
  'No unscoped service-role SLA read');
select keu10_test.assert(public.calculate_business_minutes('2026-10-02 16:30+07','2026-10-05 08:30+07')=60,
  'Canonical time excludes overnight and weekend');
select keu10_test.assert(public.calculate_business_minutes('2026-10-08 11:30+07','2026-10-08 13:30+07')=60,
  'Canonical time excludes lunch');
select keu10_test.assert(public.calculate_business_minutes('2026-10-03 09:00+07','2026-10-04 16:00+07')=0,
  'Weekend has zero work minutes');

set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,true);
select keu10_test.assert((select sla_minutes=75 and config_source='department' and department_name='Teknik (Cabang)'
  and started_at=(select created_at from public.surat_revision_events where id=keu10_test.id(9802))
  and elapsed_minutes=public.calculate_business_minutes(started_at,measured_at)
  from public.get_requester_follow_up_sla(keu10_test.id(9802))),
  'Owner uses requester department, event creation and canonical work minutes, not manager10 or document30days');
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,true);
select keu10_test.expect_error('42501','select public.get_requester_follow_up_sla(keu10_test.id(9802))');
select set_config('request.jwt.claim.sub',keu10_test.id(12)::text,true);
select keu10_test.expect_error('42501','select public.get_requester_follow_up_sla(keu10_test.id(9802))');
select set_config('request.jwt.claim.sub','',true);
select keu10_test.expect_error('42501','select public.get_requester_follow_up_sla(keu10_test.id(9802))');
select set_config('request.jwt.claim.sub',keu10_test.id(9)::text,true);
select keu10_test.assert((select count(*)=1 from public.get_requester_follow_up_sla(keu10_test.id(9802))),
  'Active admin can read one requester event');
select keu10_test.expect_error('42501','select public.get_requester_follow_up_sla(keu10_test.id(99999))');

set role postgres;
update public.department_kpi_configs set work_days=array[6],timezone='Asia/Makassar',work_start='09:00',work_end='16:00',
  break_start='11:00',break_end='11:30' where dept_id=keu10_test.id(105);
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,true);
select keu10_test.assert((select timezone='Asia/Makassar' and elapsed_minutes=public.calculate_business_minutes(
  started_at,measured_at,array[6],time '09:00',time '16:00',time '11:00',time '11:30','Asia/Makassar')
  from public.get_requester_follow_up_sla(keu10_test.id(9802))), 'Custom days, hours, break and timezone honored');

set role postgres;
update public.department_kpi_configs set is_active=false where dept_id=keu10_test.id(105);
set role authenticated;
select keu10_test.assert((select sla_minutes=120 and config_source='default' and timezone='Asia/Jakarta'
  and elapsed_minutes=public.calculate_business_minutes(started_at,measured_at)
  from public.get_requester_follow_up_sla(keu10_test.id(9802))), 'Inactive configuration uses existing120 and default working hours');
set role postgres;
delete from public.department_kpi_configs where dept_id=keu10_test.id(105);
set role authenticated;
select keu10_test.assert((select sla_minutes=120 and config_source='default'
  from public.get_requester_follow_up_sla(keu10_test.id(9802))), 'Missing configuration uses existing120');

set role postgres;
update public.surat_registrasi set policy_snapshot=jsonb_build_object('requester_department_id',keu10_test.id(102))
  where id=keu10_test.id(9801);
set role authenticated;
select keu10_test.assert((select sla_minutes=15 and department_name='Legal Lahan'
  from public.get_requester_follow_up_sla(keu10_test.id(9802))), 'Captured requester department takes precedence over current profile');
set role postgres;
update public.surat_registrasi set policy_snapshot='{"requester_department_id":"invalid"}' where id=keu10_test.id(9801);
update public.surat_revision_events set created_at=now()+interval '1 day',status='awaiting_requester' where id=keu10_test.id(9802);
set role authenticated;
select keu10_test.assert((select elapsed_minutes=0 and sla_minutes=120
  from public.get_requester_follow_up_sla(keu10_test.id(9802))), 'Future start clamps to zero and awaiting_requester is supported');

set role postgres;
update public.surat_revision_events set status='resolved',resolved_at=now() where id=keu10_test.id(9802);
set role authenticated;
select keu10_test.assert((select count(*)=0 from public.get_requester_follow_up_sla(keu10_test.id(9802))), 'Resolved event has no active SLA');
set role postgres;
update public.surat_revision_events set status='cancelled' where id=keu10_test.id(9802);
set role authenticated;
select keu10_test.assert((select count(*)=0 from public.get_requester_follow_up_sla(keu10_test.id(9802))), 'Cancelled event has no active SLA');
set role postgres;
update public.surat_revision_events set status='open',target_type='checker' where id=keu10_test.id(9802);
set role authenticated;
select keu10_test.assert((select count(*)=0 from public.get_requester_follow_up_sla(keu10_test.id(9802))), 'Checker event excluded');
set role postgres;
update public.surat_revision_events set target_type='requester' where id=keu10_test.id(9802);
update public.surat_registrasi set data_snapshot='{}' where id=keu10_test.id(9801);
set role authenticated;
select keu10_test.assert((select count(*)=0 from public.get_requester_follow_up_sla(keu10_test.id(9802))), 'Superseded event has no active SLA');
set role postgres;
update public.profiles set is_active=false where id=keu10_test.id(1);
set role authenticated;
select keu10_test.expect_error('42501','select public.get_requester_follow_up_sla(keu10_test.id(9802))');
set role postgres;
update public.profiles set is_active=true,deleted_at=now() where id=keu10_test.id(1);
set role authenticated;
select keu10_test.expect_error('42501','select public.get_requester_follow_up_sla(keu10_test.id(9802))');
rollback;
select 'Requester follow-up SLA: all assertions passed';
