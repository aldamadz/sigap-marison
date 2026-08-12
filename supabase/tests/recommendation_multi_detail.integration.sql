-- REC-03 disposable integration assertions. Never run against shared environments.
insert into public.profiles(id,role,is_active) values
('00000000-0000-4000-8000-000000000001','user',true),('00000000-0000-4000-8000-000000000002','user',true),
('00000000-0000-4000-8000-000000000003','admin',true),('00000000-0000-4000-8000-000000000004','admin',false);
insert into public.surat_reservations(id,status,reserved_by) values
('20000000-0000-4000-8000-000000000001','PENDING','00000000-0000-4000-8000-000000000001'),
('20000000-0000-4000-8000-000000000002','PENDING','00000000-0000-4000-8000-000000000001');
insert into public.surat_registrasi(id,created_by,no_surat,judul_surat,status,file_path,current_step,reservation_id,form_input_data) values
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','PARENT-001','Parent','PROSES','parent.xlsx',2,null,'{"request_category":"asset"}'),
('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','REC-001','Canonical child','PROSES','child-v1.xlsx',1,'20000000-0000-4000-8000-000000000001',
'{"linked_document_type":"recommendation","linked_parent_surat_id":"10000000-0000-4000-8000-000000000001","task_id":"30000000-0000-4000-8000-000000000001","recommendation_multi_detail":{"version":1,"items":[{"id":"asset-1","order":0,"status":"not_recommended","applicant_original":{"name":"Server","quantity":1,"notes":""},"location":"Gudang","pic":"Budi","rejection_reason":"Tidak ekonomis","details":[]},{"id":"asset-2","order":1,"status":"recommended","applicant_original":{"name":"Komputer","quantity":2,"notes":""},"location":"","pic":"","rejection_reason":"","details":[{"id":"detail-1","order":0,"parent_item_id":"asset-2","name":"RAM 32 GB","quantity":2,"action":"service","description":"Servis","description_manually_edited":false,"notes":"","estimated_price":0,"attachments":[{"id":"photo-1","order":0,"storage_path":"recommendation/photo.jpg"}],"reference_links":[{"id":"ref-1","order":0,"url":"https://example.test/item"}]}]}]}}'),
('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','REC-002','Wrong child','PROSES','wrong.xlsx',1,'20000000-0000-4000-8000-000000000002',
'{"linked_document_type":"recommendation","linked_parent_surat_id":"10000000-0000-4000-8000-000000000099","recommendation_items":[{"nama_barang":"Legacy","jumlah":1,"recommendation_action":"service"}]}'),
('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','REC-003','All rejected','PROSES','reject.xlsx',1,'20000000-0000-4000-8000-000000000002',
'{"linked_document_type":"recommendation","linked_parent_surat_id":"10000000-0000-4000-8000-000000000001","task_id":"30000000-0000-4000-8000-000000000001","recommendation_multi_detail":{"version":1,"items":[{"id":"asset-x","status":"not_recommended","location":"Site","pic":"Ani","rejection_reason":"Rusak total","details":[]}]}}');
insert into public.surat_registration_drafts(id,reservation_id,created_by,no_surat,status) values
('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','REC-001','DRAFT');
insert into public.surat_recommendation_tasks(id,parent_surat_id,reservation_id,required_before_step,status,claimed_by)
values('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',2,'claimed','00000000-0000-4000-8000-000000000001');
insert into public.surat_signatures(id,surat_id,user_id,is_signed,step_order,status)
values
('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',false,2,'PENDING'),
('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',false,1,'PENDING');

