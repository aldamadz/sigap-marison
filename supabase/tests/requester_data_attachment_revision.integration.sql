-- Real RPCs in disposable PostgreSQL; no live employee or document mutation.
set role postgres;
insert into public.surat_registrasi(id,no_surat,created_by,judul_surat,request_place,request_date,
  current_step,file_path,form_input_data) values
  (keu10_test.id(9001),'001/TEST/REVISION/X/2026',keu10_test.id(1),'Spesifikasi barang','Magelang','2026-10-08',3,
   'native://document/test', '{"request_category":"asset","items":[{"nama_barang":"Komputer","jumlah":"5","sat":"Unit","nominal":"5000000"},{"nama_barang":"Monitor","jumlah":"2","sat":"Unit","nominal":"2000000"}],"allocated_units":[{"id":"protected"}]}');
insert into public.surat_signatures(id,surat_id,user_id,step_order,role_name,is_signed,signed_at,status,available_at) values
  (keu10_test.id(9011),keu10_test.id(9001),keu10_test.id(2),1,'membuat',true,now(),'APPROVED',now()),
  (keu10_test.id(9012),keu10_test.id(9001),keu10_test.id(4),2,'memeriksa',true,now(),'APPROVED',now()),
  (keu10_test.id(9013),keu10_test.id(9001),keu10_test.id(3),3,'memeriksa',false,null,'PENDING',now()),
  (keu10_test.id(9014),keu10_test.id(9001),keu10_test.id(7),4,'menyetujui',false,null,'PENDING',null);
insert into public.surat_attachments(surat_id,stage,signature_id,file_url,file_name) values
  (keu10_test.id(9001),'initial',null,'private://requester/spec.pdf','Spesifikasi.pdf'),
  (keu10_test.id(9001),'approval',keu10_test.id(9012),'private://checker/rab.pdf','RAB pemeriksa.pdf');

set role authenticated;
-- Fixture-only operator recovery is separate from requester privileges.
reset role;
create function keu10_test.restore_expiry(p_draft uuid) returns void language plpgsql security definer as $$
declare v_surat uuid;
begin
  select event.surat_id into v_surat from public.surat_registration_drafts draft join public.surat_revision_events event
    on event.id=draft.revision_event_id where draft.id=p_draft;
  insert into requester_revision_internal.permits values(txid_current(),v_surat,'draft');
  update public.surat_registration_drafts set expires_at=now()+interval '1 day' where id=p_draft;
  delete from requester_revision_internal.permits where transaction_id=txid_current() and surat_id=v_surat;
end $$;
grant execute on function keu10_test.restore_expiry(uuid) to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
insert into keu10_test.results(key,surat_id,event_id) values('edit',keu10_test.id(9001),
  public.request_surat_process_revision(keu10_test.id(9001),keu10_test.id(9013),'requester',null,
    'Lengkapi merek, tipe, dan lampiran spesifikasi.','{"requester_edit_required":true,"resume_step":99}'));
select keu10_test.assert((select form_input_data#>>'{items,0,jumlah}'='5' and status='MENUNGGU_PERBAIKAN'
  from public.surat_registrasi where id=keu10_test.id(9001)),'Return reason alone does not reduce items');
select keu10_test.assert((select changes->>'resume_step'='3' and not(changes ? 'external_submission_revision')
  from public.surat_revision_events where id=(select event_id from keu10_test.results where key='edit')),'Server determines resume step, not vendor rejection');
select set_config('request.jwt.claim.sub',keu10_test.id(8)::text,false);
select keu10_test.expect_error('42501',format('select public.create_external_submission_revision_draft(%L)',
  (select event_id from keu10_test.results where key='edit')));
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
select keu10_test.expect_error('42501',format('select public.accept_surat_process_revision(%L,null)',
  (select event_id from keu10_test.results where key='edit')));
