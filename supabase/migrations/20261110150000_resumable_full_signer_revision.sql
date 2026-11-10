begin;

-- Product policy: a completed internal revision returns to its asking stage.
-- Retain the material-change evidence, but do not restart all prior approvals.
create or replace function requester_revision_internal.reapproval_decision(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare event public.surat_revision_events; doc public.surat_registrasi; step integer;
begin
  select * into event from public.surat_revision_events where id=p_event_id;
  select * into doc from public.surat_registrasi where id=event.surat_id;
  if event.id is null or doc.id is null or event.changes->'requester_revision_base' is null
    or coalesce(event.changes->>'resume_step','')!~'^[1-9][0-9]*$' then
    raise exception 'Bukti dan tahap revisi tidak lengkap.' using errcode='42501'; end if;
  step:=(event.changes->>'resume_step')::integer;
  if not exists(select 1 from public.surat_signatures where surat_id=doc.id and step_order=step) then
    raise exception 'Tahap persetujuan tidak tersedia.' using errcode='42501'; end if;
  return jsonb_build_object('restart_step',step,'material_reapproval',false);
end $$;

create or replace function requester_revision_internal.propose_full_form(
  p_surat uuid,p_signature uuid,p_reason text,p_form jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare doc public.surat_registrasi; sig public.surat_signatures; event_id uuid;
  input jsonb; original_form jsonb; proposed_form jsonb; key text; item jsonb; items jsonb:='[]';
  total numeric:=0; quantity numeric; price numeric; amount numeric; is_financial boolean;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid()
    and is_active is true and deleted_at is null) then raise exception 'Pemakai tidak aktif.' using errcode='42501'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('keu10:'||p_surat::text,0)) then
    raise exception 'Pengajuan sedang diproses. Silakan coba lagi.' using errcode='55P03';end if;
  select * into doc from public.surat_registrasi where id=p_surat for update nowait;
  select * into sig from public.surat_signatures where id=p_signature and surat_id=p_surat for update nowait;
  if doc.id is null or sig.id is null or sig.user_id is distinct from auth.uid() or sig.is_signed
    or doc.status<>'PROSES' or sig.step_order is distinct from doc.current_step then
    raise exception 'Hanya penandatangan tahap aktif yang dapat mengusulkan revisi.' using errcode='42501';end if;
  if jsonb_typeof(p_form) is distinct from 'object' or jsonb_typeof(p_form->'form_input_data') is distinct from 'object'
    or pg_column_size(p_form)>1048576 or (p_form-array['judul_surat','request_place','request_date','form_input_data'])<>'{}'
    or length(btrim(coalesce(p_reason,''))) not between 5 and 1000 then
    raise exception 'Isi atau alasan usulan revisi tidak valid.' using errcode='22023';end if;
  input:=p_form->'form_input_data';
  -- Allocation, external identity and examination receipts are never signer-editable.
  for key in select jsonb_object_keys(input||doc.form_input_data) loop
    if (key like 'allocated\_%' escape '\' or key like 'verification\_%' escape '\' or key like 'checker\_%' escape '\'
      or key in ('request_category','request_mode','requested_project','unit_config_snapshot','fund_without_project',
        'keu10_purpose_code','linked_document_type','is_aset')) and input->key is distinct from doc.form_input_data->key then
      raise exception 'Identitas pengajuan dan data pemeriksaan tidak dapat diganti.' using errcode='42501';end if;
  end loop;
  is_financial:=doc.form_input_data ? 'fund_amount';
  if doc.form_input_data ? 'items' or input ? 'items' then
    if jsonb_typeof(input->'items') is distinct from 'array' or jsonb_array_length(input->'items') not between 1 and 500 then
      raise exception 'Usulan wajib memiliki 1 sampai 500 item.' using errcode='22023';end if;
    for item in select value from jsonb_array_elements(input->'items') loop
      if jsonb_typeof(item) is distinct from 'object' then raise exception 'Rincian item tidak valid.' using errcode='22023';end if;
      if item ? 'jumlah' then
        if coalesce(item->>'jumlah','')!~'^[0-9]+(\.[0-9]{1,6})?$' then raise exception 'Jumlah item tidak valid.' using errcode='22023';end if;
        quantity:=(item->>'jumlah')::numeric;
        if quantity<=0 or quantity>9007199254740991 then raise exception 'Jumlah item tidak valid.' using errcode='22023';end if;
      elsif is_financial then raise exception 'Jumlah item wajib diisi.' using errcode='22023';end if;
      if item ? 'nama_barang' and nullif(btrim(item->>'nama_barang'),'') is null then
        raise exception 'Nama item wajib diisi.' using errcode='22023';end if;
      if is_financial and not public.is_keu10_surat(p_surat) then
        if coalesce(nullif(item->>'nominal',''),nullif(item->>'estimasi_harga_satuan',''),'')!~'^[0-9]+$' then
          raise exception 'Nominal item wajib berupa Rupiah non-negatif.' using errcode='22023';end if;
        if nullif(item->>'nominal','') is not null then amount:=(item->>'nominal')::numeric;
        elsif nullif(item->>'estimasi_harga_satuan','') is not null then
          price:=(item->>'estimasi_harga_satuan')::numeric;amount:=round(quantity*price);
          item:=item||jsonb_build_object('total',amount);
        end if;
        total:=total+amount;
        if total>9007199254740991 then raise exception 'Total pengajuan melebihi batas angka aman.' using errcode='22023';end if;
      end if;
      items:=items||jsonb_build_array(item);
    end loop;
    input:=input||jsonb_build_object('items',items);
  end if;
  if input->>'request_category'='unit' and (coalesce(input->>'requested_unit_count','')!~'^[1-9][0-9]*$'
    or (input->>'requested_unit_count')::numeric>2147483647) then
    raise exception 'Jumlah unit wajib berupa bilangan bulat positif.' using errcode='22023';end if;
  if public.is_keu10_surat(p_surat) then input:=public.normalize_keu10_input(input,doc.policy_snapshot->'keu10_config');
  elsif is_financial then
    if input ? 'fund_type' and coalesce(input->>'fund_type','') not in ('operational','production_cost','marketing_cost') then
      raise exception 'Jenis dana tidak valid.' using errcode='22023';end if;
    if input ? 'free_cash_sisa_bulan_lalu' then
      if coalesce(input->>'free_cash_sisa_bulan_lalu','')!~'^[0-9]+$' then raise exception 'Free Cash tidak valid.' using errcode='22023';end if;
      input:=input||jsonb_build_object('fund_amount',greatest(0,total-(input->>'free_cash_sisa_bulan_lalu')::numeric));
    else input:=input||jsonb_build_object('fund_amount',total);end if;
    if input ? 'keu1_grand_total' then input:=input||jsonb_build_object('keu1_grand_total',total);end if;
  end if;
  original_form:=jsonb_build_object('judul_surat',doc.judul_surat,'request_place',doc.request_place,
    'request_date',doc.request_date,'form_input_data',doc.form_input_data);
  proposed_form:=original_form||p_form||jsonb_build_object('form_input_data',input,
    'judul_surat',coalesce(nullif(btrim(p_form->>'judul_surat'),''),doc.judul_surat),
    'request_place',coalesce(nullif(btrim(p_form->>'request_place'),''),doc.request_place),
    'request_date',coalesce(nullif(p_form->>'request_date','')::date,doc.request_date));
  if proposed_form=original_form then raise exception 'Belum ada perubahan pada usulan revisi.' using errcode='22023';end if;
  -- Reuse the existing requester-return authorization, snapshot and notification path.
  event_id:=public.request_surat_process_revision(p_surat,p_signature,'requester',null,p_reason,
    '{"requester_edit_required":true}'::jsonb);
  insert into requester_revision_internal.permits values(txid_current(),p_surat,'request') on conflict do nothing;
  if public.is_keu10_surat(p_surat) then
    insert into keu10_internal.mutation_permits values(txid_current(),p_surat,'request_revision') on conflict do nothing;end if;
  update public.surat_revision_events set changes=changes||jsonb_build_object(
    'requester_edit_required',false,'signer_revision_required',true,'signer_full_proposal',true,
    'signer_proposed_by',auth.uid(),'signer_proposed_at',clock_timestamp(),'signer_proposed_form',proposed_form,
    'signer_proposal_before',jsonb_build_object('document',original_form),
    'signer_proposal_after',jsonb_build_object('document',proposed_form))
    ||case when public.is_keu10_surat(p_surat) then jsonb_build_object('keu10_finance_proposal',true,'keu10_proposed_input',jsonb_build_object('items',input->'items')) else '{}'::jsonb end
    where id=event_id;
  update public.surat_registrasi set data_snapshot=jsonb_set(data_snapshot,'{revision,changes}',
    (select changes-'requester_revision_base' from public.surat_revision_events where id=event_id),true) where id=p_surat;
  delete from requester_revision_internal.permits where transaction_id=txid_current() and surat_id=p_surat;
  delete from keu10_internal.mutation_permits where transaction_id=txid_current() and surat_id=p_surat;
  return event_id;
