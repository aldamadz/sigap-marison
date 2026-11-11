reset role;
insert into public.master_departments values(keu10_test.id(960),'HRD & GA','HRD');
insert into public.profiles(id,full_name,job_title,department_id,office_id) values
  (keu10_test.id(961),'Usman Huda','Staff Umum',keu10_test.id(960),keu10_test.id(201)),
  (keu10_test.id(962),'Tri Sulistyanto','Staff HRD',keu10_test.id(960),keu10_test.id(201)),
  (keu10_test.id(963),'HRD Manager','Manager HRD & GA',keu10_test.id(960),keu10_test.id(201));
update public.form_usage_steps set signer_department_id=keu10_test.id(960),label='Mgr. HRD & GA' where id=keu10_test.id(953);
insert into public.form_usage_step_users values(keu10_test.id(953),keu10_test.id(963));
-- Existing signatures were created before activation; their snapshots must survive it.
create temporary table legacy_before as select id,verifier_snapshot,verification_required,input_schema_snapshot,action_type
  from public.surat_signatures where form_usage_step_id=keu10_test.id(953);
select keu10_test.assert(hrd_ga_review_internal.configure(1)=1,'One exact configured HRD stage');
select keu10_test.assert(hrd_ga_review_internal.configure(1)=1,'Configuration activation is repeatable');
update public.surat_signatures set catatan=catatan where form_usage_step_id=keu10_test.id(953);
select keu10_test.assert(not exists(select 1 from legacy_before b join public.surat_signatures s using(id)
  where (s.verifier_snapshot,s.verification_required,s.input_schema_snapshot,s.action_type)
    is distinct from (b.verifier_snapshot,b.verification_required,b.input_schema_snapshot,b.action_type)),'Legacy snapshots preserved');
select keu10_test.assert(not has_schema_privilege('authenticated','hrd_ga_review_internal','usage')
  and not has_function_privilege('service_role','hrd_ga_review_internal.configure(integer)','execute'),'Routing helpers are private');

create function keu10_test.hrd_payload(n integer, category text) returns jsonb language plpgsql as $$
declare payload jsonb := keu10_test.payload(n,2,1000);
begin
 return payload || jsonb_build_object('form_usage_id',keu10_test.id(951),'file_path','native://document/hrd-test/'||n,
   'data_snapshot','{}'::jsonb,'policy_snapshot',jsonb_build_object('hrd_ga_review',jsonb_build_object('reviewer','FORGED')),
   'form_input_data',jsonb_build_object('request_category','non_asset','items',jsonb_build_array(
     jsonb_build_object('id','line-1','nama_barang','Synthetic request','jumlah',1,'satuan','Unit','hrd_ga_category',category))));
end $$;
create function keu10_test.hrd_plan() returns jsonb language sql as $$
 select jsonb_build_array(
  jsonb_build_object('form_usage_step_id',keu10_test.id(952),'user_id',keu10_test.id(1)),
  jsonb_build_object('form_usage_step_id',keu10_test.id(953),'user_id',keu10_test.id(963)),
  jsonb_build_object('form_usage_step_id',keu10_test.id(954),'user_id',keu10_test.id(7)))
