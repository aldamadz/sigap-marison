-- REC-03 file-link acceptance. Disposable PostgreSQL only.
insert into public.profiles(id,role,is_active) values
 ('00000000-0000-4000-8000-000000000001','user',true),
 ('00000000-0000-4000-8000-000000000002','admin',true);
insert into public.surat_registrasi(id,created_by,status,file_path,pdf_path,pdf_bucket,pdf_object_path,pdf_storage_origin,form_input_data) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','DONE','parent.xlsx',null,null,null,null,'{"request_category":"asset"}'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','DONE','child.xlsx','ignored-public-url','dokumen_surat','pdf/current.pdf','external','{}');
insert into public.surat_linked_documents(id,parent_surat_id,child_surat_id,link_type,status,updated_at) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','recommendation','active',now());
insert into public.document_pdf_jobs(surat_id,source_file_path,status,pdf_url,pdf_bucket,pdf_object_path,pdf_storage_origin,recommendation_content_fingerprint,render_payload)
select '10000000-0000-4000-8000-000000000002','child.xlsx','done','ignored-public-url','dokumen_surat','pdf/current.pdf','external',public.recommendation_content_fingerprint(payload),payload
from (select public.recommendation_pdf_render_payload('10000000-0000-4000-8000-000000000002','child.xlsx') payload) source;
-- Simulate a PDF published before the parent approval path was removed from the
-- canonical payload. Existing final PDFs remain valid after the forward fix.
update public.document_pdf_jobs
set render_payload = render_payload || jsonb_build_object(
      'parent_workbook_source', jsonb_build_object('bucket','dokumen_surat','path','parent.xlsx')
    ),
    recommendation_content_fingerprint = public.recommendation_content_fingerprint(
      render_payload || jsonb_build_object(
        'parent_workbook_source', jsonb_build_object('bucket','dokumen_surat','path','parent.xlsx')
      )
    )
where surat_id='10000000-0000-4000-8000-000000000002';
insert into public.surat_attachments(surat_id,file_url,file_size,file_type)
values('10000000-0000-4000-8000-000000000001','approval-stage.pdf',100,'application/pdf');
update public.surat_registrasi set file_path='parent-approval-step-2.xlsx'
where id='10000000-0000-4000-8000-000000000001';
insert into public.marison_outbound_dispatches(id,surat_id,environment,kind,endpoint,idempotency_key,status,lease_token,lease_acquired_at,lease_expires_at) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','staging','asset','/asset-purchase-requests','file-link-dispatch','processing','40000000-0000-4000-8000-000000000001',now(),now()+interval '5 minutes');

do $$begin
 assert not (public.recommendation_pdf_render_payload('10000000-0000-4000-8000-000000000002','child.xlsx') ? 'parent_attachment_refs'),'parent approval attachments remain in recommendation fingerprint';
 assert not (public.recommendation_pdf_render_payload('10000000-0000-4000-8000-000000000002','child.xlsx') ? 'parent_workbook_source'),'parent approval source remains in recommendation fingerprint';
 assert public.recommendation_pdf_is_current('10000000-0000-4000-8000-000000000002'),'parent approval attachment invalidated recommendation PDF';
 begin update public.surat_registrasi set pdf_object_path='https://example.test/file.pdf' where id='10000000-0000-4000-8000-000000000002';raise exception 'lowercase URL accepted';exception when check_violation then null;end;
 begin update public.surat_registrasi set pdf_object_path='HTTPS://example.test/file.pdf' where id='10000000-0000-4000-8000-000000000002';raise exception 'uppercase URL accepted';exception when check_violation then null;end;
 begin update public.surat_registrasi set pdf_object_path='/pdf/current.pdf' where id='10000000-0000-4000-8000-000000000002';raise exception 'leading slash accepted';exception when check_violation then null;end;
 begin update public.surat_registrasi set pdf_object_path='pdf\current.pdf' where id='10000000-0000-4000-8000-000000000002';raise exception 'backslash accepted';exception when check_violation then null;end;
 begin update public.surat_registrasi set pdf_object_path='pdf/../secret.pdf' where id='10000000-0000-4000-8000-000000000002';raise exception 'traversal accepted';exception when check_violation then null;end;
 begin update public.surat_registrasi set pdf_object_path='storage/v1/object/public/b/f.pdf' where id='10000000-0000-4000-8000-000000000002';raise exception 'storage marker accepted';exception when check_violation then null;end;
 begin update public.surat_registrasi set pdf_object_path='pdf%2Fsecret.pdf' where id='10000000-0000-4000-8000-000000000002';raise exception 'encoded slash accepted';exception when check_violation then null;end;
 begin update public.surat_registrasi set pdf_bucket='bad/bucket' where id='10000000-0000-4000-8000-000000000002';raise exception 'bad bucket accepted';exception when check_violation then null;end;
 begin update public.surat_registrasi set pdf_bucket='DOKUMEN_SURAT' where id='10000000-0000-4000-8000-000000000002';raise exception 'non-canonical bucket case accepted';exception when check_violation then null;end;
 begin perform public.publish_document_pdf_job(gen_random_uuid(),'x',repeat('a',64),'x',gen_random_uuid(),'dokumen_surat','HTTPS://example.test/file.pdf','external');raise exception 'publication URL accepted';exception when invalid_parameter_value then null;end;
