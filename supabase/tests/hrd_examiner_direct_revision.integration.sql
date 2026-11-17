reset role;
create function keu10_test.examiner_doc(n integer) returns uuid language plpgsql security definer as $$
declare doc uuid;begin
 doc:=keu10_test.direct_doc(n,'goods');
 update public.surat_signatures set verification_required=true,verification_status='pending',
  input_schema_snapshot='{"fields":[],"hrd_ga_review":{"mode":"claim"}}',
  verifier_snapshot=jsonb_build_array(jsonb_build_object('user_id',keu10_test.id(9974),'full_name','Usman fixture'),
    jsonb_build_object('user_id',keu10_test.id(9975),'full_name','Tri fixture')) where id=keu10_test.id(n+2);
 return doc;
end $$;
grant execute on function keu10_test.examiner_doc(integer) to authenticated;
select keu10_test.examiner_doc(16000);
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(9974)::text,false);
select keu10_test.expect_error('42501',format('select public.revise_and_complete_hrd_examination(%L,%L,''Sesuaikan stok.'',%L)',
 keu10_test.id(16000),keu10_test.id(16002),jsonb_set(keu10_test.full_form(keu10_test.id(16000)),'{form_input_data,items,0,jumlah}','1')));
select public.claim_hrd_ga_examination(keu10_test.id(16002));
-- Another candidate, requester and even the manager cannot edit a claimed task.
select set_config('request.jwt.claim.sub',keu10_test.id(9975)::text,false);
select keu10_test.expect_error('42501',format('select public.revise_and_complete_hrd_examination(%L,%L,''Sesuaikan stok.'',%L)',
 keu10_test.id(16000),keu10_test.id(16002),jsonb_set(keu10_test.full_form(keu10_test.id(16000)),'{form_input_data,items,0,jumlah}','1')));
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
select keu10_test.expect_error('42501',format('select public.revise_and_complete_hrd_examination(%L,%L,''Sesuaikan stok.'',%L)',
 keu10_test.id(16000),keu10_test.id(16002),jsonb_set(keu10_test.full_form(keu10_test.id(16000)),'{form_input_data,items,0,jumlah}','1')));
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
select keu10_test.expect_error('42501',format('select public.revise_and_complete_hrd_examination(%L,%L,''Sesuaikan stok.'',%L)',
 keu10_test.id(16000),keu10_test.id(16002),jsonb_set(keu10_test.full_form(keu10_test.id(16000)),'{form_input_data,items,0,jumlah}','1')));
select set_config('request.jwt.claim.sub',keu10_test.id(9974)::text,false);
select keu10_test.expect_error('42501',format('select public.revise_and_complete_hrd_examination(%L,%L,''Sesuaikan stok.'',%L)',
 keu10_test.id(16000),keu10_test.id(16002),jsonb_set(keu10_test.full_form(keu10_test.id(16000)),'{form_input_data,allocated_units}','[]')));
select keu10_test.expect_error('55000',format('select public.revise_and_complete_hrd_examination(%L,%L,''Sesuaikan stok.'',%L)',
 keu10_test.id(16000),keu10_test.id(16002),jsonb_set(keu10_test.full_form(keu10_test.id(16000)),'{form_input_data,requires_recommendation}','true')));
do $$declare result jsonb; event uuid;begin
 result:=public.revise_and_complete_hrd_examination(keu10_test.id(16000),keu10_test.id(16002),'Sesuaikan stok dan spesifikasi.',
   jsonb_set(jsonb_set(keu10_test.full_form(keu10_test.id(16000)),'{form_input_data,items,0,jumlah}','1.5'),'{form_input_data,items,0,spesifikasi}','"RAM 16GB"'));
 event:=(result->>'revision_event_id')::uuid;
 perform keu10_test.assert((select current_step=2 and status='PROSES' and form_input_data#>>'{items,0,jumlah}'='1.5'
   and data_snapshot#>>'{revision_history,0,revision_mode}'='examiner_direct' and pdf_path is null
   from public.surat_registrasi where id=keu10_test.id(16000)),'Examiner edits without advancing manager stage, caches invalidated');
 perform keu10_test.assert((select user_id=keu10_test.id(3) and not is_signed and verified_by=keu10_test.id(9974)
   and verification_status='verified' from public.surat_signatures where id=keu10_test.id(16002)),'Canonical verification retains unsigned manager');
 perform keu10_test.assert((select status='resolved' and actor_id=keu10_test.id(9974) and changes->>'requester_confirmation_required'='false'
   from public.surat_revision_events where id=event),'No pending requester action or false approval');
 perform keu10_test.assert((select requested_by=keu10_test.id(9974) and submitted_by=keu10_test.id(9974)
   and before_snapshot#>>'{document,form_input_data,items,0,jumlah}'='2'
   and after_snapshot#>>'{document,form_input_data,items,0,jumlah}'='1.5'
   from public.surat_requester_revision_history where revision_event_id=event),'Immutable examiner evidence preserves before/after');
 perform keu10_test.assert((select count(*)=1 from public.notifications where user_id=keu10_test.id(1)
   and data->>'revision_event_id'=event::text and link='/status-pengajuan?document='||keu10_test.id(16000)::text),'One requester notification to exact document');
 perform keu10_test.assert((select count(*)=1 from public.notifications where user_id=keu10_test.id(3)
   and data->>'signature_id'=keu10_test.id(16002)::text and link='/surat/inbox?task=approval%3A'||keu10_test.id(16002)::text),'Manager receives approval task, not examiner signature');
 perform keu10_test.expect_error('42501',format('select public.revise_and_complete_hrd_examination(%L,%L,''Ulangi revisi.'',%L)',
   keu10_test.id(16000),keu10_test.id(16002),keu10_test.full_form(keu10_test.id(16000))));
