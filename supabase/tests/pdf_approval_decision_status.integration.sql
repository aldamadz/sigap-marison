-- Disposable fixture: load canonical reject_surat_by_document_number from
-- 20260818153000_reject_surat_by_document_number.sql before running this file.
-- Apply 20261008110000 twice first; no fixtures belong in rollout migrations.
set role service_role;
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
do $$
declare v_id uuid; v_sig uuid; v_old_source text; v_source text; v_stale uuid; v_job uuid;
  v_token uuid; v_kind text; v_count integer; v_result jsonb;
begin
  foreach v_kind in array array['PGD','KEU1'] loop
    v_id:=gen_random_uuid(); v_sig:=gen_random_uuid(); v_old_source:='native://document/'||v_id::text;
    insert into public.surat_registrasi(id,no_surat,created_by,status,current_step,file_path,pdf_path)
      values(v_id,'PDF-'||v_kind||'/TEST',keu10_test.id(1),'PROSES',1,v_old_source,'cached://approved');
    insert into public.surat_signatures(id,surat_id,user_id,step_order,role_name,file_path_snap,pdf_path_snap)
      values(v_sig,v_id,keu10_test.id(1),1,'membuat',v_old_source,'cached://signature');
    v_token:=gen_random_uuid();
    insert into public.document_pdf_jobs(surat_id,source_file_path,status,lease_token,lease_expires_at)
      values(v_id,v_old_source,'processing',v_token,clock_timestamp()+interval '5 minutes') returning id into v_stale;
    perform set_config('request.jwt.claim.sub',keu10_test.id(12)::text,false);
    perform keu10_test.expect_error('P0001',format('select public.handle_reject_surat_v2(%L,%L,%L)',v_sig,v_id,'Unauthorized rejection'));
    perform keu10_test.assert((select status='PROSES' and pdf_path='cached://approved' from public.surat_registrasi where id=v_id),'Unauthorized rejection leaves cache and status unchanged');
    perform set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
    if v_kind='KEU1' then
      v_result:=public.reject_surat_by_document_number('PDF-KEU1/TEST','Test rejection',null);
      perform keu10_test.assert(v_result->>'status'='REJECTED','Number rejection canonical status');
    else
      perform public.handle_reject_surat_v2(v_sig,v_id,'Test rejection');
    end if;
    select file_path into v_source from public.surat_registrasi where id=v_id;
    perform keu10_test.assert(v_source<>v_old_source and v_source like '%/rejection/%','Rejection replaces native source');
    perform keu10_test.assert((select status='REJECTED' and pdf_path is null from public.surat_registrasi where id=v_id),'Rejected main cache cleared');
    perform keu10_test.assert((select status='REJECTED' and is_signed and file_path_snap=v_source and pdf_path_snap is null
      from public.surat_signatures where id=v_sig),'Rejected signature records decision, source, cleared cache');
    perform keu10_test.assert((select count(*)=2 from public.document_pdf_jobs where surat_id=v_id and source_file_path=v_source),'Both rejection snapshot and main PDF queued');
    perform keu10_test.expect_error('40001',format('select public.complete_document_pdf_job(%L,%L,%L)',v_stale,'stale://approved',v_token));
    perform keu10_test.assert((select pdf_path is null from public.surat_registrasi where id=v_id),'Stale pre-rejection PDF cannot republish');
    for v_job in select id from public.document_pdf_jobs where surat_id=v_id and source_file_path=v_source loop
      v_token:=gen_random_uuid();
      update public.document_pdf_jobs set status='processing',lease_token=v_token,lease_expires_at=clock_timestamp()+interval '5 minutes' where id=v_job;
      perform public.complete_document_pdf_job(v_job,'fresh://rejected/'||v_job::text,v_token);
    end loop;
    perform keu10_test.assert((select pdf_path like 'fresh://rejected/%' from public.surat_registrasi where id=v_id),'Fresh rejected main can publish');
    perform keu10_test.assert((select pdf_path_snap like 'fresh://rejected/%' and file_path_snap=v_source
      from public.surat_signatures where id=v_sig),'Published rejection snapshot retains native source');
    if v_kind='KEU1' then
      select count(*) into v_count from public.document_pdf_jobs where surat_id=v_id;
      v_result:=public.reject_surat_by_document_number('PDF-KEU1/TEST','Test rejection',null);
      perform keu10_test.assert(v_result->>'idempotent'='true' and (select count(*)=v_count from public.document_pdf_jobs where surat_id=v_id),'Number rejection retry adds no jobs');
    end if;
  end loop;
end $$;

select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
do $$
declare v_id uuid; v_sig uuid; v_prior_sig uuid; v_source text; v_stale uuid; v_job uuid;
  v_token uuid; v_initial jsonb; v_payload jsonb;
