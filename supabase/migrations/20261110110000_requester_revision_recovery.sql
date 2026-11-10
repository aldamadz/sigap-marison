begin;

-- Preserve the installed photo/attachment wrappers and the original function owner.
do $patch$
declare source text; body text; patched text;
  old_expiry text:=E'if v_draft.created_by is distinct from auth.uid() or v_draft.status<>''DRAFT''\n      or v_draft.expires_at is null or v_draft.expires_at<=clock_timestamp() then\n      raise exception ''Draft perbaikan tidak lagi aktif.'' using errcode=''40001''; end if;';
begin
  select prosrc into body from pg_proc where oid='public.create_external_submission_revision_draft(uuid)'::regprocedure;
  source:=pg_get_functiondef('public.create_external_submission_revision_draft(uuid)'::regprocedure);
  if position('SIGAP active revision draft recovery v1' in body)=0 then
    if position(old_expiry in body)=0
      or position('perform pg_advisory_xact_lock(hashtextextended(''keu10:''||v_event.surat_id::text,0));' in body)=0
      or (select count(*) from regexp_matches(body,'for update;','g'))<>3
      or position('exception when' in lower(body))>0 then
      raise exception 'Unknown requester draft implementation; audit before applying';
    end if;
    patched:=replace(body,old_expiry,E'-- SIGAP active revision draft recovery v1\n'
      ||E'    if v_draft.created_by is distinct from auth.uid() or v_draft.status not in (''DRAFT'',''EXPIRED'')\n'
      ||E'      or v_draft.expires_at is null or v_draft.submitted_at is not null or v_draft.voided_at is not null then\n'
      ||E'      raise exception ''Draft perbaikan tidak lagi aktif.'' using errcode=''40001''; end if;\n'
      ||E'    if v_draft.expires_at<=clock_timestamp() then\n'
      ||E'      insert into requester_revision_internal.permits values(txid_current(),v_surat.id,''active_draft_renewal'') on conflict do nothing;\n'
      ||E'      update public.surat_registration_drafts set status=''DRAFT'',expires_at=clock_timestamp()+interval ''7 days''\n'
      ||E'        where id=v_draft.id returning * into v_draft;\n'
      ||E'      delete from requester_revision_internal.permits where transaction_id=txid_current() and surat_id=v_surat.id and operation=''active_draft_renewal'';\n'
      ||E'    elsif v_draft.status<>''DRAFT'' then\n'
      ||E'      raise exception ''Draft perbaikan tidak lagi aktif.'' using errcode=''40001'';\n'
      ||E'    end if;');
    patched:=replace(patched,
      'perform pg_advisory_xact_lock(hashtextextended(''keu10:''||v_event.surat_id::text,0));',
      E'if not pg_try_advisory_xact_lock(hashtextextended(''keu10:''||v_event.surat_id::text,0)) then\n'
      ||E'    raise exception ''Pengajuan sedang diproses. Silakan coba lagi sebentar.'' using errcode=''55P03''; end if;');
    patched:=replace(patched,'for update;','for update nowait;');
    patched:=regexp_replace(patched,'end[[:space:]]*;?[[:space:]]*$',
      E'exception when lock_not_available or deadlock_detected then\n'
      ||E'  raise exception ''Pengajuan sedang diproses. Silakan coba lagi sebentar.'' using errcode=''55P03'';\nend','i');
    if position('exception when lock_not_available' in patched)=0 then raise exception 'Draft lock handler drift';end if;
    execute replace(source,body,patched);
  elsif position('pg_try_advisory_xact_lock' in body)=0 or position('for update nowait' in body)=0 then
    raise exception 'Installed draft recovery is incomplete';
  end if;
end $patch$;

-- Bounds any secondary/index lock in legacy delegates; restored on function exit.
alter function public.create_external_submission_revision_draft(uuid) set lock_timeout='3s';

create or replace function requester_revision_internal.material_input(p_input jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb)
  from jsonb_each(case when jsonb_typeof(p_input)='object' then p_input else '{}'::jsonb end)
  where key not in ('catatan','notes','allocated_at','allocated_by_signature_id')
    and left(key,13)<>'verification_' and left(key,8)<>'checker_'
$$;

