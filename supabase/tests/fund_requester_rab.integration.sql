insert into public.form_usages(id,form_id,name,request_category,scope_type,status)
values('48800000-0000-4000-8000-000000000001','48400000-0000-4000-8000-000000000002','Planning fund fixture','non_asset','pusat','active');
insert into public.form_usage_steps(id,usage_id,step_order,role_name,label,signer_department_id,action_type,input_schema)
values('48800000-0000-4000-8000-000000000002','48800000-0000-4000-8000-000000000001',1,'memeriksa','Mgr. Perencanaan',
 '30000000-0000-4000-8000-000000000004','configured_input','{"fields":[{"key":"note","label":"Catatan","type":"text","required":false}]}');
insert into public.form_usage_step_users values('48800000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000003');
insert into public.form_usage_step_verifiers values('48800000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000005');

do $$
declare v_case integer; v_doc uuid; v_sig uuid; v_result boolean; v_expected boolean;
  v_rules jsonb:='[{"requirement_key":"rab","label":"RAB hasil pemeriksaan","is_required":true,"min_files":1},{"requirement_key":"other","label":"Bukti lain","is_required":true,"min_files":1}]';
begin
  if has_function_privilege('authenticated','public.effective_fund_rab_requirements(uuid)','execute')
    or has_function_privilege('anon','public.is_fund_planning_signature(uuid)','execute') then raise exception 'Internal RAB helper exposed'; end if;
  for v_case in 0..7 loop
    perform set_config('request.jwt.claim.sub','',true);
    insert into public.surat_registrasi(form_usage_id,office_id,dept_id,created_by,form_input_data)
    values('48800000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',jsonb_build_object('request_category','non_asset','requester_has_rab',v_case>1)) returning id into v_doc;
    insert into public.surat_signatures(surat_id,user_id,form_usage_step_id,attachment_requirements_snapshot)
    values(v_doc,'40000000-0000-4000-8000-000000000003','48800000-0000-4000-8000-000000000002',v_rules) returning id into v_sig;
    if v_case=1 then
      insert into public.surat_attachments(surat_id,signature_id,stage,requirement_key) values(v_doc,v_sig,'approval','rab');
    elsif v_case=3 then
      insert into public.surat_attachments(surat_id,stage,requirement_key) values(v_doc,'initial','requester_additional');
    elsif v_case>=4 then
      insert into public.surat_attachments(surat_id,stage,requirement_key) values(v_doc,'initial','rab');
    end if;
    if v_case<>4 then
      insert into public.surat_attachments(surat_id,signature_id,stage,requirement_key) values(v_doc,v_sig,'approval','other');
    end if;
    if v_case=7 then delete from public.surat_attachments where surat_id=v_doc and stage='initial'; end if;
    perform set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
    begin perform public.verify_surat_signature_v2(v_sig); raise exception 'Requester bypassed verifier'; exception when insufficient_privilege then null; end;
    perform set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000005',true);
    v_result:=false;
    begin
      if v_case=6 then v_result:=public.verify_surat_signature(v_sig);
      else v_result:=public.verify_surat_signature_v2(v_sig); end if;
    exception when invalid_parameter_value then null; end;
    v_expected:=v_case in (1,5,6);
    if v_result is distinct from v_expected then raise exception 'RAB case % result %, expected %',v_case,v_result,v_expected; end if;
    if (select verification_status='verified' from public.surat_signatures where id=v_sig) is distinct from v_expected then raise exception 'RAB case % verification mutation',v_case; end if;
    if (select attachment_requirements_snapshot from public.surat_signatures where id=v_sig)<>v_rules then raise exception 'Historical rules mutated'; end if;
    if v_expected and not exists(select 1 from public.surat_registrasi where id=v_doc and data_snapshot#>>array['verification_inputs',v_sig::text,'verified_by']=auth.uid()::text) then raise exception 'Canonical audit lost'; end if;
  end loop;
  -- A non-PGD form cannot opt out of an existing checker requirement.
  update public.master_forms set nomor_form='FM-UAI.KEU-01-00' where id='48400000-0000-4000-8000-000000000002';
  if public.is_fund_planning_signature(v_sig) then raise exception 'KEU inherited RAB waiver'; end if;
  raise notice 'Requester RAB: all assertions passed';
end $$;
