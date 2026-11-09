-- Disposable fixtures only. Fixed timeline; private clock injection is never granted to clients.
select check_ok(not has_schema_privilege('authenticated','sla_clock_internal','USAGE'),'no client clock schema');
select check_ok(not has_function_privilege('authenticated','sla_clock_internal.refresh(uuid,timestamptz,boolean)','EXECUTE'),'no client timestamp injection');
select check_ok(not has_function_privilege('service_role','sla_clock_internal.refresh(uuid,timestamptz,boolean)','EXECUTE'),'service cannot fake clock');
select check_ok((select count(*)=1 from sla_clock_internal.clocks where signature_id=tid(1022)),'repeat migration retains one clock');

-- Disable only our triggers while a DB owner drives a deterministic state timeline.
alter table surat_signatures disable trigger signer_action_sla_changed;
alter table surat_registrasi disable trigger signer_action_sla_changed;
alter table surat_recommendation_tasks disable trigger signer_action_sla_changed;
alter table surat_linked_documents disable trigger signer_action_sla_changed;
insert into surat_registrasi(id,created_by,office_id,dept_id,no_surat,judul_surat,status,current_step,created_at)
values(tid(900),tid(1),tid(1),tid(1),'SLA-TEST','SLA Fixture','PROSES',2,'2026-11-02 01:00Z');
insert into surat_signatures(id,surat_id,user_id,step_order,is_signed,available_at,role_name,verification_required,verification_status)
values(tid(9001),tid(900),tid(1),1,true,'2026-11-02 01:00Z','Membuat',false,'not_required'),
 (tid(9002),tid(900),tid(2),2,false,'2026-11-02 01:00Z','Manager',true,'pending'),
 (tid(9003),tid(900),tid(3),3,false,null,'Menyetujui',false,'not_required');
select sla_clock_internal.refresh(tid(9002),'2026-11-02 01:00Z');
create function public.test_sla_minutes(p_at timestamptz) returns integer language sql as $$
 select sla_clock_internal.elapsed(tid(9002),'2026-11-02 01:00Z',p_at,array[1,2,3,4,5],'08:00','17:00','12:00','13:00','Asia/Jakarta');
$$;
select check_ok(sla_clock_internal.paused(tid(9002)),'verifier blocks clock');
select check_ok(test_sla_minutes('2026-11-02 02:00Z')=0,'one hour pending verifier costs zero');
update surat_signatures set verification_status='verified' where id=tid(9002);
select sla_clock_internal.refresh(tid(9002),'2026-11-02 02:00Z');
select check_ok(test_sla_minutes('2026-11-02 02:20Z')=20,'verified opens clock');

-- At current2 the deployed 2to3 parent transition is blocked by unfinished recommendation.
insert into surat_recommendation_tasks(id,parent_surat_id,required_before_step,status) values(tid(901),tid(900),3,'claimed');
select sla_clock_internal.refresh(tid(9002),'2026-11-02 02:20Z');
select check_ok(sla_clock_internal.reasons(tid(9002))=array['Menunggu rekomendasi'],'same prerequisite as database approval');
select check_ok(test_sla_minutes('2026-11-02 03:20Z')=20,'recommendation wait freezes prior twenty minutes');
insert into surat_registrasi(id,created_by,status,current_step,data_snapshot) values(tid(902),tid(1),'DONE',1,'{"current_pdf":true}');
insert into surat_linked_documents(parent_surat_id,child_surat_id,link_type,status) values(tid(900),tid(902),'recommendation','active');
select sla_clock_internal.refresh(tid(9002),'2026-11-02 03:20Z');
select check_ok(test_sla_minutes('2026-11-02 03:40Z')=40,'resume preserves prior work time');

