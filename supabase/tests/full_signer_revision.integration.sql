reset role;
create function keu10_test.full_form(p_id uuid) returns jsonb language sql security definer as $$
 select jsonb_build_object('judul_surat',judul_surat,'request_place',request_place,
   'request_date',request_date,'form_input_data',form_input_data) from public.surat_registrasi where id=p_id
$$;
grant execute on function keu10_test.full_form(uuid) to authenticated;
insert into public.surat_registrasi(id,no_surat,created_by,judul_surat,request_place,request_date,current_step,file_path,form_input_data)
values(keu10_test.id(9901),'FULL/ASSET/TEST',keu10_test.id(1),'Perangkat kantor','Magelang','2026-11-10',3,'native://document/full',
 '{"request_category":"asset","items":[{"id":"a","nama_barang":"Komputer awal","jumlah":5,"sat":"Unit","status":"2","spesifikasi":"RAM 8GB"},{"id":"b","nama_barang":"Monitor lama","jumlah":1,"sat":"Unit"}]}');
insert into public.surat_signatures(id,surat_id,user_id,step_order,role_name,is_signed,signed_at,status,available_at) values
 (keu10_test.id(9911),keu10_test.id(9901),keu10_test.id(2),1,'membuat',true,now(),'APPROVED',now()),
 (keu10_test.id(9912),keu10_test.id(9901),keu10_test.id(4),2,'memeriksa',true,now(),'APPROVED',now()),
 (keu10_test.id(9913),keu10_test.id(9901),keu10_test.id(3),3,'memeriksa',false,null,'PENDING',now()),
 (keu10_test.id(9914),keu10_test.id(9901),keu10_test.id(7),4,'menyetujui',false,null,'PENDING',null);
insert into public.surat_attachments(surat_id,stage,signature_id,file_url,file_name) values
 (keu10_test.id(9901),'initial',null,'private://full/requester.pdf','Permohonan.pdf'),
 (keu10_test.id(9901),'approval',keu10_test.id(9912),'private://full/checker.pdf','Pemeriksaan.pdf');
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
insert into keu10_test.results(key,surat_id,event_id) values('full-requester',keu10_test.id(9901),
 public.request_surat_process_revision(keu10_test.id(9901),keu10_test.id(9913),'requester',null,'Perbaiki spesifikasi barang.','{"requester_edit_required":true}'));
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
do $$declare draft public.surat_registration_drafts; begin
 draft:=public.create_external_submission_revision_draft((select event_id from keu10_test.results where key='full-requester'));
 perform public.submit_external_submission_revision(draft.revision_event_id,draft.id,
   jsonb_set(draft.payload->'formData','{form_input_data,items,0,spesifikasi}','"RAM 16GB"'),'Spesifikasi diperbaiki.');
 perform keu10_test.assert((select current_step=3 and status='PROSES' from public.surat_registrasi where id=keu10_test.id(9901)),
   'Requester material correction resumes asking step instead of restarting step1');
 perform keu10_test.assert((select bool_and(is_signed) from public.surat_signatures where surat_id=keu10_test.id(9901) and step_order<3),
   'Product policy retains previous approvals and old version history');
end $$;

