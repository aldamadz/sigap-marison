-- Disposable canonical RPC fixture; never run against a live business database.
create function keu10_test.expect_superseded(p_sql text) returns void language plpgsql as $$
declare v_detail text;
begin
  begin execute p_sql;
  exception when sqlstate 'PT409' then
    get stacked diagnostics v_detail=pg_exception_detail;
    perform keu10_test.assert(v_detail='PDF_SOURCE_CHANGED','Stable machine-readable supersession detail');
    return;
  end;
  raise exception 'Expected superseded publication to fail';
end $$;

insert into public.surat_registrasi(id,no_surat,created_by,file_path,status)
values(keu10_test.id(9001),'PDF-SUPERSESSION',keu10_test.id(1),'native://document/test/v2','PROSES');
insert into public.document_pdf_jobs(id,surat_id,source_file_path,status,lease_token,lease_expires_at)
values(keu10_test.id(9002),keu10_test.id(9001),'native://document/test/v1','processing',keu10_test.id(9003),now()+interval '5 minutes');
select keu10_test.expect_superseded(format('select public.complete_document_pdf_job(%L,%L,%L)',keu10_test.id(9002),'https://storage.invalid/main.pdf',keu10_test.id(9003)));
select keu10_test.assert((select pdf_path is null from public.surat_registrasi where id=keu10_test.id(9001)),'Stale main PDF cannot publish');
select keu10_test.assert((select status='processing' from public.document_pdf_jobs where id=keu10_test.id(9002)),'Rejected publication does not mutate job');
select keu10_test.expect_error('42501',format('select public.complete_document_pdf_job(%L,%L,%L)',keu10_test.id(9002),'https://storage.invalid/main.pdf',keu10_test.id(9999)));
update public.document_pdf_jobs set source_file_path='native://document/test/v2' where id=keu10_test.id(9002);
select keu10_test.assert((public.complete_document_pdf_job(keu10_test.id(9002),'https://storage.invalid/current.pdf',keu10_test.id(9003))).status='done','Current main PDF completes');
select keu10_test.assert((public.complete_document_pdf_job(keu10_test.id(9002),'https://storage.invalid/current.pdf',keu10_test.id(9003))).status='done','Publication remains idempotent');

insert into public.surat_signatures(id,surat_id,user_id,step_order,is_signed,file_path_snap)
values(keu10_test.id(9004),keu10_test.id(9001),keu10_test.id(2),1,true,'native://document/test/v1');
insert into public.document_pdf_jobs(id,surat_id,signature_id,source_file_path,status,lease_token,lease_expires_at)
values(keu10_test.id(9005),keu10_test.id(9001),keu10_test.id(9004),'native://document/test/v1','processing',keu10_test.id(9006),now()+interval '5 minutes');
select keu10_test.assert((public.complete_document_pdf_job(keu10_test.id(9005),'https://storage.invalid/historical.pdf',keu10_test.id(9006))).status='done','Historical signed PDF completes');
select keu10_test.assert((select file_path_snap='native://document/test/v1' and pdf_path_snap='https://storage.invalid/historical.pdf' from public.surat_signatures where id=keu10_test.id(9004)),'Historical signed snapshot remains valid');
select keu10_test.assert((select pdf_path='https://storage.invalid/current.pdf' from public.surat_registrasi where id=keu10_test.id(9001)),'Historical publication cannot replace current main PDF');

do $$ declare v_doc uuid;v_job public.document_pdf_jobs;v_lease uuid:=gen_random_uuid();
begin
 select surat_id into v_doc from keu10_test.results where key='legacy_type_marketing_cost';
 select * into v_job from public.document_pdf_jobs where surat_id=v_doc order by created_at limit 1;
 update public.document_pdf_jobs set status='processing',lease_token=v_lease,lease_expires_at=now()+interval '5 minutes' where id=v_job.id;
 perform keu10_test.approve(v_doc,1);
 perform keu10_test.expect_superseded(format('select public.complete_document_pdf_job(%L,%L,%L)',v_job.id,'https://storage.invalid/keu10-old.pdf',v_lease));
 perform keu10_test.expect_superseded(format('insert into public.document_pdf_jobs(surat_id,source_file_path) values(%L,%L)',v_doc,'native://document/invalid-keu10-source'));
 insert into public.document_pdf_jobs(surat_id,source_file_path,status,lease_token,lease_expires_at)
 select id,file_path,'processing',gen_random_uuid(),now()+interval '5 minutes' from public.surat_registrasi where id=v_doc returning * into v_job;
 perform public.complete_document_pdf_job(v_job.id,'https://storage.invalid/keu10-current.pdf',v_job.lease_token);
 perform keu10_test.assert((select pdf_path='https://storage.invalid/keu10-current.pdf' from public.surat_registrasi where id=v_doc),'Current KEU10 snapshot still publishes');
end $$;

insert into public.surat_registrasi(id,no_surat,created_by,file_path,status)
values(keu10_test.id(9010),'PDF-RECOMMENDATION',keu10_test.id(1),'native://document/recommendation/v1','PROSES');
insert into public.surat_linked_documents(id,parent_surat_id,child_surat_id,link_type,status)
values(keu10_test.id(9011),keu10_test.id(9001),keu10_test.id(9010),'recommendation','active');
do $$ declare v_job public.document_pdf_jobs;v_payload jsonb;
begin
 v_payload:=public.recommendation_pdf_render_payload(keu10_test.id(9010),'native://document/recommendation/v1');
 insert into public.document_pdf_jobs(surat_id,source_file_path,status,lease_token,lease_expires_at,render_payload,recommendation_content_fingerprint)
 values(keu10_test.id(9010),'native://document/recommendation/v1','processing',gen_random_uuid(),now()+interval '5 minutes',v_payload,public.recommendation_content_fingerprint(v_payload)) returning * into v_job;
 perform keu10_test.expect_superseded(format('select public.publish_document_pdf_job(%L,%L,%L,%L,%L,%L,%L,%L)',v_job.id,v_job.source_file_path,'wrong-fingerprint','https://storage.invalid/reco.pdf',v_job.lease_token,'dokumen_surat','pdf/reco.pdf','external'));
 perform keu10_test.expect_superseded(format('select public.publish_document_pdf_job(%L,%L,%L,%L,%L,%L,%L,%L)',v_job.id,v_job.source_file_path,v_job.recommendation_content_fingerprint,'https://storage.invalid/reco.pdf',v_job.lease_token,'dokumen_surat','pdf/reco.pdf','external'));
 perform keu10_test.assert((select status='processing' and pdf_url is null from public.document_pdf_jobs where id=v_job.id),'Non-final recommendation rolls back job publication');
 update public.surat_registrasi set status='PDF_PENDING' where id=keu10_test.id(9010);
 perform public.publish_document_pdf_job(v_job.id,v_job.source_file_path,v_job.recommendation_content_fingerprint,'https://storage.invalid/reco.pdf',v_job.lease_token,'dokumen_surat','pdf/reco.pdf','external');
 perform keu10_test.assert((select status='DONE' and pdf_object_path='pdf/reco.pdf' from public.surat_registrasi where id=keu10_test.id(9010)),'Current final recommendation still publishes');
end $$;

select keu10_test.assert(not exists(select 1 from keu10_test.pdf_function_metadata before join pg_proc after using(oid)
 where row(before.proowner,before.proacl,before.prosecdef,before.proconfig) is distinct from row(after.proowner,after.proacl,after.prosecdef,after.proconfig)),'Function identities owners ACLs and security settings preserved');
select 'PDF supersession: all assertions passed';
