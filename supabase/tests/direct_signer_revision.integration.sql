reset role;
create function keu10_test.direct_doc(n integer,kind text default 'asset') returns uuid language plpgsql security definer as $$
declare doc uuid:=keu10_test.id(n);begin
 insert into public.surat_registrasi(id,no_surat,created_by,judul_surat,current_step,file_path,form_input_data)
 values(doc,'DIRECT/'||n,keu10_test.id(1),'Perangkat kantor',2,'native://document/direct/'||n,
   jsonb_build_object('request_category',kind,'items',jsonb_build_array(jsonb_build_object('id','a','nama_barang','Komputer','jumlah',2,'sat','Unit','spesifikasi','RAM 8GB'))));
 insert into public.surat_signatures(id,surat_id,user_id,step_order,role_name,is_signed,signed_at,status,file_path_snap,available_at) values
  (keu10_test.id(n+1),doc,keu10_test.id(1),1,'membuat',true,now(),'APPROVED','native://document/old-approved',now()),
  (keu10_test.id(n+2),doc,keu10_test.id(3),2,'memeriksa',false,null,'PENDING',null,now()),
  (keu10_test.id(n+3),doc,keu10_test.id(7),3,'menyetujui',false,null,'PENDING',null,null);
 return doc;
end $$;
grant execute on function keu10_test.direct_doc(integer,text) to authenticated;
select keu10_test.direct_doc(15000);
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(8)::text,false);
select keu10_test.expect_error('42501',format('select public.revise_and_approve_surat(%L,%L,''Alasan revisi'',%L)',
 keu10_test.id(15000),keu10_test.id(15002),jsonb_set(keu10_test.full_form(keu10_test.id(15000)),'{form_input_data,items,0,jumlah}','1')));
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
do $$declare event uuid;result jsonb;begin
 result:=public.revise_and_approve_surat(keu10_test.id(15000),keu10_test.id(15002),'Sesuaikan spesifikasi dan jumlah.',
  jsonb_set(jsonb_set(keu10_test.full_form(keu10_test.id(15000)),'{form_input_data,items,0,jumlah}','1.5'),'{form_input_data,items,0,spesifikasi}','"RAM 16GB"'));
 event:=(result->>'revision_event_id')::uuid;
 perform keu10_test.assert((select status='PROSES' and current_step=3 and form_input_data#>>'{items,0,jumlah}'='1.5' from public.surat_registrasi where id=keu10_test.id(15000)),'Revision and approval advance together without requester acceptance');
 perform keu10_test.assert((select is_signed and status='APPROVED' from public.surat_signatures where id=keu10_test.id(15002)),'Current signer really approved the corrected version');
 perform keu10_test.assert((select is_signed and file_path_snap='native://document/old-approved' from public.surat_signatures where id=keu10_test.id(15001)),'Previous signed archive is unchanged');
 perform keu10_test.assert((select status='resolved' and actor_id=keu10_test.id(3) and changes->>'requester_confirmation_required'='false' from public.surat_revision_events where id=event),'No pending requester action or fabricated acceptance');
 perform keu10_test.assert((select submitted_by=keu10_test.id(3) and requested_by=keu10_test.id(3)
  and submitted_at<=(select signed_at from public.surat_signatures where id=keu10_test.id(15002))
  and before_snapshot#>>'{document,form_input_data,items,0,spesifikasi}'='RAM 8GB'
  and after_snapshot#>>'{document,form_input_data,items,0,spesifikasi}'='RAM 16GB'
  from public.surat_requester_revision_history where revision_event_id=event),'Immutable evidence identifies signer and is inside signed PDF cutoff');
 perform keu10_test.assert((select count(*)=1 from public.notifications where user_id=keu10_test.id(1) and data->>'revision_event_id'=event::text and link='/status-pengajuan?document='||keu10_test.id(15000)::text),'Requester has an atomic notification to the exact document');
 perform keu10_test.assert((select count(*)=1 from public.notifications where data->>'signature_id'=keu10_test.id(15003)::text),'Next signer is notified');
 perform keu10_test.expect_error('42501',format('select public.revise_and_approve_surat(%L,%L,''Alasan revisi'',%L)',keu10_test.id(15000),keu10_test.id(15002),keu10_test.full_form(keu10_test.id(15000))));
end $$;

-- Required examination and intake holds cannot be converted into approvals.
reset role;
select keu10_test.direct_doc(15100);
update public.surat_signatures set verification_required=true,verification_status='pending' where id=keu10_test.id(15102);
set role authenticated;
select keu10_test.expect_error('55000',format('select public.revise_and_approve_surat(%L,%L,''Alasan revisi'',%L)',keu10_test.id(15100),keu10_test.id(15102),jsonb_set(keu10_test.full_form(keu10_test.id(15100)),'{judul_surat}','"Judul berubah"')));
select keu10_test.assert((select judul_surat='Perangkat kantor' and current_step=2 from public.surat_registrasi where id=keu10_test.id(15100)),'Blocked examination rolls back edits and approval');
reset role;
update public.surat_signatures set verification_status='verified',available_at=clock_timestamp()+interval '1 day' where id=keu10_test.id(15102);
set role authenticated;
select keu10_test.expect_error('55000',format('select public.revise_and_approve_surat(%L,%L,''Alasan revisi'',%L)',keu10_test.id(15100),keu10_test.id(15102),jsonb_set(keu10_test.full_form(keu10_test.id(15100)),'{judul_surat}','"Judul berubah"')));

-- A failed canonical approval rolls back history, notification and form changes.
reset role;
create function keu10_test.reject_direct_approval() returns trigger language plpgsql as $$begin
 if new.is_signed and old.id=keu10_test.id(15202) then raise exception 'Fixture canonical approval rejection' using errcode='23514';end if;
 return new;end $$;
create trigger test_direct_failure before update of is_signed on public.surat_signatures for each row execute function keu10_test.reject_direct_approval();
select keu10_test.direct_doc(15200);
set role authenticated;
select keu10_test.expect_error('23514',format('select public.revise_and_approve_surat(%L,%L,''Alasan revisi'',%L)',keu10_test.id(15200),keu10_test.id(15202),jsonb_set(keu10_test.full_form(keu10_test.id(15200)),'{judul_surat}','"Judul berubah"')));
select keu10_test.assert((select judul_surat='Perangkat kantor' and current_step=2 from public.surat_registrasi where id=keu10_test.id(15200)) and not exists(select 1 from public.surat_requester_revision_history where surat_id=keu10_test.id(15200)) and not exists(select 1 from public.notifications where data->>'surat_id'=keu10_test.id(15200)::text),'Failure has no partial revision, audit or notification');

-- KEU10 re-evaluates the unsigned director when Finance changes the amount.
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
insert into keu10_test.results(key,surat_id) select 'direct-keu',(public.create_keu10_registration(keu10_test.payload(190,2,1000000),keu10_test.signers(2,6))#>>'{surat,id}')::uuid;
select keu10_test.approve((select surat_id from keu10_test.results where key='direct-keu'),1);
select keu10_test.approve((select surat_id from keu10_test.results where key='direct-keu'),2);
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
select public.revise_and_approve_surat(surat_id,(select id from public.surat_signatures where surat_id=r.surat_id and step_order=3),'Harga aktual disesuaikan.',jsonb_set(keu10_test.full_form(surat_id),'{form_input_data,items,0,estimasi_harga_satuan}','2500000'),keu10_test.id(7)) from keu10_test.results r where key='direct-keu';
select keu10_test.assert((select current_step=4 and status='PROSES' and form_input_data->>'fund_amount'='2500000' from public.surat_registrasi where id=(select surat_id from keu10_test.results where key='direct-keu')),'KEU10 Finance advances without requester confirmation');
select keu10_test.assert((select user_id=keu10_test.id(7) and not is_signed from public.surat_signatures where surat_id=(select surat_id from keu10_test.results where key='direct-keu') and step_order=4),'KEU10 correct eligible director remains mandatory');
reset role;
select keu10_test.assert(not has_function_privilege('authenticated','requester_revision_internal.normalize_signer_form(uuid,uuid,text,jsonb)','execute') and not has_function_privilege('anon','public.revise_and_approve_surat(uuid,uuid,text,jsonb,uuid)','execute'),'Normalization remains private and public access requires an authenticated signer');
-- Protected identity/examination data and newly required prerequisites stay locked.
select keu10_test.direct_doc(15300,'unit');
update public.surat_registrasi set form_input_data=form_input_data||'{"requested_unit_count":30}' where id=keu10_test.id(15300);
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
select keu10_test.expect_error('42501',format('select public.revise_and_approve_surat(%L,%L,''Alasan revisi'',%L)',keu10_test.id(15300),keu10_test.id(15302),jsonb_set(keu10_test.full_form(keu10_test.id(15300)),'{form_input_data,allocated_units}','[]')));
select keu10_test.expect_error('55000',format('select public.revise_and_approve_surat(%L,%L,''Alasan revisi'',%L)',keu10_test.id(15300),keu10_test.id(15302),jsonb_set(keu10_test.full_form(keu10_test.id(15300)),'{form_input_data,requested_unit_count}','3')));
select keu10_test.expect_error('55000',format('select public.revise_and_approve_surat(%L,%L,''Alasan revisi'',%L)',keu10_test.id(15300),keu10_test.id(15302),jsonb_set(keu10_test.full_form(keu10_test.id(15300)),'{form_input_data,requires_recommendation}','true')));
select keu10_test.expect_error('22023',format('select public.revise_and_approve_surat(%L,%L,''Alasan revisi'',%L)',keu10_test.id(15300),keu10_test.id(15302),keu10_test.full_form(keu10_test.id(15300))));

-- The last signer can complete, not just advance to an intermediate stage.
select public.revise_and_approve_surat(keu10_test.id(15300),keu10_test.id(15302),'Perbaikan judul tanpa mengubah alokasi.',jsonb_set(keu10_test.full_form(keu10_test.id(15300)),'{judul_surat}','"Unit siap diproses"'));
select set_config('request.jwt.claim.sub',keu10_test.id(7)::text,false);
select public.revise_and_approve_surat(keu10_test.id(15300),keu10_test.id(15303),'Catatan judul diperjelas.',jsonb_set(keu10_test.full_form(keu10_test.id(15300)),'{judul_surat}','"Unit siap dilaksanakan"'));
select keu10_test.assert((select status in ('DONE','SELESAI') from public.surat_registrasi where id=keu10_test.id(15300)),'Last signer completes through canonical approval');
select keu10_test.assert((select jsonb_array_length(data_snapshot->'revision_history')=2
  and data_snapshot#>>'{revision_history,0,revision_mode}'='signer_direct'
  and data_snapshot#>>'{revision_history,1,before_snapshot,document,judul_surat}'='Unit siap diproses'
  and not data_snapshot ? 'revision'
  from public.surat_registrasi where id=keu10_test.id(15300)),'The immutable render payload contains both direct revisions, not a stale requester-return snapshot');

-- Authoritative KEU10 candidates cannot be read by an unrelated caller.
select set_config('request.jwt.claim.sub',keu10_test.id(8)::text,false);
select keu10_test.expect_error('42501',format('select * from public.get_signer_revision_final_candidates(%L)',(select id from public.surat_signatures where surat_id=(select surat_id from keu10_test.results where key='direct-keu') and step_order=4)));
select set_config('request.jwt.claim.sub',keu10_test.id(7)::text,false);
select keu10_test.assert((select count(*)=1 and bool_and(id=keu10_test.id(7)) from public.get_signer_revision_final_candidates((select id from public.surat_signatures where surat_id=(select surat_id from keu10_test.results where key='direct-keu') and step_order=4))),'A current final signer cannot select a replacement for their own signature');
select 'Direct signer revision: all assertions passed';

-- Legacy proposals in older clients remain valid and retain their before image.
reset role;
select keu10_test.direct_doc(15400);
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
do $$ declare event uuid;begin
 event:=public.request_surat_process_revision(keu10_test.id(15400),keu10_test.id(15402),'requester',null,
  'Usulan dari klien lama tetap dapat diproses.',jsonb_build_object('signer_full_proposal',true,
  'signer_proposed_form',jsonb_set(keu10_test.full_form(keu10_test.id(15400)),'{judul_surat}','"Usulan revisi lama"')));
 perform keu10_test.assert((select changes#>>'{signer_proposal_before,document,judul_surat}'='Perangkat kantor'
  and changes#>>'{signer_proposal_after,document,judul_surat}'='Usulan revisi lama' from public.surat_revision_events where id=event),
  'Legacy compatibility preserves original and proposed form evidence');
end $$;
