begin;

create or replace function signer_plan_internal.removal_evidence(p_usage uuid,p_input jsonb,p_plan jsonb,p_kept uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare omitted jsonb; usage public.form_usages; last_order integer;
begin
 select * into strict usage from public.form_usages where id=p_usage;
 select max(step_order) into last_order from public.form_usage_steps where usage_id=p_usage;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'role_name',role_name,'configured_order',step_order)
  order by step_order),'[]'::jsonb) into omitted from public.form_usage_steps where usage_id=p_usage and not id=any(p_kept);
 if jsonb_array_length(omitted)=0 then return omitted;end if;
 if not exists(select 1 from jsonb_array_elements(p_plan) maker,jsonb_array_elements(p_plan) reviewer
   where maker->>'role_name'='membuat' and reviewer->>'role_name' in ('memeriksa','verifikator','menyetujui')
    and maker->>'user_id'<>reviewer->>'user_id') then
  raise exception 'Pilih pembuat dan pemeriksa atau penyetuju dari minimal dua akun berbeda.' using errcode='22023';end if;
 if exists(select 1 from public.form_usage_steps s where s.usage_id=p_usage and not s.id=any(p_kept) and (
   s.role_name='verifikator' or coalesce(s.action_type::text,'approval')<>'approval'
   or exists(select 1 from public.form_usage_step_verifiers v where v.usage_step_id=s.id)
   or exists(select 1 from public.form_usage_attachment_requirements r where r.usage_id=p_usage and r.stage_order=s.step_order and r.is_required)
   or (usage.keu10_config is not null and s.step_order in (1,last_order))
   or (usage.recommendation_config->>'enabled'='true'
    and (usage.recommendation_config->>'optional' is distinct from 'true' or p_input->>'requires_recommendation'='true')
    and s.step_order=nullif(usage.recommendation_config->>'required_before_step','')::integer))) then
  raise exception 'Langkah pemeriksaan khusus, rekomendasi, dan kontrol KEU 10 tetap diperlukan.' using errcode='22023';end if;
 return omitted;
end $$;

