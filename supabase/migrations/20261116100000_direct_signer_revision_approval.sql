begin;

-- Share the installed, already-hardened form validation with the legacy proposal
-- route. Unknown function shapes stop the migration rather than weaken validation.
do $patch$
declare body text; declaration text; validation text; tail text; marker integer; start_at integer;
begin
  select prosrc into body from pg_proc where oid='requester_revision_internal.propose_full_form(uuid,uuid,text,jsonb)'::regprocedure;
  if position('normalize_signer_form' in body)>0 then return; end if;
  marker:=position('  -- Reuse the existing requester-return authorization' in body);
  start_at:=position(E'\nbegin\n' in body);
  if marker=0 or start_at=0 or position('proposed_form=original_form' in body)=0 then
    raise exception 'Unknown signer revision validator; audit before applying'; end if;
  declaration:=left(body,start_at-1);
  validation:=left(body,marker-1)||E'  return proposed_form;\nend';
  execute 'create function requester_revision_internal.normalize_signer_form(p_surat uuid,p_signature uuid,p_reason text,p_form jsonb) returns jsonb language plpgsql security definer set search_path='''''||' as '||quote_literal(validation);
  tail:=substring(body from marker);
  execute 'create or replace function requester_revision_internal.propose_full_form(p_surat uuid,p_signature uuid,p_reason text,p_form jsonb) returns uuid language plpgsql security definer set search_path='''''||' as '||quote_literal(
    declaration||E'\nbegin\n  proposed_form:=requester_revision_internal.normalize_signer_form(p_surat,p_signature,p_reason,p_form);\n  select * into strict doc from public.surat_registrasi where id=p_surat;\n  original_form:=jsonb_build_object(''judul_surat'',doc.judul_surat,''request_place'',doc.request_place,''request_date'',doc.request_date,''form_input_data'',doc.form_input_data);\n  input:=proposed_form->''form_input_data'';\n'||tail);