-- Full proposal is server-attributed and does not change the request before confirmation.
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
do $$declare proposal jsonb; event uuid; original jsonb; begin
 original:=keu10_test.full_form(keu10_test.id(9901));
 proposal:=original||jsonb_build_object('judul_surat','Perangkat kantor revisi','form_input_data',
   (original->'form_input_data')||'{"catatan":"Kebutuhan disesuaikan","items":[{"id":"a","nama_barang":"Komputer desain","jumlah":2.5,"sat":"Paket","status":"3","spesifikasi":"RAM 32GB"},{"id":"c","nama_barang":"Keyboard baru","jumlah":1,"sat":"Unit","status":"2"}]}'::jsonb);
 perform keu10_test.expect_error('22023',format('select public.request_surat_process_revision(%L,%L,''requester'',null,''Alasan valid'',%L)',
   keu10_test.id(9901),keu10_test.id(9913),jsonb_build_object('signer_proposed_form',proposal||jsonb_build_object('office_id',keu10_test.id(77)))));
 perform keu10_test.expect_error('42501',format('select public.request_surat_process_revision(%L,%L,''requester'',null,''Alasan valid'',%L)',
   keu10_test.id(9901),keu10_test.id(9913),jsonb_build_object('signer_proposed_form',jsonb_set(proposal,'{form_input_data,allocated_units}','[{"id":"forged"}]'))));
 perform keu10_test.expect_error('22023',format('select public.request_surat_process_revision(%L,%L,''requester'',null,''Alasan valid'',%L)',
   keu10_test.id(9901),keu10_test.id(9913),jsonb_build_object('signer_proposed_form',jsonb_set(proposal,'{form_input_data,items,0,jumlah}','0'))));
 event:=public.request_surat_process_revision(keu10_test.id(9901),keu10_test.id(9913),'requester',null,'Sesuaikan kebutuhan dan spesifikasi.',
   jsonb_build_object('signer_proposed_form',proposal,'signer_proposed_by',keu10_test.id(8)));
 insert into keu10_test.results(key,surat_id,event_id) values('full-proposal',keu10_test.id(9901),event);
 perform keu10_test.assert(keu10_test.full_form(keu10_test.id(9901))=original,'Proposal never silently applies signer changes');
 perform keu10_test.assert((select changes->>'signer_proposed_by'=keu10_test.id(3)::text
   and changes->>'requester_edit_required'='false' and changes->>'signer_full_proposal'='true'
   and changes#>>'{signer_proposal_before,document,form_input_data,items,0,spesifikasi}'='RAM 16GB'
   and changes#>>'{signer_proposal_after,document,form_input_data,items,0,spesifikasi}'='RAM 32GB'
   from public.surat_revision_events where id=event),'Proposal snapshot and editor identity come from the server');
 perform keu10_test.expect_error('42501',format('update public.surat_revision_events set changes=''{}'' where id=%L',event));
