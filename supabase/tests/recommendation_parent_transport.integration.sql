insert into public.surat_registrasi(id,no_surat,status,current_step,file_path,form_input_data) values
 ('56300000-0000-4000-8000-000000000001','UJI-TRANSPORT-PARENT','PROSES',2,'parent-v1.xlsx','{"items":[{"nama_barang":"Komputer","jumlah":1}]}'),
 ('56300000-0000-4000-8000-000000000002','UJI-TRANSPORT-CHILD','DONE',2,'child.xlsx','{"recommendation_items":[]}');
insert into public.surat_linked_documents(parent_surat_id,child_surat_id,link_type,status,required_before_step) values
 ('56300000-0000-4000-8000-000000000001','56300000-0000-4000-8000-000000000002','recommendation','active',3);
insert into public.surat_recommendation_tasks(id,parent_surat_id,submitted_surat_id,status,required_before_step) values
 ('56300000-0000-4000-8000-000000000003','56300000-0000-4000-8000-000000000001','56300000-0000-4000-8000-000000000002','completed',3);
update public.surat_registrasi set pdf_path='child.pdf',pdf_bucket='dokumen_surat',pdf_object_path='child.pdf',pdf_storage_origin='primary'
 where id='56300000-0000-4000-8000-000000000002';
insert into public.document_pdf_jobs(id,surat_id,source_file_path,status,pdf_url,pdf_bucket,pdf_object_path,pdf_storage_origin,render_payload,recommendation_content_fingerprint)
select '56300000-0000-4000-8000-000000000004',id,file_path,'done',pdf_path,pdf_bucket,pdf_object_path,pdf_storage_origin,
 public.recommendation_pdf_render_payload(id,file_path),public.recommendation_content_fingerprint(public.recommendation_pdf_render_payload(id,file_path))
from public.surat_registrasi where id='56300000-0000-4000-8000-000000000002';
do $$begin
 assert public.recommendation_pdf_is_current('56300000-0000-4000-8000-000000000002'),'Initial canonical PDF not current';
end$$;
update public.surat_registrasi set file_path='parent-v2.xlsx' where id='56300000-0000-4000-8000-000000000001';
do $$begin
 assert not public.recommendation_pdf_is_current('56300000-0000-4000-8000-000000000002'),'Old production bug not reproduced';
 begin
  update public.surat_registrasi set current_step=3 where id='56300000-0000-4000-8000-000000000001';
  raise exception 'Old parent gate unexpectedly allowed approval';
 exception when sqlstate '55000' then null; end;
end$$;

-- APPLY TRANSPORT FIX

begin;
do $$begin
 assert public.recommendation_pdf_is_current('56300000-0000-4000-8000-000000000002'),'Transport change still invalidates finished recommendation';
 assert (select count(*)=1 from public.document_pdf_jobs where surat_id='56300000-0000-4000-8000-000000000002'),'Fix created a PDF job';
end$$;
-- No PDF viewer call or PDF regeneration: the actual parent guard now passes.
update public.surat_registrasi set current_step=3 where id='56300000-0000-4000-8000-000000000001';
update public.surat_registrasi set form_input_data='{"items":[{"nama_barang":"Komputer","jumlah":2}]}' where id='56300000-0000-4000-8000-000000000001';
do $$begin
 assert not public.recommendation_pdf_is_current('56300000-0000-4000-8000-000000000002'),'Actual parent content drift was accepted';
 begin
  update public.surat_registrasi set current_step=4 where id='56300000-0000-4000-8000-000000000001';
  raise exception 'Stale recommendation allowed next approval';
 exception when sqlstate '55000' then null; end;
end$$;
rollback;
begin;
update public.document_pdf_jobs set recommendation_content_fingerprint=repeat('f',64) where id='56300000-0000-4000-8000-000000000004';
do $$begin assert not public.recommendation_pdf_is_current('56300000-0000-4000-8000-000000000002'),'Forged fingerprint allowed';end$$;
rollback;
begin;
update public.surat_registrasi set pdf_object_path='wrong.pdf' where id='56300000-0000-4000-8000-000000000002';
do $$begin assert not public.recommendation_pdf_is_current('56300000-0000-4000-8000-000000000002'),'Wrong storage allowed';end$$;
rollback;
begin;
-- A job rendered before a parent signature is publishable after pointer rotation.
update public.document_pdf_jobs set status='processing',lease_token='56300000-0000-4000-8000-000000000005',lease_expires_at=now()+interval '1 minute'
 where id='56300000-0000-4000-8000-000000000004';
select public.publish_document_pdf_job(id,source_file_path,recommendation_content_fingerprint,'child.pdf',lease_token,pdf_bucket,pdf_object_path,pdf_storage_origin)
 from public.document_pdf_jobs where id='56300000-0000-4000-8000-000000000004';
do $$begin assert public.recommendation_pdf_is_current('56300000-0000-4000-8000-000000000002'),'Publication failed after parent pointer rotated';end$$;
rollback;
do $$begin
 assert not has_function_privilege('anon','public.recommendation_pdf_is_current(uuid)','execute'),'Anonymous helper access widened';
 assert not has_function_privilege('authenticated','public.publish_document_pdf_job(uuid,text,text,text,uuid,text,text,text)','execute'),'Publisher access widened';
 raise notice 'Recommendation parent transport: all assertions passed';
end$$;
