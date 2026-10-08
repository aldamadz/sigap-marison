begin;

-- Extend the frozen payload in place, retaining requester revision evidence and ACLs.
do $patch$
declare
  v_body text := pg_get_functiondef('public.keu10_pdf_render_payload(uuid)'::regprocedure);
  v_document text := '''id'',surat.id,''no_surat'',surat.no_surat,''judul_surat'',surat.judul_surat,';
  v_signature text := '''is_signed'',signature.is_signed,''signed_at'',signature.signed_at,''catatan'',signature.catatan,';
begin
  if strpos(v_body,'''status'',surat.status')=0 then
    if strpos(v_body,v_document)=0 then raise exception 'Unknown KEU10 PDF document status anchor'; end if;
    v_body := replace(v_body,v_document,v_document||'''status'',surat.status,');
  end if;
  if strpos(v_body,'''status'',signature.status')=0 then
    if strpos(v_body,v_signature)=0 then raise exception 'Unknown KEU10 PDF signature status anchor'; end if;
    v_body := replace(v_body,v_signature,v_signature||'''status'',signature.status,');
  end if;
  execute v_body;
end $patch$;

-- Future decisions must remain pending in an earlier immutable signer snapshot.
do $patch$
declare
  v_body text := pg_get_functiondef('public.freeze_keu10_pdf_job()'::regprocedure);
  v_old text := '''{"is_signed":false,"signed_at":null,"catatan":null}''::jsonb';
  v_new text := '''{"is_signed":false,"signed_at":null,"catatan":null,"status":"PENDING"}''::jsonb';
  v_order_old text := 'case when nullif(signature->>''signed_at'','''')::timestamptz > requested.signed_at then';
  v_order_new text := 'case when (signature->>''step_order'')::integer > requested.step_order or nullif(signature->>''signed_at'','''')::timestamptz > requested.signed_at then';
begin
  if strpos(v_body,v_new)=0 then
    if strpos(v_body,v_old)=0 then raise exception 'Unknown KEU10 historical PDF decision anchor'; end if;
    v_body := replace(v_body,v_old,v_new);
  end if;
  if strpos(v_body,v_order_new)=0 then
    if strpos(v_body,v_order_old)=0 then raise exception 'Unknown KEU10 historical PDF step anchor'; end if;
    v_body := replace(v_body,v_order_old,v_order_new);
  end if;
  execute v_body;
end $patch$;

-- Both signer RPC and document-number rejection use this guarded private body.
-- Changing the native source also prevents a pre-rejection job publishing stale PDF.
do $patch$
declare
  v_body text := replace(pg_get_functiondef('public.handle_reject_surat_v2_pre_keu10(uuid,uuid,text)'::regprocedure),E'\r\n',E'\n');
  v_declare text := E'  v_actor uuid := auth.uid();\n';
  v_old text := $anchor$  update public.surat_signatures
  set is_signed = true,
      signed_at = now(),
      catatan = p_note,
      status = 'REJECTED'
  where id = p_sig_id;

  update public.surat_registrasi
  set status = 'REJECTED',
      updated_at = now()
  where id = p_surat_id;$anchor$;
  v_new text := $replacement$  -- pdf_approval_decision_status: retain the canonical rejection guards above.
  select case when sr.file_path like 'native://document/%'
    and nullif(sr.form_input_data->>'linked_parent_surat_id','') is null
    and not exists(select 1 from public.surat_linked_documents link
      where link.child_surat_id=sr.id and link.link_type='recommendation' and link.status='active')
    then sr.file_path||'/rejection/'||p_sig_id::text end into v_pdf_source
  from public.surat_registrasi sr where sr.id=p_surat_id;

  update public.surat_signatures
  set is_signed = true,
      signed_at = now(),
      catatan = p_note,
      status = 'REJECTED',
      file_path_snap = coalesce(v_pdf_source,file_path_snap),
      pdf_path_snap = case when v_pdf_source is not null then null else pdf_path_snap end
  where id = p_sig_id;

  update public.surat_registrasi
  set status = 'REJECTED',
      file_path = coalesce(v_pdf_source,file_path),
      pdf_path = case when v_pdf_source is not null then null else pdf_path end,
      updated_at = now()
  where id = p_surat_id;

  if v_pdf_source is not null then
    insert into public.document_pdf_jobs(surat_id,signature_id,source_file_path,requested_by,refresh)
      values(p_surat_id,null,v_pdf_source,v_actor,true);
  end if;$replacement$;
begin
  if strpos(v_body,'pdf_approval_decision_status:')=0 then
    if strpos(v_body,v_declare)=0 or strpos(v_body,v_old)=0 then
      raise exception 'Unknown canonical rejection PDF anchors';
    end if;
    v_body := replace(v_body,v_declare,v_declare||E'  v_pdf_source text;\n');
    execute replace(v_body,v_old,v_new);
  end if;
end $patch$;

-- The non-KEU10 publisher also needs source checks; KEU10 already enforces them.
do $patch$
declare
  v_body text := replace(pg_get_functiondef('public.complete_document_pdf_job_pre_keu10(uuid,text,uuid)'::regprocedure),E'\r\n',E'\n');
  v_main text := $anchor$  else
    update public.surat_registrasi set pdf_path=p_pdf_url,updated_at=clock_timestamp() where id=v_surat.id;$anchor$;
  v_signature text := $anchor$    update public.surat_signatures set pdf_path_snap=p_pdf_url,file_path_snap=null where id=v_signature.id;$anchor$;
begin
  if strpos(v_body,'Native PDF source changed')=0 then
    if strpos(v_body,v_main)=0 or strpos(v_body,v_signature)=0 then
      raise exception 'Unknown canonical PDF publication source anchors';
    end if;
    v_body := replace(v_body,v_main,$replacement$  else
    if v_surat.file_path like 'native://document/%' and v_surat.file_path is distinct from v_job.source_file_path then
      raise exception 'Native PDF source changed' using errcode='40001';
    end if;
    update public.surat_registrasi set pdf_path=p_pdf_url,updated_at=clock_timestamp() where id=v_surat.id;$replacement$);
    v_body := replace(v_body,v_signature,$replacement$    if v_job.source_file_path like 'native://document/%' and
      (v_signature.is_signed is not true or v_signature.file_path_snap is distinct from v_job.source_file_path) then
      raise exception 'Native PDF source changed' using errcode='40001';
    end if;
    update public.surat_signatures set pdf_path_snap=p_pdf_url,
      file_path_snap=case when v_job.source_file_path like 'native://document/%' then file_path_snap else null end
      where id=v_signature.id;$replacement$);
    execute v_body;
  end if;
end $patch$;

notify pgrst,'reload schema';
commit;
