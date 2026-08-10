-- REC-03 disposable integration assertions. Never run against shared environments.
insert into public.profiles(id,role,is_active) values
('00000000-0000-4000-8000-000000000001','user',true),('00000000-0000-4000-8000-000000000002','user',true),
('00000000-0000-4000-8000-000000000003','admin',true),('00000000-0000-4000-8000-000000000004','admin',false);
insert into public.surat_reservations(id,status) values('20000000-0000-4000-8000-000000000001','PENDING'),('20000000-0000-4000-8000-000000000002','PENDING');
insert into public.surat_registrasi(id,created_by,judul_surat,status,file_path,current_step,reservation_id,form_input_data) values
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','Parent','PROSES','parent.xlsx',2,null,'{"request_category":"asset"}'),
('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Canonical child','PROSES','child-v1.xlsx',1,'20000000-0000-4000-8000-000000000001',
'{"linked_document_type":"recommendation","linked_parent_surat_id":"10000000-0000-4000-8000-000000000001","task_id":"30000000-0000-4000-8000-000000000001","recommendation_multi_detail":{"version":1,"items":[{"id":"asset-1","order":0,"status":"not_recommended","applicant_original":{"name":"Server","quantity":1,"notes":""},"location":"Gudang","pic":"Budi","rejection_reason":"Tidak ekonomis","details":[]},{"id":"asset-2","order":1,"status":"recommended","applicant_original":{"name":"Komputer","quantity":2,"notes":""},"location":"","pic":"","rejection_reason":"","details":[{"id":"detail-1","order":0,"parent_item_id":"asset-2","name":"RAM 32 GB","quantity":2,"action":"service","description":"Servis","description_manually_edited":false,"notes":"","estimated_price":0,"attachments":[{"id":"photo-1","order":0,"storage_path":"recommendation/photo.jpg"}],"reference_links":[{"id":"ref-1","order":0,"url":"https://example.test/item"}]}]}]}}'),
('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Wrong child','PROSES','wrong.xlsx',1,'20000000-0000-4000-8000-000000000002',
'{"linked_document_type":"recommendation","linked_parent_surat_id":"10000000-0000-4000-8000-000000000099","recommendation_items":[{"nama_barang":"Legacy","jumlah":1,"recommendation_action":"service"}]}'),
('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','All rejected','PROSES','reject.xlsx',1,'20000000-0000-4000-8000-000000000002',
'{"linked_document_type":"recommendation","linked_parent_surat_id":"10000000-0000-4000-8000-000000000001","task_id":"30000000-0000-4000-8000-000000000001","recommendation_multi_detail":{"version":1,"items":[{"id":"asset-x","status":"not_recommended","location":"Site","pic":"Ani","rejection_reason":"Rusak total","details":[]}]}}');
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
end$$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$begin begin perform public.complete_recommendation_task('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');raise exception 'unauthorized accepted';exception when insufficient_privilege then null;end;end$$;
do $$begin begin perform public.finalize_recommendation_revision_if_needed('10000000-0000-4000-8000-000000000002');raise exception 'unauthorized direct finalize accepted';exception when insufficient_privilege then null;end;end$$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
update public.surat_registrasi set form_input_data=form_input_data||'{"recommendation_multi_detail":{"broken":true},"recommendation_items":[{"nama_barang":"Legacy","jumlah":1}]}'::jsonb where id='10000000-0000-4000-8000-000000000004';
do $$begin begin perform public.complete_recommendation_task('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004');raise exception 'malformed canonical downgraded to legacy';exception when invalid_parameter_value then null;end;end$$;
do $$begin begin perform public.complete_recommendation_task('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003');raise exception 'wrong linkage accepted';exception when invalid_parameter_value then null;end;end$$;
select public.complete_recommendation_task('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');
do $$declare t timestamptz;begin select submitted_at into t from public.surat_recommendation_tasks where id='30000000-0000-4000-8000-000000000001';perform pg_sleep(.01);perform public.complete_recommendation_task('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');assert(select submitted_at=t from public.surat_recommendation_tasks where id='30000000-0000-4000-8000-000000000001'),'same child not idempotent';begin perform public.complete_recommendation_task('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003');raise exception 'different child accepted';exception when sqlstate '55000' then null;end;end$$;