-- A second prerequisite pauses again; repeated refresh is idempotent.
update surat_signatures set verification_status='pending' where id=tid(9002);
select sla_clock_internal.refresh(tid(9002),'2026-11-02 03:40Z');
select sla_clock_internal.refresh(tid(9002),'2026-11-02 03:41Z');
select check_ok((select count(*)=1 from sla_clock_internal.periods where signature_id=tid(9002) and ended_at is null),'one open interval');
select check_ok(test_sla_minutes('2026-11-02 06:30Z')=40,'repeated wait and office break do not add time');
update surat_signatures set verification_status='verified',available_at='2026-11-02 06:30Z' where id=tid(9002);
update surat_registrasi set data_snapshot='{"applied_revision":{"accepted_at":"2026-11-02T06:30:00Z"}}' where id=tid(900);
select sla_clock_internal.refresh(tid(9002),'2026-11-02 06:30Z');
select check_ok(test_sla_minutes('2026-11-02 06:45Z')=55,'new available-at never resets accumulated ready time');

-- SQL-owned UI/KPI result metadata and clocks agree; unauthorized readers see no data.
select set_config('request.jwt.claim.sub',tid(2)::text,false);
select check_ok((select elapsed_minutes>=55 from get_department_kpi_details() where signature_id=tid(9002)),'KPI uses accumulated clock');
update surat_signatures set verification_status='pending' where id=tid(9002);
select sla_clock_internal.refresh(tid(9002),'2026-11-02 06:45Z');
select check_ok((select sla_paused and not is_late and sla_pause_reasons=array['Menunggu tim pemeriksa'] from get_department_kpi_details() where signature_id=tid(9002)),'KPI paused metadata');
select check_ok(not exists(select 1 from get_department_kpi_details(null,null,null,null,null,'late') where signature_id=tid(9002)),'paused excluded from active late filter');
select check_ok((get_actionable_dashboard('signer','active',null,null,'SLA-TEST')->'rows'->0->>'sla_paused')::boolean,'dashboard shares waiting state');
do $$begin begin perform remind_dashboard_request(tid(900));exception when object_not_in_prerequisite_state then return;end;raise exception 'paused signer reminder accepted';end$$;
select set_config('request.jwt.claim.sub',tid(7)::text,false);
select check_ok(not exists(select 1 from get_department_kpi_details() where signature_id=tid(9002)),'foreign KPI remains private');

-- Finished measurement cannot keep growing; unknown historical pauses are never invented.
update surat_signatures set is_signed=true,signed_at='2026-11-02 06:45Z' where id=tid(9002);
select sla_clock_internal.refresh(tid(9002),'2026-11-02 06:45Z');
select check_ok(test_sla_minutes('2026-11-03 08:00Z')=55,'terminal clock frozen');
select check_ok(not sla_clock_internal.paused(tid(9002)),'terminal not reported as waiting');
select check_ok(sla_clock_internal.elapsed(tid(9999),'2026-11-02 01:00Z','2026-11-02 01:30Z',array[1,2,3,4,5],'08:00','17:00','12:00','13:00','Asia/Jakarta')=30,'untracked history uses original clock');

alter table surat_signatures enable trigger signer_action_sla_changed;
alter table surat_registrasi enable trigger signer_action_sla_changed;
alter table surat_recommendation_tasks enable trigger signer_action_sla_changed;
alter table surat_linked_documents enable trigger signer_action_sla_changed;
update surat_signatures set is_signed=false,verification_status='pending',available_at=now() where id=tid(9002);
select check_ok((select phase='waiting' from sla_clock_internal.periods where signature_id=tid(9002) and ended_at is null),'real signature trigger pauses');
update surat_signatures set verification_status='verified' where id=tid(9002);
select check_ok((select phase='ready' from sla_clock_internal.periods where signature_id=tid(9002) and ended_at is null),'real verifier completion trigger resumes');
update surat_registrasi set data_snapshot='{"current_pdf":false}' where id=tid(902);
select check_ok(sla_clock_internal.paused(tid(9002)),'child invalidation pauses parent');
update surat_registrasi set data_snapshot='{"current_pdf":true}' where id=tid(902);
select check_ok(not sla_clock_internal.paused(tid(9002)),'child publication resumes parent');
update profiles set is_active=false where id=tid(2);
select check_ok(sla_clock_internal.paused(tid(9002)),'inactive signer is waiting');
update profiles set is_active=true where id=tid(2);
select check_ok(not sla_clock_internal.paused(tid(9002)),'reactivation resumes');
select check_ok((select count(*)=1 from sla_clock_internal.periods where signature_id=tid(9002) and ended_at is null),'triggers retain single current state');

