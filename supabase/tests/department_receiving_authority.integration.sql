begin;
-- A specific week is already closed; the regular next week remains resolvable.
insert into department_receiving_settings(dept_id,enabled) values(tid(2),true);
insert into department_receiving_weekly_rules(dept_id,enabled,open_weekday,open_time,cutoff_weekday,cutoff_time)
 values(tid(2),true,1,'08:00',4,'16:00'),
 (tid(1),false,1,'08:00',4,'16:00');
insert into department_receiving_weekly_rules(dept_id,week_start,enabled,open_weekday,open_time,cutoff_weekday,cutoff_time)
 values(tid(2),date_trunc('week',now() at time zone 'Asia/Jakarta')::date,true,1,'00:00',1,'00:01');
create temp table policies_before as select id,sla_policy_snapshot,signer_snapshot from surat_signatures;
create temp table supplied_snapshot(payload jsonb);
insert into supplied_snapshot values
 (jsonb_build_object('department_id',tid(1),'display_name','Historical department')),
 ('{"department_id":"not-a-uuid"}'),('{"department_id":null}'),
 ('{"department_id":{"nested":"untrusted"}}'),('{}');

-- Forged, missing and malformed snapshot departments cannot bypass the real hold.
do $$declare r record; ordinal integer:=0; incoming timestamptz:=now();begin
 for r in select payload from supplied_snapshot loop
  ordinal:=ordinal+1;
  insert into surat_signatures(id,surat_id,user_id,step_order,available_at,signer_snapshot)
   values(tid(9900+ordinal),tid(13),tid(3),2,incoming,r.payload);
  perform check_ok((select available_at>incoming and sla_policy_snapshot->>'department_id'=tid(2)::text
   and (sla_policy_snapshot#>>'{receiving,enabled}')::boolean and signer_snapshot=r.payload
   from surat_signatures where id=tid(9900+ordinal)),'snapshot cannot choose intake department or be rewritten');
 end loop;
end $$;

-- A foreign department cannot impose a hold on an open authoritative department.
insert into surat_signatures(id,surat_id,user_id,step_order,available_at,signer_snapshot)
 values(tid(9910),tid(13),tid(2),2,now(),jsonb_build_object('department_id',tid(2)));
select check_ok((select available_at=now() and sla_policy_snapshot->>'department_id'=tid(1)::text
 and not (sla_policy_snapshot#>>'{receiving,enabled}')::boolean from surat_signatures where id=tid(9910)),
 'foreign snapshot cannot impose a hold');

-- Missing profile, null department and legacy orphan department mean no policy.
update profiles set department_id=null where id=tid(6);
update profiles set department_id=tid(999) where id=tid(7);
insert into surat_signatures(id,surat_id,user_id,step_order,available_at,signer_snapshot)
 values(tid(9911),tid(13),tid(999),2,now(),jsonb_build_object('department_id',tid(2))),
 (tid(9912),tid(13),tid(6),2,now(),jsonb_build_object('department_id',tid(2))),
 (tid(9913),tid(13),tid(7),2,now(),jsonb_build_object('department_id',tid(2)));
select check_ok((select count(*)=3 and bool_and(sla_policy_snapshot is null and available_at=now())
 from surat_signatures where id in(tid(9911),tid(9912),tid(9913))),'missing server authority never falls back to snapshot');

-- Only activation captures a policy; use the current profile at that instant.
insert into surat_signatures(id,surat_id,user_id,step_order,available_at,signer_snapshot)
 values(tid(9914),tid(13),tid(2),3,null,jsonb_build_object('department_id',tid(1)));
select check_ok((select sla_policy_snapshot is null from surat_signatures where id=tid(9914)),'inactive stage not captured');
update profiles set department_id=tid(2) where id=tid(2);
update surat_signatures set available_at=now() where id=tid(9914);
select check_ok((select available_at>now() and sla_policy_snapshot->>'department_id'=tid(2)::text
 from surat_signatures where id=tid(9914)),'activation resolves profile after transfer');

-- Once captured, neither forged JSON nor a later transfer rewrites the decision.
create temp table frozen_policy as select sla_policy_snapshot from surat_signatures where id=tid(9901);
update profiles set department_id=tid(1) where id=tid(3);
update surat_signatures set signer_snapshot=jsonb_build_object('department_id',tid(1)),
 sla_policy_snapshot='{}',available_at=null where id=tid(9901);
select check_ok((select s.available_at>now() and s.sla_policy_snapshot=f.sla_policy_snapshot
 from surat_signatures s cross join frozen_policy f where s.id=tid(9901)),'previous hold remains frozen after transfer and JSON writes');
do $$begin
 begin update surat_signatures set is_signed=true where id=tid(9901);
  raise exception 'frozen hold approved early';
 exception when object_not_in_prerequisite_state then null;end;
end $$;
insert into surat_signatures(id,surat_id,user_id,step_order,available_at,signer_snapshot)
 values(tid(9915),tid(13),tid(3),3,now(),jsonb_build_object('department_id',tid(2)));
select check_ok((select available_at=now() and sla_policy_snapshot->>'department_id'=tid(1)::text
 from surat_signatures where id=tid(9915)),'next stage uses new profile, not historical attribution');
select check_ok((select bool_and(s.sla_policy_snapshot is not distinct from p.sla_policy_snapshot
 and s.signer_snapshot is not distinct from p.signer_snapshot) from policies_before p join surat_signatures s using(id)),
 'unrelated historical snapshots and attribution unchanged');
select check_ok(not has_function_privilege('authenticated','public.department_receiving_policy(uuid,timestamptz)','execute'),
 'policy clock remains private');
rollback;
select 'SLA02 authoritative intake department assertions passed';