create or replace function requester_revision_internal.reapproval_decision(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare event public.surat_revision_events; doc public.surat_registrasi;
  baseline jsonb; material boolean; step integer; field text;
begin
  select * into event from public.surat_revision_events where id=p_event_id;
  select * into doc from public.surat_registrasi where id=event.surat_id;
  baseline:=event.changes#>'{requester_revision_base,document}';
  if event.id is null or doc.id is null
    or jsonb_typeof(baseline->'form_input_data') is distinct from 'object'
    or jsonb_typeof(doc.form_input_data) is distinct from 'object'
    or coalesce(event.changes->>'resume_step','')!~'^[1-9][0-9]*$' then
    raise exception 'Bukti dan tahap revisi tidak lengkap.' using errcode='42501';
  end if;
  material:=requester_revision_internal.material_input(baseline->'form_input_data')
    is distinct from requester_revision_internal.material_input(doc.form_input_data);
  foreach field in array array['entity_id','office_id','project_id','dept_id','letter_type_id','form_usage_id','penggunaan_id'] loop
    material:=material or baseline->field is distinct from to_jsonb(doc)->field;
  end loop;
  step:=case when material then 1 else (event.changes->>'resume_step')::integer end;
  if not exists(select 1 from public.surat_signatures where surat_id=doc.id and step_order=step) then
    raise exception 'Tahap persetujuan ulang tidak tersedia.' using errcode='42501';
  end if;
  return jsonb_build_object('restart_step',step,'material_reapproval',material);
end $$;

revoke all on function requester_revision_internal.material_input(jsonb),
  requester_revision_internal.reapproval_decision(uuid) from public,anon,authenticated,service_role;
-- Canonical RPCs imported from Cloud may still be owned by non-superuser postgres.
grant usage on schema requester_revision_internal to postgres;
grant execute on function requester_revision_internal.material_input(jsonb),
  requester_revision_internal.reapproval_decision(uuid) to postgres;

do $patch$
declare source text; body text; patched text; identity regprocedure;
  anchor text:='v_base:=v_event.changes->''requester_revision_base'';';
  old_history text:='(v_event.changes->>''resume_step'')::integer,v_event.changes->''requester_revision_base'',';
begin
  identity:='requester_revision_internal.resume(uuid)'::regprocedure;
  select prosrc into body from pg_proc where oid=identity;
  if position('SIGAP material reapproval v1' in body)=0 then
    if position(anchor in body)=0 or position('v_base jsonb;' in body)=0
      or position('''restart_reason'',''Perbaikan kembali ke tahap yang meminta revisi.''' in body)=0 then
      raise exception 'Unknown requester resume implementation; audit before applying';
    end if;
    patched:=replace(body,'v_base jsonb;','v_base jsonb; v_decision jsonb;');
    patched:=replace(patched,anchor,anchor||E'\n  -- SIGAP material reapproval v1\n'
      ||E'  v_decision:=requester_revision_internal.reapproval_decision(p_event_id);\n'
      ||E'  v_step:=(v_decision->>''restart_step'')::integer;\n'
      ||E'  update public.surat_revision_events set changes=changes||v_decision||jsonb_build_object(''restart_reason'',\n'
      ||E'    case when (v_decision->>''material_reapproval'')::boolean\n'
      ||E'      then ''Data material berubah; persetujuan dimulai ulang dari tahap pertama.''\n'
      ||E'      else ''Perbaikan kembali ke tahap yang meminta revisi.'' end) where id=p_event_id;');
    patched:=replace(patched,'''restart_reason'',''Perbaikan kembali ke tahap yang meminta revisi.''',
      '''restart_reason'',(select changes->>''restart_reason'' from public.surat_revision_events where id=p_event_id)');
    execute replace(pg_get_functiondef(identity),body,patched);
  end if;
  foreach identity in array array[
    'public.accept_surat_process_revision(uuid,text)'::regprocedure,
    'public.accept_keu10_requester_revision(uuid,jsonb,text,uuid)'::regprocedure,
    'public.submit_external_submission_revision(uuid,uuid,jsonb,text)'::regprocedure] loop
    source:=pg_get_functiondef(identity);
    if position('requester_revision_internal.reapproval_decision' in source)=0 then
      if position(old_history in source)=0 then raise exception 'Unknown revision history writer: %',identity;end if;
      execute replace(source,old_history,
        '(requester_revision_internal.reapproval_decision(v_event.id)->>''restart_step'')::integer,v_event.changes->''requester_revision_base'',');
    end if;
  end loop;
end $patch$;

notify pgrst,'reload schema';
commit;