do $$begin
 perform public.validate_recommendation_items(('__CANONICAL_FIXTURE__'::jsonb)->'items');
 perform public.validate_recommendation_items('[{"nama_barang":"Legacy","jumlah":1,"recommendation_action":"service"}]');
 begin perform public.validate_recommendation_items('[{"id":"p","order":0,"status":"recommended","applicant_original":{"name":"A","quantity":1,"notes":""},"location":"","pic":"","rejection_reason":"","details":[]}]');raise exception 'empty recommended accepted';exception when invalid_parameter_value then null;end;
 begin perform public.validate_recommendation_items('[{"id":"p","order":0,"status":"not_recommended","applicant_original":{"name":"A","quantity":1,"notes":""},"location":"","pic":"","rejection_reason":"","details":[]}]');raise exception 'incomplete rejection accepted';exception when invalid_parameter_value then null;end;
 begin perform public.validate_recommendation_items('[{"id":"p","order":0,"status":"recommended","applicant_original":{"name":"A","quantity":1,"notes":""},"location":"","pic":"","rejection_reason":"","details":[{"id":"d","order":0,"name":"A","quantity":0,"action":"service","description":"Servis","description_manually_edited":false,"notes":"","attachments":[],"reference_links":[]}]}]');raise exception 'zero quantity accepted';exception when invalid_parameter_value then null;end;
 begin perform public.validate_recommendation_items('[{"id":"p","order":0,"status":"recommended","applicant_original":{"name":"A","quantity":1,"notes":""},"location":"","pic":"","rejection_reason":"","details":[{"id":"d","order":0,"name":"A","quantity":1,"action":"invalid","description":"Servis","description_manually_edited":false,"notes":"","attachments":[],"reference_links":[]}]}]');raise exception 'bad action accepted';exception when invalid_parameter_value then null;end;
 begin perform public.validate_recommendation_items('[{"id":"p","order":0,"status":"recommended","applicant_original":{"name":"A","quantity":1,"notes":""},"location":"","pic":"","rejection_reason":"","details":[{"id":"d","order":0,"name":"A","quantity":1,"action":"service","description":"Servis","description_manually_edited":false,"notes":"","attachments":[{"id":"a","order":0,"storage_path":"x"},{"id":"a","order":1,"storage_path":"y"}],"reference_links":[]}]}]');raise exception 'duplicate attachment IDs accepted';exception when unique_violation then null;end;
 begin perform public.validate_recommendation_items('[{}]');raise exception 'empty legacy object accepted';exception when invalid_parameter_value then null;end;
 begin perform public.validate_recommendation_items('[{"nama_barang":"A","jumlah":1}]');raise exception 'legacy without action accepted';exception when invalid_parameter_value then null;end;
 begin perform public.validate_recommendation_items('[{"recommendation_action":"service","nama_barang":"A","jumlah":0}]');raise exception 'legacy zero quantity accepted';exception when invalid_parameter_value then null;end;
 begin perform public.validate_recommendation_items('[{"id":"p","order":0,"status":"recommended","applicant_original":{"name":"A","quantity":1,"notes":""},"location":"","pic":"","rejection_reason":"","details":[{"recommendation_action":"service","nama_barang":"legacy","jumlah":1}]}]');raise exception 'mixed canonical downgraded';exception when invalid_parameter_value then null;end;
 begin perform public.validate_recommendation_items('[{"id":7,"order":0,"status":"not_recommended","applicant_original":{"name":"A","quantity":1,"notes":""},"location":"L","pic":"P","rejection_reason":"R","details":[]}]');raise exception 'numeric canonical ID accepted';exception when invalid_parameter_value then null;end;
 begin perform public.validate_recommendation_items('[{"id":"p","order":0,"status":"recommended","applicant_original":{"name":"A","quantity":1,"notes":""},"location":"","pic":"","rejection_reason":"","details":[{"id":"d","order":0,"name":"A","quantity":1,"action":"service","description":"S","description_manually_edited":false,"notes":"","attachments":[{"id":"a","order":0,"storage_path":7}],"reference_links":[]}]}]');raise exception 'numeric path accepted';exception when invalid_parameter_value then null;end;
 begin perform public.validate_recommendation_items('[{"recommendation_action":"service","nama_barang":"A","jumlah":1,"details":[]}]',false);raise exception 'empty legacy nested details accepted';exception when invalid_parameter_value then null;end;
 perform public.validate_recommendation_items('[{"recommendation_action":"tidak direkomendasikan","location":"L","pic":"P","reason":"R","details":[]}]',false);
end$$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$begin begin perform public.complete_recommendation_task('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');raise exception 'unauthorized accepted';exception when insufficient_privilege then null;end;end$$;
do $$begin begin perform public.finalize_recommendation_revision_if_needed('10000000-0000-4000-8000-000000000002');raise exception 'unauthorized direct finalize accepted';exception when insufficient_privilege then null;end;end$$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
update public.surat_registration_drafts set reservation_id='20000000-0000-4000-8000-000000000002' where id='40000000-0000-4000-8000-000000000001';
do $$begin begin perform public.complete_recommendation_task('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');raise exception 'task context bypassed reservation';exception when invalid_parameter_value then null;end;end$$;
update public.surat_registration_drafts set reservation_id='20000000-0000-4000-8000-000000000001' where id='40000000-0000-4000-8000-000000000001';
update public.surat_registrasi set form_input_data=form_input_data||'{"recommendation_multi_detail":{"broken":true},"recommendation_items":[{"nama_barang":"Legacy","jumlah":1}]}'::jsonb where id='10000000-0000-4000-8000-000000000004';
do $$begin begin perform public.complete_recommendation_task('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004');raise exception 'malformed canonical downgraded to legacy';exception when invalid_parameter_value then null;end;end$$;
do $$begin begin perform public.complete_recommendation_task('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003');raise exception 'wrong linkage accepted';exception when invalid_parameter_value then null;end;end$$;
select public.complete_recommendation_task('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');
do $$declare recovered public.surat_registrasi; before_count integer;begin
 select count(*) into before_count from public.surat_registrasi;
 select * into recovered from public.create_surat_registrasi(jsonb_build_object(
   'draft_id','40000000-0000-4000-8000-000000000001','reservation_id','20000000-0000-4000-8000-000000000001','no_surat','REC-001'));
 assert recovered.id='10000000-0000-4000-8000-000000000002','partial registration retry did not reuse existing surat';
 assert(select count(*)=before_count from public.surat_registrasi),'partial registration retry duplicated surat';