end$$;

set role authenticated;
do $$begin begin perform public.recommendation_all_items_rejected('10000000-0000-4000-8000-000000000001');raise exception 'authenticated helper call accepted';exception when insufficient_privilege then null;end;end$$;
reset role;
set role service_role;

-- Browser preview tokens are one-time bearers. A consumed token must not replay.
insert into public.file_view_tokens(token_hash,bucket,object_path,storage_origin,surat_id,purpose,expires_at)
values(repeat('8',64),'dokumen_surat','pdf/preview.pdf','external','10000000-0000-4000-8000-000000000002','preview',now()+interval '2 minutes');
do $$begin
 assert(select count(*)=1 from public.consume_file_view_token(repeat('8',64))),'fresh preview token did not resolve';
 assert(select consumed_at is not null from public.file_view_tokens where token_hash=repeat('8',64)),'preview token was not marked consumed';
 assert(select count(*)=0 from public.consume_file_view_token(repeat('8',64))),'consumed preview token replayed';
end$$;

select * from public.mint_recommendation_file_view_token(repeat('a',64),'10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',null);
do $$begin
 assert(select count(*)=1 and bool_and(token_hash=repeat('a',64) and bucket='dokumen_surat' and object_path='pdf/current.pdf') from public.file_view_tokens where transport_attempt_id='50000000-0000-4000-8000-000000000001'),'hash-only coordinate token missing';
 assert(select count(*)=1 and bool_and(bucket='dokumen_surat' and object_path='pdf/current.pdf' and storage_origin='external') from public.consume_file_view_token(repeat('a',64))),'consume did not return exact canonical coordinate';
end$$;
select public.cleanup_recommendation_file_view_tokens('50000000-0000-4000-8000-000000000001','acceptance revoke');
do $$begin assert(select count(*)=0 from public.consume_file_view_token(repeat('a',64))),'revoked token resolved';end$$;

select * from public.mint_recommendation_file_view_token(repeat('b',64),'10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',null);
update public.surat_registrasi set pdf_object_path='pdf/replaced.pdf' where id='10000000-0000-4000-8000-000000000002';
do $$begin assert(select count(*)=0 from public.consume_file_view_token(repeat('b',64))),'pointer mismatch resolved';end$$;
update public.surat_registrasi set pdf_object_path='pdf/current.pdf' where id='10000000-0000-4000-8000-000000000002';
update public.surat_linked_documents set status='cancelled' where id='20000000-0000-4000-8000-000000000001';
do $$begin assert(select revoked_at is not null and revoke_reason='recommendation link cancelled or replaced' from public.file_view_tokens where token_hash=repeat('b',64)),'cancel trigger did not revoke';end$$;
update public.surat_linked_documents set status='active' where id='20000000-0000-4000-8000-000000000001';

-- Lease reclaim: stale worker cannot insert; current worker revokes old pre-POST token and mints one.
select * from public.mint_recommendation_file_view_token(repeat('c',64),'10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003',null);
update public.marison_outbound_dispatches set lease_token='40000000-0000-4000-8000-000000000002',lease_expires_at=now()+interval '5 minutes' where id='30000000-0000-4000-8000-000000000001';
do $$begin
 begin perform public.mint_recommendation_file_view_token(repeat('e',64),'10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000005',null);raise exception 'stale lease minted';exception when insufficient_privilege then null;end;
 assert(select count(*)=0 from public.file_view_tokens where token_hash=repeat('e',64)),'stale mint inserted token';
 assert(select revoked_at is null from public.file_view_tokens where token_hash=repeat('c',64)),'stale request mutated prior token';
