-- Synthetic principals and real canonical RPCs, only in disposable PostgreSQL.
reset role;
alter table keu10_test.results add column if not exists draft_id uuid;
insert into public.surat_registrasi(id,no_surat,created_by,judul_surat,current_step,file_path,form_input_data)
values(keu10_test.id(9801),'RECOVERY/TEST',keu10_test.id(1),'Recovery fixture',3,'native://recovery',
  '{"request_category":"asset","items":[{"nama_barang":"Komputer","jumlah":"5","nominal":"5000000","spesifikasi":"RAM 16GB"}]}');
insert into public.surat_signatures(id,surat_id,user_id,step_order,role_name,is_signed,signed_at,status,available_at)
values
  (keu10_test.id(9811),keu10_test.id(9801),keu10_test.id(2),1,'membuat',true,now(),'APPROVED',now()),
  (keu10_test.id(9812),keu10_test.id(9801),keu10_test.id(4),2,'memeriksa',true,now(),'APPROVED',now()),
  (keu10_test.id(9813),keu10_test.id(9801),keu10_test.id(3),3,'memeriksa',false,null,'PENDING',now()),
  (keu10_test.id(9814),keu10_test.id(9801),keu10_test.id(7),4,'menyetujui',false,null,'PENDING',null);
insert into public.surat_attachments(surat_id,stage,file_url,file_name,created_by) values
  (keu10_test.id(9801),'initial','private://recovery/keep.pdf','Keep.pdf',keu10_test.id(1)),
  (keu10_test.id(9801),'initial','private://recovery/remove.pdf','Remove.pdf',keu10_test.id(1));
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
insert into keu10_test.results(key,surat_id,event_id) values('recovery',keu10_test.id(9801),
  public.request_surat_process_revision(keu10_test.id(9801),keu10_test.id(9813),'requester',null,
    'Lengkapi spesifikasi dan nilai aktual.','{"requester_edit_required":true}'));
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
update keu10_test.results set draft_id=(public.create_external_submission_revision_draft(event_id)).id where key='recovery';
delete from public.surat_registration_draft_files where draft_id=(select draft_id from keu10_test.results where key='recovery')
  and file_url='private://recovery/remove.pdf';
insert into public.surat_registration_draft_files(draft_id,created_by,file_url,file_name)
  select draft_id,keu10_test.id(1),'private://recovery/new.pdf','New.pdf' from keu10_test.results where key='recovery';
reset role;
-- Fixture operator emulates expiry, not a browser bypass of the draft guard.
insert into requester_revision_internal.permits
  select txid_current(),surat_id,'fixture' from keu10_test.results where key='recovery';
update public.surat_registration_drafts set status='EXPIRED',expires_at=clock_timestamp()-interval '8 days',
  payload=jsonb_set(payload,'{formData,form_input_data,catatan}','"Perubahan tersimpan"')
  where id=(select draft_id from keu10_test.results where key='recovery');
delete from requester_revision_internal.permits where transaction_id=txid_current();
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(8)::text,false);
select keu10_test.expect_error('42501',format('select public.create_external_submission_revision_draft(%L)',
  (select event_id from keu10_test.results where key='recovery')));
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
do $$ declare first public.surat_registration_drafts; again public.surat_registration_drafts; form jsonb;
begin
  first:=public.create_external_submission_revision_draft((select event_id from keu10_test.results where key='recovery'));
  perform keu10_test.assert(first.id=(select draft_id from keu10_test.results where key='recovery')
    and first.status='DRAFT' and first.expires_at>clock_timestamp()+interval '6 days',
    'Expired active revision renews the same draft, never allocates another number');
  perform keu10_test.assert(first.payload#>>'{formData,form_input_data,catatan}'='Perubahan tersimpan',
    'Expiry recovery preserves saved data');
  perform keu10_test.assert((select count(*)=2 and bool_and(file_url<>'private://recovery/remove.pdf')
    from public.surat_registration_draft_files where draft_id=first.id),'Recovery preserves intentional attachment removal and additions');
  again:=public.create_external_submission_revision_draft(first.revision_event_id);
  perform keu10_test.assert(first.expires_at=again.expires_at,'Fresh reopen does not keep extending the lease');
  form:=jsonb_set(first.payload->'formData','{form_input_data,items,0,spesifikasi}','"RAM 32GB"');
  perform public.submit_external_submission_revision(first.revision_event_id,first.id,form,'Spesifikasi diperbaiki.');
  perform keu10_test.assert((select current_step=1 and status='PROSES'
    and data_snapshot#>>'{applied_revision,restart_step}'='1'
    and data_snapshot#>>'{applied_revision,changes,material_reapproval}'='true'
    from public.surat_registrasi where id=keu10_test.id(9801)),'Material specification change restarts approval at step one');
  perform keu10_test.assert((select bool_and(not is_signed and signed_at is null and file_path_snap is null and pdf_path_snap is null)
    from public.surat_signatures where surat_id=keu10_test.id(9801)),'No old signature is restored on the revised document');
  perform keu10_test.assert((select resume_step=1 and before_snapshot#>>'{signatures,0,is_signed}'='true'
    and before_snapshot#>>'{signatures,1,is_signed}'='true'
    and after_snapshot#>>'{document,current_step}'='1'
    from public.surat_requester_revision_history where revision_event_id=first.revision_event_id),
    'History preserves the signed old version and records the actual new restart step');
  perform keu10_test.expect_error('40001',format('select public.create_external_submission_revision_draft(%L)',first.revision_event_id));
