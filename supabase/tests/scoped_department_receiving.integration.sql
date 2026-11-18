begin;
insert into master_forms values(tid(701),'Kas Kecil','KEU 10'),(tid(702),'Pengadaan','PGD');
insert into form_usages values(tid(703),tid(701),'Kas Kecil Bulanan','active'),
 (tid(704),tid(702),'Barang','active'),(tid(705),tid(701),'Arsip','archived');
insert into department_sla_managers(dept_id,user_id) values(tid(2),tid(3));
insert into department_receiving_weekly_rules(dept_id,enabled,sla_minutes) values(tid(2),true,180);
insert into department_receiving_settings(dept_id,enabled) values(tid(2),true);
set local role authenticated;
select set_config('request.jwt.claim.sub',tid(3)::text,true);
select check_ok((select count(*)=4 from get_department_receiving_scope_options(tid(2))),
 'authorized catalog includes forms and only active usages');
do $$begin
 begin perform get_department_receiving_scope_options(tid(1));raise exception 'foreign catalog access';
 exception when insufficient_privilege then null;end;
 update department_kpi_configs set sla_minutes=30 where dept_id=tid(2);
 if found then raise exception 'delegate edited signer KPI';end if;
 begin update department_receiving_weekly_rules set sla_minutes=30 where dept_id=tid(2);raise exception 'delegate changed SLA override';
 exception when insufficient_privilege then null;end;
 begin update department_receiving_settings set enabled=false where dept_id=tid(2);raise exception 'delegate disabled signer SLA override';
 exception when insufficient_privilege then null;end;
end $$;
insert into department_receiving_scoped_rules(dept_id,scope_kind,scope_id,cadence,period_start,enabled,open_day,open_time,cutoff_day,cutoff_time)
 values(tid(2),'form',tid(701),'weekly','2000-01-03',true,1,'08:00',3,'16:00'),
 (tid(2),'usage',tid(703),'weekly','2000-01-03',true,1,'08:00',5,'15:00'),
 (tid(2),'usage',tid(703),'weekly','2026-11-02',false,1,'08:00',4,'16:00'),
 (tid(2),'form',tid(701),'monthly','2026-12-01',true,1,'08:00',25,'15:00');
