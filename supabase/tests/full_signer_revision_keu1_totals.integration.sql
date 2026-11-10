reset role;
insert into public.master_forms(id,nama_form,nomor_form)
 values(keu10_test.id(9930),'Kas Kecil','FM-UAI.KEU-01-00');
insert into public.form_usages(id,form_id,name,scope_type,status,first_maker_policy)
 values(keu10_test.id(9931),keu10_test.id(9930),'UJI KEU1','all','active','configured');
insert into public.form_usage_steps(id,usage_id,step_order,role_name,label,candidate_scope)
 values(keu10_test.id(9932),keu10_test.id(9931),1,'memeriksa','Pemeriksa','manual');
insert into public.form_usage_step_users(usage_step_id,user_id) values(keu10_test.id(9932),keu10_test.id(3));
insert into public.surat_registrasi(id,no_surat,form_usage_id,created_by,judul_surat,current_step,file_path,form_input_data)
 values(keu10_test.id(9933),'FULL/KEU1/TEST',keu10_test.id(9931),keu10_test.id(1),'Kas Kecil',1,'native://document/keu1',
 '{"fund_amount":500,"fund_type":"operational","keu1_grand_total":500,"free_cash_sisa_bulan_lalu":1000,
   "items":[{"id":"legacy","nama_barang":"Servis","keterangan":"Servis","jumlah":1,"satuan":"Unit","nominal":500,"estimasi_harga_satuan":500}]}');
insert into public.surat_signatures(id,surat_id,user_id,form_usage_step_id,step_order,role_name,is_signed,status)
 values(keu10_test.id(9934),keu10_test.id(9933),keu10_test.id(3),keu10_test.id(9932),1,'memeriksa',false,'PENDING');
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
insert into keu10_test.results(key,surat_id,event_id) values('full-keu1',keu10_test.id(9933),
 public.request_surat_process_revision(keu10_test.id(9933),keu10_test.id(9934),'requester',null,'Sesuaikan biaya Kas Kecil.',
 jsonb_build_object('signer_proposed_form',jsonb_set(jsonb_set(keu10_test.full_form(keu10_test.id(9933)),
 '{form_input_data,items,0,estimasi_harga_satuan}','2000'),'{form_input_data,items,0,jumlah}','2.5'))));
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
select public.accept_surat_process_revision((select event_id from keu10_test.results where key='full-keu1'),null);
select keu10_test.assert((select form_input_data->>'fund_amount'='4000' and form_input_data->>'keu1_grand_total'='5000'
 and form_input_data#>>'{items,0,total}'='5000' from public.surat_registrasi where id=keu10_test.id(9933)),
 'KEU1 decimal price calculation ignores stale legacy nominal and subtracts Free Cash');
select 'Full signer KEU1 totals: all assertions passed';
