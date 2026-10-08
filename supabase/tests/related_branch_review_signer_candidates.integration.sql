do $$
declare
  hq uuid:=gen_random_uuid(); kc uuid:=gen_random_uuid(); kcp uuid:=gen_random_uuid(); other uuid:=gen_random_uuid();
  tech uuid:=gen_random_uuid(); marketing uuid:=gen_random_uuid(); finance uuid:=gen_random_uuid();
  staff uuid:=gen_random_uuid(); bm uuid:=gen_random_uuid(); abm uuid:=gen_random_uuid();
  spv_tech uuid:=gen_random_uuid(); spv_marketing uuid:=gen_random_uuid(); foreign_bm uuid:=gen_random_uuid();
  usage uuid; step uuid; maker_step uuid; doc uuid; sig uuid; candidate uuid;
begin
  insert into public.master_offices(id,name,kedudukan,parent_id) values
    (hq,'Officer HQ','Pusat',null),(kc,'Officer KC','KC',hq),(kcp,'Officer KCP','KCP',kc),(other,'Officer Other','KC',hq);
  insert into public.master_departments(id,name) values(tech,'Officer Technique'),(marketing,'Officer Marketing'),(finance,'Officer Finance');
  insert into public.profiles(id,full_name,job_title,office_id,department_id) values
    (staff,'Officer Staff','Staff Admin',kcp,tech),(bm,'Officer BM','Branch Manager',kc,marketing),
    (abm,'Officer ABM','Assistant Branch Manager',kc,tech),(spv_tech,'Officer Tech','SPV Teknik',kc,tech),
    (spv_marketing,'Officer Marketing','Supervisor Marketing',kc,marketing),(foreign_bm,'Officer Foreign','BM',other,tech);
  if not public.is_related_branch_officer(bm,staff,kcp,tech) then raise exception 'Parent KC BM missing'; end if;
  foreach candidate in array array[staff,abm,spv_tech,foreign_bm] loop
    if public.is_related_branch_officer(candidate,staff,kcp,tech) then raise exception 'Lower/foreign/self officer accepted while BM active'; end if;
  end loop;
  if public.is_contextual_first_maker_candidate(bm,staff,kcp,tech) then raise exception 'BM leaked into maker dropdown'; end if;
  if not public.is_contextual_first_maker_candidate(staff,staff,kcp,tech) then raise exception 'Requester missing from maker'; end if;

  -- A real signature trigger, not a boolean-only authorization test.
  insert into public.form_usages(name,request_category,scope_type,status) values('Officer Test','non_asset','pusat','active') returning id into usage;
  insert into public.form_usage_steps(usage_id,step_order,role_name,label,assignee_mode,candidate_scope,candidate_fallback_mode)
    values(usage,2,'memeriksa','Branch Manager','select','request_office','related_branch_officer') returning id into step;
  insert into public.form_usage_steps(usage_id,step_order,role_name,label,assignee_mode)
    values(usage,1,'membuat','Pemohon','select') returning id into maker_step;
  insert into public.surat_registrasi(form_usage_id,office_id,dept_id,created_by)
    values(usage,hq,tech,staff) returning id into doc;
  -- The unrelated HQ document cannot use a branch officer.
  begin
    insert into public.surat_signatures(surat_id,user_id,form_usage_step_id) values(doc,bm,step);
    raise exception 'Expected HQ candidate rejection';
  exception when raise_exception then if sqlerrm<>'User bukan kandidat signer pada tahap ini.' then raise; end if; end;
  -- Use canonical KEU1 branch registration guard and reservation fixture for KCP.
  select u.id into usage from public.form_usages u join public.master_forms f on f.id=u.form_id
    where f.nomor_form='FM-UAI.KEU-01-00' and u.scope_type='cabang' and u.first_maker_policy='contextual' limit 1;
  select id into step from public.form_usage_steps where usage_id=usage and step_order=2;
  if (select candidate_fallback_mode from public.form_usage_steps where id=step)<>'related_branch_officer' then
    raise exception 'Normal branch BM step not migrated'; end if;
  insert into public.surat_reservations(entity_id,type_id,office_id,year,no_urut,reserved_by,number_scope_type,status)
    values('80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',kcp,
      extract(year from now())::integer,81,staff,'branch_keu1_000','PENDING');
  insert into public.surat_registrasi(form_usage_id,office_id,dept_id,created_by,entity_id,letter_type_id,no_surat,form_input_data)
    values(usage,kcp,tech,staff,'80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',
      '081/UAI/000/X/2026','{"fund_without_project":true}') returning id into doc;
  insert into public.surat_signatures(surat_id,user_id,form_usage_step_id) values(doc,bm,step) returning id into sig;
  begin
    update public.surat_signatures set user_id=spv_tech where id=sig;
    raise exception 'Expected lower candidate reassignment rejection';
  exception when raise_exception then if sqlerrm<>'User bukan kandidat signer pada tahap ini.' then raise; end if; end;
  update public.profiles set is_active=false where id=bm;
  update public.surat_signatures set is_signed=true where id=sig;
  if (select user_id from public.surat_signatures where id=sig)<>bm then raise exception 'Historical signer rewritten'; end if;
  if not public.is_related_branch_officer(abm,staff,kcp,tech) then raise exception 'ABM fallback missing'; end if;
  if public.is_related_branch_officer(spv_tech,staff,kcp,tech) then raise exception 'SPV superseded active ABM'; end if;
  update public.profiles set is_active=false where id=abm;
  if not public.is_related_branch_officer(spv_tech,staff,kcp,tech) or public.is_related_branch_officer(spv_marketing,staff,kcp,tech)
    then raise exception 'SPV department selection mismatch'; end if;
  insert into public.surat_signatures(surat_id,user_id,form_usage_step_id) values(doc,spv_tech,step) returning id into sig;
  if (select label_jabatan from public.surat_signatures where id=sig)<>'SPV Teknik' then
    raise exception 'Fallback SPV mislabeled as Branch Manager'; end if;
  if not public.is_related_branch_officer(spv_tech,staff,kcp,finance) or not public.is_related_branch_officer(spv_marketing,staff,kcp,finance)
    then raise exception 'General finance cannot choose both SPVs'; end if;
  -- Strict BM mode (KEU10 maker) remains strict, no fallback after the BM becomes inactive.
  if public.is_related_branch_manager(abm,kcp) or public.is_related_branch_manager(spv_tech,kcp) then raise exception 'Strict BM contract widened'; end if;
  if has_function_privilege('authenticated','public.is_related_branch_officer(uuid,uuid,uuid,uuid)','EXECUTE')
    or has_function_privilege('anon','public.is_related_branch_officer(uuid,uuid,uuid,uuid)','EXECUTE') then raise exception 'Private candidate guard exposed'; end if;
  perform set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000020',true);
  candidate:=public.save_form_usage_config(null,'{"name":"Officer Configuration Roundtrip","first_maker_policy":"configured"}',array[]::uuid[],
    '[{"step_order":1,"role_name":"memeriksa","label":"Officer","action_type":"approval","assignee_mode":"select","candidate_scope":"request_office","candidate_fallback_mode":"related_branch_officer"}]','[]','[]');
  if not exists(select 1 from public.form_usage_steps where usage_id=candidate and candidate_fallback_mode='related_branch_officer')
    then raise exception 'Officer mode lost in configuration save'; end if;
  raise notice 'Related branch review signer: all assertions passed';
end;
$$;