do $$begin
 begin insert into department_receiving_scoped_rules(dept_id,scope_kind,scope_id,cadence,period_start,enabled,open_day,open_time,cutoff_day,cutoff_time)
 values(tid(1),'form',tid(701),'weekly','2000-01-03',true,1,'08:00',4,'16:00');raise exception 'foreign department accepted';
 exception when insufficient_privilege then null;end;
 begin insert into department_receiving_scoped_rules(dept_id,scope_kind,scope_id,cadence,period_start,enabled,open_day,open_time,cutoff_day,cutoff_time)
 values(tid(2),'usage',tid(705),'weekly','2000-01-03',true,1,'08:00',4,'16:00');raise exception 'archived usage accepted';
 exception when check_violation then null;end;
 begin insert into department_receiving_scoped_rules(dept_id,scope_kind,scope_id,cadence,period_start,enabled,open_day,open_time,cutoff_day,cutoff_time)
 values(tid(2),'form',tid(702),'monthly','2000-01-01',true,1,'08:00',null,'16:00');raise exception 'missing cutoff accepted';
 exception when check_violation then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select check_ok((department_receiving_policy(tid(2),'2026-11-05 16:00+07',tid(702),tid(704))#>>'{receiving,available_at}')::timestamptz
 ='2026-11-09 08:00+07','unmatched form keeps general Thursday cutoff');
select check_ok((department_receiving_policy(tid(2),'2026-11-05 10:00+07',tid(701),null)#>>'{receiving,available_at}')::timestamptz
 ='2026-11-09 08:00+07','form Wednesday cutoff precedes general rule');
select check_ok((department_receiving_policy(tid(2),'2026-11-06 16:00+07',tid(701),tid(703))#>>'{receiving,available_at}')::timestamptz
 ='2026-11-06 16:00+07','usage-specific week disables the lower weekly rules');
select check_ok((department_receiving_policy(tid(2),'2026-11-12 16:00+07',tid(701),tid(703))#>>'{receiving,available_at}')::timestamptz
 ='2026-11-12 16:00+07','regular usage window precedes form and general');
select check_ok((department_receiving_policy(tid(2),'2026-12-28 09:00+07',tid(701),tid(703))#>>'{receiving,available_at}')::timestamptz
 ='2027-01-01 08:00+07','form monthly rule coexists with usage weekly rule');
select check_ok((department_receiving_policy(tid(2),'2026-11-06 16:00+07',tid(701),tid(703))->>'sla_minutes')::int
 =180,'scoped schedule does not replace existing signer SLA');
update department_receiving_settings set enabled=false where dept_id=tid(2);
select check_ok((department_receiving_policy(tid(2),'2026-11-05 10:00+07',tid(701),null)#>>'{receiving,available_at}')::timestamptz
 ='2026-11-09 08:00+07','scoped rule stays active even if general defaults are off');

update surat_registrasi set form_usage_id=tid(703) where id=tid(13);
insert into department_receiving_scoped_rules(dept_id,scope_kind,scope_id,cadence,period_start,enabled,open_day,open_time,cutoff_day,cutoff_time)
 values(tid(2),'usage',tid(703),'weekly',date_trunc('week',now() at time zone 'Asia/Jakarta')::date,true,1,'00:00',1,'00:01')
 on conflict(dept_id,scope_kind,scope_id,cadence,period_start) do update set enabled=true,open_time='00:00',cutoff_day=1,cutoff_time='00:01';
insert into surat_signatures(id,surat_id,user_id,step_order,available_at,signer_snapshot)
 values(tid(9960),tid(13),tid(3),2,now(),jsonb_build_object('form_id',tid(702),'form_usage_id',tid(704)));
select check_ok((select sla_policy_snapshot#>>'{receiving,week_scope}'='usage' from surat_signatures where id=tid(9960)),
 'activation resolves the registered usage, not signer snapshot');
insert into master_penggunaan_detail values(tid(706),tid(701));
update surat_registrasi set form_usage_id=null,penggunaan_id=tid(706) where id=tid(13);
insert into surat_signatures(id,surat_id,user_id,step_order,available_at) values(tid(9961),tid(13),tid(3),3,now());
select check_ok((select sla_policy_snapshot#>>'{receiving,week_scope}'='form' from surat_signatures where id=tid(9961)),
 'legacy registration uses its linked master form');
update surat_registrasi set form_usage_id=tid(703) where id=tid(13);
create temp table scoped_before as select sla_policy_snapshot from surat_signatures where id=tid(9960);
delete from department_receiving_scoped_rules where dept_id=tid(2);
update surat_signatures set signer_snapshot='{}' where id=tid(9960);
select check_ok((select s.sla_policy_snapshot=b.sla_policy_snapshot from surat_signatures s cross join scoped_before b where s.id=tid(9960)),
 'schedule edits do not rewrite an activated stage');
select check_ok(not has_function_privilege('authenticated','public.department_receiving_policy(uuid,timestamptz,uuid,uuid)','execute'),
 'scoped resolver is not an API');
grant select, update on public.surat_registrasi to authenticated;
create policy scoped_fixture_direct_update on public.surat_registrasi for all to authenticated using(true) with check(true);
select set_config('request.jwt.claim.sub',tid(3)::text,true);
set local role authenticated;
do $$begin
 update surat_registrasi set form_usage_id=tid(703) where id=tid(13);
 if not found then raise exception 'fixture cannot exercise workflow guard';end if;
 begin update surat_registrasi set form_usage_id=tid(704) where id=tid(13);raise exception 'registered workflow not protected';
 exception when insufficient_privilege then null;end;
 begin update surat_registrasi set penggunaan_id=null where id=tid(13);raise exception 'legacy workflow not protected';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'Scoped department receiving assertions passed';