end $$;
-- A later signer revision must preserve the examiner's evidence in its new PDF.
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
select public.revise_and_approve_surat(keu10_test.id(16000),keu10_test.id(16002),'Perjelas judul pengajuan.',
 jsonb_set(keu10_test.full_form(keu10_test.id(16000)),'{judul_surat}','"Barang siap dipenuhi"'));
select keu10_test.assert((select data_snapshot#>>'{revision_history,0,revision_mode}'='examiner_direct'
 and data_snapshot#>>'{revision_history,1,revision_mode}'='signer_direct' and current_step=3
 from public.surat_registrasi where id=keu10_test.id(16000)),'Later manager approval keeps examiner attribution and distinct approval');

-- Canonical verification failure is atomic: form, events, audit and notifications roll back.
reset role;
select keu10_test.examiner_doc(16100);
create function keu10_test.reject_examiner_completion() returns trigger language plpgsql as $$begin
 if new.id=keu10_test.id(16102) and new.verification_status='verified' then
  raise exception 'Fixture verification rejection' using errcode='23514';end if;return new;end $$;
create trigger test_examiner_failure before update on public.surat_signatures for each row execute function keu10_test.reject_examiner_completion();
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(9974)::text,false);
select public.claim_hrd_ga_examination(keu10_test.id(16102));
select keu10_test.expect_error('23514',format('select public.revise_and_complete_hrd_examination(%L,%L,''Sesuaikan stok.'',%L)',
 keu10_test.id(16100),keu10_test.id(16102),jsonb_set(keu10_test.full_form(keu10_test.id(16100)),'{form_input_data,items,0,jumlah}','1')));
select keu10_test.assert((select form_input_data#>>'{items,0,jumlah}'='2' from public.surat_registrasi where id=keu10_test.id(16100))
 and not exists(select 1 from public.surat_requester_revision_history where surat_id=keu10_test.id(16100))
 and not exists(select 1 from public.surat_revision_events where surat_id=keu10_test.id(16100))
 and not exists(select 1 from public.notifications where data->>'surat_id'=keu10_test.id(16100)::text),'Verification failure leaves no partial edit/audit/notification');
reset role;
select keu10_test.examiner_doc(16200);
update public.surat_registrasi set form_input_data=form_input_data||'{"fund_amount":8000,"free_cash_sisa_bulan_lalu":1000,"keu1_grand_total":9000,
 "items":[{"id":"a","keterangan":"ATK","jumlah":3,"satuan":"rim","estimasi_harga_satuan":3000,"total":9000}]}' where id=keu10_test.id(16200);
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(9974)::text,false);
select public.claim_hrd_ga_examination(keu10_test.id(16202));
select public.revise_and_complete_hrd_examination(keu10_test.id(16200),keu10_test.id(16202),'Kurangi jumlah biaya ATK.',
 jsonb_set(keu10_test.full_form(keu10_test.id(16200)),'{form_input_data,items,0,jumlah}','2'));
select keu10_test.assert((select form_input_data->>'fund_amount'='5000' and form_input_data->>'keu1_grand_total'='6000'
 and form_input_data#>>'{items,0,total}'='6000' from public.surat_registrasi where id=keu10_test.id(16200)),'Petty cash totals use normalized items and Free Cash, not client totals');
reset role;
select keu10_test.examiner_doc(16300);
set role authenticated;
select public.claim_hrd_ga_examination(keu10_test.id(16302));
reset role;
update public.surat_signatures set available_at=clock_timestamp()+interval '1 day' where id=keu10_test.id(16302);
set role authenticated;
select keu10_test.expect_error('55000',format('select public.revise_and_complete_hrd_examination(%L,%L,''Sesuaikan stok.'',%L)',
 keu10_test.id(16300),keu10_test.id(16302),jsonb_set(keu10_test.full_form(keu10_test.id(16300)),'{form_input_data,items,0,jumlah}','1')));
select keu10_test.expect_error('42501',format('select public.revise_and_complete_hrd_examination(%L,%L,''Sesuaikan stok.'',%L)',
 keu10_test.id(16300),keu10_test.id(16202),jsonb_set(keu10_test.full_form(keu10_test.id(16300)),'{form_input_data,items,0,jumlah}','1')));
reset role;
select keu10_test.assert(not has_function_privilege('anon','public.revise_and_complete_hrd_examination(uuid,uuid,text,jsonb)','execute')
 and not has_function_privilege('service_role','public.revise_and_complete_hrd_examination(uuid,uuid,text,jsonb)','execute'),'No anonymous/service role mutation privilege');
select 'HRD examiner direct revision: all assertions passed';
