begin;
select check_ok(not exists(select 1 from surat_signatures where sla_policy_snapshot is not null),'no historical snapshot backfill');
insert into department_receiving_rules(dept_id,enabled,cutoff_day,cutoff_time,reopen_day,reopen_time,sla_minutes,message)
 values(tid(2),true,25,'15:00',1,'08:00',75,'Tutup buku. Permohonan diterima pada periode berikutnya.');
select check_ok((department_receiving_policy(tid(2),'2026-11-24T10:00:00+07:00')#>>'{receiving,available_at}')::timestamptz='2026-11-24T10:00:00+07:00','open period is immediate');
select check_ok((department_receiving_policy(tid(2),'2026-11-25T15:00:00+07:00')#>>'{receiving,available_at}')::timestamptz='2026-12-01T08:00:00+07:00','exact cutoff moves to next month');
select check_ok((department_receiving_policy(tid(2),'2026-12-28T10:00:00+07:00')#>>'{receiving,available_at}')::timestamptz='2027-01-01T08:00:00+07:00','year rollover');
insert into department_receiving_rules(dept_id,period_month,enabled,cutoff_day,sla_minutes) values(tid(2),'2026-11-01',true,20,45);
select check_ok((department_receiving_policy(tid(2),'2026-11-24T10:00:00+07:00')#>>'{receiving,available_at}')::timestamptz='2026-12-01T08:00:00+07:00','month override takes precedence');
select check_ok((department_receiving_policy(tid(2),'2026-11-24T10:00:00+07:00')->>'sla_minutes')::int=75,'next period SLA is selected, not previous month override');
select check_ok((department_receiving_policy(tid(2),'2026-11-19T10:00:00+07:00')->>'sla_minutes')::int=45,'month SLA is frozen when received');
insert into holidays values('2026-12-01');
select check_ok((department_receiving_policy(tid(2),'2026-11-24T10:00:00+07:00')#>>'{receiving,available_at}')::timestamptz='2026-12-02T08:00:00+07:00','holiday shifts reopening to a working day');
select check_ok((department_receiving_policy(tid(2),'2026-10-26T10:00:00+07:00')#>>'{receiving,available_at}')::timestamptz='2026-11-02T08:00:00+07:00','Sunday opening rolls to Monday');
select check_ok((department_receiving_policy(tid(2),'2026-11-19T12:30:00+07:00')#>>'{receiving,available_at}')::timestamptz='2026-11-19T13:00:00+07:00','break is not processing time');
select check_ok((department_receiving_policy(tid(1),'2026-11-26T10:00:00+07:00')#>>'{receiving,available_at}')::timestamptz='2026-11-26T10:00:00+07:00','unconfigured department is unchanged');

-- Runtime tests use the server clock. A tiny opening window already closed today
-- deterministically defers this synthetic signature without an injectable client clock.
update department_receiving_rules set period_month=date_trunc('month',now() at time zone 'Asia/Jakarta')::date,
 cutoff_day=1,cutoff_time='00:01',reopen_day=1,reopen_time='00:00' where period_month='2026-11-01' and dept_id=tid(2);
create temp table inbox_before as select get_compact_inbox_count(tid(3)) as count,get_user_active_sla_breach_count(tid(3)) as breaches;
insert into surat_signatures(id,surat_id,user_id,step_order,available_at,signer_snapshot) values
 (tid(950),tid(13),tid(3),2,now(),jsonb_build_object('department_id',tid(2)));
update surat_registrasi set current_step=2 where id=tid(13);
select check_ok((select available_at>now() and sla_policy_snapshot->>'version'='1' from surat_signatures where id=tid(950)),'new active stage receives a future period');
select check_ok(not is_inbox_task_active(tid(3),tid(950)),'deferred stage is not an actionable inbox task');
select check_ok(not exists(select 1 from get_compact_inbox(tid(3)) where id=tid(950)),'deferred stage absent from compact queue');
select check_ok(get_compact_inbox_count(tid(3))=(select count from inbox_before),'compact count excludes deferred stage');
select check_ok(get_user_active_sla_breach_count(tid(3))=(select breaches from inbox_before),'future intake adds no overdue signal');
select set_config('request.jwt.claim.sub',tid(3)::text,true);set local role authenticated;
select check_ok((get_actionable_dashboard('signer','all',null,null,'ORG-3')->'rows'->0->>'bucket')='waiting','dashboard shows waiting, not ready');
select check_ok((get_actionable_dashboard('signer','all',null,null,'ORG-3')->'rows'->0->>'elapsed_minutes') is null,'future intake not measured');
reset role;
do $$begin begin update surat_signatures set is_signed=true where id=tid(950);exception when object_not_in_prerequisite_state then return;end;raise exception 'early signing accepted';end$$;
do $$begin begin update surat_signatures set verification_status='verified' where id=tid(950);exception when object_not_in_prerequisite_state then return;end;raise exception 'early verification accepted';end$$;
update surat_signatures set available_at=null,sla_policy_snapshot='{"sla_minutes":1}' where id=tid(950);
select check_ok((select available_at>now() and (sla_policy_snapshot->>'sla_minutes')::integer<>1 from surat_signatures where id=tid(950)),'clearing availability or forging snapshot cannot bypass hold');
create temp table captured as select sla_policy_snapshot from surat_signatures where id=tid(950);
update department_kpi_configs set sla_minutes=999 where dept_id=tid(2);
update department_receiving_rules set sla_minutes=888 where dept_id=tid(2);
update surat_signatures set status='PENDING' where id=tid(950);
select check_ok((select s.sla_policy_snapshot=c.sla_policy_snapshot from surat_signatures s cross join captured c where s.id=tid(950)),'existing stage snapshot is immutable after configuration changes');
select check_ok((select sla_minutes<>999 and sla_minutes<>888 from signature_sla_config(tid(950),tid(2))),'clock resolver uses frozen SLA');
select check_ok((select sla_minutes=999 from signature_sla_config(tid(999),tid(2))),'legacy stages keep existing fallback semantics');

select set_config('request.jwt.claim.sub',tid(1)::text,true);set local role authenticated;
select check_ok(not exists(select 1 from department_receiving_rules),'ordinary staff cannot read internal configuration');
do $$begin begin insert into department_receiving_rules(dept_id) values(tid(1));exception when insufficient_privilege then return;end;raise exception 'staff changed receiving policy';end$$;
do $$begin begin perform department_receiving_policy(tid(2),now());exception when insufficient_privilege then return;end;raise exception 'client policy clock accepted';end$$;
reset role;select set_config('request.jwt.claim.sub',tid(9)::text,true);set local role authenticated;
insert into department_receiving_rules(dept_id) values(tid(1));
select check_ok(exists(select 1 from department_receiving_rule_events where actor_id=tid(9) and dept_id=tid(1)),'admin changes record actor and before/after');
do $$begin begin delete from department_receiving_rule_events;exception when insufficient_privilege then return;end;raise exception 'audit deletion accepted';end$$;
reset role;
select check_ok(not has_function_privilege('anon','public.department_receiving_policy(uuid,timestamptz)','execute'),'anonymous clock denied');
select check_ok(not has_function_privilege('authenticated','public.signature_sla_config(uuid,uuid)','execute'),'private snapshots not exposed as a lookup API');
select 'SLA02 monthly receiving and frozen clocks passed';
rollback;