begin;
select set_config('request.jwt.claim.sub',tid(2)::text,true);set local role authenticated;
select check_ok((select not sla_paused from get_department_kpi_details() where signature_id=tid(9002)),'authenticated existing RPC can use private clock');
do $$begin begin perform sla_clock_internal.refresh(tid(9002));exception when insufficient_privilege then return;end;raise exception 'client changed clock';end$$;
rollback;

alter table surat_signatures disable trigger signer_action_sla_changed;
alter table surat_registrasi disable trigger signer_action_sla_changed;
insert into surat_registrasi(id,created_by,office_id,dept_id,no_surat,judul_surat,status,current_step,created_at)
values(tid(910),tid(1),tid(1),tid(1),'SLA-FRACTION','Fractional fixture','PROSES',2,'2026-11-02 01:00Z'),
 (tid(920),tid(1),tid(1),tid(1),'SLA-SCHEDULE','Scheduled fixture','PROSES',2,'2026-11-02 01:00Z'),
 (tid(930),tid(1),tid(1),tid(1),'SLA-LEGACY','Legacy fixture','PROSES',2,'2026-11-02 01:00Z');
insert into surat_signatures(id,surat_id,user_id,step_order,is_signed,available_at,role_name,verification_required,verification_status)
values(tid(9102),tid(910),tid(2),2,false,'2026-11-02 01:00Z','Manager',false,'not_required'),
 (tid(9202),tid(920),tid(2),2,false,'2026-11-02 02:00Z','Manager',false,'not_required'),
 (tid(9302),tid(930),tid(2),2,false,'2026-11-02 01:00Z','Manager',true,'pending');
select sla_clock_internal.refresh(tid(9102),'2026-11-02 01:00Z');
update surat_registrasi set status='MENUNGGU_PERBAIKAN' where id=tid(910);
select sla_clock_internal.refresh(tid(9102),'2026-11-02 01:00:30Z');
update surat_registrasi set status='PROSES' where id=tid(910);
select sla_clock_internal.refresh(tid(9102),'2026-11-02 02:00Z');
select check_ok(sla_clock_internal.elapsed(tid(9102),null,'2026-11-02 02:00:30Z',null,null,null,null,null,null)=1,'two thirty-second intervals retain one full minute');
select sla_clock_internal.refresh(tid(9202),'2026-11-02 01:00Z');
select check_ok(sla_clock_internal.state(tid(9202),'2026-11-02 01:30Z')->>'phase'='scheduled','receiving future is waiting');
select check_ok(sla_clock_internal.elapsed(tid(9202),null,'2026-11-02 01:59Z',null,null,null,null,null,null)=0,'receiving delay costs zero');
select check_ok(sla_clock_internal.elapsed(tid(9202),null,'2026-11-02 02:10Z',null,null,null,null,null,null)=10,'scheduled clock automatically runs when intake opens');
select sla_clock_internal.refresh(tid(9302),'2026-11-02 01:30Z',true);
select check_ok(sla_clock_internal.elapsed(tid(9302),null,'2026-11-02 02:00Z',null,null,null,null,null,null)=30,'legacy baseline preserved, no invented retrospective pauses');
update surat_signatures set verification_status='verified' where id=tid(9302);
select sla_clock_internal.refresh(tid(9302),'2026-11-02 02:00Z');
select check_ok(sla_clock_internal.elapsed(tid(9302),null,'2026-11-02 02:10Z',null,null,null,null,null,null)=40,'legacy baseline survives resume');
alter table surat_signatures enable trigger signer_action_sla_changed;
alter table surat_registrasi enable trigger signer_action_sla_changed;
-- A failed business transaction must also roll back its clock events.
begin;
update surat_signatures set verification_status='pending' where id=tid(9002);
select check_ok(sla_clock_internal.paused(tid(9002)),'transaction sees its prerequisite change');
rollback;
select check_ok(not sla_clock_internal.paused(tid(9002)),'rollback leaves prior clock unchanged');
select 'SLA03 actionable clock assertions passed';
