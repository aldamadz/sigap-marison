set role postgres;
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
insert into public.master_forms(id,nama_form,nomor_form) values(keu10_test.id(9600),'Rekomendasi','REC-TEST');
insert into public.form_usages(id,form_id,name) values(keu10_test.id(9601),keu10_test.id(9600),'Rekomendasi IT');
insert into public.form_usage_steps(id,usage_id,step_order,role_name) values(keu10_test.id(9602),keu10_test.id(9601),1,'membuat');
insert into public.form_usage_step_users values(keu10_test.id(9602),keu10_test.id(11));
update public.master_departments set code='PBO',name='Pengembangan Organisasi' where id=keu10_test.id(101);
insert into public.surat_registrasi(id,no_surat,office_id,created_by,judul_surat,current_step,file_path,form_input_data,policy_snapshot)
values(keu10_test.id(19501),'001/TEST/ENABLE/XI/2026',keu10_test.id(202),keu10_test.id(1),'Komputer perlu rekomendasi',3,
  'native://document/enable','{"request_category":"asset","requires_recommendation":false,"items":[{"nama_barang":"Komputer","jumlah":"1"}]}',
  jsonb_build_object('recommendation_config',jsonb_build_object('form_id',keu10_test.id(9600),'usage_id',keu10_test.id(9601),
    'department_id',keu10_test.id(101),'letter_type_id',keu10_test.id(501),'entity_id',keu10_test.id(401),'required_before_step',3)));
insert into public.surat_signatures(id,surat_id,user_id,step_order,role_name,is_signed,status,signed_at) values
  (keu10_test.id(19511),keu10_test.id(19501),keu10_test.id(2),1,'membuat',true,'APPROVED',now()),
  (keu10_test.id(19512),keu10_test.id(19501),keu10_test.id(4),2,'membuat',true,'APPROVED',now()),
  (keu10_test.id(19513),keu10_test.id(19501),keu10_test.id(3),3,'memeriksa',false,'PENDING',null);
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
insert into keu10_test.results(key,surat_id,event_id) values('rec06',keu10_test.id(19501),
  public.request_surat_process_revision(keu10_test.id(19501),keu10_test.id(19513),'requester',null,
    'Mohon tambahkan rekomendasi IT.','{"requester_edit_required":true}'));
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
do $$declare draft public.surat_registration_drafts; data jsonb; result jsonb;
begin
  draft:=public.create_external_submission_revision_draft((select event_id from keu10_test.results where key='rec06'));
  data:=jsonb_set(draft.payload->'formData','{form_input_data,requires_recommendation}','true');
  result:=public.submit_external_submission_revision(draft.revision_event_id,draft.id,data,'Rekomendasi diperlukan.');
  perform keu10_test.assert(result->>'next_step'='requesting_step','canonical RPC returns requesting step');
  perform keu10_test.assert((select current_step=3 and status='PROSES' and form_input_data->>'requires_recommendation'='true'
    from public.surat_registrasi where id=keu10_test.id(19501)), 'revised request resumes instead of failing approval gate');
  perform keu10_test.assert((select count(*)=1 from public.surat_recommendation_tasks where parent_surat_id=keu10_test.id(19501)), 'real submit RPC creates exactly one task');
  perform keu10_test.assert((select bool_and(is_signed) from public.surat_signatures where surat_id=keu10_test.id(19501) and step_order<3), 'earlier approvals retained');
  perform keu10_test.assert((select not is_signed from public.surat_signatures where id=keu10_test.id(19513)), 'requesting signer remains pending');
  perform keu10_test.assert((select count(*)=1 from public.surat_requester_revision_history where revision_event_id=draft.revision_event_id), 'revision history retained');
end$$;
select set_config('request.jwt.claim.sub',keu10_test.id(11)::text,false);
select keu10_test.assert(exists(select 1 from public.get_my_recommendation_tasks() where parent_surat_id=keu10_test.id(19501)), 'IT sees new task through actual inbox RPC');
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
select keu10_test.expect_error('55000',format('update public.surat_signatures set is_signed=true where id=%L',keu10_test.id(19513)));
reset role;
do $$begin raise notice 'REC-06 canonical requester RPC and IT inbox: all assertions passed'; end$$;