end $$;
-- A full restart remains actionable through actual approval RPCs.
select keu10_test.approve(keu10_test.id(9801),1);
select keu10_test.approve(keu10_test.id(9801),2);
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
insert into keu10_test.results(key,surat_id,event_id) values('recovery-notes',keu10_test.id(9801),
  public.request_surat_process_revision(keu10_test.id(9801),keu10_test.id(9813),'requester',null,
    'Lengkapi catatan umum dan lampiran.','{"requester_edit_required":true}'));
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
do $$ declare draft public.surat_registration_drafts; form jsonb;
begin
  draft:=public.create_external_submission_revision_draft((select event_id from keu10_test.results where key='recovery-notes'));
  form:=jsonb_set(draft.payload->'formData','{form_input_data,catatan}','"Catatan umum telah dilengkapi"');
  insert into public.surat_registration_draft_files(draft_id,created_by,file_url,file_name)
    values(draft.id,keu10_test.id(1),'private://recovery/additional.pdf','Additional.pdf');
  perform public.submit_external_submission_revision(draft.revision_event_id,draft.id,form,'Catatan dan lampiran dilengkapi.');
  perform keu10_test.assert((select current_step=3 and data_snapshot#>>'{applied_revision,changes,material_reapproval}'='false'
    from public.surat_registrasi where id=keu10_test.id(9801)),'Notes and attachment-only revision resumes the asking step');
  perform keu10_test.assert((select bool_and(is_signed) from public.surat_signatures
    where surat_id=keu10_test.id(9801) and step_order<3),'Nonmaterial revision keeps previous approvals');
end $$;