$$;
grant execute on function keu10_test.hrd_payload(integer,text),keu10_test.hrd_plan() to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
do $$ declare payload jsonb := keu10_test.hrd_payload(130,'ga'); doc uuid; sig uuid; result jsonb;
begin
  perform keu10_test.expect_error('22023',format('select public.create_registration_with_signer_plan(%L,%L)',
    jsonb_set(payload,'{form_input_data,items,0,hrd_ga_category}','null'),keu10_test.hrd_plan()));
  perform keu10_test.expect_error('22023',format('select public.create_registration_with_signer_plan(%L,%L)',
    jsonb_set(payload,'{form_input_data,items}',payload#>'{form_input_data,items}' ||
      jsonb_build_array(jsonb_build_object('hrd_ga_category','hrd'))),keu10_test.hrd_plan()));
  result := public.create_registration_with_signer_plan(payload,keu10_test.hrd_plan()); doc := (result#>>'{surat,id}')::uuid;
  select id into sig from public.surat_signatures where surat_id=doc and step_order=2;
  perform keu10_test.assert(result#>>'{surat,policy_snapshot,hrd_ga_review,reviewer,user_id}'=keu10_test.id(961)::text,'Server ignores forged reviewer');
  perform keu10_test.assert((select verifier_snapshot->0->>'user_id'=keu10_test.id(961)::text
    and jsonb_array_length(verifier_snapshot)=1 and verification_required and action_type='approval'
    and input_schema_snapshot->'fields'='[]'::jsonb and verification_status='pending'
    from public.surat_signatures where id=sig),'GA assigned only to Usman without mandatory input');
  perform keu10_test.expect_error('42501',format('update public.surat_registrasi set policy_snapshot=policy_snapshot-''hrd_ga_review'' where id=%L',doc));
  perform keu10_test.expect_error('22023',format('update public.surat_registrasi set form_input_data=jsonb_set(form_input_data,''{items,0,hrd_ga_category}'',''"hrd"'') where id=%L',doc));
  update public.surat_registrasi set form_input_data=jsonb_set(form_input_data,'{items}',
    (form_input_data->'items')||jsonb_build_array(jsonb_build_object('id','revision-add','nama_barang','New GA item','jumlah',2))) where id=doc;
  perform keu10_test.assert((select form_input_data#>>'{items,1,hrd_ga_category}'='ga' from public.surat_registrasi where id=doc),'Revision additions inherit frozen category');
  perform keu10_test.approve(doc,1);
  perform set_config('request.jwt.claim.sub',keu10_test.id(963)::text,false);
  perform keu10_test.expect_error('P0001',format('select public.handle_approve_surat_v2(%L,%L,null,%L)',sig,doc,'native://document/'||doc||'/approval/test-pending'));
  perform set_config('request.jwt.claim.sub',keu10_test.id(962)::text,false);
  perform keu10_test.expect_error('P0001',format('select public.verify_surat_signature_v2(%L,null,''{}'')',sig));
  perform set_config('request.jwt.claim.sub',keu10_test.id(961)::text,false);
  perform keu10_test.expect_error('P0001',format('select public.handle_approve_surat_v2(%L,%L,null,%L)',sig,doc,'native://document/'||doc||'/approval/test-examiner'));
  perform public.verify_surat_signature_v2(sig,null,'{}');
  perform keu10_test.assert((select verified_by=keu10_test.id(961) and verification_status='verified' and not is_signed from public.surat_signatures where id=sig),'Completion records examiner, not manager approval');
  perform keu10_test.approve(doc,2); perform keu10_test.approve(doc,3);
  perform keu10_test.assert((select status='DONE' from public.surat_registrasi where id=doc),'Manager and final signer complete after examiner');
  perform set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
  result := public.create_registration_with_signer_plan(keu10_test.hrd_payload(131,'hrd'),keu10_test.hrd_plan());
  perform keu10_test.assert((select verifier_snapshot->0->>'user_id'=keu10_test.id(962)::text and jsonb_array_length(verifier_snapshot)=1
    from public.surat_signatures where surat_id=(result#>>'{surat,id}')::uuid and step_order=2),'HRD assigned only to Tri');
  doc := (result#>>'{surat,id}')::uuid;
  perform keu10_test.approve(doc,1);
  select id into sig from public.surat_signatures where surat_id=doc and step_order=2;
  perform set_config('request.jwt.claim.sub',keu10_test.id(962)::text,false);
  perform public.request_surat_process_revision(doc,sig,'requester',null,'Lengkapi rincian perjalanan dinas',jsonb_build_object('requester_edit_required',true));
  perform keu10_test.assert(exists(select 1 from public.surat_revision_events where surat_id=doc
    and actor_id=keu10_test.id(962) and target_type='requester' and status='open'),'Examiner can return with an attributed reason');
end $$;

reset role;
update public.profiles set is_active=false where id=keu10_test.id(961);
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
do $$ declare payload jsonb := keu10_test.hrd_payload(132,'ga'); begin
 perform keu10_test.expect_error('22023',format('select public.create_registration_with_signer_plan(%L,%L)',payload,keu10_test.hrd_plan()));
end $$;
reset role;
update public.profiles set is_active=true where id=keu10_test.id(961);
select 'HRD GA review: all assertions passed';
