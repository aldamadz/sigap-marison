do $$
declare
  v_hq uuid := gen_random_uuid(); v_kc uuid := gen_random_uuid(); v_kcp uuid := gen_random_uuid(); v_other uuid := gen_random_uuid();
  v_bm uuid := gen_random_uuid(); v_staff uuid := gen_random_uuid(); v_spv uuid := gen_random_uuid(); v_foreign uuid := gen_random_uuid();
  v_usage uuid; v_step uuid; v_surat uuid; v_candidate uuid; v_signature uuid; v_saved_usage uuid;
  v_entity uuid := '80000000-0000-4000-8000-000000000001';
  v_type uuid := '70000000-0000-4000-8000-000000000001';
begin
  insert into public.master_offices(id,name,kedudukan,parent_id) values
    (v_hq,'BM HQ','Pusat',null),(v_kc,'BM KC','KC',v_hq),(v_kcp,'BM KCP','KCP',v_kc),(v_other,'BM Other','KC',v_hq);
  insert into public.profiles(id,full_name,job_title,office_id) values
    (v_bm,'Related BM','Branch Manager',v_kc),(v_staff,'Staff','Staff Admin',v_kc),
    (v_spv,'SPV','Supervisor Marketing',v_kc),(v_foreign,'Foreign BM','BM',v_other);
  if not public.is_related_branch_manager(v_bm,v_kc) or not public.is_related_branch_manager(v_bm,v_kcp) then raise exception 'Related BM rejected'; end if;
  foreach v_candidate in array array[v_staff,v_spv,v_foreign] loop
    if public.is_related_branch_manager(v_candidate,v_kc) then raise exception 'Non-BM candidate accepted'; end if;
  end loop;
  if public.is_related_branch_manager(v_bm,v_hq) then raise exception 'HQ offered BM'; end if;
  update public.profiles set is_active=false where id=v_bm;
  if public.is_related_branch_manager(v_bm,v_kc) then raise exception 'Inactive BM accepted'; end if;
  update public.profiles set is_active=true where id=v_bm;
  select usage.id,step.id into v_usage,v_step from public.form_usages usage
    join public.master_forms form on form.id=usage.form_id
    join public.form_usage_steps step on step.usage_id=usage.id and step.step_order=2
    where form.nomor_form='FM-UAI.KEU-01-00' and usage.scope_type='cabang' and usage.first_maker_policy='contextual' limit 1;
  if (select candidate_fallback_mode from public.form_usage_steps where id=v_step) <> 'related_branch_manager' then raise exception 'Canonical mode not updated'; end if;
  insert into public.surat_reservations(entity_id,type_id,office_id,year,no_urut,reserved_by,number_scope_type,status)
    values(v_entity,v_type,v_kc,extract(year from now())::integer,24,v_staff,'branch_keu1_000','PENDING');
  insert into public.surat_registrasi(form_usage_id,office_id,created_by,entity_id,letter_type_id,no_surat,form_input_data)
    values(v_usage,v_kc,v_staff,v_entity,v_type,'024/UAI/000/X/2026','{"fund_without_project":true}') returning id into v_surat;
  -- The actual signature trigger must accept a newly synced BM without a stale static candidate list.
  insert into public.surat_signatures(surat_id,user_id,form_usage_step_id) values(v_surat,v_bm,v_step) returning id into v_signature;
  foreach v_candidate in array array[v_staff,v_spv,v_foreign] loop
    begin
      insert into public.surat_signatures(surat_id,user_id,form_usage_step_id) values(v_surat,v_candidate,v_step);
      raise exception 'Expected role bypass rejection';
    exception when raise_exception then if sqlerrm <> 'User bukan kandidat signer pada tahap ini.' then raise; end if; end;
  end loop;
  begin
    update public.surat_signatures set user_id=v_staff where id=v_signature;
    raise exception 'Expected reassignment rejection';
  exception when raise_exception then if sqlerrm <> 'User bukan kandidat signer pada tahap ini.' then raise; end if; end;
  update public.profiles set is_active=false where id=v_bm;
  update public.surat_signatures set is_signed=true where id=v_signature;
  if (select user_id from public.surat_signatures where id=v_signature) <> v_bm then raise exception 'Historical signer rewritten'; end if;
  if has_function_privilege('authenticated','public.is_related_branch_manager(uuid,uuid)','EXECUTE') then raise exception 'Internal helper exposed'; end if;
  perform set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000020',true);
  v_saved_usage := public.save_form_usage_config(null,'{"name":"BM Configuration Roundtrip","first_maker_policy":"configured"}',array[]::uuid[],
    '[{"step_order":1,"role_name":"memeriksa","label":"Branch Manager","action_type":"approval","assignee_mode":"select","candidate_scope":"request_office","candidate_fallback_mode":"related_branch_manager"}]',
    '[]','[]');
  if not exists(select 1 from public.form_usage_steps where usage_id=v_saved_usage and candidate_fallback_mode='related_branch_manager') then
    raise exception 'BM mode lost through configuration save';
  end if;
  begin
    perform public.save_form_usage_config(null,'{"name":"Invalid BM Scope"}',array[]::uuid[],
      '[{"step_order":1,"role_name":"memeriksa","label":"Branch Manager","action_type":"approval","assignee_mode":"select","candidate_scope":"all_offices","candidate_fallback_mode":"related_branch_manager"}]','[]','[]');
    raise exception 'Expected invalid BM scope rejection';
  exception when sqlstate '22023' then null; end;
  raise notice 'KEU 1 Branch Manager: all assertions passed';
end;
$$;
