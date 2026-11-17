begin;

create or replace function public.revise_and_complete_hrd_examination(
  p_surat_id uuid,p_sig_id uuid,p_reason text,p_form jsonb)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare doc public.surat_registrasi; sig public.surat_signatures;
  form jsonb; baseline jsonb; after_image jsonb; snapshot jsonb; input jsonb;
  event_id uuid:=gen_random_uuid(); actor_name text; source text; at timestamptz:=transaction_timestamp();
begin
  if auth.uid() is null then raise exception 'Tidak terautentikasi.' using errcode='42501'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('keu10:'||p_surat_id::text,0)) then
    raise exception 'Pengajuan sedang diproses. Silakan coba lagi.' using errcode='55P03'; end if;
  select * into doc from public.surat_registrasi where id=p_surat_id for update nowait;
  select * into sig from public.surat_signatures where id=p_sig_id and surat_id=p_surat_id for update nowait;
  if doc.id is null or sig.id is null or sig.input_schema_snapshot#>>'{hrd_ga_review,mode}' is distinct from 'claim'
    or sig.verification_required is not true then
    raise exception 'Revisi pemeriksa HRD & GA tidak tersedia.' using errcode='42501'; end if;
  -- The private claim, not its public display projection, grants editing authority.
  perform hrd_ga_review_internal.assert_owner(sig.id);
  if sig.available_at>clock_timestamp() or public.is_keu10_surat(doc.id)
    or exists(select 1 from public.surat_revision_events where surat_id=doc.id and status in ('open','awaiting_requester')) then
    raise exception 'Tahap belum siap untuk revisi langsung. Selesaikan prasyarat atau gunakan Minta Perbaikan.' using errcode='55000'; end if;
  form:=requester_revision_internal.normalize_signer_form(doc.id,sig.id,p_reason,p_form);
  input:=form->'form_input_data';
  if input->'requires_recommendation' is distinct from doc.form_input_data->'requires_recommendation'
    or (coalesce(doc.form_input_data->>'request_mode',doc.form_input_data->>'request_category')='unit'
      and input->'requested_unit_count' is distinct from doc.form_input_data->'requested_unit_count')
    or (input->'items' is distinct from doc.form_input_data->'items' and exists(
      select 1 from public.surat_recommendation_tasks where parent_surat_id=doc.id and status<>'cancelled')) then
    raise exception 'Perubahan memerlukan pemeriksaan ulang alokasi atau rekomendasi. Gunakan Minta Perbaikan.' using errcode='55000'; end if;
  baseline:=requester_revision_internal.snapshot(doc.id);
  select full_name into actor_name from public.profiles where id=auth.uid();
  source:='native://document/'||doc.id::text||'/revision/'||event_id::text||'/examination/'||sig.id::text;
  after_image:=jsonb_build_object('document',form);
  insert into requester_revision_internal.permits values(txid_current(),doc.id,'submit') on conflict do nothing;
  insert into public.surat_revision_events(id,surat_id,signature_id,actor_id,target_type,target_user_ids,
    from_step,target_step,reason,status,resolved_by,resolved_at,changes)
  values(event_id,doc.id,sig.id,auth.uid(),'checker',array[auth.uid()],sig.step_order,sig.step_order,btrim(p_reason),
    'resolved',auth.uid(),at,jsonb_build_object('examiner_direct_revision',true,'requester_confirmation_required',false,
      'signer_proposal_before',baseline,'signer_proposal_after',after_image));
  snapshot:=(coalesce(doc.data_snapshot,'{}')-'revision')||jsonb_build_object('input',input,'applied_revision',
    jsonb_build_object('event_id',event_id,'reason',btrim(p_reason),'actor_id',auth.uid(),'actor_name',actor_name,'submitted_at',at,
      'changes',jsonb_build_object('examiner_direct_revision',true,'requester_confirmation_required',false,
        'signer_proposal_before',jsonb_build_object('document',jsonb_build_object('judul_surat',doc.judul_surat,
          'request_place',doc.request_place,'request_date',doc.request_date,'form_input_data',doc.form_input_data)),
        'signer_proposal_after',after_image)));
  -- Freeze readable evidence for future immutable PDF jobs without recursive snapshots.
  snapshot:=snapshot||jsonb_build_object('revision_history',coalesce((
    select jsonb_agg(jsonb_build_object('revision_event_id',h.revision_event_id,'reason',h.reason,
      'requester_note',h.requester_note,'submitted_at',h.submitted_at,'submitted_by_name',author.full_name,
      'requested_by_name',requester.full_name,'revision_mode',case
        when e.changes->>'examiner_direct_revision'='true' then 'examiner_direct'
        when e.changes->>'signer_direct_approval'='true' then 'signer_direct'
        when e.changes->>'signer_revision_required'='true' or e.changes->>'signer_full_proposal'='true' then 'signer_proposal'
        when e.changes->>'requester_edit_required'='true' then 'requester_edit' end,
      'before_snapshot',jsonb_build_object('document',(h.before_snapshot->'document')-array['data_snapshot','policy_snapshot','location_snapshot','requester_snapshot']),
      'after_snapshot',jsonb_build_object('document',(h.after_snapshot->'document')-array['data_snapshot','policy_snapshot','location_snapshot','requester_snapshot'])) order by h.submitted_at,h.id)
    from public.surat_requester_revision_history h join public.surat_revision_events e on e.id=h.revision_event_id and e.surat_id=h.surat_id
      left join public.profiles author on author.id=h.submitted_by left join public.profiles requester on requester.id=h.requested_by
    where h.surat_id=doc.id),'[]'::jsonb)||jsonb_build_array(jsonb_build_object('revision_event_id',event_id,
      'reason',btrim(p_reason),'submitted_at',at,'submitted_by_name',actor_name,'revision_mode','examiner_direct',
      'before_snapshot',snapshot#>'{applied_revision,changes,signer_proposal_before}','after_snapshot',after_image)));
  update public.surat_registrasi set judul_surat=form->>'judul_surat',request_place=form->>'request_place',
    request_date=(form->>'request_date')::date,form_input_data=input,data_snapshot=snapshot,file_path=source,pdf_path=null,
    updated_at=clock_timestamp() where id=doc.id;
  -- Complete only examination. The manager signature and current_step stay intact.
  if public.verify_surat_signature_v2(sig.id,btrim(p_reason),'{}'::jsonb) is distinct from true then
    raise exception 'Pemeriksaan gagal diselesaikan.'; end if;
  insert into public.surat_requester_revision_history(surat_id,revision_event_id,requested_by,submitted_by,
    requested_at,submitted_at,reason,requester_note,resume_step,before_snapshot,after_snapshot)
  values(doc.id,event_id,auth.uid(),auth.uid(),at,at,btrim(p_reason),null,sig.step_order,baseline,
    requester_revision_internal.snapshot(doc.id));
  insert into public.notifications(user_id,type,title,message,data,link) values(doc.created_by,'info',
    'Pengajuan direvisi oleh pemeriksa','Tim pemeriksa memperbarui pengajuan '||doc.no_surat||'. Lihat rincian perubahan pada riwayat. Tidak perlu konfirmasi.',
    jsonb_build_object('surat_id',doc.id,'revision_event_id',event_id,'event_type','examiner_revision_completed'),
    '/status-pengajuan?document='||doc.id::text);
  insert into public.notifications(user_id,type,title,message,data,link) values(sig.user_id,'info',
    'Pemeriksaan selesai, menunggu persetujuan','Pengajuan '||doc.no_surat||' sudah direvisi oleh pemeriksa dan siap ditinjau.',
    jsonb_build_object('surat_id',doc.id,'signature_id',sig.id,'event_type','next_inbox'),
    '/surat/inbox?task=approval%3A'||sig.id::text);
  delete from requester_revision_internal.permits where transaction_id=txid_current() and surat_id=doc.id;
  return jsonb_build_object('success',true,'revision_event_id',event_id,'signature_id',sig.id);
end $$;
revoke all on function public.revise_and_complete_hrd_examination(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.revise_and_complete_hrd_examination(uuid,uuid,text,jsonb) to authenticated;

-- A later signer edit must retain earlier examiner attribution in immutable jobs.
do $patch$
declare definition text; anchor text:='case when e.changes->>''signer_direct_approval''=''true'' then ''signer_direct''';
begin
  definition:=pg_get_functiondef('public.revise_and_approve_surat(uuid,uuid,text,jsonb,uuid)'::regprocedure);
  if position('then ''examiner_direct''' in definition)>0 then return; end if;
  if position(anchor in definition)=0 then raise exception 'Unknown revision history snapshot shape'; end if;
  execute replace(definition,anchor,'case when e.changes->>''examiner_direct_revision''=''true'' then ''examiner_direct'' when e.changes->>''signer_direct_approval''=''true'' then ''signer_direct''');
end $patch$;
notify pgrst,'reload schema';
commit;