-- Parent approval guard and final stamped source orchestration.
do $$begin begin update public.surat_registrasi set status='DONE' where id='10000000-0000-4000-8000-000000000001';raise exception 'final approval passed unfinished child';exception when sqlstate '55000' then null;end;end$$;
do $$begin begin update public.surat_signatures set is_signed=true where id='60000000-0000-4000-8000-000000000001';raise exception 'signature passed unfinished recommendation';exception when sqlstate '55000' then null;end;end$$;
select public.handle_approve_surat_v2('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',null,'child-stamped-v2.xlsx');
do $$begin
 assert(select status='PDF_PENDING' and file_path='child-stamped-v2.xlsx' and pdf_path is null from public.surat_registrasi where id='10000000-0000-4000-8000-000000000002'),'stamped source not held PDF_PENDING';
 assert(select is_signed and file_path_snap='child-stamped-v2.xlsx' from public.surat_signatures where id='60000000-0000-4000-8000-000000000002'),'final signature not stored';
 assert(select count(*)=1 and bool_and(signature_id is null and source_file_path='child-stamped-v2.xlsx' and status='queued' and recommendation_content_fingerprint is not null) from public.document_pdf_jobs where surat_id='10000000-0000-4000-8000-000000000002'),'approval transition did not atomically create canonical job';
 assert(select count(*)=0 from public.notifications where data->>'event_type'='recommendation_initial_finalized'),'notification emitted before PDF';
 assert(select status='submitted' from public.surat_recommendation_tasks where id='30000000-0000-4000-8000-000000000001'),'task changed before PDF';
end$$;
set role service_role;
select public.enqueue_recommendation_pdf_job('10000000-0000-4000-8000-000000000002','child-stamped-v2.xlsx',null,false);
select public.enqueue_recommendation_pdf_job('10000000-0000-4000-8000-000000000002','child-stamped-v2.xlsx',null,false);
do $$begin assert(select count(*)=1 from public.document_pdf_jobs where surat_id='10000000-0000-4000-8000-000000000002' and status='queued'),'atomic enqueue duplicated active canonical job';end$$;
update public.document_pdf_jobs set status='processing',locked_by='worker-a',attempt_count=1 where surat_id='10000000-0000-4000-8000-000000000002' and status='queued';
do $$declare j uuid; f text;begin
 select id,recommendation_content_fingerprint into j,f from public.document_pdf_jobs where surat_id='10000000-0000-4000-8000-000000000002' and status='processing';
 begin perform public.publish_document_pdf_job(j,'child-stamped-v2.xlsx',f,'pdf/bad.pdf','worker-b');raise exception 'foreign worker lock accepted';exception when insufficient_privilege then null;end;
 update public.surat_registrasi set form_input_data=jsonb_set(form_input_data,'{recommendation_multi_detail,items,1,details,0,quantity}','3') where id='10000000-0000-4000-8000-000000000002';
 begin perform public.publish_document_pdf_job(j,'child-stamped-v2.xlsx',f,'pdf/stale.pdf','worker-a');raise exception 'stale fingerprint accepted';exception when serialization_failure then null;end;
 assert(select status='PDF_PENDING' and pdf_path is null from public.surat_registrasi where id='10000000-0000-4000-8000-000000000002'),'stale publication finalized child';
 update public.document_pdf_jobs set status='failed',locked_by=null,error_message='stale' where id=j;
