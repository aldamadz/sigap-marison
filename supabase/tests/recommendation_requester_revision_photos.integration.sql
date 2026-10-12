set role postgres;
insert into public.surat_registrasi(id,no_surat,created_by,judul_surat,current_step,file_path,form_input_data) values
  (keu10_test.id(9500),'001/TEST/PARENT/X/2026',keu10_test.id(1),'Parent',1,'native://parent','{}'),
  (keu10_test.id(9501),'005/TEST/REC/X/2026',keu10_test.id(1),'Recommendation',3,'native://recommendation',
   '{"items":[],"request_category":"asset","linked_document_type":"recommendation","linked_parent_surat_id":"00000000-0000-4000-8000-000000009500","linked_parent_no_surat":"001/TEST/PARENT/X/2026","recommendation_multi_detail":{"version":1,"items":[{"id":"parent","order":0,"status":"recommended","pic":"Tester","location":"IT","rejection_reason":"","applicant_original":{"name":"Tablet","quantity":1,"notes":""},"details":[{"id":"detail","order":0,"name":"Tablet","quantity":1,"action":"purchase_new","description":"Original","description_manually_edited":false,"notes":"","reference_links":[],"attachments":[{"id":"old-file","order":0,"source":"paste","caption":"photo.png","storage_path":"private://requester/photo.png","metadata":{"draft_file_id":"old-file"}},{"id":"old-file-2","order":1,"source":"upload","caption":"photo2.png","storage_path":"private://requester/photo2.png","metadata":{"draft_file_id":"old-file-2"}}]}]}]}}');
update public.surat_registrasi set form_input_data=jsonb_set(form_input_data,'{linked_parent_surat_id}',to_jsonb(keu10_test.id(9500)::text)) where id=keu10_test.id(9501);
insert into public.surat_linked_documents values(keu10_test.id(9502),keu10_test.id(9501),keu10_test.id(9500),'recommendation','active',3);
insert into public.surat_recommendation_tasks(id,parent_surat_id,submitted_surat_id,form_id,usage_id)
  values(keu10_test.id(9503),keu10_test.id(9500),keu10_test.id(9501),keu10_test.id(9510),keu10_test.id(9511));
insert into public.surat_signatures(id,surat_id,user_id,step_order,role_name,is_signed,signed_at,status,available_at) values
  (keu10_test.id(9504),keu10_test.id(9501),keu10_test.id(1),1,'membuat',true,now(),'APPROVED',now()),
  (keu10_test.id(9505),keu10_test.id(9501),keu10_test.id(3),3,'memeriksa',false,null,'PENDING',now());
insert into public.surat_attachments(surat_id,created_by,stage,signature_id,file_url,file_name,requirement_key) values
  (keu10_test.id(9501),keu10_test.id(1),'recommendation_item',null,'private://requester/photo.png','photo.png','recommendation_detail_detail'),
  (keu10_test.id(9501),keu10_test.id(1),'recommendation_item',null,'private://requester/photo2.png','photo2.png','recommendation_detail_detail'),
  (keu10_test.id(9501),keu10_test.id(3),'approval',keu10_test.id(9505),'private://examiner/photo.png','examiner.png','examiner');
create function keu10_test.simulate_old_recommendation_draft(p_id uuid) returns void language plpgsql security definer as $$
declare d public.surat_registration_drafts; s uuid; p jsonb;
begin
  select * into d from public.surat_registration_drafts where id=p_id;
  select surat_id into s from public.surat_revision_events where id=d.revision_event_id;
  insert into requester_revision_internal.permits values(txid_current(),s,'draft');
  p:=(d.payload-'recommendation_revision_photos_version')||jsonb_build_object('linkedDocumentContext',null);
  p:=jsonb_set(p,'{formData,form_input_data,recommendation_items}',
    '[{"detail_id":"detail","keterangan":"Saved specifications from legacy editor"}]');
  p:=jsonb_set(p,'{externalRevision,protectedAttachments}',(select jsonb_agg(to_jsonb(a)) from public.surat_attachments a where surat_id=s));
  update public.surat_registration_drafts set payload=p where id=p_id;
  delete from public.surat_registration_draft_files where draft_id=p_id;
  delete from requester_revision_internal.permits where transaction_id=txid_current() and surat_id=s;
end $$;
grant execute on function keu10_test.simulate_old_recommendation_draft(uuid) to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
insert into keu10_test.results(key,surat_id,event_id) values('recommendation-photos',keu10_test.id(9501),
  public.request_surat_process_revision(keu10_test.id(9501),keu10_test.id(9505),'requester',null,
    'Lengkapi spesifikasi warna tablet.','{"requester_edit_required":true}'));
