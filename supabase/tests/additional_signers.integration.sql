set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
select keu10_test.assert(not has_function_privilege('anon','public.create_registration_with_signer_plan(jsonb,jsonb)','execute'),'Anonymous cannot create plan');
select keu10_test.assert(not has_schema_privilege('authenticated','signer_plan_internal','usage'),'Private permits unavailable to requester');

do $$
declare v_payload jsonb := keu10_test.payload(81,2,2000000); v_plan jsonb; v_result jsonb; v_id uuid; v_extra jsonb;
begin
  select jsonb_agg(value||jsonb_build_object('role_name',step.role_name,'is_additional',false) order by ordinality)
    into v_plan from jsonb_array_elements(keu10_test.signers(2,6)) with ordinality
    join public.form_usage_steps step on step.id=(value->>'form_usage_step_id')::uuid;
  v_extra := jsonb_build_object('is_additional',true,'client_id',keu10_test.id(9001),'user_id',keu10_test.id(11),'role_name','memeriksa');
  v_plan := jsonb_build_array(v_plan->0,v_plan->1,v_extra,v_plan->2,v_plan->3,
    jsonb_build_object('is_additional',true,'client_id',keu10_test.id(9002),'user_id',keu10_test.id(10),'role_name','menyetujui'));
  perform keu10_test.expect_error('22023',format('select public.create_registration_with_signer_plan(%L,%L)',v_payload,v_plan-1));
  perform keu10_test.assert(not exists(select 1 from public.surat_registrasi where no_surat=v_payload->>'no_surat'),'Missing mandatory signer rolls back');
  perform keu10_test.expect_error('22023',format('select public.create_registration_with_signer_plan(%L,%L)',v_payload,
    jsonb_set(v_plan,'{2,user_id}',v_plan#>'{0,user_id}')));
  perform keu10_test.expect_error('22023',format('select public.create_registration_with_signer_plan(%L,%L)',v_payload,
    jsonb_set(v_plan,'{2,is_additional}','"true"')));
  perform keu10_test.expect_error('22023',format('select public.create_registration_with_signer_plan(%L,%L)',v_payload,
    jsonb_build_array(v_plan->0,v_plan->3,v_plan->2,v_plan->1,v_plan->4,v_plan->5)));
  v_result := public.create_registration_with_signer_plan(v_payload,v_plan);
  v_id := (v_result#>>'{surat,id}')::uuid;
  perform keu10_test.assert(v_result->>'created'='true','New route created atomically');
  insert into keu10_test.results(key,surat_id,input) values('additional-keu',v_id,jsonb_build_object('payload',v_payload,'signers',v_plan));
  perform keu10_test.assert((select count(*)=6 and count(*) filter(where is_additional)=2 from public.surat_signatures where surat_id=v_id),'Mandatory and additional rows retained');
  perform keu10_test.assert((select array_agg(step_order order by step_order)=array[1,2,3,4,5,6] from public.surat_signatures where surat_id=v_id),'Contiguous runtime order');
  perform keu10_test.assert((select count(*)=6 from public.document_pdf_jobs,lateral jsonb_array_elements(render_payload->'signatures') signature where surat_id=v_id),'Initial frozen PDF contains all signers');
  v_result := public.create_registration_with_signer_plan(v_payload,v_plan);
  perform keu10_test.assert(v_result->>'created'='false','Retry returns same route');
  perform keu10_test.expect_error('40001',format('select public.create_registration_with_signer_plan(%L,%L)',v_payload,
    jsonb_set(v_plan,'{2,user_id}',to_jsonb(keu10_test.id(12)::text))));
  perform keu10_test.expect_error('42501',format('delete from public.surat_signatures where surat_id=%L',v_id));
  perform keu10_test.expect_error('42501',format('update public.surat_signatures set step_order=8 where surat_id=%L and is_additional',v_id));
  perform keu10_test.expect_error('42501',format('update public.surat_registrasi set policy_snapshot=policy_snapshot-''signer_plan'' where id=%L',v_id));
  perform keu10_test.expect_error('42501',format('insert into public.surat_signatures(surat_id,user_id,step_order,role_name) values(%L,%L,7,''memeriksa'')',v_id,keu10_test.id(12)));
  perform keu10_test.approve(v_id,1); perform keu10_test.approve(v_id,2);
  perform keu10_test.approve(v_id,3); perform keu10_test.approve(v_id,4);
  perform keu10_test.approve(v_id,5);
  perform keu10_test.assert((select status='PROSES' and current_step=6 from public.surat_registrasi where id=v_id),'Mandatory director does not skip final added signer');
  perform keu10_test.approve(v_id,6);
  perform keu10_test.assert((select status='DONE' from public.surat_registrasi where id=v_id),'All six approvals complete route');
end $$;

reset role;
insert into public.master_forms(id,nama_form,nomor_form) values(keu10_test.id(950),'PGD','FM-UAI.PGD-01-00');
insert into public.form_usages(id,form_id,name,request_category,scope_type,status)
  values(keu10_test.id(951),keu10_test.id(950),'Ordinary submission','non_asset','cabang','active');
insert into public.form_usage_departments values(keu10_test.id(951),keu10_test.id(105));
insert into public.form_usage_steps(id,usage_id,step_order,role_name,label,action_type,assignee_mode) values
 (keu10_test.id(952),keu10_test.id(951),1,'membuat','Requester','approval','requester'),
 (keu10_test.id(953),keu10_test.id(951),2,'memeriksa','Business','approval','select'),
 (keu10_test.id(954),keu10_test.id(951),3,'menyetujui','Director','approval','select');
insert into public.form_usage_step_users values(keu10_test.id(953),keu10_test.id(5)),(keu10_test.id(954),keu10_test.id(7));
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
do $$
declare v_payload jsonb := keu10_test.payload(82,2,1000); v_plan jsonb; v_result jsonb; v_id uuid; v_sig uuid; v_event uuid;
begin
  v_payload := v_payload||jsonb_build_object('form_usage_id',keu10_test.id(951),
    'file_path','native://document/additional/82','form_input_data',jsonb_build_object('request_category','non_asset'),
    'policy_snapshot',jsonb_build_object('recommendation_config',jsonb_build_object('required_before_step',2),
      'external_revision_policy',jsonb_build_object('recipient_type','signer','recipient_step_order',2,'approval_restart_step',1)),
    'data_snapshot','{}'::jsonb);
  v_plan := jsonb_build_array(
    jsonb_build_object('is_additional',true,'client_id',keu10_test.id(9101),'user_id',keu10_test.id(8),'role_name','membuat'),
    jsonb_build_object('form_usage_step_id',keu10_test.id(952),'user_id',keu10_test.id(1)),
    jsonb_build_object('is_additional',true,'client_id',keu10_test.id(9102),'user_id',keu10_test.id(11),'role_name','memeriksa'),
    jsonb_build_object('form_usage_step_id',keu10_test.id(953),'user_id',keu10_test.id(5)),
    jsonb_build_object('form_usage_step_id',keu10_test.id(954),'user_id',keu10_test.id(7)));
  perform keu10_test.expect_error('P0001',format('select public.create_registration_with_signer_plan(%L,%L)',v_payload,
    jsonb_set(v_plan,'{3,user_id}',to_jsonb(keu10_test.id(12)::text))));
  v_result := public.create_registration_with_signer_plan(v_payload,v_plan); v_id := (v_result#>>'{surat,id}')::uuid;
  perform keu10_test.assert(v_result#>>'{surat,policy_snapshot,recommendation_config,required_before_step}'='4','Recommendation prerequisite follows configured examiner');
  perform keu10_test.assert(v_result#>>'{surat,policy_snapshot,external_revision_policy,recipient_step_order}'='4','Revision recipient follows configured examiner');
  perform keu10_test.assert(v_result#>>'{surat,policy_snapshot,external_revision_policy,approval_restart_step}'='1','Restart includes earlier additions');
  perform keu10_test.expect_error('42501',format('update public.surat_signatures set signer_snapshot=''{}'' where surat_id=%L',v_id));
  perform keu10_test.expect_error('42501',format('update public.surat_signatures set user_id=%L where surat_id=%L and step_order=4',keu10_test.id(12),v_id));
  perform keu10_test.expect_error('42501',format('update public.surat_signatures set is_additional=true where surat_id=%L and step_order=4',v_id));
  perform keu10_test.expect_error('42501',format('update public.surat_signatures set surat_id=%L where surat_id=%L and is_additional',
    (select surat_id from keu10_test.results where key='additional-keu'),v_id));
  perform keu10_test.approve(v_id,1); perform keu10_test.approve(v_id,2);
  select id into v_sig from public.surat_signatures where surat_id=v_id and step_order=3;
  perform set_config('request.jwt.claim.sub',keu10_test.id(11)::text,false);
  v_event := public.request_surat_process_revision(v_id,v_sig,'requester',1,'Please correct the request details','{}');
  perform set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
  perform public.accept_surat_process_revision(v_event,'Request corrected');
  perform keu10_test.assert((select count(*)=5 from public.surat_signatures where surat_id=v_id),'Return preserves all signers');
  perform keu10_test.assert((select policy_snapshot->'signer_plan'=v_result#>'{surat,policy_snapshot,signer_plan}' from public.surat_registrasi where id=v_id),'Return preserves frozen plan');
  insert into public.surat_registration_drafts(id,revision_event_id,created_by,no_surat,signer_assignments)
    select keu10_test.id(9801),v_event,keu10_test.id(1),v_payload->>'no_surat',jsonb_agg(jsonb_build_object(
      'step_order',step_order,'user_id',user_id,'role_name',role_name,'form_usage_step_id',form_usage_step_id) order by step_order)
    from public.surat_signatures where surat_id=v_id;
  perform keu10_test.assert((select count(*)=2 from public.surat_registration_drafts,
    lateral jsonb_array_elements(signer_assignments) signer where id=keu10_test.id(9801)
    and signer->>'is_additional'='true' and signer->>'client_id' is not null),'Revision draft restores additional labels and identity');
  perform keu10_test.approve(v_id,1); perform keu10_test.approve(v_id,2); perform keu10_test.approve(v_id,3);
  perform keu10_test.approve(v_id,4); perform keu10_test.approve(v_id,5);
  perform keu10_test.assert((select status='DONE' from public.surat_registrasi where id=v_id),'Ordinary route completes after added approvals');
end $$;

-- Threshold corrections keep additions and replace the final mandatory director,
-- even when another added approver follows that director in the actual route.
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
do $$
declare v_payload jsonb := keu10_test.payload(84,2,2000000); v_plan jsonb; v_result jsonb; v_id uuid; v_sig uuid; v_event uuid; v_items jsonb;
begin
  v_plan := keu10_test.signers(2,6)||jsonb_build_array(jsonb_build_object('is_additional',true,
    'client_id',keu10_test.id(9201),'user_id',keu10_test.id(11),'role_name','menyetujui'));
  v_result := public.create_registration_with_signer_plan(v_payload,v_plan); v_id := (v_result#>>'{surat,id}')::uuid;
  perform keu10_test.approve(v_id,1); perform keu10_test.approve(v_id,2);
  select id into v_sig from public.surat_signatures where surat_id=v_id and step_order=3;
  perform set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
  v_event := public.request_surat_process_revision(v_id,v_sig,'requester',1,'Correct quantity and price',
    jsonb_build_object('keu10_proposed_input',jsonb_build_object('items',jsonb_build_array(jsonb_build_object(
      'id','line_1','keterangan','Corrected estimate','jumlah',1,'satuan','Paket','estimasi_harga_satuan',3000000)))));
  perform set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
  perform public.accept_keu10_requester_revision(v_event,null,'Requester agrees',keu10_test.id(7));
  perform keu10_test.assert((select user_id=keu10_test.id(7) from public.surat_signatures where surat_id=v_id and step_order=4),'Threshold updates mandatory director');
  perform keu10_test.assert((select user_id=keu10_test.id(11) and is_additional from public.surat_signatures where surat_id=v_id and step_order=5),'Last added approver retained');
  perform keu10_test.assert((select jsonb_array_length(signatures_snapshot)=5 from public.surat_external_revision_history where surat_id=v_id),'Version history includes additions');
  for v_sig in select id from public.surat_signatures where surat_id=v_id order by step_order loop
    perform keu10_test.approve(v_id,(select step_order from public.surat_signatures where id=v_sig));
  end loop;
  perform keu10_test.assert((select status='DONE' from public.surat_registrasi where id=v_id),'Revised KEU route completes with extra approver');
end $$;
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
insert into keu10_test.results(key,input) values('additional-concurrency',jsonb_build_object('payload',keu10_test.payload(83,2,1000),
  'signers',keu10_test.signers(2,6)||jsonb_build_array(jsonb_build_object('is_additional',true,'client_id',keu10_test.id(9301),
    'user_id',keu10_test.id(11),'role_name','menyetujui'))));
reset role;
do $$ begin raise notice 'Additional signers: all assertions passed'; end $$;