end$$;
select public.enqueue_recommendation_pdf_job('10000000-0000-4000-8000-000000000002','child-stamped-v2.xlsx',null,true);
update public.document_pdf_jobs set status='processing',locked_by='worker-a',attempt_count=1 where surat_id='10000000-0000-4000-8000-000000000002' and status='queued';
do $$declare j uuid; f text;begin select id,recommendation_content_fingerprint into j,f from public.document_pdf_jobs where surat_id='10000000-0000-4000-8000-000000000002' and status='processing';perform public.publish_document_pdf_job(j,'child-stamped-v2.xlsx',f,'pdf/stable.pdf','worker-a');end$$;
reset role;
update public.surat_registrasi set current_step=3 where id='10000000-0000-4000-8000-000000000001';
do $$begin
 assert(select status='DONE' and pdf_path='pdf/stable.pdf' from public.surat_registrasi where id='10000000-0000-4000-8000-000000000002'),'publish did not atomically finalize child';
 assert(select count(*)=1 from public.notifications where data->>'event_type'='recommendation_initial_finalized'),'DONE trigger did not notify';
 assert(select message like '%asset-1: Tidak ekonomis%' from public.notifications where data->>'event_type'='recommendation_initial_finalized'),'combined rejected parent missing';
 assert(select data_snapshot#>>'{recommendation,items,1,details,0,quantity}'='3' from public.surat_registrasi where id='10000000-0000-4000-8000-000000000001'),'parent final snapshot was not refreshed';
end$$;
update public.surat_registrasi set form_input_data=jsonb_set(form_input_data,'{recommendation_multi_detail,items,1,details,0,quantity}','4') where id='10000000-0000-4000-8000-000000000002';
set role service_role;
select public.enqueue_recommendation_pdf_job('10000000-0000-4000-8000-000000000002','child-stamped-v2.xlsx',null,true);
update public.document_pdf_jobs set status='processing',locked_by='worker-a' where surat_id='10000000-0000-4000-8000-000000000002' and status='queued';
do $$declare j uuid; f text;begin
 select id,recommendation_content_fingerprint into j,f from public.document_pdf_jobs where surat_id='10000000-0000-4000-8000-000000000002' and status='processing';
 perform public.publish_document_pdf_job(j,'child-stamped-v2.xlsx',f,'pdf/final-refresh.pdf','worker-a');
 assert(select status='DONE' and pdf_path='pdf/final-refresh.pdf' from public.surat_registrasi where id='10000000-0000-4000-8000-000000000002'),'DONE recommendation refresh failed';
 perform public.enqueue_recommendation_pdf_job('10000000-0000-4000-8000-000000000002','child-stamped-v2.xlsx',null,true);
 update public.document_pdf_jobs set status='processing',locked_by='worker-a' where surat_id='10000000-0000-4000-8000-000000000002' and status='queued';
 select id,recommendation_content_fingerprint into j,f from public.document_pdf_jobs where surat_id='10000000-0000-4000-8000-000000000002' and status='processing';
 update public.surat_registrasi set form_input_data=jsonb_set(form_input_data,'{recommendation_multi_detail,items,1,details,0,quantity}','5') where id='10000000-0000-4000-8000-000000000002';
 begin perform public.publish_document_pdf_job(j,'child-stamped-v2.xlsx',f,'pdf/stale-final-refresh.pdf','worker-a');raise exception 'stale final fingerprint accepted';exception when serialization_failure then null;end;
 assert(select status='DONE' and pdf_path='pdf/final-refresh.pdf' from public.surat_registrasi where id='10000000-0000-4000-8000-000000000002'),'stale refresh changed final recommendation';
end$$;
reset role;
select public.ensure_recommendation_file_view_token(repeat('a',64),'10000000-0000-4000-8000-000000000002','dokumen_surat','pdf/stable.pdf','external',null);
select public.ensure_recommendation_file_view_token(repeat('a',64),'10000000-0000-4000-8000-000000000002','dokumen_surat','pdf/changed.pdf','external','00000000-0000-4000-8000-000000000001');
do $$declare v_revoked boolean;begin
 assert(select count(*)=1 and bool_and(token_hash=repeat('a',64)) from public.file_view_tokens where surat_id='10000000-0000-4000-8000-000000000002' and purpose='external_marison_recommendation_pdf'),'stable token upsert raced or stored raw bearer';
 begin perform public.ensure_recommendation_file_view_token(repeat('b',64),'10000000-0000-4000-8000-000000000002','dokumen_surat','pdf/stable.pdf','external',null);raise exception 'second token identity accepted';exception when sqlstate '55000' then null;end;
 select public.revoke_recommendation_file_view_token('10000000-0000-4000-8000-000000000002','vendor access removed',null) into v_revoked;
 assert v_revoked,'token revoke failed';
 assert(select count(*)=1 from public.file_view_token_audit where action='revoked' and reason='vendor access removed'),'revoke audit missing';
 assert(select count(*)=0 from public.consume_file_view_token(repeat('a',64))),'revoked token resolved';
end$$;
update public.surat_registrasi set file_path='child-v2.xlsx' where id='10000000-0000-4000-8000-000000000002';
reset role;

update public.surat_registrasi set form_input_data=jsonb_set(form_input_data,'{recommendation_multi_detail,items}','[{"id":"asset-1","status":"not_recommended","rejection_reason":"No stock","details":[]}]') where id='10000000-0000-4000-8000-000000000002';
insert into public.marison_outbound_dispatches(surat_id,environment,kind,endpoint,idempotency_key,status,payload,payload_body,payload_hash,payload_built_at,contract_version)
values('10000000-0000-4000-8000-000000000001','staging','asset','/asset-purchase-requests','rec03-all-rejected','pending','{}','{}',repeat('a',64),now(),'v1');
insert into public.marison_outbound_dispatches(surat_id,environment,kind,endpoint,idempotency_key,status,payload,payload_body,payload_hash,payload_built_at,contract_version)
values('10000000-0000-4000-8000-000000000001','production','asset','/asset-purchase-requests','rec03-production','pending','{}','{}',repeat('b',64),now(),'v1');
do $$begin assert(select status='skipped' and skipped_code='all_recommendations_rejected' and endpoint='/asset-purchase-requests' and payload='{}'::jsonb and payload_hash=repeat('a',64) from public.marison_outbound_dispatches where idempotency_key='rec03-all-rejected'),'all rejected staging insert not skipped with audit payload';assert(select status='skipped' and skipped_code='all_recommendations_rejected' and endpoint='/asset-purchase-requests' and payload='{}'::jsonb from public.marison_outbound_dispatches where idempotency_key='rec03-production'),'all rejected production insert not skipped';end$$;

-- Old prepared/inflight rows are re-evaluated from canonical or legacy snapshots at last pre-POST boundary.
update public.surat_linked_documents set status='cancelled' where parent_surat_id='10000000-0000-4000-8000-000000000001' and link_type='recommendation';
update public.surat_registrasi set data_snapshot='{"recommendation_decisions":[{"recommendation_action":"service"}]}' where id='10000000-0000-4000-8000-000000000001';
insert into public.marison_outbound_dispatches(id,surat_id,environment,kind,endpoint,idempotency_key,status,payload,payload_body,payload_hash,payload_built_at,contract_version,lease_token,lease_acquired_at,lease_expires_at)
values('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','staging','asset','/asset-purchase-requests','rec03-prepared','processing','{}','{}',repeat('c',64),now(),'v1','71000000-0000-4000-8000-000000000001',now(),now()+interval '1 minute');
update public.surat_registrasi set data_snapshot='{"recommendation_decisions":[{"recommendation_action":"rejected"}]}' where id='10000000-0000-4000-8000-000000000001';
do $$declare r jsonb;begin select public.mark_marison_outbound_post_started('70000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001') into r;assert r->>'skipped'='true','legacy all-rejected was not skipped';assert(select status='skipped' and payload='{}'::jsonb and payload_hash=repeat('c',64) and lease_token is null and post_started_at is null from public.marison_outbound_dispatches where id='70000000-0000-4000-8000-000000000001'),'prepared audit changed while skipping';end$$;
update public.surat_registrasi set data_snapshot='{"recommendation_decisions":[{"recommendation_action":"rejected"},{"recommendation_action":"service"}]}' where id='10000000-0000-4000-8000-000000000001';
insert into public.marison_outbound_dispatches(id,surat_id,environment,kind,endpoint,idempotency_key,status,payload,payload_body,payload_hash,payload_built_at,contract_version,lease_token,lease_acquired_at,lease_expires_at)
values('70000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','staging','asset','/asset-purchase-requests','rec03-mixed','processing','{}','{}',repeat('d',64),now(),'v1','71000000-0000-4000-8000-000000000002',now(),now()+interval '1 minute');
do $$declare r jsonb;begin select public.mark_marison_outbound_post_started('70000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002') into r;assert r->>'post_started'='true','mixed recommendation did not proceed';assert(select post_started_at is not null from public.marison_outbound_dispatches where id='70000000-0000-4000-8000-000000000002'),'POST boundary missing';update public.surat_registrasi set data_snapshot='{"recommendation_decisions":[{"recommendation_action":"rejected"}]}' where id='10000000-0000-4000-8000-000000000001';begin perform public.mark_marison_outbound_post_started('70000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002');raise exception 'post-started row rewritten';exception when sqlstate '55000' then null;end;assert(select status='processing' and post_started_at is not null from public.marison_outbound_dispatches where id='70000000-0000-4000-8000-000000000002'),'post-started audit evidence changed';update public.marison_outbound_dispatches set status='outcome_unknown',lease_token=null,lease_acquired_at=null,lease_expires_at=null where id='70000000-0000-4000-8000-000000000002';begin perform public.mark_marison_outbound_post_started('70000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002');raise exception 'outcome_unknown row rewritten';exception when sqlstate '55000' then null;end;assert(select status='outcome_unknown' and post_started_at is not null and payload_hash=repeat('d',64) from public.marison_outbound_dispatches where id='70000000-0000-4000-8000-000000000002'),'outcome_unknown audit evidence changed';end$$;

select 'REC-03 recommendation SQL integration passed' as result;
