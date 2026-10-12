begin;

-- Recommendation photos belong to the requester, not the examining signature.
create or replace function requester_revision_internal.editable_attachment(p_stage text,p_signature uuid,p_creator uuid,p_owner uuid)
returns boolean language sql immutable set search_path='' as $$
  select p_signature is null and (p_stage='initial' or (p_stage='recommendation_item' and p_creator=p_owner))
$$;

create or replace function requester_revision_internal.rebind_photos(p_value jsonb,p_draft uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_key text; v_entry jsonb; v_file public.surat_registration_draft_files%rowtype;
begin
  if jsonb_typeof(p_value)='array' then
    select coalesce(jsonb_agg(requester_revision_internal.rebind_photos(value,p_draft) order by ord),'[]')
      into v_result from jsonb_array_elements(p_value) with ordinality entries(value,ord);
    return v_result;
  elsif jsonb_typeof(p_value)='object' then
    v_result:='{}';
    for v_key,v_entry in select key,value from jsonb_each(p_value) loop
      v_result:=v_result||jsonb_build_object(v_key,requester_revision_internal.rebind_photos(v_entry,p_draft));
    end loop;
    if p_value ? 'storage_path' then
      select * into v_file from public.surat_registration_draft_files
        where draft_id=p_draft and file_url=p_value->>'storage_path' order by id limit 1;
      if found then
        v_result:=v_result||jsonb_build_object('id',v_file.id,'metadata',coalesce(v_result->'metadata','{}')
          ||jsonb_build_object('draft_file_id',v_file.id));
      end if;
    end if;
    if p_value ? 'recommendation_attachment_url' then
      select * into v_file from public.surat_registration_draft_files
        where draft_id=p_draft and file_url=p_value->>'recommendation_attachment_url' order by id limit 1;
      if found then v_result:=v_result||jsonb_build_object('recommendation_attachment_draft_file_id',v_file.id); end if;
    end if;
    if p_value ? 'file_url' and p_value ? 'draft_file_id' then
      select * into v_file from public.surat_registration_draft_files
        where draft_id=p_draft and file_url=p_value->>'file_url' order by id limit 1;
      if found then v_result:=v_result||jsonb_build_object('draft_file_id',v_file.id); end if;
    end if;
    return v_result;
  end if;
  return p_value;
end $$;

create or replace function requester_revision_internal.prepare_recommendation_draft(p_draft uuid)
returns public.surat_registration_drafts language plpgsql security definer set search_path='' as $$
declare v_draft public.surat_registration_drafts%rowtype; v_surat public.surat_registrasi%rowtype;
  v_event public.surat_revision_events%rowtype; v_context jsonb; v_payload jsonb; v_input jsonb;
  v_parent record; v_detail record; v_legacy jsonb; v_saved text; v_baseline text;
begin
  select * into v_draft from public.surat_registration_drafts where id=p_draft for update;
  select * into v_event from public.surat_revision_events where id=v_draft.revision_event_id;
  select * into v_surat from public.surat_registrasi where id=v_event.surat_id;
  if v_surat.form_input_data->>'linked_document_type' is distinct from 'recommendation' then return v_draft; end if;
  if auth.uid() is null or auth.uid() is distinct from v_draft.created_by or auth.uid() is distinct from v_surat.created_by
    or v_event.status is distinct from 'open' or v_draft.status is distinct from 'DRAFT'
    or v_draft.expires_at is null or v_draft.expires_at<=clock_timestamp() then
    raise exception 'Draft rekomendasi tidak lagi aktif.' using errcode='42501'; end if;
  if v_draft.payload->>'recommendation_revision_photos_version'='1' then return v_draft; end if;
  select jsonb_build_object('type','recommendation','parentSuratId',parent.id,'parentNoSurat',parent.no_surat,
    'requiredBeforeStep',link.required_before_step,'taskId',task.id,'formId',task.form_id,'usageId',task.usage_id,
    'departmentId',task.department_id,'letterTypeId',task.letter_type_id) into v_context
    from public.surat_linked_documents link join public.surat_registrasi parent on parent.id=link.parent_surat_id
    join public.surat_recommendation_tasks task on task.parent_surat_id=parent.id and task.submitted_surat_id=v_surat.id
    where link.child_surat_id=v_surat.id and link.link_type='recommendation' and link.status='active';
  if v_context is null then raise exception 'Tautan pengajuan induk rekomendasi tidak tersedia.' using errcode='40001'; end if;
  insert into requester_revision_internal.permits values(txid_current(),v_surat.id,'draft') on conflict do nothing;
  v_input:=v_draft.payload#>'{formData,form_input_data}';
  -- The broken legacy editor saved specifications in keterangan, outside the model.
  -- Rescue only those edits; never overwrite a subsequently edited canonical description.
  for v_parent in select value,ordinality from jsonb_array_elements(coalesce(v_input#>'{recommendation_multi_detail,items}','[]')) with ordinality loop
    for v_detail in select value,ordinality from jsonb_array_elements(v_parent.value->'details') with ordinality loop
      select value into v_legacy from jsonb_array_elements(coalesce(v_input->'recommendation_items','[]'))
        where value->>'detail_id'=v_detail.value->>'id' limit 1;
      v_saved:=nullif(btrim(v_legacy->>'keterangan'),'');
      select detail->>'description' into v_baseline from jsonb_array_elements(coalesce(v_surat.form_input_data#>'{recommendation_multi_detail,items}','[]')) parent,
        lateral jsonb_array_elements(parent->'details') detail where detail->>'id'=v_detail.value->>'id';
      if v_saved is not null and v_detail.value->>'description' is not distinct from v_baseline then
        v_input:=jsonb_set(v_input,array['recommendation_multi_detail','items',(v_parent.ordinality-1)::text,'details',(v_detail.ordinality-1)::text],
          v_detail.value||jsonb_build_object('description',v_saved,'description_manually_edited',true),true);
      end if;
    end loop;
  end loop;
  -- Copy references only, never storage objects. Missing/deleted details stay missing.
  insert into public.surat_registration_draft_files(draft_id,created_by,file_url,file_name,file_type,file_size,requirement_key,requirement_label)
    select v_draft.id,auth.uid(),a.file_url,a.file_name,a.file_type,a.file_size,a.requirement_key,a.requirement_label
    from public.surat_attachments a where a.surat_id=v_surat.id and a.stage='recommendation_item'
      and requester_revision_internal.editable_attachment(a.stage,a.signature_id,a.created_by,auth.uid())
      and exists(select 1 from (
        select path from jsonb_path_query(v_input,'$.**.storage_path') path
        union all select path from jsonb_path_query(v_input,'$.**.recommendation_attachment_url') path
        union all select path from jsonb_path_query(v_input,'$.**.file_url') path) refs where path#>>'{}'=a.file_url)
      and not exists(select 1 from public.surat_registration_draft_files f where f.draft_id=v_draft.id and f.file_url=a.file_url);
  v_payload:=jsonb_set(v_draft.payload,'{formData,form_input_data}',requester_revision_internal.rebind_photos(v_input,v_draft.id),true)
    ||jsonb_build_object('linkedDocumentContext',v_context,'recommendation_revision_photos_version',1);
  v_payload:=jsonb_set(v_payload,'{externalRevision,protectedAttachments}',coalesce((select jsonb_agg(to_jsonb(a))
    from public.surat_attachments a where a.surat_id=v_surat.id and not coalesce(
      requester_revision_internal.editable_attachment(a.stage,a.signature_id,a.created_by,auth.uid()),false)),'[]'),true);
  update public.surat_registration_drafts set payload=v_payload where id=v_draft.id returning * into v_draft;
  delete from requester_revision_internal.permits where transaction_id=txid_current() and surat_id=v_surat.id and operation='draft';
  return v_draft;
end $$;

create or replace function requester_revision_internal.validate_recommendation_revision(p_surat uuid,p_draft uuid,p_input jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v_original jsonb; v_items jsonb; v_photo jsonb;
begin
  select form_input_data into v_original from public.surat_registrasi where id=p_surat;
  if p_input->>'linked_document_type' is distinct from 'recommendation'
    or p_input->>'linked_parent_surat_id' is distinct from v_original->>'linked_parent_surat_id'
    or p_input->>'linked_parent_no_surat' is distinct from v_original->>'linked_parent_no_surat' then
    raise exception 'Identitas rekomendasi dan pengajuan induk tidak dapat diubah.' using errcode='22023'; end if;
  if p_input ? 'recommendation_multi_detail' then
    if p_input#>>'{recommendation_multi_detail,version}' is distinct from '1' then
      raise exception 'Versi rincian rekomendasi tidak valid.' using errcode='22023'; end if;
    v_items:=p_input#>'{recommendation_multi_detail,items}';
    perform public.validate_recommendation_items(v_items,true);
    for v_photo in select photo from jsonb_array_elements(v_items) parent,
      lateral jsonb_array_elements(parent->'details') detail,
      lateral jsonb_array_elements(detail->'attachments') photo loop
      if not exists(select 1 from public.surat_registration_draft_files f where f.draft_id=p_draft
        and f.created_by=auth.uid() and f.id::text=v_photo#>>'{metadata,draft_file_id}'
        and f.id::text=v_photo->>'id' and f.file_url=v_photo->>'storage_path') then
        raise exception 'Foto rekomendasi tidak terhubung ke draft pemohon.' using errcode='42501'; end if;
    end loop;
  else
    perform public.validate_recommendation_items(p_input->'recommendation_items',false);
    for v_photo in select path from (
      select path from jsonb_path_query(p_input->'recommendation_items','$.**.recommendation_attachment_url') path
      union all select path from jsonb_path_query(p_input->'recommendation_items','$.**.file_url') path) refs loop
      if nullif(v_photo#>>'{}','') is not null and not exists(select 1 from public.surat_registration_draft_files f
        where f.draft_id=p_draft and f.created_by=auth.uid() and f.file_url=v_photo#>>'{}') then
        raise exception 'Foto rekomendasi legacy tidak terhubung ke draft pemohon.' using errcode='42501'; end if;
    end loop;
  end if;
end $$;

-- Preserve the live canonical wrappers and abort on unexpected source drift.
do $patch$
declare v_source text; v_before text; v_oid regprocedure; v_old text;
begin
  foreach v_oid in array array[
    'public.create_external_submission_revision_draft(uuid)'::regprocedure,
    'public.submit_external_submission_revision(uuid,uuid,jsonb,text)'::regprocedure,
    'requester_revision_internal.guard_draft_file()'::regprocedure] loop
    v_source:=pg_get_functiondef(v_oid); v_before:=v_source;
    if position('requester_revision_internal.editable_attachment' in v_source)=0 then
      v_source:=replace(v_source,'stage=''initial'' and signature_id is null',
        'requester_revision_internal.editable_attachment(stage,signature_id,created_by,auth.uid())');
      v_source:=replace(v_source,'stage is distinct from ''initial'' or signature_id is not null',
        'not coalesce(requester_revision_internal.editable_attachment(stage,signature_id,created_by,auth.uid()),false)');
      v_source:=replace(v_source,'stage<>''initial'' or signature_id is not null',
        'not coalesce(requester_revision_internal.editable_attachment(stage,signature_id,created_by,auth.uid()),false)');
      if v_source=v_before then raise exception 'Recommendation attachment patch drift: %',v_oid; end if;
      execute v_source;
    end if;
  end loop;
  v_source:=pg_get_functiondef('requester_revision_internal.guard_draft()'::regprocedure);
  v_old:='new.payload:=jsonb_set(new.payload,''{externalRevision}'',old.payload->''externalRevision'',true);';
  if position('operation=''draft''' in v_source)=0 then
    if position(v_old in v_source)=0 then raise exception 'Recommendation draft guard drift'; end if;
    execute replace(v_source,v_old,'if not exists(select 1 from requester_revision_internal.permits where transaction_id=txid_current() and surat_id=v_event.surat_id and operation=''draft'') then '||v_old||' end if;');
  end if;
  v_source:=pg_get_functiondef('public.create_external_submission_revision_draft(uuid)'::regprocedure);
  if position('prepare_recommendation_draft' in v_source)=0 then
    if position('return v_draft;' in v_source)=0 then raise exception 'Recommendation draft return drift'; end if;
    execute replace(v_source,'return v_draft;','return requester_revision_internal.prepare_recommendation_draft(v_draft.id);');
  end if;
  v_source:=pg_get_functiondef('public.submit_external_submission_revision(uuid,uuid,jsonb,text)'::regprocedure);
  if position('validate_recommendation_revision' in v_source)=0 then
    v_old:='if v_surat.form_input_data ? ''items'' and';
    if position(v_old in v_source)=0 then raise exception 'Recommendation submit item guard drift'; end if;
    v_source:=replace(v_source,v_old,'if v_surat.form_input_data->>''linked_document_type''=''recommendation'' then perform requester_revision_internal.validate_recommendation_revision(v_surat.id,v_draft.id,v_input); end if; '||
      'if v_surat.form_input_data->>''linked_document_type'' is distinct from ''recommendation'' and v_surat.form_input_data ? ''items'' and');
    -- Preserve attachment stages: per-item photos must not become generic PGD files.
    v_old:='requirement_key,requirement_label,''initial''';
    if position(v_old in v_source)=0 then raise exception 'Recommendation submit attachment insert drift'; end if;
    v_source:=replace(v_source,v_old,'requirement_key,requirement_label,case when v_surat.form_input_data->>''linked_document_type''=''recommendation'' and requirement_key like ''recommendation_%'' then ''recommendation_item'' else ''initial'' end');
    v_old:='public.surat_attachments(surat_id,file_url,file_name,file_type,file_size,requirement_key,requirement_label,stage)';
    if position(v_old in v_source)=0 then raise exception 'Recommendation attachment ownership insert drift'; end if;
    v_source:=replace(v_source,v_old,'public.surat_attachments(surat_id,file_url,file_name,file_type,file_size,requirement_key,requirement_label,stage,created_by)');
    v_source:=replace(v_source,'else ''initial'' end'||E'\n    from public.surat_registration_draft_files',
      'else ''initial'' end,auth.uid()'||E'\n    from public.surat_registration_draft_files');
    if position('else ''initial'' end,auth.uid()' in v_source)=0 then raise exception 'Recommendation attachment ownership select drift'; end if;
    execute v_source;
  end if;
end $patch$;

revoke all on function requester_revision_internal.editable_attachment(text,uuid,uuid,uuid),
  requester_revision_internal.rebind_photos(jsonb,uuid),requester_revision_internal.prepare_recommendation_draft(uuid),
  requester_revision_internal.validate_recommendation_revision(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