end $patch$;
revoke all on function requester_revision_internal.normalize_signer_form(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function requester_revision_internal.normalize_signer_form(uuid,uuid,text,jsonb) to postgres;

create or replace function public.revise_and_approve_surat(
  p_surat_id uuid,p_sig_id uuid,p_reason text,p_form jsonb,p_final_signer_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare doc public.surat_registrasi; sig public.surat_signatures; final_sig public.surat_signatures;
  form jsonb; baseline jsonb; event_id uuid:=gen_random_uuid(); result jsonb; input jsonb;
  candidates uuid[]; director uuid; requirement jsonb; source text; snapshot jsonb;
begin
  form:=requester_revision_internal.normalize_signer_form(p_surat_id,p_sig_id,p_reason,p_form);
  select * into strict doc from public.surat_registrasi where id=p_surat_id;
  select * into strict sig from public.surat_signatures where id=p_sig_id and surat_id=doc.id;
  if sig.available_at>clock_timestamp() then
    raise exception 'Tahap ini belum memasuki periode penerimaan.' using errcode='55000'; end if;
  if sig.verification_required and sig.verification_status is distinct from 'verified' then
    raise exception 'Selesaikan pemeriksaan sebelum merevisi dan menyetujui.' using errcode='55000'; end if;
  if exists(select 1 from public.surat_revision_events where surat_id=doc.id and status in ('open','awaiting_requester')) then
    raise exception 'Masih ada perbaikan yang harus diselesaikan.' using errcode='55000'; end if;
  input:=form->'form_input_data';
  -- The shortcut never approves new examination prerequisites or changes a Unit
  -- request behind an immutable allocation receipt. Use the existing return route.
  if input->'requires_recommendation' is distinct from doc.form_input_data->'requires_recommendation'
    or (coalesce(doc.form_input_data->>'request_mode',doc.form_input_data->>'request_category')='unit'
      and input->'requested_unit_count' is distinct from doc.form_input_data->'requested_unit_count')
    or (input->'items' is distinct from doc.form_input_data->'items' and exists(
      select 1 from public.surat_recommendation_tasks where parent_surat_id=doc.id and status<>'cancelled')) then
    raise exception 'Perubahan ini memerlukan pemeriksaan ulang. Gunakan Minta Perbaikan agar pemeriksaan alokasi atau rekomendasi diperbarui.' using errcode='55000'; end if;
  for requirement in select value from jsonb_array_elements(coalesce(sig.attachment_requirements_snapshot,'[]')) loop
    if coalesce((requirement->>'is_required')::boolean,false) and
      (select count(*) from public.surat_attachments a where a.surat_id=doc.id and a.signature_id=sig.id
        and a.requirement_key=coalesce(requirement->>'requirement_key',requirement->>'key')
        and a.file_url is not null)<greatest(1,coalesce((requirement->>'min_files')::integer,1)) then
      raise exception 'Lampiran persetujuan wajib belum tersimpan.' using errcode='55000'; end if;
  end loop;
  baseline:=requester_revision_internal.snapshot(doc.id);
  source:='native://document/'||doc.id::text||'/revision/'||event_id::text||'/approval/'||sig.id::text;
  insert into requester_revision_internal.permits values(txid_current(),doc.id,'submit') on conflict do nothing;
  if public.is_keu10_surat(doc.id) then
    insert into keu10_internal.mutation_permits values(txid_current(),doc.id,'accept_revision') on conflict do nothing;
  end if;
  insert into public.surat_revision_events(id,surat_id,signature_id,actor_id,target_type,target_user_ids,
    from_step,target_step,reason,status,resolved_by,resolved_at,changes)
  values(event_id,doc.id,sig.id,auth.uid(),'signer',array[doc.created_by],sig.step_order,sig.step_order,btrim(p_reason),
    'resolved',auth.uid(),clock_timestamp(),jsonb_build_object('signer_direct_approval',true,
      'signer_proposed_by',auth.uid(),'requester_confirmation_required',false,
      'signer_proposal_before',baseline,'signer_proposal_after',jsonb_build_object('document',form)));
  snapshot:=(coalesce(doc.data_snapshot,'{}')-'revision')||jsonb_build_object('input',input,'applied_revision',
    jsonb_build_object('event_id',event_id,'reason',btrim(p_reason),'actor_id',auth.uid(),
      'actor_name',(select full_name from public.profiles where id=auth.uid()),
      'submitted_at',transaction_timestamp(),
      'changes',jsonb_build_object('signer_direct_approval',true,'requester_confirmation_required',false,
        'signer_proposal_before',jsonb_build_object('document',jsonb_build_object('judul_surat',doc.judul_surat,
          'request_place',doc.request_place,'request_date',doc.request_date,'form_input_data',doc.form_input_data)),
        'signer_proposal_after',jsonb_build_object('document',form))));
  -- Freeze the complete readable audit into the new PDF version before enqueue.
  -- Older immutable KEU10 jobs must not depend on the live document's latest edit.
  snapshot:=snapshot||jsonb_build_object('revision_history',coalesce((
    select jsonb_agg(jsonb_build_object('revision_event_id',h.revision_event_id,
      'reason',h.reason,'requester_note',h.requester_note,'submitted_at',h.submitted_at,
      'submitted_by_name',author.full_name,'requested_by_name',requester.full_name,
      'revision_mode',case when e.changes->>'signer_direct_approval'='true' then 'signer_direct'
        when e.changes->>'signer_revision_required'='true' then 'signer_proposal' else 'requester_edit' end,
      'before_snapshot',jsonb_build_object('document',(h.before_snapshot->'document')-array['data_snapshot','policy_snapshot','location_snapshot','requester_snapshot']),
      'after_snapshot',jsonb_build_object('document',(h.after_snapshot->'document')-array['data_snapshot','policy_snapshot','location_snapshot','requester_snapshot'])) order by h.submitted_at,h.id)
    from public.surat_requester_revision_history h
      join public.surat_revision_events e on e.id=h.revision_event_id and e.surat_id=h.surat_id
      left join public.profiles author on author.id=h.submitted_by
      left join public.profiles requester on requester.id=h.requested_by
    where h.surat_id=doc.id),'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
      'revision_event_id',event_id,'reason',btrim(p_reason),'submitted_at',transaction_timestamp(),
      'submitted_by_name',snapshot#>>'{applied_revision,actor_name}','revision_mode','signer_direct',
      'before_snapshot',snapshot#>'{applied_revision,changes,signer_proposal_before}',
      'after_snapshot',snapshot#>'{applied_revision,changes,signer_proposal_after}')));
  if public.is_keu10_surat(doc.id) then
    snapshot:=snapshot||jsonb_build_object('keu10_generation',coalesce((doc.data_snapshot->>'keu10_generation')::integer,1)+1);
  end if;
  update public.surat_registrasi set judul_surat=form->>'judul_surat',request_place=form->>'request_place',
    request_date=(form->>'request_date')::date,form_input_data=input,data_snapshot=snapshot,file_path=source,pdf_path=null,
    updated_at=clock_timestamp() where id=doc.id;
  if public.is_keu10_surat(doc.id) then
    select * into strict final_sig from public.surat_signatures where surat_id=doc.id order by step_order desc limit 1 for update nowait;
    select array_agg(profile.id order by profile.id) into candidates from public.profiles profile
      join public.master_offices office on office.id=profile.office_id
      where profile.is_active and profile.deleted_at is null and lower(btrim(office.kedudukan))='pusat'
      and exists(select 1 from jsonb_array_elements(doc.policy_snapshot->'keu10_steps') step
        where step->>'id'=final_sig.form_usage_step_id::text and step->'candidate_user_ids' @> jsonb_build_array(profile.id::text)
          and (nullif(step->>'signer_department_id','') is null or profile.department_id=(step->>'signer_department_id')::uuid))
      and public.keu10_director_code(profile.job_title,to_jsonb(profile)->>'job_title_display')=
        case when doc.policy_snapshot#>>'{keu10_config,disposition}'='tactical_land' and (input->>'fund_amount')::numeric<=2000000 then 'DI' else 'DU' end;
    if p_final_signer_id is not null and coalesce(p_final_signer_id=any(candidates),false)
      and (final_sig.step_order>sig.step_order or p_final_signer_id=final_sig.user_id) then director:=p_final_signer_id;
    elsif p_final_signer_id is not null then raise exception 'Penyetuju revisi tidak memenuhi syarat.' using errcode='42501';
    elsif coalesce(final_sig.user_id=any(candidates),false) then director:=final_sig.user_id;
    elsif cardinality(candidates)=1 and final_sig.step_order>sig.step_order and not final_sig.is_signed then director:=candidates[1];
    else raise exception 'Penyetuju akhir tidak sesuai nominal revisi. Gunakan alur perbaikan untuk menentukan penyetuju yang memenuhi syarat.' using errcode='42501'; end if;
    perform public.assert_keu10_signer(doc.id,final_sig.form_usage_step_id,director);
    if director is distinct from final_sig.user_id then
      update public.surat_signatures set user_id=director,
        label_jabatan=case public.keu10_director_code((select job_title from public.profiles where id=director)) when 'DI' then 'Direktur I' else 'Direktur Utama' end,
        signer_snapshot=(select jsonb_build_object('id',id,'full_name',full_name,'job_title',coalesce(nullif(to_jsonb(p)->>'job_title_display',''),job_title),'nik',nik) from public.profiles p where id=director)
        where id=final_sig.id;
    end if;
  end if;
  -- This is the canonical approval, not a direct signature/status update. Its
  -- verification, recommendation, amount and completion guards remain active.
  delete from keu10_internal.mutation_permits where transaction_id=txid_current() and surat_id=doc.id;
  result:=public.handle_approve_surat_v2(sig.id,doc.id,btrim(p_reason),source)::jsonb;
  if result->>'success' is distinct from 'true' then raise exception 'Persetujuan revisi gagal.'; end if;
  insert into public.surat_requester_revision_history(surat_id,revision_event_id,requested_by,submitted_by,
    requested_at,submitted_at,reason,requester_note,resume_step,before_snapshot,after_snapshot)
  values(doc.id,event_id,auth.uid(),auth.uid(),transaction_timestamp(),transaction_timestamp(),btrim(p_reason),null,
    sig.step_order,baseline,requester_revision_internal.snapshot(doc.id));
  insert into public.notifications(user_id,type,title,message,data,link) values(doc.created_by,'info',
    'Pengajuan direvisi dan disetujui',
    'Penandatangan memperbarui pengajuan '||doc.no_surat||'. Lihat rincian perubahan pada riwayat. Tidak perlu konfirmasi.',
    jsonb_build_object('surat_id',doc.id,'revision_event_id',event_id,'event_type','signer_revision_approved'),
    '/status-pengajuan?document='||doc.id::text);
  insert into public.notifications(user_id,type,title,message,data,link)
    select next.user_id,'info','Pengajuan menunggu persetujuan','Pengajuan '||doc.no_surat||' sudah direvisi dan siap ditindaklanjuti.',
      jsonb_build_object('surat_id',doc.id,'signature_id',next.id,'event_type','next_inbox'),
      '/surat/inbox?task=approval%3A'||next.id::text
    from public.surat_signatures next join public.surat_registrasi d on d.id=next.surat_id
    where d.id=doc.id and d.status='PROSES' and next.step_order=d.current_step and not next.is_signed;
  delete from requester_revision_internal.permits where transaction_id=txid_current() and surat_id=doc.id;
  delete from keu10_internal.mutation_permits where transaction_id=txid_current() and surat_id=doc.id;
  return result||jsonb_build_object('revision_event_id',event_id);
end $$;
revoke all on function public.revise_and_approve_surat(uuid,uuid,text,jsonb,uuid) from public,anon,service_role;
grant execute on function public.revise_and_approve_surat(uuid,uuid,text,jsonb,uuid) to authenticated;

create or replace function public.get_signer_revision_final_candidates(p_sig_id uuid)
returns table(id uuid,full_name text,job_title text,is_active boolean,department_id uuid,kedudukan text)
language plpgsql stable security definer set search_path='' as $$
declare doc public.surat_registrasi; sig public.surat_signatures; final_sig public.surat_signatures;
begin
 select * into sig from public.surat_signatures where surat_signatures.id=p_sig_id;
 select * into doc from public.surat_registrasi where surat_registrasi.id=sig.surat_id;
 if auth.uid() is null or sig.user_id is distinct from auth.uid() or sig.is_signed or doc.status<>'PROSES'
   or sig.step_order is distinct from doc.current_step or not public.is_keu10_surat(doc.id)
   or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.deleted_at is null) then
   raise exception 'Kandidat revisi tidak tersedia untuk akun ini.' using errcode='42501'; end if;
 select * into final_sig from public.surat_signatures where surat_id=doc.id order by step_order desc limit 1;
 return query select p.id,p.full_name::text,coalesce(nullif(to_jsonb(p)->>'job_title_display',''),p.job_title),p.is_active,p.department_id,o.kedudukan::text
   from public.profiles p join public.master_offices o on o.id=p.office_id
   where p.is_active and p.deleted_at is null and lower(btrim(o.kedudukan))='pusat'
   and exists(select 1 from jsonb_array_elements(doc.policy_snapshot->'keu10_steps') s
     where s->>'id'=final_sig.form_usage_step_id::text and s->'candidate_user_ids' @> jsonb_build_array(p.id::text)
       and (nullif(s->>'signer_department_id','') is null or p.department_id=(s->>'signer_department_id')::uuid))
   and (final_sig.step_order>sig.step_order or p.id=final_sig.user_id)
   and public.keu10_director_code(p.job_title,to_jsonb(p)->>'job_title_display') is not null;
end $$;
revoke all on function public.get_signer_revision_final_candidates(uuid) from public,anon,service_role;
grant execute on function public.get_signer_revision_final_candidates(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