end $$;
select set_config('request.jwt.claim.sub',keu10_test.id(8)::text,false);
select keu10_test.expect_error('42501',format('select public.accept_surat_process_revision(%L,null)',(select event_id from keu10_test.results where key='full-proposal')));
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
select public.accept_surat_process_revision((select event_id from keu10_test.results where key='full-proposal'),'Usulan dikonfirmasi.');
select keu10_test.assert((select current_step=3 and no_surat='FULL/ASSET/TEST' and form_input_data#>>'{items,0,nama_barang}'='Komputer desain'
 and form_input_data#>>'{items,0,jumlah}'='2.5' and form_input_data#>>'{items,0,sat}'='Paket'
 and form_input_data#>>'{items,1,id}'='c' from public.surat_registrasi where id=keu10_test.id(9901)),
 'Name, decimal quantity, unit, specification, status, addition and removal apply only after requester confirmation');
select keu10_test.assert((select count(*)=2 from public.surat_attachments where surat_id=keu10_test.id(9901)),
 'Requester and checker attachments remain intact');
select keu10_test.assert((select requested_by=keu10_test.id(3) and submitted_by=keu10_test.id(1) and resume_step=3
 and before_snapshot#>>'{document,form_input_data,items,1,id}'='b' and after_snapshot#>>'{document,form_input_data,items,1,id}'='c'
 from public.surat_requester_revision_history where revision_event_id=(select event_id from keu10_test.results where key='full-proposal')),
 'Immutable history preserves both full versions, proposing signer and confirming requester');
select keu10_test.expect_error('40001',format('select public.accept_surat_process_revision(%L,null)',(select event_id from keu10_test.results where key='full-proposal')));

-- Canonical KEU10 amount/director checks remain authoritative despite resume policy.
insert into keu10_test.results(key,surat_id) select 'full-keu',(public.create_keu10_registration(
 keu10_test.payload(90,2,1000000),keu10_test.signers(2,6))#>>'{surat,id}')::uuid;
select keu10_test.approve((select surat_id from keu10_test.results where key='full-keu'),1);
select keu10_test.approve((select surat_id from keu10_test.results where key='full-keu'),2);
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
update keu10_test.results set event_id=public.request_surat_process_revision(surat_id,
 (select id from public.surat_signatures where surat_id=keu10_test.results.surat_id and step_order=3),
 'requester',null,'Harga aktual perlu diperbaiki.',jsonb_build_object('signer_proposed_form',
 jsonb_set(keu10_test.full_form(surat_id),'{form_input_data,items,0,estimasi_harga_satuan}','2500000'))) where key='full-keu';
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
select keu10_test.expect_error('42501',format('select public.accept_keu10_requester_revision(%L,null,null,%L)',
 (select event_id from keu10_test.results where key='full-keu'),keu10_test.id(6)));
select public.accept_keu10_requester_revision((select event_id from keu10_test.results where key='full-keu'),null,'Nilai dikonfirmasi.',keu10_test.id(7));
select keu10_test.assert((select current_step=3 and form_input_data->>'fund_amount'='2500000'
 from public.surat_registrasi where id=(select surat_id from keu10_test.results where key='full-keu')),
 'KEU10 full proposal uses canonical normalization but resumes Finance');
select keu10_test.assert((select user_id=keu10_test.id(7) and not is_signed from public.surat_signatures
 where surat_id=(select surat_id from keu10_test.results where key='full-keu') and step_order=4),
 'New amount still selects the eligible unsigned director');

-- Fund totals are recomputed on the server, not copied from the proposed total.
reset role;
insert into public.surat_registrasi(id,no_surat,created_by,judul_surat,current_step,file_path,form_input_data)
 values(keu10_test.id(9921),'FULL/FUND/TEST',keu10_test.id(1),'Dana operasional',1,'native://document/fund',
 '{"request_category":"fund","fund_type":"operational","fund_amount":1000,"items":[{"nama_barang":"Servis","jumlah":1,"satuan":"Unit","nominal":1000,"status":"2"}]}');
insert into public.surat_signatures(id,surat_id,user_id,step_order,role_name,is_signed,status)
 values(keu10_test.id(9922),keu10_test.id(9921),keu10_test.id(3),1,'memeriksa',false,'PENDING');
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(8)::text,false);
select keu10_test.expect_error('42501',format('select public.request_surat_process_revision(%L,%L,''requester'',null,''Alasan valid'',%L)',
 keu10_test.id(9921),keu10_test.id(9922),jsonb_build_object('signer_proposed_form',keu10_test.full_form(keu10_test.id(9921)))));
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
insert into keu10_test.results(key,surat_id,event_id) values('full-fund',keu10_test.id(9921),
 public.request_surat_process_revision(keu10_test.id(9921),keu10_test.id(9922),'requester',null,'Sesuaikan nominal servis.',
 jsonb_build_object('signer_proposed_form',jsonb_set(jsonb_set(keu10_test.full_form(keu10_test.id(9921)),
 '{form_input_data,items,0,nominal}','175000'),'{form_input_data,fund_amount}','999'))));
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
select public.accept_surat_process_revision((select event_id from keu10_test.results where key='full-fund'),null);
select keu10_test.assert((select form_input_data->>'fund_amount'='175000' from public.surat_registrasi where id=keu10_test.id(9921)),
 'Fund confirmation recomputes nominal from item values');

-- Full Unit proposals still go through the actual checker reallocation stage.
select keu10_test.approve(keu10_test.id(9101),2);
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
insert into keu10_test.results(key,surat_id,event_id) values('full-unit',keu10_test.id(9101),
 public.request_surat_process_revision(keu10_test.id(9101),keu10_test.id(9113),'requester',null,'Empat unit sesuai kebutuhan.',
 jsonb_build_object('signer_proposed_form',jsonb_set(keu10_test.full_form(keu10_test.id(9101)),
 '{form_input_data,requested_unit_count}','"4"'))));
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
select public.accept_surat_process_revision((select event_id from keu10_test.results where key='full-unit'),null);
select keu10_test.assert((select current_step=2 and status='MENUNGGU_PERBAIKAN' from public.surat_registrasi where id=keu10_test.id(9101)),
 'Full Unit proposal cannot skip examiner reallocation');
select set_config('request.jwt.claim.sub',keu10_test.id(8)::text,false);
select public.verify_surat_signature_v2(keu10_test.id(9112),'Alokasi empat unit diverifikasi.',
 '{"allocated_units":[{"id":"one"},{"id":"two"},{"id":"three"},{"id":"four"}]}');
select keu10_test.assert((select current_step=3 and status='PROSES' from public.surat_registrasi where id=keu10_test.id(9101)),
 'Verified Unit proposal resumes the asking signer, not step one');
reset role;
select keu10_test.assert(not has_function_privilege('authenticated','requester_revision_internal.accept_full_form(uuid,text,uuid)','execute')
 and not has_function_privilege('service_role','requester_revision_internal.propose_full_form(uuid,uuid,text,jsonb)','execute')
 and has_function_privilege('postgres','requester_revision_internal.accept_full_form(uuid,text,uuid)','execute'),
 'Full proposal helpers remain private with canonical owner access');
select 'Full signer revision: all assertions passed';