-- KEU10 must not restore old approvals over a new amount or director.
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
insert into keu10_test.results(key,surat_id) select 'recovery-keu',(public.create_keu10_registration(
  keu10_test.payload(89,2,1000000),keu10_test.signers(2,6))#>>'{surat,id}')::uuid;
select keu10_test.approve((select surat_id from keu10_test.results where key='recovery-keu'),1);
select keu10_test.approve((select surat_id from keu10_test.results where key='recovery-keu'),2);
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
update keu10_test.results set event_id=public.request_surat_process_revision(surat_id,
  (select id from public.surat_signatures where surat_id=keu10_test.results.surat_id and step_order=3),
  'requester',null,'Perbaiki nominal aktual.','{"requester_edit_required":true}') where key='recovery-keu';
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
do $$ declare draft public.surat_registration_drafts; form jsonb; doc_id uuid;
begin
  select surat_id into doc_id from keu10_test.results where key='recovery-keu';
  draft:=public.create_external_submission_revision_draft((select event_id from keu10_test.results where key='recovery-keu'));
  form:=jsonb_set(draft.payload->'formData','{form_input_data,items,0,estimasi_harga_satuan}','2500000');
  update public.surat_registration_drafts set signer_assignments=jsonb_set(signer_assignments,'{3,user_id}',to_jsonb(keu10_test.id(7)::text))
    where id=draft.id;
  perform public.submit_external_submission_revision(draft.revision_event_id,draft.id,form,'Nominal aktual diperbaiki.');
  perform keu10_test.assert((select current_step=1 and form_input_data->>'fund_amount'='2500000'
    from public.surat_registrasi where id=doc_id),'KEU10 revised amount restarts from step one');
  perform keu10_test.assert((select user_id=keu10_test.id(7) and not is_signed from public.surat_signatures
    where surat_id=doc_id and step_order=4),'Canonical threshold recalculation retains the new unsigned director');
  perform keu10_test.assert((select bool_and(not is_signed) from public.surat_signatures where surat_id=doc_id),
    'No KEU10 earlier approval survives material revision');
end $$;

-- A valid open event is not enough to resurrect a cancelled/submitted draft.
-- Existing Unit fixture uses the real requester/reallocation/checker routines.
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
insert into keu10_test.results(key,surat_id,event_id) values('recovery-unit',keu10_test.id(9101),
  public.request_surat_process_revision(keu10_test.id(9101),keu10_test.id(9113),'requester',null,
    'Perbaiki jumlah unit sesuai kebutuhan.','{"requester_edit_required":true}'));
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
do $$ declare draft public.surat_registration_drafts; begin
  draft:=public.create_external_submission_revision_draft((select event_id from keu10_test.results where key='recovery-unit'));
  perform public.submit_external_submission_revision(draft.revision_event_id,draft.id,
    jsonb_set(draft.payload->'formData','{form_input_data,requested_unit_count}','"3"'),'Jumlah unit diperbaiki.');
  perform keu10_test.assert((select current_step=2 and status='MENUNGGU_PERBAIKAN'
    from public.surat_registrasi where id=keu10_test.id(9101)),'Material Unit revision still requires canonical checker reallocation');
end $$;
select set_config('request.jwt.claim.sub',keu10_test.id(8)::text,false);
select public.verify_surat_signature_v2(keu10_test.id(9112),'Alokasi tiga unit disesuaikan.',
  '{"allocated_units":[{"id":"one"},{"id":"two"},{"id":"three"}]}');
select keu10_test.assert((select current_step=1 and status='PROSES' from public.surat_registrasi where id=keu10_test.id(9101)),
  'Unit checker completion restarts all approvals after material change');
select keu10_test.assert((select bool_and(not is_signed) from public.surat_signatures where surat_id=keu10_test.id(9101)),
  'Unit previous signatures are never restored over revised quantities');
select keu10_test.approve(keu10_test.id(9101),1);
select set_config('request.jwt.claim.sub',keu10_test.id(8)::text,false);
select public.verify_surat_signature_v2(keu10_test.id(9112),'Pemeriksaan versi baru.',
  '{"allocated_units":[{"id":"one"},{"id":"two"},{"id":"three"}]}');
select keu10_test.assert((select current_step=2 and status='PROSES' from public.surat_registrasi where id=keu10_test.id(9101)),
  'Repeated verification of the new version does not restart approval in a loop');

select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
insert into keu10_test.results(key,surat_id,event_id) values('recovery-lock',keu10_test.id(9801),
  public.request_surat_process_revision(keu10_test.id(9801),keu10_test.id(9813),'requester',null,
    'Lengkapi informasi untuk pemeriksaan.','{"requester_edit_required":true}'));
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
update keu10_test.results set draft_id=(public.create_external_submission_revision_draft(event_id)).id where key='recovery-lock';
begin;
reset role;
insert into requester_revision_internal.permits select txid_current(),surat_id,'fixture' from keu10_test.results where key='recovery-lock';
update public.surat_registration_drafts set status='VOID',voided_at=now(),expires_at=now()-interval '8 days'
  where id=(select draft_id from keu10_test.results where key='recovery-lock');
delete from requester_revision_internal.permits where transaction_id=txid_current();
set role authenticated;
select keu10_test.expect_error('40001',format('select public.create_external_submission_revision_draft(%L)',
  (select event_id from keu10_test.results where key='recovery-lock')));
rollback;
begin;
reset role;
insert into requester_revision_internal.permits select txid_current(),surat_id,'fixture' from keu10_test.results where key='recovery-lock';
update public.surat_registration_drafts set status='SUBMITTED',submitted_at=now(),expires_at=now()-interval '8 days'
  where id=(select draft_id from keu10_test.results where key='recovery-lock');
delete from requester_revision_internal.permits where transaction_id=txid_current();
set role authenticated;
select keu10_test.expect_error('40001',format('select public.create_external_submission_revision_draft(%L)',
  (select event_id from keu10_test.results where key='recovery-lock')));
rollback;
begin;
reset role;
insert into requester_revision_internal.permits select txid_current(),surat_id,'submit' from keu10_test.results where key='recovery-lock';
update public.surat_revision_events set status='resolved' where id=(select event_id from keu10_test.results where key='recovery-lock');
delete from requester_revision_internal.permits where transaction_id=txid_current();
set role authenticated;
select keu10_test.expect_error('40001',format('select public.create_external_submission_revision_draft(%L)',
  (select event_id from keu10_test.results where key='recovery-lock')));
rollback;
reset role;
select keu10_test.assert(not has_function_privilege('authenticated','requester_revision_internal.reapproval_decision(uuid)','execute')
  and not has_function_privilege('service_role','requester_revision_internal.reapproval_decision(uuid)','execute')
  and has_function_privilege('postgres','requester_revision_internal.reapproval_decision(uuid)','execute'),
  'Decision helpers are private and canonical owner retains access');
select keu10_test.assert(not (select rolsuper from pg_roles where rolname='postgres'),'Canonical function owner is not superuser');
select keu10_test.assert(not exists(
  select 1 from keu10_test.recovery_catalog before join pg_proc after using(oid)
  where after.proowner<>before.proowner or after.proacl is distinct from before.proacl),
  'Existing function owners and client ACLs are unchanged');
select keu10_test.assert(
  requester_revision_internal.material_input('{"items":[{"nominal":100}],"catatan":"old"}')
  =requester_revision_internal.material_input('{"items":[{"nominal":100}],"catatan":"new"}'),
  'General notes alone are not a material change');
select keu10_test.assert(
  requester_revision_internal.material_input('{"items":[{"nominal":100}]}')
  <>requester_revision_internal.material_input('{"items":[{"nominal":200}]}'),
  'Nominal changes cannot be hidden as cosmetic revisions');
select 'Requester revision recovery: all assertions passed';