do $$ declare v_draft public.surat_registration_drafts; v_again public.surat_registration_drafts; v_data jsonb; v_before jsonb;
begin
  v_draft:=public.create_external_submission_revision_draft((select event_id from keu10_test.results where key='edit'));
  perform keu10_test.assert(v_draft.no_surat='001/TEST/REVISION/X/2026','Revision keeps original number');
  v_before:=(select form_input_data from public.surat_registrasi where id=keu10_test.id(9001));
  perform keu10_test.expect_error('42501',format('update public.surat_registrasi set form_input_data=%L where id=%L',
    '{"items":[]}',keu10_test.id(9001)));
  perform keu10_test.assert(v_draft.payload#>'{formData,form_input_data}'=v_before,'Full original items, counts and amounts loaded');
  perform keu10_test.assert((select count(*)=1 from public.surat_registration_draft_files where draft_id=v_draft.id),'Only requester attachments editable');
  perform keu10_test.expect_error('42501',format('insert into public.surat_registration_draft_files(draft_id,created_by,file_url) values(%L,%L,%L)',
    v_draft.id,keu10_test.id(1),'private://checker/rab.pdf'));
  perform keu10_test.expect_error('42501',format('update public.surat_registration_drafts set revision_event_id=null where id=%L',v_draft.id));
  perform keu10_test.expect_error('42501',format('update public.surat_registration_drafts set no_surat=%L where id=%L','FORGED',v_draft.id));
  delete from public.surat_registration_draft_files where draft_id=v_draft.id;
  insert into public.surat_registration_draft_files(draft_id,created_by,file_url,file_name)
    values(v_draft.id,keu10_test.id(1),'private://requester/new.pdf','Spesifikasi lengkap.pdf');
  v_data:=jsonb_set(v_draft.payload->'formData','{judul_surat}','"Spesifikasi komputer lengkap"');
  update public.surat_registration_drafts set payload=jsonb_set(payload,'{formData}',v_data) where id=v_draft.id;
  v_again:=public.create_external_submission_revision_draft(v_draft.revision_event_id);
  perform keu10_test.assert(v_again.payload->'formData'=v_data,'Saved redaction survives reopening');
  perform keu10_test.assert((select count(*)=1 and bool_and(file_url='private://requester/new.pdf')
    from public.surat_registration_draft_files where draft_id=v_draft.id),'Deleted attachment not re-added on reopening');
  perform keu10_test.expect_error('22023',format('select public.submit_external_submission_revision(%L,%L,%L,null)',
    v_draft.revision_event_id,v_draft.id,jsonb_set(v_data,'{form_usage_id}',to_jsonb(keu10_test.id(333)::text))));
  perform public.submit_external_submission_revision(v_draft.revision_event_id,v_draft.id,
    jsonb_set(v_data,'{form_input_data,allocated_units}','[]'),null);
  perform keu10_test.assert((select form_input_data=v_before and current_step=3 and status='PROSES'
    from public.surat_registrasi where id=keu10_test.id(9001)),'Redaction/file-only correction keeps quantities, values and checker data; resumes asking step');
  perform keu10_test.assert((select bool_and(is_signed) from public.surat_signatures
    where surat_id=keu10_test.id(9001) and step_order<3),'Earlier approvals remain signed');
  perform keu10_test.assert((select count(*)=2 from public.surat_attachments where surat_id=keu10_test.id(9001))
    and exists(select 1 from public.surat_attachments where file_url='private://checker/rab.pdf'),'Checker attachments retained');
  perform keu10_test.assert((select before_snapshot#>>'{attachments,0,file_url}' is not null
    and after_snapshot#>>'{document,judul_surat}'='Spesifikasi komputer lengkap'
    from public.surat_requester_revision_history where revision_event_id=v_draft.revision_event_id),'Immutable before/after audit');
  perform keu10_test.expect_error('40001',format('select public.submit_external_submission_revision(%L,%L,%L,null)',
    v_draft.revision_event_id,v_draft.id,v_data));
  perform keu10_test.expect_error('42501',format('update public.surat_requester_revision_history set reason=%L where revision_event_id=%L',
    'Forged',v_draft.revision_event_id));
  perform keu10_test.assert((select count(*)=1 from public.surat_requester_revision_history),'Requester can read history');
end $$;

-- Explicit signer proposal: requested 5, approved 3, reason preserved in the preview/PDF payload.
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
insert into keu10_test.results(key,surat_id,event_id) values('proposal',keu10_test.id(9001),
  public.request_surat_process_revision(keu10_test.id(9001),keu10_test.id(9013),'requester',null,
    'Kebutuhan aktual hanya tiga komputer.',
    '{"signer_revision_required":true,"item_revisions":[{"index":0,"action":"adjust","value_type":"quantity","nama_barang":"Komputer","nilai_diajukan":"5","nilai_disetujui":"3","jumlah_diajukan":"5","jumlah_disetujui":"3","alasan":"Kebutuhan aktual hanya tiga komputer."}]}'));
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
select public.accept_surat_process_revision((select event_id from keu10_test.results where key='proposal'),'Saya mengonfirmasi perubahan.');
select keu10_test.assert((select form_input_data#>>'{items,0,jumlah}'='3'
  and data_snapshot#>>'{applied_revision,changes,item_revisions,0,jumlah_diajukan}'='5'
  and data_snapshot#>>'{applied_revision,changes,item_revisions,0,alasan}'='Kebutuhan aktual hanya tiga komputer.'
  and current_step=3 from public.surat_registrasi where id=keu10_test.id(9001)),'Requested/approved/reason preserved after confirmation');
select set_config('request.jwt.claim.sub',keu10_test.id(8)::text,false);
select keu10_test.assert((select count(*)=0 from public.surat_requester_revision_history),'Unrelated requester cannot read revision history');

-- Add/delete/change items, expired drafts, stale event and double send.
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
insert into keu10_test.results(key,surat_id,event_id) values('items',keu10_test.id(9001),
  public.request_surat_process_revision(keu10_test.id(9001),keu10_test.id(9013),'requester',null,
    'Perbaiki daftar barang beserta spesifikasinya.','{"requester_edit_required":true}'));
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
do $$ declare v_draft public.surat_registration_drafts; v_data jsonb;
begin
  v_draft:=public.create_external_submission_revision_draft((select event_id from keu10_test.results where key='items'));
  v_data:=jsonb_set(v_draft.payload->'formData','{form_input_data,items}',
    '[{"nama_barang":"Komputer","jumlah":"4","nominal":"4000000"},{"nama_barang":"Keyboard baru","jumlah":"1","nominal":"100000"}]');
  update public.surat_registration_drafts set payload=jsonb_set(payload,'{formData}',v_data),expires_at=now()-interval '1 second'
    where id=v_draft.id;
  perform keu10_test.expect_error('40001',format('select public.create_external_submission_revision_draft(%L)',v_draft.revision_event_id));
  perform keu10_test.expect_error('40001',format('select public.submit_external_submission_revision(%L,%L,%L,null)',
    v_draft.revision_event_id,v_draft.id,v_data));
  perform keu10_test.expect_error('42501',format('update public.surat_registration_drafts set expires_at=now()+interval ''1 day'' where id=%L',v_draft.id));
  perform keu10_test.restore_expiry(v_draft.id);
  perform public.submit_external_submission_revision(v_draft.revision_event_id,v_draft.id,v_data,'Daftar diperbaiki sesuai catatan.');
  perform keu10_test.assert((select form_input_data#>>'{items,0,jumlah}'='4' and form_input_data#>>'{items,1,nama_barang}'='Keyboard baru'
    from public.surat_registrasi where id=keu10_test.id(9001)),'Requester can deliberately replace/remove/add items and amounts');
  perform keu10_test.expect_error('40001',format('select public.create_external_submission_revision_draft(%L)',v_draft.revision_event_id));
end $$;

-- KEU10 uses canonical amount normalization and re-selects the director when crossing Rp2 million.
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
insert into keu10_test.results(key,surat_id) select 'keu-edit',(public.create_keu10_registration(
  keu10_test.payload(81,2,1000000),keu10_test.signers(2,6))#>>'{surat,id}')::uuid;
select keu10_test.approve((select surat_id from keu10_test.results where key='keu-edit'),1);
select keu10_test.approve((select surat_id from keu10_test.results where key='keu-edit'),2);
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
update keu10_test.results set event_id=public.request_surat_process_revision(surat_id,
  (select id from public.surat_signatures where surat_id=keu10_test.results.surat_id and step_order=3),
  'requester',null,'Lengkapi biaya dan spesifikasi.','{"requester_edit_required":true}') where key='keu-edit';
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
do $$ declare v_draft public.surat_registration_drafts; v_data jsonb; v_id uuid;
begin
  select surat_id into v_id from keu10_test.results where key='keu-edit';
  v_draft:=public.create_external_submission_revision_draft((select event_id from keu10_test.results where key='keu-edit'));
  v_data:=jsonb_set(jsonb_set(v_draft.payload->'formData','{form_input_data,items,0,estimasi_harga_satuan}','2500000'),
    '{judul_surat}','"Biaya lahan diperbaiki"');
  perform keu10_test.expect_error('42501',format('select public.submit_external_submission_revision(%L,%L,%L,%L)',
    v_draft.revision_event_id,v_draft.id,v_data,'Biaya aktual diperbaiki.'));
  update public.surat_registration_drafts set signer_assignments=jsonb_set(signer_assignments,'{3,user_id}',
    to_jsonb(keu10_test.id(7)::text)) where id=v_draft.id;
  perform public.submit_external_submission_revision(v_draft.revision_event_id,v_draft.id,v_data,'Biaya aktual diperbaiki.');
  perform keu10_test.assert((select current_step=3 and form_input_data->>'fund_amount'='2500000'
    from public.surat_registrasi where id=v_id),'KEU10 normalized total, resume Finance verifier');
  perform keu10_test.assert((select user_id=keu10_test.id(7) from public.surat_signatures where surat_id=v_id and step_order=4),'Director recomputed for revised total');
  perform keu10_test.assert((select bool_and(is_signed) from public.surat_signatures where surat_id=v_id and step_order<3),'KEU10 earlier signatures retained');
  perform keu10_test.assert(exists(select 1 from public.document_pdf_jobs where surat_id=v_id
    and render_payload#>>'{document,judul_surat}'='Biaya lahan diperbaiki'
    and render_payload#>>'{signatures,0,is_signed}'='true'),'Frozen PDF contains corrected title and preserved signatures');
end $$;

-- A pending Finance proposal must change the PDF cache key and freeze its evidence.
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
do $$ declare v_id uuid; v_sig uuid; v_event uuid; v_path text; v_payload jsonb;
begin
  v_id:=(public.create_keu10_registration(keu10_test.payload(83,2,1000000),keu10_test.signers(2,6))#>>'{surat,id}')::uuid;
  perform keu10_test.approve(v_id,1); perform keu10_test.approve(v_id,2);
  select file_path into v_path from public.surat_registrasi where id=v_id;
  select id into v_sig from public.surat_signatures where surat_id=v_id and step_order=3;
  perform set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
  v_event:=public.request_surat_process_revision(v_id,v_sig,'requester',null,'Nilai disesuaikan berdasarkan kebutuhan.',
    '{"signer_revision_required":true,"keu10_proposed_input":{"items":[{"id":"line_1","keterangan":"Biaya diperiksa","jumlah":1,"satuan":"Paket","estimasi_harga_satuan":500000}]}}');
  perform keu10_test.assert((select file_path<>v_path and pdf_path is null and form_input_data->>'fund_amount'='1000000'
    from public.surat_registrasi where id=v_id),'Pending proposal invalidates cache without changing original amount');
  select render_payload into v_payload from public.document_pdf_jobs where surat_id=v_id
    and render_payload#>>'{document,data_snapshot,revision,event_id}'=v_event::text order by created_at desc limit 1;
  perform keu10_test.assert(v_payload#>>'{document,data_snapshot,revision,reason}'='Nilai disesuaikan berdasarkan kebutuhan.',
    'Pending PDF job contains the active revision reason');
  perform keu10_test.assert(v_payload#>>'{document,data_snapshot,revision,changes,signer_revision_required}'='true',
    'Pending PDF job contains the signer proposal marker');
end $$;
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
insert into keu10_test.results(key,surat_id) select 'keu-purpose',(public.create_keu10_registration(
  keu10_test.payload(82,1,1000000),keu10_test.signers(1,7))#>>'{surat,id}')::uuid;
select set_config('request.jwt.claim.sub',keu10_test.id(2)::text,false);
update keu10_test.results set event_id=public.request_surat_process_revision(surat_id,
  (select id from public.surat_signatures where surat_id=keu10_test.results.surat_id and step_order=1),
  'requester',null,'Perbaiki tujuan biaya tanah.','{"requester_edit_required":true}') where key='keu-purpose';
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
do $$ declare v_draft public.surat_registration_drafts; v_data jsonb; v_id uuid; v_purpose jsonb;
begin
  select surat_id into v_id from keu10_test.results where key='keu-purpose';
  select policy_snapshot#>'{keu10_config,purposes,1,code}' into v_purpose from public.surat_registrasi where id=v_id;
  v_draft:=public.create_external_submission_revision_draft((select event_id from keu10_test.results where key='keu-purpose'));
  v_data:=jsonb_set(v_draft.payload->'formData','{form_input_data,keu10_purpose_code}',v_purpose);
  perform public.submit_external_submission_revision(v_draft.revision_event_id,v_draft.id,v_data,null);
  perform keu10_test.assert((select form_input_data->'keu10_purpose_code'=v_purpose from public.surat_registrasi where id=v_id),
    'Changed purpose persists exactly as confirmed');
end $$;

-- Actual Unit acceptance -> checker reallocation -> verification -> requesting signer.
reset role;
insert into public.surat_registrasi(id,no_surat,created_by,judul_surat,current_step,file_path,form_input_data)
values(keu10_test.id(9101),'002/TEST/UNIT/X/2026',keu10_test.id(1),'Pengajuan Unit',3,'native://document/unit',
  '{"request_category":"unit","requested_unit_count":"2","requested_project":{"code":"TEST"},"allocated_units":[{"id":"one"},{"id":"two"}],"items":[{"nama_barang":"2 Unit","jumlah":"2","sat":"Unit"}]}');
insert into public.surat_signatures(id,surat_id,user_id,step_order,role_name,is_signed,signed_at,status,
  requires_unit_allocation,verification_required,verification_status,verifier_snapshot) values
  (keu10_test.id(9111),keu10_test.id(9101),keu10_test.id(2),1,'membuat',true,now(),'APPROVED',false,false,'not_required','[]'),
  (keu10_test.id(9112),keu10_test.id(9101),keu10_test.id(4),2,'memeriksa',true,now(),'APPROVED',true,true,'verified',jsonb_build_array(jsonb_build_object('user_id',keu10_test.id(8)::text))),
  (keu10_test.id(9113),keu10_test.id(9101),keu10_test.id(3),3,'menyetujui',false,null,'PENDING',false,false,'not_required','[]');
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
insert into keu10_test.results(key,surat_id,event_id) values('unit-edit',keu10_test.id(9101),
  public.request_surat_process_revision(keu10_test.id(9101),keu10_test.id(9113),'requester',null,'Perbaiki jumlah unit.','{"requester_edit_required":true}'));
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
do $$ declare v_draft public.surat_registration_drafts; v_input jsonb;
begin
  v_draft:=public.create_external_submission_revision_draft((select event_id from keu10_test.results where key='unit-edit'));
  v_input:=jsonb_set(v_draft.payload->'formData','{form_input_data,requested_unit_count}','"3"');
  perform public.submit_external_submission_revision(v_draft.revision_event_id,v_draft.id,v_input,'Jumlah unit dilengkapi.');
  perform keu10_test.assert((select current_step=2 and status='MENUNGGU_PERBAIKAN' from public.surat_registrasi
    where id=keu10_test.id(9101)),'Changed Unit count routes through canonical reallocation');
end $$;
select set_config('request.jwt.claim.sub',keu10_test.id(8)::text,false);
select public.verify_surat_signature_v2(keu10_test.id(9112),'Alokasi tiga unit disesuaikan.',
  '{"allocated_units":[{"id":"one"},{"id":"two"},{"id":"three"}]}');
select keu10_test.assert((select current_step=3 and status='PROSES' from public.surat_registrasi where id=keu10_test.id(9101)),
  'After canonical verification resumes original asking signer');
select keu10_test.assert((select is_signed and verification_status='verified' from public.surat_signatures where id=keu10_test.id(9112)),
  'Earlier approval and fresh verification retained');
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
insert into keu10_test.results(key,surat_id,event_id) values('unit-proposal',keu10_test.id(9101),
  public.request_surat_process_revision(keu10_test.id(9101),keu10_test.id(9113),'requester',null,'Dua unit sesuai kebutuhan.',
    '{"signer_revision_required":true,"item_revisions":[{"index":0,"action":"adjust","value_type":"unit_count","nama_barang":"Unit","nilai_diajukan":"3","nilai_disetujui":"2","alasan":"Dua unit sesuai kebutuhan."}]}'));
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
select public.accept_surat_process_revision((select event_id from keu10_test.results where key='unit-proposal'),'Saya konfirmasi dua unit.');
select set_config('request.jwt.claim.sub',keu10_test.id(8)::text,false);
select public.verify_surat_signature_v2(keu10_test.id(9112),'Alokasi dua unit disesuaikan.','{"allocated_units":[{"id":"one"},{"id":"two"}]}');
select keu10_test.assert((select current_step=3 and status='PROSES' from public.surat_registrasi where id=keu10_test.id(9101)),
  'Signer Unit proposal uses same verified reallocation and resumes original signer');
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
insert into keu10_test.results(key,surat_id,event_id) values('requester-concurrency',keu10_test.id(9001),
  public.request_surat_process_revision(keu10_test.id(9001),keu10_test.id(9013),'requester',null,
    'Lengkapi lampiran spesifikasi final.','{"requester_edit_required":true}'));
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
select public.create_external_submission_revision_draft((select event_id from keu10_test.results where key='requester-concurrency')) is not null;
do $$ begin raise notice 'Requester corrections: all assertions passed'; end $$;
