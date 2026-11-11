set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
do $$
declare payload jsonb:=keu10_test.payload(180,2,1000); plan jsonb; result jsonb; doc_id uuid;
begin
 payload:=payload||jsonb_build_object('form_usage_id',keu10_test.id(951),'policy_snapshot','{}'::jsonb,
  'form_input_data',jsonb_build_object('request_category','non_asset'),'data_snapshot','{}'::jsonb);
 plan:=jsonb_build_array(jsonb_build_object('form_usage_step_id',keu10_test.id(952),'user_id',keu10_test.id(1)),
   jsonb_build_object('form_usage_step_id',keu10_test.id(954),'user_id',keu10_test.id(7)));
 result:=public.create_registration_with_signer_plan(payload,plan);doc_id:=(result#>>'{surat,id}')::uuid;
 perform keu10_test.assert((select count(*)=2 from public.surat_signatures where surat_id=doc_id),'Ordinary configured examiner can be removed');
 perform keu10_test.assert(result#>>'{surat,policy_snapshot,signer_plan,0,route_version}'='2','Frozen editable route version');
 perform keu10_test.assert(result#>>'{surat,policy_snapshot,signer_plan,0,omitted_configured_steps,0,id}'=keu10_test.id(953)::text,'Server attribution of omitted configured step');
 perform keu10_test.assert(result#>>'{surat,policy_snapshot,signer_plan_captured_by}'=keu10_test.id(1)::text,'Actor recorded');
 perform keu10_test.assert(public.create_registration_with_signer_plan(payload,plan)->>'created'='false','Idempotent reduced retry');
 perform keu10_test.expect_error('40001',format('select public.create_registration_with_signer_plan(%L,%L)',payload,
  jsonb_build_array(plan->0,jsonb_build_object('form_usage_step_id',keu10_test.id(953),'user_id',keu10_test.id(5)),plan->1)));
 perform keu10_test.expect_error('42501',format('delete from public.surat_signatures where surat_id=%L and step_order=2',doc_id));
 perform keu10_test.expect_error('42501',format('update public.surat_registrasi set policy_snapshot=jsonb_set(policy_snapshot,''{signer_plan,0,omitted_configured_steps}'',''[]'') where id=%L',doc_id));
 perform keu10_test.approve(doc_id,1);perform keu10_test.approve(doc_id,2);
 perform keu10_test.assert((select status='DONE' from public.surat_registrasi where id=doc_id),'Reduced ordinary route completes');
 perform set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
end $$;

-- All special KEU10 controls remain; only its ordinary examiner can be omitted.
do $$declare payload jsonb:=keu10_test.payload(181,2,1000); plan jsonb:=keu10_test.signers(2,6); result jsonb; doc_id uuid;begin
 perform keu10_test.expect_error('22023',format('select public.create_registration_with_signer_plan(%L,%L)',payload,plan-2));
 perform keu10_test.expect_error('22023',format('select public.create_registration_with_signer_plan(%L,%L)',payload,plan-3));
 plan:=plan-1;
 result:=public.create_registration_with_signer_plan(payload,plan);doc_id:=(result#>>'{surat,id}')::uuid;
 perform keu10_test.assert((select count(*)=3 from public.surat_signatures where surat_id=doc_id),'Reduced KEU10 retains BM Finance and director');
 perform keu10_test.assert((select jsonb_array_length(render_payload->'signatures')=3 from public.document_pdf_jobs where surat_id=doc_id and signature_id is null),'Frozen KEU10 PDF has effective three signers');
 perform keu10_test.approve(doc_id,1);perform keu10_test.approve(doc_id,2);perform keu10_test.approve(doc_id,3);
 perform keu10_test.assert((select status='DONE' from public.surat_registrasi where id=doc_id),'Reduced KEU10 completes with Finance/director checks');
 perform set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
end $$;

-- Two rows representing one person cannot pass the new policy.
do $$declare payload jsonb:=keu10_test.payload(184,2,2000000);plan jsonb:=keu10_test.signers(2,6)-1;
 result jsonb;doc_id uuid;signature_id uuid;event_id uuid;begin
 result:=public.create_registration_with_signer_plan(payload,plan);doc_id:=(result#>>'{surat,id}')::uuid;
 perform keu10_test.approve(doc_id,1);
 select id into signature_id from public.surat_signatures where surat_id=doc_id and step_order=2;
 perform set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
 event_id:=public.request_surat_process_revision(doc_id,signature_id,'requester',1,'Perbaiki estimasi biaya.',
  jsonb_build_object('keu10_proposed_input',jsonb_build_object('items',jsonb_build_array(jsonb_build_object(
   'id','line_1','keterangan','Estimasi baru','jumlah',1,'satuan','Paket','estimasi_harga_satuan',3000000)))));
 perform set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
 perform public.accept_keu10_requester_revision(event_id,null,'Setuju revisi',keu10_test.id(7));
 perform keu10_test.assert((select user_id=keu10_test.id(7) from public.surat_signatures where surat_id=doc_id and step_order=3),'Reduced route still recalculates final director above threshold');
 perform keu10_test.approve(doc_id,1);perform keu10_test.approve(doc_id,2);perform keu10_test.approve(doc_id,3);
 perform keu10_test.assert((select status='DONE' from public.surat_registrasi where id=doc_id),'Revised reduced KEU10 completes');
 perform set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
end $$;

do $$declare payload jsonb:=keu10_test.payload(182,2,1000); plan jsonb;begin
 payload:=payload||jsonb_build_object('form_usage_id',keu10_test.id(951),'policy_snapshot','{}'::jsonb,
  'form_input_data',jsonb_build_object('request_category','non_asset'),'data_snapshot','{}'::jsonb);
 plan:=jsonb_build_array(jsonb_build_object('form_usage_step_id',keu10_test.id(952),'user_id',keu10_test.id(1)),
  jsonb_build_object('form_usage_step_id',keu10_test.id(954),'user_id',keu10_test.id(1)));
 perform keu10_test.expect_error('22023',format('select public.create_registration_with_signer_plan(%L,%L)',payload,plan));
 perform keu10_test.expect_error('22023',format('select public.create_registration_with_signer_plan(%L,%L)',payload,jsonb_build_array(plan->0)));
 perform keu10_test.assert(not exists(select 1 from public.surat_registrasi where no_surat=payload->>'no_surat'),'Invalid reduced request leaves no document');
end $$;

reset role;
update public.form_usage_steps set action_type='unit_allocation' where id=keu10_test.id(953);
set role authenticated;
do $$declare payload jsonb:=keu10_test.payload(183,2,1000);plan jsonb;begin
 payload:=payload||jsonb_build_object('form_usage_id',keu10_test.id(951),'policy_snapshot','{}'::jsonb,
  'form_input_data',jsonb_build_object('request_category','non_asset'),'data_snapshot','{}'::jsonb);
 plan:=jsonb_build_array(jsonb_build_object('form_usage_step_id',keu10_test.id(952),'user_id',keu10_test.id(1)),
   jsonb_build_object('form_usage_step_id',keu10_test.id(954),'user_id',keu10_test.id(7)));
 perform keu10_test.expect_error('22023',format('select public.create_registration_with_signer_plan(%L,%L)',payload,plan));
end $$;
reset role;
update public.form_usage_steps set action_type='approval' where id=keu10_test.id(953);
select keu10_test.assert(not has_function_privilege('authenticated','signer_plan_internal.create_reduced_keu10(jsonb,jsonb)','execute'),'Private initializer unavailable');
select 'Configured signer removal: all assertions passed';