begin
  v_id:=(public.create_keu10_registration(keu10_test.payload(651,2,1000000),keu10_test.signers(2,6))#>>'{surat,id}')::uuid;
  perform keu10_test.approve(v_id,1);
  select id into v_prior_sig from public.surat_signatures where surat_id=v_id and step_order=1;
  select id,render_payload into v_job,v_initial from public.document_pdf_jobs where signature_id=v_prior_sig;
  perform keu10_test.assert(v_initial#>>'{signatures,0,status}'='APPROVED','Frozen approval includes explicit status');
  v_token:=gen_random_uuid();
  update public.document_pdf_jobs set status='processing',lease_token=v_token,lease_expires_at=clock_timestamp()+interval '5 minutes' where id=v_job;
  perform public.complete_document_pdf_job(v_job,'cached://keu10-approved',v_token);
  select file_path into v_source from public.surat_registrasi where id=v_id;
  v_token:=gen_random_uuid();
  insert into public.document_pdf_jobs(surat_id,source_file_path,status,lease_token,lease_expires_at)
    values(v_id,v_source,'processing',v_token,clock_timestamp()+interval '5 minutes') returning id into v_stale;
  select id into v_sig from public.surat_signatures where surat_id=v_id and step_order=2;
  perform set_config('request.jwt.claim.sub',keu10_test.id(12)::text,false);
  perform keu10_test.expect_error('42501',format('select public.handle_reject_surat_v2(%L,%L,%L)',v_sig,v_id,'Unauthorized KEU10 rejection'));
  perform keu10_test.assert((select status='PROSES' and pdf_path='cached://keu10-approved' from public.surat_registrasi where id=v_id),'KEU10 rejection guards preserve status and cache');
  perform set_config('request.jwt.claim.sub',(select user_id::text from public.surat_signatures where id=v_sig),false);
  perform public.handle_reject_surat_v2(v_sig,v_id,'Test KEU10 rejection');
  perform keu10_test.assert((select status='REJECTED' and pdf_path is null and file_path<>v_source from public.surat_registrasi where id=v_id),'KEU10 rejection invalidates cached main');
  perform keu10_test.expect_error('40001',format('select public.complete_document_pdf_job(%L,%L,%L)',v_stale,'stale://keu10',v_token));
  perform keu10_test.assert((select render_payload=v_initial from public.document_pdf_jobs where id=v_job),'Earlier immutable approval payload unchanged');
  select file_path into v_source from public.surat_registrasi where id=v_id;
  perform keu10_test.assert((select count(*)=2 from public.document_pdf_jobs where surat_id=v_id and source_file_path=v_source),'KEU10 main and rejected signer queued');
  select render_payload into v_payload from public.document_pdf_jobs where surat_id=v_id and source_file_path=v_source and signature_id is null;
  perform keu10_test.assert(v_payload#>>'{document,status}'='REJECTED' and v_payload#>>'{signatures,0,status}'='APPROVED'
    and v_payload#>>'{signatures,1,status}'='REJECTED' and v_payload#>>'{signatures,2,status}'='PENDING','Frozen main carries actual decisions');
  insert into keu10_test.results(key,surat_id,pdf_snapshot) values('pdf-decision-frozen',v_id,v_payload);
  insert into public.document_pdf_jobs(surat_id,signature_id,source_file_path,requested_by)
    select v_id,v_prior_sig,file_path_snap,keu10_test.id(2) from public.surat_signatures where id=v_prior_sig returning render_payload into v_payload;
  perform keu10_test.assert(v_payload#>>'{signatures,1,status}'='PENDING' and v_payload#>>'{signatures,1,is_signed}'='false','Regenerated earlier snapshot masks later rejection even with equal timestamps');
  for v_job in select id from public.document_pdf_jobs where surat_id=v_id and source_file_path=v_source loop
    v_token:=gen_random_uuid();
    update public.document_pdf_jobs set status='processing',lease_token=v_token,lease_expires_at=clock_timestamp()+interval '5 minutes' where id=v_job;
    perform public.complete_document_pdf_job(v_job,'fresh://keu10-rejected/'||v_job::text,v_token);
  end loop;
  perform keu10_test.assert((select pdf_path like 'fresh://keu10-rejected/%' and status='REJECTED' from public.surat_registrasi where id=v_id),'KEU10 fresh rejected PDF publishes without approving document');
  perform keu10_test.assert(not has_function_privilege('authenticated','public.handle_reject_surat_v2_pre_keu10(uuid,uuid,text)','execute')
    and not has_function_privilege('authenticated','public.keu10_pdf_render_payload(uuid)','execute'),'Private patched function ACLs unchanged');
end $$;
reset role;
select 'PDF_DECISION_PAYLOAD:'||pdf_snapshot::text from keu10_test.results where key='pdf-decision-frozen';
select 'PDF decision SQL: all assertions passed';