end $$;

create or replace function requester_revision_internal.accept_full_form(p_event uuid,p_note text,p_final uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare event public.surat_revision_events; doc public.surat_registrasi; draft public.surat_registration_drafts;
  form jsonb; signature jsonb;
begin
  select * into event from public.surat_revision_events where id=p_event;
  if event.id is null then raise exception 'Revisi tidak ditemukan.' using errcode='40001';end if;
  if not pg_try_advisory_xact_lock(hashtextextended('keu10:'||event.surat_id::text,0)) then
    raise exception 'Pengajuan sedang diproses. Silakan coba lagi.' using errcode='55P03';end if;
  select * into doc from public.surat_registrasi where id=event.surat_id for update nowait;
  select * into event from public.surat_revision_events where id=p_event for update nowait;
  if doc.id is null or doc.created_by is distinct from auth.uid() or not exists(select 1 from public.profiles
    where id=auth.uid() and is_active is true and deleted_at is null) then
    raise exception 'Hanya pemohon aktif yang dapat mengonfirmasi usulan.' using errcode='42501';end if;
  if event.status not in ('open','awaiting_requester') or event.target_type<>'requester'
    or event.changes->>'signer_full_proposal' is distinct from 'true' or doc.status<>'MENUNGGU_PERBAIKAN'
    or doc.data_snapshot#>>'{revision,event_id}' is distinct from event.id::text
    or jsonb_typeof(event.changes->'signer_proposed_form') is distinct from 'object' then
    raise exception 'Usulan revisi tidak lagi aktif.' using errcode='40001';end if;
  form:=event.changes->'signer_proposed_form';
  insert into requester_revision_internal.permits values(txid_current(),doc.id,'request') on conflict do nothing;
  if public.is_keu10_surat(doc.id) then
    insert into keu10_internal.mutation_permits values(txid_current(),doc.id,'accept_revision') on conflict do nothing;end if;
  update public.surat_revision_events set status='open',changes=(changes-'keu10_finance_proposal')
    ||jsonb_build_object('requester_edit_required',true) where id=event.id;
  draft:=public.create_external_submission_revision_draft(event.id);
  -- All fixed identities and existing requester files come from the canonical draft.
  form:=(draft.payload->'formData')||form;
  if p_final is not null then
    select jsonb_agg(case when value->>'role_name'='menyetujui' then value||jsonb_build_object('user_id',p_final) else value end order by ordinal)
      into signature from jsonb_array_elements(draft.signer_assignments) with ordinality rows(value,ordinal);
    update public.surat_registration_drafts set signer_assignments=signature where id=draft.id;
  end if;
  update public.surat_registration_drafts set payload=jsonb_set(payload,'{formData}',form,true) where id=draft.id;
  -- The canonical submission owns its own KEU10 permit lifecycle.
  delete from keu10_internal.mutation_permits where transaction_id=txid_current() and surat_id=doc.id;
  perform public.submit_external_submission_revision(event.id,draft.id,form,p_note);
  -- Keep display metadata correct after canonical completion, including Unit reallocation.
  insert into requester_revision_internal.permits values(txid_current(),doc.id,'request') on conflict do nothing;
  if public.is_keu10_surat(doc.id) then
    insert into keu10_internal.mutation_permits values(txid_current(),doc.id,'accept_revision') on conflict do nothing;end if;
  update public.surat_revision_events set changes=changes||jsonb_build_object('requester_edit_required',false) where id=event.id;
  update public.surat_registrasi set data_snapshot=jsonb_set(data_snapshot,
    case when data_snapshot#>>'{revision,event_id}'=event.id::text then '{revision,changes}'::text[] else '{applied_revision,changes}'::text[] end,
    (select changes-'requester_revision_base' from public.surat_revision_events where id=event.id),true) where id=doc.id;
  delete from requester_revision_internal.permits where transaction_id=txid_current() and surat_id=doc.id;
  delete from keu10_internal.mutation_permits where transaction_id=txid_current() and surat_id=doc.id;
  return true;
end $$;

revoke all on function requester_revision_internal.propose_full_form(uuid,uuid,text,jsonb),
  requester_revision_internal.accept_full_form(uuid,text,uuid),requester_revision_internal.reapproval_decision(uuid)
  from public,anon,authenticated,service_role;
grant execute on function requester_revision_internal.propose_full_form(uuid,uuid,text,jsonb),
  requester_revision_internal.accept_full_form(uuid,text,uuid),requester_revision_internal.reapproval_decision(uuid) to postgres;

-- Patch existing public contracts without changing their OID, owner or ACL.
do $patch$
declare identity regprocedure; body text; patched text; source text; anchor text;
begin
  identity:='public.request_surat_process_revision(uuid,uuid,text,integer,text,jsonb)'::regprocedure;
  select prosrc into body from pg_proc where oid=identity;
  if position('SIGAP full signer proposal v1' in body)=0 then
    anchor:=E'begin\n  if v_changes->>''requester_edit_required''';
    if position(anchor in body)=0 then raise exception 'Unknown requester-return implementation';end if;
    patched:=replace(body,anchor,E'begin\n  -- SIGAP full signer proposal v1\n'
      ||E'  if v_changes ? ''signer_proposed_form'' then\n'
      ||E'    if p_target_type is distinct from ''requester'' then raise exception ''Usulan lengkap harus ditujukan ke pemohon.'' using errcode=''22023'';end if;\n'
      ||E'    return requester_revision_internal.propose_full_form(p_surat_id,p_sig_id,p_reason,v_changes->''signer_proposed_form'');\n  end if;\n'
      ||E'  v_changes:=v_changes-array[''signer_full_proposal'',''signer_proposal_before'',''signer_proposal_after'',''signer_proposed_by'',''signer_proposed_at''];\n'
      ||E'  if v_changes->>''requester_edit_required''');
    execute replace(pg_get_functiondef(identity),body,patched);
  end if;
  foreach identity in array array['public.accept_surat_process_revision(uuid,text)'::regprocedure,
    'public.accept_keu10_requester_revision(uuid,jsonb,text,uuid)'::regprocedure] loop
    select prosrc into body from pg_proc where oid=identity;
    if position('SIGAP full signer confirmation v1' in body)>0 then continue;end if;
    anchor:='if not (v_event.changes ? ''requester_revision_base'') then';
    if position(anchor in body)=0 then raise exception 'Unknown revision confirmation implementation: %',identity;end if;
    source:=case when identity='public.accept_keu10_requester_revision(uuid,jsonb,text,uuid)'::regprocedure then 'p_final_signer_id' else 'null' end;
    patched:=replace(body,anchor,E'-- SIGAP full signer confirmation v1\n'
      ||E'  if v_event.changes->>''signer_full_proposal''=''true'' then\n'
      ||'    return requester_revision_internal.accept_full_form(p_event_id,p_note,'||source||E');\n  end if;\n  '||anchor);
    execute replace(pg_get_functiondef(identity),body,patched);
  end loop;
end $patch$;

notify pgrst,'reload schema';
commit;