end$$;
do $$begin assert(select not (data_snapshot ? 'recommendation') from public.surat_registrasi where id='10000000-0000-4000-8000-000000000001'),'parent snapshot published before PDF';end$$;
do $$declare t timestamptz;begin select submitted_at into t from public.surat_recommendation_tasks where id='30000000-0000-4000-8000-000000000001';perform pg_sleep(.01);perform public.complete_recommendation_task('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');assert(select submitted_at=t from public.surat_recommendation_tasks where id='30000000-0000-4000-8000-000000000001'),'same child not idempotent';begin perform public.complete_recommendation_task('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003');raise exception 'different child accepted';exception when sqlstate '55000' then null;end;end$$;

-- Parent approval guard and final stamped source orchestration.
do $$begin begin update public.surat_registrasi set status='DONE' where id='10000000-0000-4000-8000-000000000001';raise exception 'final approval passed unfinished child';exception when sqlstate '55000' then null;end;end$$;
do $$begin begin update public.surat_registrasi set status='DONE',pdf_path='pdf/forged.pdf' where id='10000000-0000-4000-8000-000000000002';raise exception 'direct child final status accepted';exception when sqlstate '55000' then null;end;end$$;
do $$begin begin update public.surat_signatures set is_signed=true where id='60000000-0000-4000-8000-000000000001';raise exception 'signature passed unfinished recommendation';exception when sqlstate '55000' then null;end;end$$;
select public.handle_approve_surat_v2('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',null,'child-stamped-v2.xlsx');
do $$begin
 assert(select status='PDF_PENDING' and file_path='child-stamped-v2.xlsx' and pdf_path is null from public.surat_registrasi where id='10000000-0000-4000-8000-000000000002'),'stamped source not held PDF_PENDING';
 assert(select is_signed and file_path_snap='child-stamped-v2.xlsx' from public.surat_signatures where id='60000000-0000-4000-8000-000000000002'),'final signature not stored';
 assert(select count(*)=1 and bool_and(signature_id is null and source_file_path='child-stamped-v2.xlsx' and status='queued' and recommendation_content_fingerprint=public.recommendation_content_fingerprint(render_payload) and render_payload#>>'{workbook_source,path}'='child-stamped-v2.xlsx') from public.document_pdf_jobs where surat_id='10000000-0000-4000-8000-000000000002'),'approval transition did not atomically snapshot canonical job';
 assert(select count(*)=0 from public.notifications where data->>'event_type'='recommendation_initial_finalized'),'notification emitted before PDF';
 assert(select status='submitted' from public.surat_recommendation_tasks where id='30000000-0000-4000-8000-000000000001'),'task changed before PDF';
end$$;
set role service_role;
select public.enqueue_recommendation_pdf_job('10000000-0000-4000-8000-000000000002','child-stamped-v2.xlsx',null,false);
select public.enqueue_recommendation_pdf_job('10000000-0000-4000-8000-000000000002','child-stamped-v2.xlsx',null,false);
do $$begin assert(select count(*)=1 from public.document_pdf_jobs where surat_id='10000000-0000-4000-8000-000000000002' and status='queued'),'atomic enqueue duplicated active canonical job';end$$;
select * from public.claim_document_pdf_jobs('worker-a',1,3,interval '5 minutes');
do $$declare j uuid; f text; lease uuid;begin
 select id,recommendation_content_fingerprint,lease_token into j,f,lease from public.document_pdf_jobs where surat_id='10000000-0000-4000-8000-000000000002' and status='processing';
 begin perform public.publish_document_pdf_job(j,'child-stamped-v2.xlsx',f,'pdf/bad.pdf',gen_random_uuid(),'dokumen_surat','pdf/bad.pdf','external');raise exception 'foreign lease accepted';exception when insufficient_privilege then null;end;
 update public.surat_registrasi set form_input_data=jsonb_set(form_input_data,'{recommendation_multi_detail,items,1,details,0,quantity}','3') where id='10000000-0000-4000-8000-000000000002';
 begin perform public.publish_document_pdf_job(j,'child-stamped-v2.xlsx',f,'pdf/stale.pdf',lease,'dokumen_surat','pdf/stale.pdf','external');raise exception 'stale fingerprint accepted';exception when serialization_failure then null;end;
 assert(select status='PDF_PENDING' and pdf_path is null from public.surat_registrasi where id='10000000-0000-4000-8000-000000000002'),'stale publication finalized child';
 perform public.fail_document_pdf_job(j,lease,'stale snapshot',1);
end$$;
select public.enqueue_recommendation_pdf_job('10000000-0000-4000-8000-000000000002','child-stamped-v2.xlsx',null,true);
select * from public.claim_document_pdf_jobs('worker-a',1,3,interval '5 minutes');
do $$declare j uuid; f text; lease uuid;begin select id,recommendation_content_fingerprint,lease_token into j,f,lease from public.document_pdf_jobs where surat_id='10000000-0000-4000-8000-000000000002' and status='processing';perform public.publish_document_pdf_job(j,'child-stamped-v2.xlsx',f,'pdf/stable.pdf',lease,'dokumen_surat','pdf/stable.pdf','external');perform public.publish_document_pdf_job(j,'child-stamped-v2.xlsx',f,'pdf/stable.pdf',lease,'dokumen_surat','pdf/stable.pdf','external');end$$;
reset role;
do $$begin
 assert public.recommendation_pdf_is_current('10000000-0000-4000-8000-000000000002'),'first publication became stale after parent finalization';
 perform public.ensure_recommendation_file_view_token(repeat('f',64),'10000000-0000-4000-8000-000000000002','dokumen_surat','pdf/stable.pdf','external',null);
 update public.surat_registrasi set current_step=3 where id='10000000-0000-4000-8000-000000000001';
 update public.surat_signatures set is_signed=true where id='60000000-0000-4000-8000-000000000001';
 update public.surat_signatures set is_signed=false where id='60000000-0000-4000-8000-000000000001';
 perform public.revoke_recommendation_file_view_token('10000000-0000-4000-8000-000000000002','first publication assertion complete',null);
end$$;
do $$begin
 assert(select status='DONE' and pdf_path='pdf/stable.pdf' from public.surat_registrasi where id='10000000-0000-4000-8000-000000000002'),'publish did not atomically finalize child';
 assert(select count(*)=1 from public.notifications where data->>'event_type'='recommendation_initial_finalized'),'DONE trigger did not notify';
 assert(select message like '%asset-1: Tidak ekonomis%' from public.notifications where data->>'event_type'='recommendation_initial_finalized'),'combined rejected parent missing';
 assert(select data_snapshot#>>'{recommendation,items,1,details,0,quantity}'='3' from public.surat_registrasi where id='10000000-0000-4000-8000-000000000001'),'parent final snapshot was not refreshed';
end$$;
update public.surat_registrasi set form_input_data=jsonb_set(form_input_data,'{recommendation_multi_detail,items,1,details,0,quantity}','4') where id='10000000-0000-4000-8000-000000000002';
set role service_role;
select public.enqueue_recommendation_pdf_job('10000000-0000-4000-8000-000000000002','child-stamped-v2.xlsx',null,true);
select * from public.claim_document_pdf_jobs('worker-a',1,3,interval '5 minutes');
do $$declare j uuid; f text; lease uuid; active_id uuid;begin
 select id,recommendation_content_fingerprint,lease_token into j,f,lease from public.document_pdf_jobs where surat_id='10000000-0000-4000-8000-000000000002' and status='processing';
 select id into active_id from public.enqueue_recommendation_pdf_job('10000000-0000-4000-8000-000000000002','child-stamped-v2.xlsx',null,true);
 assert active_id=j,'duplicate refresh replaced healthy active job';
 perform public.publish_document_pdf_job(j,'child-stamped-v2.xlsx',f,'pdf/final-refresh.pdf',lease,'dokumen_surat','pdf/final-refresh.pdf','external');
 assert(select status='DONE' and pdf_path='pdf/final-refresh.pdf' from public.surat_registrasi where id='10000000-0000-4000-8000-000000000002'),'DONE recommendation refresh failed';
 perform public.enqueue_recommendation_pdf_job('10000000-0000-4000-8000-000000000002','child-stamped-v2.xlsx',null,true);
 perform public.claim_document_pdf_jobs('worker-a',1,3,interval '5 minutes');
 select id,recommendation_content_fingerprint,lease_token into j,f,lease from public.document_pdf_jobs where surat_id='10000000-0000-4000-8000-000000000002' and status='processing';
 update public.surat_registrasi set form_input_data=jsonb_set(form_input_data,'{recommendation_multi_detail,items,1,details,0,quantity}','5') where id='10000000-0000-4000-8000-000000000002';
 begin perform public.publish_document_pdf_job(j,'child-stamped-v2.xlsx',f,'pdf/stale-final-refresh.pdf',lease,'dokumen_surat','pdf/stale-final-refresh.pdf','external');raise exception 'stale final fingerprint accepted';exception when serialization_failure then null;end;
 assert(select status='DONE' and pdf_path='pdf/final-refresh.pdf' from public.surat_registrasi where id='10000000-0000-4000-8000-000000000002'),'stale refresh changed final recommendation';
end$$;
reset role;

-- Noncanonical completion atomically fences pointer publication by lease.
insert into public.document_pdf_jobs(id,surat_id,source_file_path,status,locked_by,locked_at,lease_token,lease_expires_at)
values('80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','ordinary.xlsx','processing','worker-current',now(),'81000000-0000-4000-8000-000000000001',now()+interval '5 minutes');
set role service_role;
do $$begin
 begin perform public.complete_document_pdf_job('80000000-0000-4000-8000-000000000001','pdf/stale-worker.pdf','81000000-0000-4000-8000-000000000099');raise exception 'stale lease completed ordinary PDF';exception when insufficient_privilege then null;end;
 assert(select pdf_path is null from public.surat_registrasi where id='10000000-0000-4000-8000-000000000001'),'stale lease updated surat pointer';
 perform public.complete_document_pdf_job('80000000-0000-4000-8000-000000000001','pdf/current-worker.pdf','81000000-0000-4000-8000-000000000001');
 assert(select pdf_path='pdf/current-worker.pdf' from public.surat_registrasi where id='10000000-0000-4000-8000-000000000001'),'current lease did not update surat pointer';
 perform public.complete_document_pdf_job('80000000-0000-4000-8000-000000000001','pdf/current-worker.pdf','81000000-0000-4000-8000-000000000001');
 assert(select status='done' and pdf_url='pdf/current-worker.pdf' from public.document_pdf_jobs where id='80000000-0000-4000-8000-000000000001'),'lost response retry was not idempotent';
end$$;
reset role;

insert into public.document_pdf_jobs(id,surat_id,signature_id,source_file_path,status,attempt_count,locked_by,locked_at,lease_token,lease_expires_at)
values('80000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','signature.xlsx','processing',1,'worker-old',now()-interval '10 minutes','81000000-0000-4000-8000-000000000002',now()-interval '5 minutes');
set role service_role;
select * from public.claim_document_pdf_jobs('worker-new',1,3,interval '5 minutes');
do $$declare new_lease uuid;begin
 select lease_token into new_lease from public.document_pdf_jobs where id='80000000-0000-4000-8000-000000000002';
 begin perform public.complete_document_pdf_job('80000000-0000-4000-8000-000000000002','pdf/old-worker.pdf','81000000-0000-4000-8000-000000000002');raise exception 'old worker completed reclaimed PDF';exception when insufficient_privilege then null;end;
 assert(select pdf_path_snap is null from public.surat_signatures where id='60000000-0000-4000-8000-000000000001'),'old worker updated signature pointer after reclaim';
 perform public.complete_document_pdf_job('80000000-0000-4000-8000-000000000002','pdf/new-worker.pdf',new_lease);
 assert(select pdf_path_snap='pdf/new-worker.pdf' and file_path_snap is null from public.surat_signatures where id='60000000-0000-4000-8000-000000000001'),'reclaimed current lease did not update signature pointer';
end$$;
reset role;

insert into public.document_pdf_jobs(surat_id,source_file_path,status,attempt_count,locked_by,locked_at,lease_token,lease_expires_at)
values
('10000000-0000-4000-8000-000000000001','stale.xlsx','processing',1,'dead-worker',now()-interval '10 minutes',gen_random_uuid(),now()-interval '5 minutes'),
('10000000-0000-4000-8000-000000000001','null-lock.xlsx','processing',1,'dead-worker',null,null,null),
('10000000-0000-4000-8000-000000000001','exhausted-queued.xlsx','queued',3,null,null,null,null),
('10000000-0000-4000-8000-000000000001','exhausted-processing.xlsx','processing',3,'dead-worker',now()-interval '10 minutes',gen_random_uuid(),now()-interval '5 minutes');
set role service_role;
select * from public.claim_document_pdf_jobs('worker-reclaimer',2,3,interval '5 minutes');
do $$begin
 assert(select count(*)=2 and count(distinct lease_token)=2 and bool_and(status='processing' and attempt_count=2 and lease_expires_at>now()) from public.document_pdf_jobs where source_file_path in ('stale.xlsx','null-lock.xlsx')),'stale/null claim did not issue unique forward lease';
 assert(select count(*)=2 and bool_and(status='failed' and finished_at is not null) from public.document_pdf_jobs where source_file_path like 'exhausted-%'),'exhausted queued/processing jobs not terminalized';
end$$;
reset role;

-- DONE pointers become stale whenever fresh render inputs differ, and republishing restores access.
do $$begin
 assert not public.recommendation_pdf_is_current('10000000-0000-4000-8000-000000000002'),'stale child JSONB remained current';
 begin perform public.ensure_recommendation_file_view_token(repeat('a',64),'10000000-0000-4000-8000-000000000002','dokumen_surat','pdf/final-refresh.pdf','external',null);raise exception 'bearer minted for stale child JSONB';exception when sqlstate '55000' then null;end;
end$$;
set role service_role;
select public.enqueue_recommendation_pdf_job('10000000-0000-4000-8000-000000000002','child-stamped-v2.xlsx',null,true);
select * from public.claim_document_pdf_jobs('worker-currentness',1,3,interval '5 minutes');
do $$declare j uuid;f text;lease uuid;begin select id,recommendation_content_fingerprint,lease_token into j,f,lease from public.document_pdf_jobs where surat_id='10000000-0000-4000-8000-000000000002' and status='processing' and locked_by='worker-currentness';perform public.publish_document_pdf_job(j,'child-stamped-v2.xlsx',f,'pdf/child-jsonb-refresh.pdf',lease,'dokumen_surat','pdf/child-jsonb-refresh.pdf','external');end$$;
reset role;
select public.ensure_recommendation_file_view_token(repeat('a',64),'10000000-0000-4000-8000-000000000002','dokumen_surat','pdf/child-jsonb-refresh.pdf','external',null);
do $$begin
 assert public.recommendation_pdf_is_current('10000000-0000-4000-8000-000000000002'),'child JSONB refresh did not restore current PDF';
 assert(select count(*)=1 and bool_and(token_id is not null and surat_id='10000000-0000-4000-8000-000000000002' and bucket='dokumen_surat' and object_path='pdf/child-jsonb-refresh.pdf' and storage_origin='external') from public.consume_file_view_token(repeat('a',64))),'consume RPC did not return audited token fields';
end$$;

update public.surat_registrasi set form_input_data=form_input_data||'{"parent_render_revision":1}'::jsonb where id='10000000-0000-4000-8000-000000000001';
do $$begin
 assert not public.recommendation_pdf_is_current('10000000-0000-4000-8000-000000000002'),'stale parent JSONB remained current';
 assert(select count(*)=0 from public.consume_file_view_token(repeat('a',64))),'bearer resolved stale parent JSONB';
 begin update public.surat_registrasi set current_step=current_step+1 where id='10000000-0000-4000-8000-000000000001';raise exception 'parent guard accepted stale PDF';exception when sqlstate '55000' then null;end;
end$$;
set role service_role;
select public.enqueue_recommendation_pdf_job('10000000-0000-4000-8000-000000000002','child-stamped-v2.xlsx',null,true);
select * from public.claim_document_pdf_jobs('worker-currentness',1,3,interval '5 minutes');
do $$declare j uuid;f text;lease uuid;begin select id,recommendation_content_fingerprint,lease_token into j,f,lease from public.document_pdf_jobs where surat_id='10000000-0000-4000-8000-000000000002' and status='processing' and locked_by='worker-currentness';perform public.publish_document_pdf_job(j,'child-stamped-v2.xlsx',f,'pdf/parent-jsonb-refresh.pdf',lease,'dokumen_surat','pdf/parent-jsonb-refresh.pdf','external');end$$;
reset role;
do $$declare child_form jsonb;child_snapshot jsonb;parent_form jsonb;parent_snapshot jsonb;child_source text;parent_source text;child_attachment uuid;parent_attachment uuid;begin
 assert public.recommendation_pdf_is_current('10000000-0000-4000-8000-000000000002'),'parent JSONB refresh did not restore current PDF';
 select form_input_data,data_snapshot,file_path into child_form,child_snapshot,child_source from public.surat_registrasi where id='10000000-0000-4000-8000-000000000002';
 select form_input_data,data_snapshot,file_path into parent_form,parent_snapshot,parent_source from public.surat_registrasi where id='10000000-0000-4000-8000-000000000001';
 update public.surat_registrasi set data_snapshot=data_snapshot||'{"input":{"recommendation_items":[{"id":"snapshot-render-input"}]}}'::jsonb where id='10000000-0000-4000-8000-000000000002';
 assert not public.recommendation_pdf_is_current('10000000-0000-4000-8000-000000000002'),'child snapshot mutation remained current';
 update public.surat_registrasi set data_snapshot=child_snapshot where id='10000000-0000-4000-8000-000000000002';
 update public.surat_registrasi set data_snapshot=data_snapshot||'{"recommendation":{"items":[{"id":"derived"}]},"recommendation_decisions":[{"id":"derived"}],"finalized_at":"2099-01-01T00:00:00Z"}'::jsonb where id='10000000-0000-4000-8000-000000000001';
 assert public.recommendation_pdf_is_current('10000000-0000-4000-8000-000000000002'),'derived parent recommendation snapshot staled PDF';
 update public.surat_registrasi set data_snapshot=parent_snapshot where id='10000000-0000-4000-8000-000000000001';
 insert into public.surat_attachments(surat_id,file_url,file_size,file_type) values('10000000-0000-4000-8000-000000000002','child-proof.jpg',1,'image/jpeg') returning id into child_attachment;
 assert not public.recommendation_pdf_is_current('10000000-0000-4000-8000-000000000002'),'child attachment mutation remained current';
 delete from public.surat_attachments where id=child_attachment;
 insert into public.surat_attachments(surat_id,file_url,file_size,file_type) values('10000000-0000-4000-8000-000000000001','parent-proof.jpg',1,'image/jpeg') returning id into parent_attachment;
 assert not public.recommendation_pdf_is_current('10000000-0000-4000-8000-000000000002'),'parent attachment mutation remained current';
 delete from public.surat_attachments where id=parent_attachment;
 update public.surat_registrasi set file_path='child-mutated.xlsx' where id='10000000-0000-4000-8000-000000000002';
 assert not public.recommendation_pdf_is_current('10000000-0000-4000-8000-000000000002'),'child source mutation remained current';
 update public.surat_registrasi set file_path=child_source where id='10000000-0000-4000-8000-000000000002';
 update public.surat_registrasi set file_path='parent-mutated.xlsx' where id='10000000-0000-4000-8000-000000000001';
 assert not public.recommendation_pdf_is_current('10000000-0000-4000-8000-000000000002'),'parent source mutation remained current';
 update public.surat_registrasi set file_path=parent_source where id='10000000-0000-4000-8000-000000000001';
 assert public.recommendation_pdf_is_current('10000000-0000-4000-8000-000000000002'),'restored render inputs did not restore current PDF';
end$$;

-- Last pre-POST fence validates attempt-owned links against durable logical references.
insert into public.marison_outbound_dispatches(id,surat_id,environment,kind,endpoint,idempotency_key,status,payload,payload_body,payload_hash,payload_built_at,contract_version,lease_token,lease_acquired_at,lease_expires_at)
values('70000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001','staging','asset','/asset-purchase-requests','rec03-marker-fence','processing','{"items":[{"attachments":[{"type":"sigap_recommendation_pdf","surat_id":"10000000-0000-4000-8000-000000000002"}]},{"attachments":[{"type":"sigap_recommendation_pdf","surat_id":"10000000-0000-4000-8000-000000000002"}]}]}','{}',repeat('7',64),now(),'v1','71000000-0000-4000-8000-000000000007',now(),now()+interval '5 minutes');
set role service_role;
select * from public.mint_recommendation_file_view_token(repeat('7',64),'10000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000007','71000000-0000-4000-8000-000000000007','72000000-0000-4000-8000-000000000007',null);
do $$begin
 begin perform public.mark_marison_outbound_post_started('70000000-0000-4000-8000-000000000007','71000000-0000-4000-8000-000000000007','72000000-0000-4000-8000-000000000099');raise exception 'attempt mismatch passed marker';exception when sqlstate '55000' then null;end;
 begin update public.file_view_tokens set revoked_at=now() where token_hash=repeat('7',64);perform public.mark_marison_outbound_post_started('70000000-0000-4000-8000-000000000007','71000000-0000-4000-8000-000000000007','72000000-0000-4000-8000-000000000007');raise exception 'revoked token passed marker';exception when sqlstate '55000' then null;end;
 begin update public.surat_linked_documents set status='cancelled' where child_surat_id='10000000-0000-4000-8000-000000000002';perform public.mark_marison_outbound_post_started('70000000-0000-4000-8000-000000000007','71000000-0000-4000-8000-000000000007','72000000-0000-4000-8000-000000000007');raise exception 'cancelled link passed marker';exception when sqlstate '55000' then null;end;
 begin update public.surat_registrasi set form_input_data=jsonb_set(form_input_data,'{recommendation_multi_detail,items,1,details,0,quantity}','6') where id='10000000-0000-4000-8000-000000000002';perform public.mark_marison_outbound_post_started('70000000-0000-4000-8000-000000000007','71000000-0000-4000-8000-000000000007','72000000-0000-4000-8000-000000000007');raise exception 'stale PDF passed marker';exception when sqlstate '55000' then null;end;
 begin update public.surat_registrasi set pdf_object_path='pdf/marker-moved.pdf' where id='10000000-0000-4000-8000-000000000002';perform public.mark_marison_outbound_post_started('70000000-0000-4000-8000-000000000007','71000000-0000-4000-8000-000000000007','72000000-0000-4000-8000-000000000007');raise exception 'changed coordinates passed marker';exception when sqlstate '55000' then null;end;
 assert(select post_started_at is null from public.marison_outbound_dispatches where id='70000000-0000-4000-8000-000000000007'),'rejected marker set POST evidence';
 assert(select count(*)=1 from public.file_view_tokens where transport_attempt_id='72000000-0000-4000-8000-000000000007' and revoked_at is null),'same-link cache minted more than one token';
 perform public.mark_marison_outbound_post_started('70000000-0000-4000-8000-000000000007','71000000-0000-4000-8000-000000000007','72000000-0000-4000-8000-000000000007');
 assert(select post_started_at is not null from public.marison_outbound_dispatches where id='70000000-0000-4000-8000-000000000007'),'valid cached token did not pass marker';
end$$;
reset role;
delete from public.file_view_token_audit where token_hash=repeat('7',64);
delete from public.file_view_tokens where token_hash=repeat('7',64);
delete from public.marison_outbound_dispatches where id='70000000-0000-4000-8000-000000000007';

update public.surat_registrasi set status='DONE' where id='10000000-0000-4000-8000-000000000001';
update public.surat_registrasi set form_input_data=jsonb_set(form_input_data,'{recommendation_multi_detail,items}','[{"id":"asset-1","status":"not_recommended","rejection_reason":"No stock","details":[]}]') where id='10000000-0000-4000-8000-000000000002';
do $$declare r jsonb;begin
 select public.ensure_marison_outbound_dispatch('10000000-0000-4000-8000-000000000001','staging') into r;
 assert r->>'skipped'='true' and r->>'no_dispatch'='true' and r->>'code'='all_recommendations_rejected','all rejected ensure result not structured';
 assert(select count(*)=0 from public.marison_outbound_dispatches where surat_id='10000000-0000-4000-8000-000000000001'),'new all rejected created dispatch row';
 assert(select status='skipped' and payload='{}'::jsonb and payload_hash=repeat('e',64) and lease_token is null and post_started_at is null from public.marison_outbound_dispatches where id='70000000-0000-4000-8000-000000000099'),'existing pre-POST row not swept while retaining audit';
 assert(select count(*)=4 and bool_and(status<>'skipped') from public.marison_outbound_dispatches where id in ('70000000-0000-4000-8000-000000000091','70000000-0000-4000-8000-000000000092','70000000-0000-4000-8000-000000000093','70000000-0000-4000-8000-000000000094')),'sweep changed live or post-evidence dispatch';
end$$;

insert into public.marison_outbound_dispatches(id,surat_id,environment,kind,endpoint,idempotency_key,status,payload,payload_body,payload_hash,payload_built_at,contract_version,post_started_at,error_code)
values('70000000-0000-4000-8000-000000000098','10000000-0000-4000-8000-000000000001','staging','asset','/asset-purchase-requests','rec03-replacement-source','failed_terminal','{}','{}',repeat('f',64),now(),'v1',now(),'marison_http_422');
do $$declare r jsonb;begin
 select public.create_marison_outbound_replacement('70000000-0000-4000-8000-000000000098','00000000-0000-4000-8000-000000000003','all rejected') into r;
 assert r->>'skipped'='true' and r->>'no_dispatch'='true','all rejected replacement result not structured';
 assert(select count(*)=1 from public.marison_outbound_dispatches where surat_id='10000000-0000-4000-8000-000000000001'),'all rejected replacement created row';
 assert(select count(*)=0 from public.marison_outbound_replacement_events),'all rejected replacement created audit row';
end$$;

-- Old prepared/inflight rows are re-evaluated from canonical or legacy snapshots at last pre-POST boundary.
update public.surat_linked_documents set status='cancelled' where parent_surat_id='10000000-0000-4000-8000-000000000001' and link_type='recommendation';
update public.surat_registrasi set data_snapshot='{"recommendation_decisions":[{"recommendation_action":"service"}]}' where id='10000000-0000-4000-8000-000000000001';
insert into public.marison_outbound_dispatches(id,surat_id,environment,kind,endpoint,idempotency_key,status,payload,payload_body,payload_hash,payload_built_at,contract_version,lease_token,lease_acquired_at,lease_expires_at)
values('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','staging','asset','/asset-purchase-requests','rec03-prepared','processing','{}','{}',repeat('c',64),now(),'v1','71000000-0000-4000-8000-000000000001',now(),now()+interval '1 minute');
update public.surat_registrasi set data_snapshot='{"recommendation_decisions":[{"recommendation_action":"rejected"}]}' where id='10000000-0000-4000-8000-000000000001';
do $$declare r jsonb;begin select public.mark_marison_outbound_post_started('70000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001') into r;assert r->>'skipped'='true','legacy all-rejected was not skipped';assert(select status='skipped' and payload='{}'::jsonb and payload_hash=repeat('c',64) and lease_token is null and post_started_at is null from public.marison_outbound_dispatches where id='70000000-0000-4000-8000-000000000001'),'prepared audit changed while skipping';end$$;
update public.surat_registrasi set data_snapshot='{"recommendation_decisions":[{"recommendation_action":"rejected"},{"recommendation_action":"service"}]}' where id='10000000-0000-4000-8000-000000000001';
insert into public.marison_outbound_dispatches(id,surat_id,environment,kind,endpoint,idempotency_key,status,payload,payload_body,payload_hash,payload_built_at,contract_version,lease_token,lease_acquired_at,lease_expires_at)
values('70000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','staging','asset','/asset-purchase-requests','rec03-mixed','processing','{}','{}',repeat('d',64),now(),'v1','71000000-0000-4000-8000-000000000002',now(),now()+interval '1 minute');
do $$declare r jsonb;begin select public.mark_marison_outbound_post_started('70000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000002') into r;assert r->>'post_started'='true','mixed recommendation did not proceed';assert(select post_started_at is not null from public.marison_outbound_dispatches where id='70000000-0000-4000-8000-000000000002'),'POST boundary missing';update public.surat_registrasi set data_snapshot='{"recommendation_decisions":[{"recommendation_action":"rejected"}]}' where id='10000000-0000-4000-8000-000000000001';begin perform public.mark_marison_outbound_post_started('70000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000002');raise exception 'post-started row rewritten';exception when sqlstate '55000' then null;end;assert(select status='processing' and post_started_at is not null from public.marison_outbound_dispatches where id='70000000-0000-4000-8000-000000000002'),'post-started audit evidence changed';update public.marison_outbound_dispatches set status='outcome_unknown',lease_token=null,lease_acquired_at=null,lease_expires_at=null where id='70000000-0000-4000-8000-000000000002';begin perform public.mark_marison_outbound_post_started('70000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000002');raise exception 'outcome_unknown row rewritten';exception when sqlstate '55000' then null;end;assert(select status='outcome_unknown' and post_started_at is not null and payload_hash=repeat('d',64) from public.marison_outbound_dispatches where id='70000000-0000-4000-8000-000000000002'),'outcome_unknown audit evidence changed';end$$;

select 'REC-03 recommendation SQL integration passed' as result;
