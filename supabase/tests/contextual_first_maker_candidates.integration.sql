do $$
declare
  v_hq uuid := gen_random_uuid(); v_kc uuid := gen_random_uuid(); v_kcp uuid := gen_random_uuid(); v_other uuid := gen_random_uuid();
  v_dept uuid := gen_random_uuid(); v_other_dept uuid := gen_random_uuid();
  v_self uuid := gen_random_uuid(); v_staff uuid := gen_random_uuid(); v_spv uuid := gen_random_uuid();
  v_spv2 uuid := gen_random_uuid(); v_foreign uuid := gen_random_uuid(); v_bm uuid := gen_random_uuid();
  v_assistant uuid := gen_random_uuid(); v_invalid_assistant uuid := gen_random_uuid();
  v_usage uuid; v_step uuid; v_surat uuid; v_candidate uuid; v_fixture uuid; v_fixture_step uuid; v_old uuid;
begin
  insert into public.master_offices(id,name,kedudukan,parent_id) values
    (v_hq,'Maker HQ','Pusat',null),(v_kc,'Maker KC','KC',v_hq),(v_kcp,'Maker KCP','KCP',v_kc),(v_other,'Maker Other','KC',v_hq);
  insert into public.master_departments(id,name,code) values (v_dept,'Maker Technical','MTECH'),(v_other_dept,'Maker Marketing','MMKT');
  insert into public.profiles(id,full_name,job_title,office_id,department_id) values
    (v_self,'Requester','Staff Teknik',v_kcp,v_dept),(v_staff,'Other Staff','Staff Teknik',v_kcp,v_dept),
    (v_spv,'Supervisor','Supervisor Teknik',v_kcp,v_dept),(v_spv2,'Marketing Supervisor','SPV Marketing',v_kcp,v_other_dept),
    (v_foreign,'Foreign Supervisor','Supervisor Teknik',v_other,v_dept),(v_bm,'BM','Branch Manager',v_kc,v_other_dept),
    (v_assistant,'Assistant','Asisten Mgr. Teknik',v_hq,v_dept),(v_invalid_assistant,'Foreign Assistant','Assistant Manager Marketing',v_hq,v_other_dept);
  insert into public.form_usages(name,request_category,scope_type,status) values ('Maker Test','non_asset','pusat','active') returning id into v_usage;
  insert into public.form_usage_steps(usage_id,step_order,role_name,label,assignee_mode) values (v_usage,1,'membuat','Membuat','select') returning id into v_step;
  -- Use HQ for registration guard, then test KC/KCP candidate context independently.
  insert into public.surat_registrasi(form_usage_id,office_id,dept_id,created_by,policy_snapshot)
  values (v_usage,v_hq,v_dept,v_self,'{"first_maker_policy":"configured"}') returning id into v_surat;
  if (select policy_snapshot->>'first_maker_policy' from public.surat_registrasi where id=v_surat) <> 'contextual' then raise exception 'Forged policy accepted'; end if;
  foreach v_candidate in array array[v_self,v_spv,v_spv2,v_bm,v_assistant] loop
    if not public.is_contextual_first_maker_candidate(v_candidate,v_self,v_kcp,v_dept) then raise exception 'Valid contextual candidate rejected'; end if;
  end loop;
  foreach v_candidate in array array[v_staff,v_foreign,v_invalid_assistant] loop
    if public.is_contextual_first_maker_candidate(v_candidate,v_self,v_kcp,v_dept) then raise exception 'Foreign candidate accepted'; end if;
  end loop;
  -- Actual signature trigger accepts creator and related assistant on ordinary select stage.
  foreach v_candidate in array array[v_self,v_assistant] loop
    insert into public.surat_signatures(surat_id,user_id,form_usage_step_id) values (v_surat,v_candidate,v_step);
  end loop;
  begin
    insert into public.surat_signatures(surat_id,user_id,form_usage_step_id) values (v_surat,v_staff,v_step);
    raise exception 'Expected staff bypass rejection';
  exception when raise_exception then if sqlerrm <> 'User bukan kandidat signer pada tahap ini.' then raise; end if; end;
  update public.profiles set is_active=false where id=v_assistant;
  if public.is_contextual_first_maker_candidate(v_assistant,v_self,v_kcp,v_dept) then raise exception 'Inactive candidate accepted'; end if;
  update public.profiles set is_active=true,deleted_at=now() where id=v_assistant;
  if public.is_contextual_first_maker_candidate(v_assistant,v_self,v_kcp,v_dept) then raise exception 'Deleted candidate accepted'; end if;
  if public.is_contextual_first_maker_candidate(v_bm,v_self,v_hq,v_dept) then raise exception 'Head office offered branch BM'; end if;
  if exists(select 1 from public.form_usages where is_system_template is true and first_maker_policy <> 'configured') then raise exception 'Internal template policy changed'; end if;
  if has_function_privilege('authenticated','public.is_contextual_first_maker_candidate(uuid,uuid,uuid,uuid)','EXECUTE') then raise exception 'Internal helper exposed'; end if;
  insert into public.form_usages(name,request_category,scope_type,status,first_maker_policy) values ('Fixture','non_asset','pusat','active','configured') returning id into v_fixture;
  insert into public.form_usage_steps(usage_id,step_order,role_name,label,assignee_mode) values (v_fixture,1,'membuat','Tester','select') returning id into v_fixture_step;
  insert into public.form_usage_step_users(usage_step_id,user_id) values (v_fixture_step,v_self);
  insert into public.surat_registrasi(form_usage_id,office_id,created_by,policy_snapshot)
  values(v_fixture,v_hq,v_self,'{"first_maker_policy":"contextual"}') returning id into v_surat;
  if (select policy_snapshot->>'first_maker_policy' from public.surat_registrasi where id=v_surat) <> 'configured' then raise exception 'Fixture isolation bypass'; end if;
  update public.surat_registrasi set policy_snapshot='{"first_maker_policy":"contextual"}' where id=v_surat;
  if (select policy_snapshot->>'first_maker_policy' from public.surat_registrasi where id=v_surat) <> 'configured' then raise exception 'Fixture update isolation bypass'; end if;
  insert into public.surat_signatures(surat_id,user_id,form_usage_step_id) values(v_surat,v_self,v_fixture_step);
  begin
    insert into public.surat_signatures(surat_id,user_id,form_usage_step_id) values(v_surat,v_spv,v_fixture_step);
    raise exception 'Expected fixture tester isolation';
  exception when raise_exception then if sqlerrm <> 'User bukan kandidat signer pada tahap ini.' then raise; end if; end;
  -- Previous registrations lack a new policy snapshot; migration does not alter them.
  if exists (select 1 from public.surat_registrasi where no_surat='017/UAI/000/X/2026' and policy_snapshot ? 'first_maker_policy') then raise exception 'Historical snapshot rewritten'; end if;
  raise notice 'Contextual first maker: all assertions passed';
end;
$$;