create or replace function signer_plan_internal.includes_step(p_surat uuid,p_step uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(policy_snapshot#>>'{signer_plan,0,route_version}','1')<>'2' or exists(
  select 1 from jsonb_array_elements(policy_snapshot->'signer_plan') item where item->>'form_usage_step_id'=p_step::text)
 from public.surat_registrasi where id=p_surat
$$;

create or replace function signer_plan_internal.mapped_order(p_plan jsonb,p_order integer)
returns integer language sql immutable set search_path='' as $$
 select coalesce((select (item->>'step_order')::integer from jsonb_array_elements(p_plan) item
  where (item->>'configured_order')::integer>=p_order order by (item->>'configured_order')::integer limit 1),jsonb_array_length(p_plan))
$$;

-- Private initializer: reuse canonical document/KEU10 policy stamping and frozen
-- candidate assertions; never fabricate signatures for the omitted officials.
create or replace function signer_plan_internal.create_reduced_keu10(p_payload jsonb,p_signers jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare doc public.surat_registrasi; item jsonb; step jsonb; profile public.profiles; v_usage uuid;
begin
 v_usage:=(p_payload->>'form_usage_id')::uuid;
 insert into keu10_internal.registration_permits values(txid_current(),auth.uid(),v_usage);
 doc:=public.create_surat_registrasi(p_payload);
 if doc.created_by is distinct from auth.uid() or doc.form_usage_id is distinct from v_usage or doc.policy_snapshot->'keu10_config' is null then
  raise exception 'Identitas registrasi KEU 10 tidak valid.' using errcode='42501';end if;
 insert into signer_plan_internal.initialization_permits values(txid_current(),doc.id);
 for item in select value from jsonb_array_elements(p_signers) loop
  select value into strict step from jsonb_array_elements(doc.policy_snapshot->'keu10_steps') where value->>'id'=item->>'form_usage_step_id';
  perform public.assert_keu10_signer(doc.id,(step->>'id')::uuid,(item->>'user_id')::uuid);
  select * into strict profile from public.profiles where id=(item->>'user_id')::uuid;
  insert into public.surat_signatures(surat_id,user_id,form_usage_step_id,step_order,role_name,label_jabatan,action_type,is_signed,status,
   available_at,signer_snapshot)
  values(doc.id,profile.id,(step->>'id')::uuid,(step->>'step_order')::integer,step->>'role_name',
   case when (step->>'step_order')::integer=jsonb_array_length(doc.policy_snapshot->'keu10_steps') then
    case public.keu10_director_code(profile.job_title,to_jsonb(profile)->>'job_title_display') when 'DI' then 'Direktur I' else 'Direktur Utama' end
    else step->>'label' end,'approval',false,'PENDING',
   case when (step->>'step_order')::integer=1 then clock_timestamp() end,
   jsonb_build_object('id',profile.id,'full_name',profile.full_name,'job_title',coalesce(nullif(to_jsonb(profile)->>'job_title_display',''),profile.job_title),'nik',profile.nik,'email',profile.email));
 end loop;
 delete from keu10_internal.registration_permits where transaction_id=txid_current() and actor_id=auth.uid() and usage_id=v_usage;
 return jsonb_build_object('surat',to_jsonb(doc),'created',true);
end $$;

do $patch$
declare identity regprocedure:='public.create_registration_with_signer_plan(jsonb,jsonb)'::regprocedure;
 body text; source text; anchor text;
begin
 select replace(prosrc,E'\r\n',E'\n') into body from pg_proc where oid=identity;
 if position('SUR46 removal evidence' in body)>0 then return;end if;
 source:=body;
 anchor:='v_keu boolean; v_policy jsonb; v_required integer;';
 if position(anchor in body)=0 then raise exception 'Unknown signer plan declaration';end if;
 body:=replace(body,anchor,anchor||' v_omitted jsonb; v_reduced boolean;');
 anchor:=E'  if exists(select 1 from public.form_usage_steps where usage_id=v_usage and not coalesce(skip_if_no_candidate,false) and not id=any(v_steps)) then\n    raise exception ''Pejabat wajib tidak dapat dihapus.'' using errcode=''22023''; end if;';
 if position(anchor in body)=0 then raise exception 'Unknown mandatory signer gate';end if;
 body:=replace(body,anchor,E'  -- SUR46 removal evidence\n  v_omitted:=signer_plan_internal.removal_evidence(v_usage,p_payload->''form_input_data'',v_plan,v_steps);\n'
  ||E'  v_reduced:=jsonb_array_length(v_omitted)>0;\n  if v_reduced then v_plan:=jsonb_set(v_plan,''{0}'',(v_plan->0)||jsonb_build_object(''route_version'',2,''omitted_configured_steps'',v_omitted));end if;');
 anchor:='v_result := public.create_keu10_registration(p_payload,v_mandatory);';
 if position(anchor in body)=0 then raise exception 'Unknown KEU10 initialization';end if;
 body:=replace(body,anchor,E'if v_reduced then v_result:=signer_plan_internal.create_reduced_keu10(p_payload,v_mandatory);\n    else '||anchor||' end if;');
 body:=replace(body,'insert into signer_plan_internal.initialization_permits values(txid_current(),v_surat.id);',
  'insert into signer_plan_internal.initialization_permits values(txid_current(),v_surat.id) on conflict do nothing;');
 anchor:=E'    select (item->>''step_order'')::integer into v_required from jsonb_array_elements(v_plan) item where (item->>''configured_order'')::integer=v_required;';
 if position(anchor in body)=0 then raise exception 'Unknown recommendation stage mapping';end if;
 body:=replace(body,anchor,'    v_required:=signer_plan_internal.mapped_order(v_plan,v_required);');
 anchor:=E'    select (item->>''step_order'')::integer into v_required from jsonb_array_elements(v_plan) item\n      where item->>''configured_order''=v_item->>''value'';';
 if position(anchor in body)=0 then raise exception 'Unknown revision stage mapping';end if;
 body:=replace(body,anchor,'    v_required:=signer_plan_internal.mapped_order(v_plan,(v_item->>''value'')::integer);');
 anchor:='  return jsonb_build_object(''surat'',to_jsonb(v_surat),''created'',true);';
 if position(anchor in body)=0 then raise exception 'Unknown registration completion';end if;
 body:=replace(body,anchor,E'  if v_keu and v_reduced then\n    insert into public.document_pdf_jobs(surat_id,signature_id,source_file_path,requested_by,refresh)\n'
  ||E'    values(v_surat.id,null,v_surat.file_path,v_actor,false);\n  end if;\n'||anchor);
 execute replace(replace(pg_get_functiondef(identity),E'\r\n',E'\n'),source,body);
end $patch$;

-- Existing KEU10 candidates, Finance and amount-dependent final approval remain
-- mandatory. Only ordinary omitted steps are excluded from completeness checks.
do $patch$
declare identity regprocedure:='public.handle_approve_surat_v2(uuid,uuid,text,text)'::regprocedure; body text; anchor text;
begin
 select prosrc into body from pg_proc where oid=identity;
 if position('signer_plan_internal.includes_step' in body)>0 then return;end if;
 anchor:='where not exists(select 1 from public.surat_signatures signature where signature.surat_id=p_surat_id';
 if position(anchor in body)=0 then raise exception 'Unknown KEU10 approval completeness gate';end if;
 execute replace(pg_get_functiondef(identity),body,replace(body,anchor,
  'where signer_plan_internal.includes_step(v_surat.id,(step->>''id'')::uuid) and not exists(select 1 from public.surat_signatures signature where signature.surat_id=p_surat_id'));
end $patch$;

revoke all on function signer_plan_internal.removal_evidence(uuid,jsonb,jsonb,uuid[]),signer_plan_internal.includes_step(uuid,uuid),
 signer_plan_internal.mapped_order(jsonb,integer),signer_plan_internal.create_reduced_keu10(jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function signer_plan_internal.removal_evidence(uuid,jsonb,jsonb,uuid[]),signer_plan_internal.includes_step(uuid,uuid),
 signer_plan_internal.mapped_order(jsonb,integer),signer_plan_internal.create_reduced_keu10(jsonb,jsonb) to postgres;

notify pgrst,'reload schema';
commit;