select set_config('request.jwt.claim.sub',keu10_test.id(8)::text,false);
select keu10_test.expect_error('42501',format('select public.create_external_submission_revision_draft(%L)',
  (select event_id from keu10_test.results where key='recommendation-photos')));
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
do $$ declare d public.surat_registration_drafts; again public.surat_registration_drafts; data jsonb; photo uuid; photo2 uuid;
begin
  d:=public.create_external_submission_revision_draft((select event_id from keu10_test.results where key='recommendation-photos'));
  perform keu10_test.simulate_old_recommendation_draft(d.id);
  d:=public.create_external_submission_revision_draft(d.revision_event_id);
  perform keu10_test.assert(d.payload#>>'{formData,form_input_data,recommendation_multi_detail,items,0,details,0,description}'='Saved specifications from legacy editor','Existing broken draft rescued without discarding saved specifications');
  perform keu10_test.assert(d.payload#>>'{linkedDocumentContext,taskId}'=keu10_test.id(9503)::text,'Canonical recommendation context restored');
  perform keu10_test.assert((select count(*)=2 from public.surat_registration_draft_files where draft_id=d.id),'Original photos cloned by reference');
  perform keu10_test.assert(jsonb_array_length(d.payload#>'{externalRevision,protectedAttachments}')=1,'Examiner file alone protected');
  photo:=(d.payload#>>'{formData,form_input_data,recommendation_multi_detail,items,0,details,0,attachments,0,metadata,draft_file_id}')::uuid;
  photo2:=(d.payload#>>'{formData,form_input_data,recommendation_multi_detail,items,0,details,0,attachments,1,metadata,draft_file_id}')::uuid;
  perform keu10_test.assert(exists(select 1 from public.surat_registration_draft_files where id=photo and draft_id=d.id),'Original photo ID rebound to revision draft');
  perform keu10_test.expect_error('42501',format('insert into public.surat_registration_draft_files(draft_id,created_by,file_url) values(%L,%L,%L)',
    d.id,keu10_test.id(1),'private://examiner/photo.png'));
  data:=jsonb_set(d.payload->'formData','{form_input_data,recommendation_multi_detail,items,0,details,0,description}','"Blue tablet, complete specifications"');
  update public.surat_registration_drafts set payload=jsonb_set(payload,'{formData}',data) where id=d.id;
  again:=public.create_external_submission_revision_draft(d.revision_event_id);
  perform keu10_test.assert(again.payload->'formData'=data,'Saved redaction and photo IDs survive reopening');
  -- Explicit deletion is durable and never deletes the original file/history.
  delete from public.surat_registration_draft_files where id=photo2;
  data:=jsonb_set(data,'{form_input_data,recommendation_multi_detail,items,0,details,0,attachments}',
    (data#>'{form_input_data,recommendation_multi_detail,items,0,details,0,attachments}')-1);
  update public.surat_registration_drafts set payload=jsonb_set(payload,'{formData}',data) where id=d.id;
  again:=public.create_external_submission_revision_draft(d.revision_event_id);
  perform keu10_test.assert((select count(*)=1 from public.surat_registration_draft_files where draft_id=d.id),'Removed photo not restored on reopen');
  perform keu10_test.assert((select count(*)=3 from public.surat_attachments where surat_id=keu10_test.id(9501)),'Original photos not deleted while drafting');
  perform keu10_test.expect_error('42501',format('select public.submit_external_submission_revision(%L,%L,%L,null)',d.revision_event_id,d.id,
    jsonb_set(data,'{form_input_data,recommendation_multi_detail,items,0,details,0,attachments,0,storage_path}','"private://examiner/photo.png"')));
  perform keu10_test.expect_error('22023',format('select public.submit_external_submission_revision(%L,%L,%L,null)',d.revision_event_id,d.id,
    jsonb_set(data,'{form_input_data,linked_parent_surat_id}','"forged"')));
  perform public.submit_external_submission_revision(d.revision_event_id,d.id,data,'Spesifikasi dilengkapi tanpa upload ulang.');
  perform keu10_test.assert((select status='PROSES' and current_step=3 and no_surat='005/TEST/REC/X/2026'
    and form_input_data#>>'{recommendation_multi_detail,items,0,details,0,description}'='Blue tablet, complete specifications'
    from public.surat_registrasi where id=keu10_test.id(9501)),'Recommendation saves without PGD items or new photo, resumes requesting step');
  perform keu10_test.assert((select count(*)=2 from public.surat_attachments where surat_id=keu10_test.id(9501)),'Retained photo and examiner attachment remain');
  perform keu10_test.assert(exists(select 1 from public.surat_requester_revision_history where revision_event_id=d.revision_event_id
    and jsonb_array_length(before_snapshot->'attachments')=3 and jsonb_array_length(after_snapshot->'attachments')=2),'Photo removal audited in immutable history');
  perform keu10_test.expect_error('40001',format('select public.submit_external_submission_revision(%L,%L,%L,null)',d.revision_event_id,d.id,data));
end $$;
reset role;
select keu10_test.assert(not has_function_privilege('authenticated','requester_revision_internal.prepare_recommendation_draft(uuid)','execute'), 'Prepare helper private');
select 'Recommendation revision photos: all assertions passed';
