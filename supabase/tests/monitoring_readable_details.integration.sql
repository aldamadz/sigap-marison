begin;
insert into profiles(id,full_name,role,office_id,department_id) values
 (tid(30),'Finance colleague','user',tid(1),tid(2)),
 (tid(31),'KC colleague','user',tid(2),tid(2)),
 (tid(32),'KCP colleague','user',tid(3),tid(2));
insert into surat_registrasi(id,created_by,office_id,dept_id,no_surat,judul_surat,status,current_step,file_path,form_input_data)
 values(tid(300),tid(7),tid(5),tid(1),'SIGNER-DETAIL','Outside requester','PROSES',2,'private/document.pdf','{"items":[{"nama_barang":"Synthetic detail","jumlah":2}]}');
insert into surat_signatures(id,surat_id,user_id,step_order,role_name,signer_snapshot)
 values(tid(301),tid(300),tid(3),2,'Finance Manager','{"synthetic":"snapshot"}'),
 (tid(302),tid(300),tid(5),3,'KCP signer','{}');
insert into surat_attachments values(tid(303),tid(300),now(),'private/attachment.pdf');
select set_config('request.jwt.claim.sub',tid(30)::text,true);set local role authenticated;
select check_ok(can_monitor_surat_progress(tid(300)) and can_read_surat(tid(300)),'signer department colleague can read');
select check_ok((select count(*)=1 from surat_registrasi where id=tid(300)),'document RLS matches detail authority');
select check_ok((get_surat_monitoring_page(24,0,'SIGNER-DETAIL')->>'count')::int=1,'list visibility unchanged');
select check_ok((get_surat_monitoring_page(24,0,'SIGNER-DETAIL')->'rows'->0->>'can_read_document')::boolean,'list enables files');
select check_ok(get_surat_monitoring_detail(tid(300))->>'file_path'='private/document.pdf','main path visible');
select check_ok(get_surat_monitoring_detail(tid(300))#>>'{form_input_data,items,0,nama_barang}'='Synthetic detail','complete items visible');
select check_ok(jsonb_array_length(get_surat_monitoring_detail(tid(300))->'surat_attachments')=1,'attachments visible');
select check_ok(get_surat_monitoring_detail(tid(300))#>>'{surat_signatures,0,signer_snapshot,synthetic}'='snapshot','signature detail visible');
do $$declare changed integer;begin
 update surat_registrasi set judul_surat='Forbidden viewer edit' where id=tid(300);
 get diagnostics changed=row_count;
 perform check_ok(changed=0,'canonical update RLS denies read-only colleague');
end$$;
select check_ok((get_actionable_dashboard('signer','active',null,null,'SIGNER-DETAIL')->>'count')::int=0,'no new signature task');
select check_ok((get_actionable_dashboard('team','active',null,null,'SIGNER-DETAIL')->'rows'->0->>'can_remind')::boolean=false,'reminder authority unchanged');
do $$begin begin perform remind_dashboard_request(tid(300));exception when insufficient_privilege then return;end;
 raise exception 'Read access unexpectedly granted reminder action';end$$;
select set_config('request.jwt.claim.sub',tid(31)::text,true);
select check_ok(can_read_surat(tid(300)),'KC can read KCP signer scope');
select set_config('request.jwt.claim.sub',tid(32)::text,true);
select check_ok(can_read_surat(tid(300)),'KCP can read its signer scope');
select set_config('request.jwt.claim.sub',tid(6)::text,true);
select check_ok(not can_read_surat(tid(300)) and get_surat_monitoring_detail(tid(300)) is null,'sibling KCP denied');
select set_config('request.jwt.claim.sub',tid(1)::text,true);
select check_ok(not can_read_surat(tid(300)),'unrelated Pusat department denied');
select check_ok((get_surat_monitoring_page(24,0,'SIGNER-DETAIL')->>'count')::int=0,'unrelated list unchanged');
reset role;
update profiles set office_id=tid(4) where id=tid(5);
select set_config('request.jwt.claim.sub',tid(32)::text,true);set local role authenticated;
select check_ok(not can_read_surat(tid(300)),'signer transfer dynamically revokes office access');
reset role;
update profiles set is_active=false where id=tid(3);
select set_config('request.jwt.claim.sub',tid(30)::text,true);set local role authenticated;
select check_ok(not can_read_surat(tid(300)),'inactive signer no longer grants department access');
reset role;update profiles set is_active=true where id=tid(3);
update profiles set deleted_at=now() where id=tid(30);set local role authenticated;
select check_ok(not can_read_surat(tid(300)),'deleted viewer denied');
reset role;update profiles set deleted_at=null,is_active=false where id=tid(30);set local role authenticated;
select check_ok(not can_read_surat(tid(300)),'inactive viewer denied');
reset role;select set_config('request.jwt.claim.sub','',true);set local role anon;
do $$begin begin perform can_read_surat(tid(300));exception when insufficient_privilege then return;end;
 raise exception 'Anonymous detail allowed';end$$;
reset role;
select check_ok(not has_function_privilege('anon','public.can_read_surat(uuid)','execute'),'no anonymous execute');
select 'Monitoring readable details: all assertions passed';
rollback;