end$$;
select * from public.mint_recommendation_file_view_token(repeat('d',64),'10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000004',null);
do $$begin
 assert(select revoked_at is not null and revoke_reason='dispatch_lease_reclaimed' from public.file_view_tokens where token_hash=repeat('c',64)),'reclaimed lease token not revoked';
 assert(select count(*)=1 from public.file_view_tokens where dispatch_id='30000000-0000-4000-8000-000000000001' and surat_id='10000000-0000-4000-8000-000000000002' and revoked_at is null),'current lease did not mint exactly one active token';
end$$;

-- Every canonical coordinate participates in currentness and token resolution.
do $$begin assert public.recommendation_pdf_is_current('10000000-0000-4000-8000-000000000002'),'published coordinates not current';end$$;
update public.surat_registrasi set pdf_bucket='other_bucket' where id='10000000-0000-4000-8000-000000000002';
do $$begin assert not public.recommendation_pdf_is_current('10000000-0000-4000-8000-000000000002'),'bucket mutation remained current';end$$;
update public.surat_registrasi set pdf_bucket='dokumen_surat' where id='10000000-0000-4000-8000-000000000002';
update public.surat_registrasi set pdf_object_path='pdf/other.pdf' where id='10000000-0000-4000-8000-000000000002';
do $$begin assert not public.recommendation_pdf_is_current('10000000-0000-4000-8000-000000000002'),'object path mutation remained current';end$$;
update public.surat_registrasi set pdf_object_path='pdf/current.pdf' where id='10000000-0000-4000-8000-000000000002';
update public.surat_registrasi set pdf_storage_origin='primary' where id='10000000-0000-4000-8000-000000000002';
do $$begin
 assert not public.recommendation_pdf_is_current('10000000-0000-4000-8000-000000000002'),'coordinate mutation remained current';
 begin perform public.mint_recommendation_file_view_token(repeat('f',64),'10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000006',null);raise exception 'stale coordinates minted';exception when object_not_in_prerequisite_state then null;end;
 assert(select count(*)=0 from public.file_view_tokens where token_hash=repeat('f',64)),'coordinate-stale mint inserted token';
 assert(select count(*)=0 from public.consume_file_view_token(repeat('d',64))),'old token resolved after coordinate mutation';
end$$;
update public.surat_registrasi set pdf_storage_origin='external' where id='10000000-0000-4000-8000-000000000002';
do $$begin
 assert public.recommendation_pdf_is_current('10000000-0000-4000-8000-000000000002'),'restored coordinates not current';
 assert(select count(*)=1 from public.consume_file_view_token(repeat('d',64))),'restored coordinates did not resolve old token';
end$$;

-- Crash after mint: expired pre-POST attempt remains cleanup-safe.
update public.file_view_tokens set minted_at=now()-interval '20 minutes' where token_hash=repeat('d',64);
update public.marison_outbound_dispatches set lease_expires_at=now()-interval '1 minute' where id='30000000-0000-4000-8000-000000000001';
select public.cleanup_stale_recommendation_file_view_tokens(interval '15 minutes');
do $$begin assert(select revoked_at is not null and mint_status='revoked' and revoke_reason='orphaned_pre_post_materialization' from public.file_view_tokens where token_hash=repeat('d',64)),'stale orphan not revoked';end$$;
update public.marison_outbound_dispatches set lease_token='40000000-0000-4000-8000-000000000003',lease_expires_at=now()+interval '5 minutes' where id='30000000-0000-4000-8000-000000000001';
select * from public.mint_recommendation_file_view_token(repeat('9',64),'10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000009',null);

-- Live and post-boundary attempts remain active even when old.
update public.marison_outbound_dispatches set lease_expires_at=now()+interval '5 minutes' where id='30000000-0000-4000-8000-000000000001';
update public.file_view_tokens set minted_at=now()-interval '20 minutes' where token_hash=repeat('9',64);
select public.cleanup_stale_recommendation_file_view_tokens(interval '15 minutes');
do $$begin assert(select revoked_at is null from public.file_view_tokens where token_hash=repeat('9',64)),'live attempt revoked';end$$;
update public.marison_outbound_dispatches set post_started_at=now(),status='outcome_unknown',lease_token=null,lease_expires_at=null where id='30000000-0000-4000-8000-000000000001';
select public.cleanup_recommendation_file_view_tokens('50000000-0000-4000-8000-000000000009','must not revoke post-started');
select public.cleanup_stale_recommendation_file_view_tokens(interval '15 minutes');
do $$begin
 assert(select revoked_at is null from public.file_view_tokens where token_hash=repeat('9',64)),'post-started token revoked';
 assert(select count(*)>=3 and bool_and(token_hash~'^[0-9a-f]{64}$') from public.file_view_token_audit),'audit missing or malformed';
end$$;
reset role;

select 'REC-03 file-link SQL integration passed' as result;
