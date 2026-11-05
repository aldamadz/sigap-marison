begin;
insert into profiles(id,full_name,role,office_id,department_id) values
 (tid(30),'Finance colleague','user',tid(1),tid(2)),
 (tid(31),'KC colleague','user',tid(2),tid(2)),
 (tid(32),'KCP colleague','user',tid(3),tid(2));
insert into surat_registrasi(id,created_by,office_id,dept_id,no_surat,judul_surat,status,current_step,file_path,form_input_data)
 values(tid(300),tid(7),tid(5),tid(1),'SIGNER-SCOPE','Outside requester','PROSES',2,'private/document.pdf','{"secret":"private"}');
insert into surat_signatures(id,surat_id,user_id,step_order,role_name,signer_snapshot)
 values(tid(301),tid(300),tid(3),2,'Finance Manager','{"private":"snapshot"}'),
 (tid(302),tid(300),tid(5),3,'KCP signer','{}');
insert into surat_attachments values(tid(303),tid(300),now(),'private/attachment.pdf');
select set_config('request.jwt.claim.sub',tid(30)::text,true);set local role authenticated;
select check_ok(can_monitor_surat_progress(tid(300)),'department colleague sees signer progress');
select check_ok(not can_read_surat(tid(300)),'new monitoring scope cannot read document');
select check_ok((select count(*)=0 from surat_registrasi where id=tid(300)),'document RLS remains unchanged');
select check_ok((get_surat_monitoring_page(24,0,'SIGNER-SCOPE')->>'count')::int=1,'monitoring search includes signer scope once');
select check_ok((get_surat_monitoring_page(1,0,'SIGNER-SCOPE')->'rows'->0->>'can_read_document')::boolean=false,'list marks progress-only');
select check_ok(get_surat_monitoring_detail(tid(300))->>'file_path' is null,'no main file path in progress detail');
select check_ok(get_surat_monitoring_detail(tid(300))->>'form_input_data' is null,'no private input in progress detail');
select check_ok(get_surat_monitoring_detail(tid(300))->'surat_attachments'='[]'::jsonb,'no attachment leakage');
select check_ok(get_surat_monitoring_detail(tid(300))->'surat_signatures'->0->>'signer_snapshot' is null,'no private signature snapshot');
select check_ok((select total>0 from get_my_surat_monitoring_stats()),'stats use same monitoring scope');
select check_ok((get_actionable_dashboard('team','active',null,null,'SIGNER-SCOPE')->>'count')::int=1,'dashboard team sees signer scope');
select check_ok((get_actionable_dashboard('team','active',null,null,'SIGNER-SCOPE')->'rows'->0->>'can_remind')::boolean=false,'new progress-only scope does not show reminder action');
select check_ok((get_actionable_dashboard('signer','active',null,null,'SIGNER-SCOPE')->>'count')::int=0,'no approval task added');
do $$begin
 begin perform remind_dashboard_request(tid(300));exception when insufficient_privilege then return;end;
 raise exception 'Monitoring unexpectedly grants reminder writes';
end$$;
select set_config('request.jwt.claim.sub',tid(31)::text,true);
select check_ok(can_monitor_surat_progress(tid(300)),'KC colleague sees descendant KCP signer');
select set_config('request.jwt.claim.sub',tid(32)::text,true);
select check_ok(can_monitor_surat_progress(tid(300)),'KCP colleague sees exact office signer');
select set_config('request.jwt.claim.sub',tid(6)::text,true);
select check_ok(not can_monitor_surat_progress(tid(300)),'sibling KCP cannot see signer outside office');
select set_config('request.jwt.claim.sub',tid(1)::text,true);
select check_ok(not can_monitor_surat_progress(tid(300)),'same department name in branch cannot expose to Pusat');
reset role;
update profiles set office_id=tid(4) where id=tid(5);
select set_config('request.jwt.claim.sub',tid(32)::text,true);set local role authenticated;
select check_ok(not can_monitor_surat_progress(tid(300)),'signer office transfer updates scope dynamically');
reset role;update profiles set is_active=false where id=tid(3);
select set_config('request.jwt.claim.sub',tid(30)::text,true);set local role authenticated;
select check_ok(not can_monitor_surat_progress(tid(300)),'inactive signer does not expose new scope');
reset role;update profiles set is_active=true where id=tid(3);update profiles set deleted_at=now() where id=tid(30);
set local role authenticated;
select check_ok(not can_monitor_surat_progress(tid(300)),'deleted viewer denied');
reset role;select set_config('request.jwt.claim.sub','',true);set local role anon;
do $$begin
 begin perform get_surat_monitoring_detail(tid(300));exception when insufficient_privilege then return;end;
 raise exception 'Anonymous monitoring allowed';
end$$;
reset role;
select check_ok(not has_function_privilege('anon','public.can_monitor_surat_progress(uuid)','execute'),'anonymous ACL denied');
rollback;
