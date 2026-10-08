-- Internal requester corrections keep the original number and resume the asking step.
-- The existing vendor RPC names remain compatible with existing clients.
begin;

create schema if not exists requester_revision_internal;
revoke all on schema requester_revision_internal from public, anon, authenticated, service_role;
create table if not exists requester_revision_internal.permits (
  transaction_id bigint not null, surat_id uuid not null, operation text not null,
  primary key(transaction_id, surat_id, operation)
);
revoke all on requester_revision_internal.permits from public, anon, authenticated, service_role;

create table if not exists public.surat_requester_revision_history (
  id uuid primary key default gen_random_uuid(),
  surat_id uuid not null references public.surat_registrasi(id) on delete restrict,
  revision_event_id uuid not null unique references public.surat_revision_events(id) on delete restrict,
  requested_by uuid not null, submitted_by uuid not null,
  requested_at timestamptz not null, submitted_at timestamptz not null default clock_timestamp(),
  reason text not null, requester_note text, resume_step integer not null check(resume_step >= 1),
  before_snapshot jsonb not null, after_snapshot jsonb not null
);
create index if not exists surat_requester_revision_history_document_idx
  on public.surat_requester_revision_history(surat_id, submitted_at desc);
alter table public.surat_requester_revision_history enable row level security;
revoke all on public.surat_requester_revision_history from public, anon, authenticated, service_role;
grant select on public.surat_requester_revision_history to authenticated, service_role;
drop policy if exists requester_revision_history_read on public.surat_requester_revision_history;
create policy requester_revision_history_read on public.surat_requester_revision_history
  for select to authenticated using(public.can_read_surat(surat_id));

create or replace function requester_revision_internal.snapshot(p_surat_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('document',to_jsonb(surat),
    'signatures',coalesce((select jsonb_agg(to_jsonb(signature) order by step_order,id)
      from public.surat_signatures signature where surat_id=surat.id),'[]'::jsonb),
    'attachments',coalesce((select jsonb_agg(to_jsonb(attachment) order by created_at,id)
      from public.surat_attachments attachment where surat_id=surat.id),'[]'::jsonb))
  from public.surat_registrasi surat where id=p_surat_id
$$;

create or replace function requester_revision_internal.guard_history()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op<>'INSERT' or not exists(select 1 from requester_revision_internal.permits
    where transaction_id=txid_current() and surat_id=new.surat_id and operation='submit') then
    raise exception 'Riwayat perbaikan hanya dapat ditulis melalui pengiriman draft.' using errcode='42501';
  end if;
  return new;
end $$;
drop trigger if exists requester_revision_history_immutable on public.surat_requester_revision_history;
create trigger requester_revision_history_immutable before insert or update or delete
  on public.surat_requester_revision_history for each row execute function requester_revision_internal.guard_history();

-- Protect the server baseline and prevent the old "accept" RPC from skipping the draft.
create or replace function requester_revision_internal.guard_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_marked boolean;
begin
  v_marked := new.changes->>'requester_edit_required'='true' or new.changes->>'signer_revision_required'='true';
  if tg_op='INSERT' and coalesce(v_marked,false) and not exists(
    select 1 from requester_revision_internal.permits where transaction_id=txid_current()
      and surat_id=new.surat_id and operation='request') then
    raise exception 'Perbaikan wajib diminta melalui alur pengajuan.' using errcode='42501';
  end if;
  if tg_op='UPDATE' and (old.changes ? 'requester_revision_base' or coalesce(v_marked,false)) then
    if (new.actor_id is distinct from old.actor_id or new.surat_id is distinct from old.surat_id
      or new.signature_id is distinct from old.signature_id or new.target_type is distinct from old.target_type
      or new.target_user_ids is distinct from old.target_user_ids or new.reason is distinct from old.reason
      or new.from_step is distinct from old.from_step or new.target_step is distinct from old.target_step)
      and not exists(select 1 from requester_revision_internal.permits where transaction_id=txid_current()
        and surat_id=new.surat_id and operation in ('request','submit')) then
      raise exception 'Pelaku dan tujuan revisi tidak dapat diubah.' using errcode='42501'; end if;
    if (new.changes->'requester_revision_base' is distinct from old.changes->'requester_revision_base'
        or new.changes->'resume_step' is distinct from old.changes->'resume_step'
        or new.changes->'requester_edit_required' is distinct from old.changes->'requester_edit_required'
        or new.changes->'signer_revision_required' is distinct from old.changes->'signer_revision_required')
      and not exists(select 1 from requester_revision_internal.permits where transaction_id=txid_current()
        and surat_id=new.surat_id and operation='request') then
      raise exception 'Identitas revisi dan data awal tidak dapat diubah.' using errcode='42501';
    end if;
    if old.status in ('open','awaiting_requester') and new.status='resolved' and not exists(
      select 1 from requester_revision_internal.permits where transaction_id=txid_current()
        and surat_id=new.surat_id and operation='submit') then
      raise exception 'Selesaikan perbaikan melalui Tindak Lanjut.' using errcode='42501';
    end if;
    if new.changes is distinct from old.changes and not exists(select 1 from requester_revision_internal.permits
      where transaction_id=txid_current() and surat_id=new.surat_id) then
      raise exception 'Lewati alur revisi yang sesuai untuk mengubah catatan.' using errcode='42501'; end if;
  end if;
  return new;
end $$;

create or replace function requester_revision_internal.guard_document()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status='MENUNGGU_PERBAIKAN' and exists(select 1 from public.surat_revision_events event
    where event.surat_id=old.id and event.id::text=old.data_snapshot#>>'{revision,event_id}'
      and event.changes ? 'requester_revision_base') and not exists(select 1 from requester_revision_internal.permits
        where transaction_id=txid_current() and surat_id=old.id) and (
    new.form_input_data is distinct from old.form_input_data or new.status is distinct from old.status
    or new.current_step is distinct from old.current_step or new.no_surat is distinct from old.no_surat
    or new.entity_id is distinct from old.entity_id or new.office_id is distinct from old.office_id
    or new.project_id is distinct from old.project_id or new.dept_id is distinct from old.dept_id
    or new.form_usage_id is distinct from old.form_usage_id or new.penggunaan_id is distinct from old.penggunaan_id
    or new.letter_type_id is distinct from old.letter_type_id or new.created_by is distinct from old.created_by
    or new.judul_surat is distinct from old.judul_surat or new.file_path is distinct from old.file_path
    or new.data_snapshot->'revision' is distinct from old.data_snapshot->'revision') then
    raise exception 'Perbaikan pengajuan wajib melalui draft atau konfirmasi Tindak Lanjut.' using errcode='42501'; end if;
  return new;
end $$;
drop trigger if exists requester_revision_document_guard on public.surat_registrasi;
create trigger requester_revision_document_guard before update on public.surat_registrasi
  for each row execute function requester_revision_internal.guard_document();
drop trigger if exists requester_revision_event_guard on public.surat_revision_events;
create trigger requester_revision_event_guard before insert or update on public.surat_revision_events
  for each row execute function requester_revision_internal.guard_event();

do $$ begin
  if to_regprocedure('public.request_surat_process_revision_pre_requester_edit(uuid,uuid,text,integer,text,jsonb)') is null then
    alter function public.request_surat_process_revision(uuid,uuid,text,integer,text,jsonb)
      rename to request_surat_process_revision_pre_requester_edit;
  end if;
  if to_regprocedure('public.submit_external_submission_revision_pre_requester_edit(uuid,uuid,jsonb,text)') is null then
    alter function public.submit_external_submission_revision(uuid,uuid,jsonb,text)
      rename to submit_external_submission_revision_pre_requester_edit;
  end if;
  if to_regprocedure('public.create_external_submission_revision_draft_pre_requester_edit(uuid)') is null then
    alter function public.create_external_submission_revision_draft(uuid)
      rename to create_external_submission_revision_draft_pre_requester_edit;
  end if;
  if to_regprocedure('public.cancel_surat_after_revision_pre_requester_edit(uuid,text)') is null then
    alter function public.cancel_surat_after_revision(uuid,text) rename to cancel_surat_after_revision_pre_requester_edit;
  end if;
  if to_regprocedure('public.resolve_surat_process_revision_pre_requester_edit(uuid,text)') is null then
    alter function public.resolve_surat_process_revision(uuid,text) rename to resolve_surat_process_revision_pre_requester_edit;
  end if;
  if to_regprocedure('public.verify_surat_signature_v2_pre_requester_edit(uuid,text,jsonb)') is null then
    alter function public.verify_surat_signature_v2(uuid,text,jsonb) rename to verify_surat_signature_v2_pre_requester_edit;
  end if;
end $$;
revoke all on function public.request_surat_process_revision_pre_requester_edit(uuid,uuid,text,integer,text,jsonb),
  public.submit_external_submission_revision_pre_requester_edit(uuid,uuid,jsonb,text),
  public.create_external_submission_revision_draft_pre_requester_edit(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.cancel_surat_after_revision_pre_requester_edit(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.resolve_surat_process_revision_pre_requester_edit(uuid,text),
  public.verify_surat_signature_v2_pre_requester_edit(uuid,text,jsonb) from public,anon,authenticated,service_role;

create or replace function public.cancel_surat_after_revision(p_event_id uuid,p_note text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_event public.surat_revision_events%rowtype; v_result boolean;
begin
  select * into v_event from public.surat_revision_events where id=p_event_id;
  if not (v_event.changes ? 'requester_revision_base') then
    return public.cancel_surat_after_revision_pre_requester_edit(p_event_id,p_note); end if;
  perform pg_advisory_xact_lock(hashtextextended('keu10:'||v_event.surat_id::text,0));
  if auth.uid() is null or not exists(select 1 from public.surat_registrasi surat join public.profiles profile
    on profile.id=surat.created_by where surat.id=v_event.surat_id and surat.created_by=auth.uid()
      and profile.is_active is true and profile.deleted_at is null and surat.status='MENUNGGU_PERBAIKAN'
      and surat.data_snapshot#>>'{revision,event_id}'=p_event_id::text) then
    raise exception 'Hanya pemohon aktif yang dapat membatalkan revisi.' using errcode='42501'; end if;
  insert into requester_revision_internal.permits values(txid_current(),v_event.surat_id,'cancel');
  v_result:=public.cancel_surat_after_revision_pre_requester_edit(p_event_id,p_note);
  delete from requester_revision_internal.permits where transaction_id=txid_current() and surat_id=v_event.surat_id;
  return v_result;
end $$;

create or replace function public.request_surat_process_revision(p_surat_id uuid,p_sig_id uuid,p_target_type text,
  p_target_step integer,p_reason text,p_changes jsonb default '{}')
returns uuid language plpgsql security definer set search_path='' as $$
declare v_surat public.surat_registrasi%rowtype; v_sig public.surat_signatures%rowtype;
  v_changes jsonb:=coalesce(p_changes,'{}'); v_base jsonb; v_event uuid; v_change jsonb; v_index integer;
begin
  if v_changes->>'requester_edit_required' is distinct from 'true'
    and v_changes->>'signer_revision_required' is distinct from 'true' then
    return public.request_surat_process_revision_pre_requester_edit(p_surat_id,p_sig_id,p_target_type,p_target_step,p_reason,
      v_changes-array['requester_revision_base','resume_step']);
  end if;
  if auth.uid() is null or not exists(select 1 from public.profiles
    where id=auth.uid() and is_active is true and deleted_at is null) then
    raise exception 'Pemakai tidak aktif.' using errcode='42501'; end if;
  if p_target_type is distinct from 'requester' or jsonb_typeof(v_changes)<>'object'
    or length(btrim(coalesce(p_reason,''))) not between 5 and 1000
    or v_changes ? 'external_submission_revision' then
    raise exception 'Permintaan perbaikan pemohon tidak valid.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('keu10:'||p_surat_id::text,0));
  select * into v_surat from public.surat_registrasi where id=p_surat_id for update;
  select * into v_sig from public.surat_signatures where id=p_sig_id and surat_id=p_surat_id for update;
  if v_surat.id is null or v_sig.id is null or v_surat.status<>'PROSES' or v_sig.is_signed
    or v_sig.step_order is distinct from v_surat.current_step
    or (v_sig.user_id is distinct from auth.uid() and not coalesce(v_sig.verifier_snapshot @>
      jsonb_build_array(jsonb_build_object('user_id',auth.uid()::text)),false)
      and not public.is_current_user_admin()) then
    raise exception 'Hanya pemeriksa pada tahap aktif yang dapat meminta perbaikan.' using errcode='42501'; end if;
  if exists(select 1 from public.surat_revision_events where surat_id=p_surat_id and status in ('open','awaiting_requester')) then
    raise exception 'Pengajuan masih memiliki perbaikan aktif.' using errcode='55000'; end if;
  v_base:=requester_revision_internal.snapshot(p_surat_id);
  if v_changes->>'requester_edit_required'='true' then
    v_changes:=v_changes-array['item_revisions','keu10_proposed_input','keu10_finance_proposal'];
  elsif not public.is_keu10_surat(p_surat_id) then
    if jsonb_typeof(v_changes->'item_revisions') is distinct from 'array'
      or jsonb_array_length(v_changes->'item_revisions')=0 then
      raise exception 'Revisi penandatangan wajib memuat perubahan item.' using errcode='22023'; end if;
    for v_change in select value from jsonb_array_elements(v_changes->'item_revisions') loop
      v_index:=(v_change->>'index')::integer;
      if v_index is null or v_index<0 or v_index>=jsonb_array_length(v_surat.form_input_data->'items')
        or coalesce(v_change->>'action','') not in ('adjust','reject','keep')
        or length(btrim(coalesce(v_change->>'alasan',''))) <5 then
        raise exception 'Item dan alasan revisi tidak valid.' using errcode='22023'; end if;
      if v_change->>'action'='adjust' and nullif(btrim(v_change->>'nilai_disetujui'),'') is null then
        raise exception 'Nilai disetujui wajib diisi.' using errcode='22023'; end if;
    end loop;
  end if;
  insert into requester_revision_internal.permits values(txid_current(),p_surat_id,'request');
  v_changes:=v_changes||jsonb_build_object('requester_revision_base',v_base,'resume_step',v_sig.step_order);
  v_event:=public.request_surat_process_revision_pre_requester_edit(p_surat_id,p_sig_id,p_target_type,p_target_step,p_reason,v_changes);
  -- KEU10 normalizes proposal metadata; attach the common baseline after that normalization.
  if public.is_keu10_surat(p_surat_id) then
    insert into keu10_internal.mutation_permits values(txid_current(),p_surat_id,'request_revision');
  end if;
  update public.surat_revision_events set changes=changes||jsonb_build_object(
    'requester_revision_base',v_base,'resume_step',v_sig.step_order,
    case when v_changes->>'requester_edit_required'='true' then 'requester_edit_required' else 'signer_revision_required' end,true)
    where id=v_event;
  update public.surat_registrasi set data_snapshot=jsonb_set(data_snapshot,'{revision,changes}',
    (select changes-'requester_revision_base' from public.surat_revision_events where id=v_event),true),
    file_path='native://document/'||id::text||'/revision-request/'||v_event::text,pdf_path=null where id=p_surat_id;
  insert into public.document_pdf_jobs(surat_id,signature_id,source_file_path,requested_by,refresh)
    select id,null,file_path,auth.uid(),false from public.surat_registrasi where id=p_surat_id;
  delete from keu10_internal.mutation_permits where transaction_id=txid_current() and surat_id=p_surat_id;
  delete from requester_revision_internal.permits where transaction_id=txid_current() and surat_id=p_surat_id;
  return v_event;
end $$;

create or replace function public.create_external_submission_revision_draft(p_revision_event_id uuid)
returns public.surat_registration_drafts language plpgsql security definer set search_path='' as $$
declare v_event public.surat_revision_events%rowtype; v_surat public.surat_registrasi%rowtype;
  v_draft public.surat_registration_drafts%rowtype; v_form jsonb; v_signers jsonb; v_baseline jsonb;
begin
  select * into v_event from public.surat_revision_events where id=p_revision_event_id;
  perform pg_advisory_xact_lock(hashtextextended('keu10:'||v_event.surat_id::text,0));
  select * into v_surat from public.surat_registrasi where id=v_event.surat_id for update;
  select * into v_event from public.surat_revision_events where id=p_revision_event_id for update;
  if auth.uid() is null or v_surat.created_by is distinct from auth.uid() or not exists(
    select 1 from public.profiles where id=auth.uid() and is_active is true and deleted_at is null) then
    raise exception 'Hanya pemohon aktif yang dapat membuka perbaikan.' using errcode='42501'; end if;
  if v_event.status is distinct from 'open' or v_event.target_type is distinct from 'requester'
    or v_surat.status is distinct from 'MENUNGGU_PERBAIKAN'
    or v_surat.data_snapshot#>>'{revision,event_id}' is distinct from p_revision_event_id::text then
    raise exception 'Permintaan perbaikan tidak lagi aktif.' using errcode='40001'; end if;
  if v_event.changes->>'external_submission_revision' is distinct from 'true'
    and v_event.changes->>'requester_edit_required' is distinct from 'true' then
    raise exception 'Revisi ini memerlukan konfirmasi, bukan draft perbaikan.' using errcode='22023'; end if;
  select * into v_draft from public.surat_registration_drafts where revision_event_id=v_event.id for update;
  if found then
    if v_draft.created_by is distinct from auth.uid() or v_draft.status<>'DRAFT'
      or v_draft.expires_at is null or v_draft.expires_at<=clock_timestamp() then
      raise exception 'Draft perbaikan tidak lagi aktif.' using errcode='40001'; end if;
    return v_draft;
  end if;
  if v_event.changes->>'requester_edit_required' is distinct from 'true' then
    return public.create_external_submission_revision_draft_pre_requester_edit(p_revision_event_id);
  end if;
  v_form:=jsonb_build_object('entity_id',v_surat.entity_id,'office_id',v_surat.office_id,
    'project_id',v_surat.project_id,'dept_id',v_surat.dept_id,'letter_type_id',v_surat.letter_type_id,
    'penggunaan_id',v_surat.penggunaan_id,'form_usage_id',v_surat.form_usage_id,
    'judul_surat',v_surat.judul_surat,'request_place',v_surat.request_place,'request_date',v_surat.request_date,
    'form_input_data',v_surat.form_input_data);
  select coalesce(jsonb_agg(jsonb_build_object('user_id',signature.user_id,'role_name',signature.role_name,
    'label_jabatan',signature.label_jabatan,'step_order',signature.step_order,'form_usage_step_id',signature.form_usage_step_id,
    'action_type',signature.action_type,'requires_unit_allocation',signature.requires_unit_allocation,
    'verifier_user_ids',coalesce((select jsonb_agg(verifier->>'user_id') from jsonb_array_elements(signature.verifier_snapshot) verifier),'[]'),
    'attachment_requirements',signature.attachment_requirements_snapshot) order by step_order),'[]') into v_signers
    from public.surat_signatures signature where surat_id=v_surat.id;
  v_baseline:=jsonb_build_object('formData',v_form,'attachments',coalesce((select jsonb_agg(to_jsonb(attachment))
    from public.surat_attachments attachment where surat_id=v_surat.id and stage='initial' and signature_id is null),'[]'));
  insert into requester_revision_internal.permits values(txid_current(),v_surat.id,'draft');
  insert into public.surat_registration_drafts(reservation_id,revision_event_id,created_by,no_surat,payload,signer_assignments,expires_at)
    values(null,v_event.id,auth.uid(),v_surat.no_surat,jsonb_build_object('formData',v_form,
      'selectedFormId',coalesce(v_surat.data_snapshot#>>'{policy,form_id}',v_surat.data_snapshot#>>'{policy_snapshot,form_id}',
        v_surat.policy_snapshot->>'form_id',v_surat.location_snapshot#>>'{form,id}',''),
      'selectedUsageId',coalesce(v_surat.form_usage_id::text,v_surat.penggunaan_id::text,''),
      'externalRevision',jsonb_build_object('eventId',v_event.id,'reason',v_event.reason,'requesterEditRequired',true,
        'policySnapshot',v_surat.policy_snapshot,
        'category',coalesce(v_surat.form_input_data->>'request_category',v_surat.form_input_data->>'request_mode'),
        'baseline',v_baseline,'protectedAttachments',coalesce((select jsonb_agg(to_jsonb(attachment))
          from public.surat_attachments attachment where surat_id=v_surat.id and (stage<>'initial' or signature_id is not null)),'[]'))),
      v_signers,clock_timestamp()+interval '7 days') returning * into v_draft;
  insert into public.surat_registration_draft_files(draft_id,created_by,file_url,file_name,file_type,file_size,requirement_key,requirement_label)
    select v_draft.id,auth.uid(),file_url,file_name,file_type,file_size,requirement_key,requirement_label
    from public.surat_attachments where surat_id=v_surat.id and stage='initial' and signature_id is null;
  delete from requester_revision_internal.permits where transaction_id=txid_current() and surat_id=v_surat.id and operation='draft';
  return v_draft;
end $$;

create or replace function requester_revision_internal.guard_draft()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_event public.surat_revision_events%rowtype;
begin
  if tg_op='UPDATE' and new.revision_event_id is distinct from old.revision_event_id
    and exists(select 1 from public.surat_revision_events where id=new.revision_event_id and changes->>'requester_edit_required'='true') then
    raise exception 'Draft umum tidak dapat ditautkan menjadi draft perbaikan.' using errcode='42501'; end if;
  select * into v_event from public.surat_revision_events
    where id=case when tg_op='UPDATE' then old.revision_event_id else new.revision_event_id end;
  if v_event.changes->>'requester_edit_required' is distinct from 'true' then return new; end if;
  if tg_op='INSERT' and not exists(select 1 from requester_revision_internal.permits
    where transaction_id=txid_current() and surat_id=v_event.surat_id and operation='draft') then
    raise exception 'Buka perbaikan melalui Tindak Lanjut.' using errcode='42501'; end if;
  if tg_op='UPDATE' then
    if new.revision_event_id is distinct from old.revision_event_id or new.created_by is distinct from old.created_by
      or new.no_surat is distinct from old.no_surat or new.reservation_id is distinct from old.reservation_id then
      raise exception 'Identitas draft perbaikan tidak dapat diubah.' using errcode='42501'; end if;
    if not exists(select 1 from requester_revision_internal.permits where transaction_id=txid_current()
      and surat_id=v_event.surat_id) and (auth.uid() is distinct from old.created_by or old.status<>'DRAFT'
        or old.expires_at is null or old.expires_at<=clock_timestamp() or v_event.status<>'open' or new.status='SUBMITTED') then
      raise exception 'Draft perbaikan tidak lagi dapat disimpan.' using errcode='42501'; end if;
    new.payload:=jsonb_set(new.payload,'{externalRevision}',old.payload->'externalRevision',true);
  end if;
  return new;
end $$;
drop trigger if exists requester_revision_draft_guard on public.surat_registration_drafts;
create trigger requester_revision_draft_guard before insert or update on public.surat_registration_drafts
  for each row execute function requester_revision_internal.guard_draft();

-- Confirmed signer proposals use the same internal audit/resume path as full drafts.
do $$ begin
  if to_regprocedure('public.accept_surat_process_revision_pre_requester_edit(uuid,text)') is null then
    alter function public.accept_surat_process_revision(uuid,text) rename to accept_surat_process_revision_pre_requester_edit;
  end if;
  if to_regprocedure('public.accept_keu10_requester_revision_pre_requester_edit(uuid,jsonb,text,uuid)') is null then
    alter function public.accept_keu10_requester_revision(uuid,jsonb,text,uuid) rename to accept_keu10_requester_revision_pre_requester_edit;
  end if;
end $$;
revoke all on function public.accept_surat_process_revision_pre_requester_edit(uuid,text),
  public.accept_keu10_requester_revision_pre_requester_edit(uuid,jsonb,text,uuid) from public,anon,authenticated,service_role;

-- Freeze the KEU10 PDF after restoring earlier approvals, not midway through the transition.
do $patch$
declare v_body text:=replace(pg_get_functiondef('keu10_internal.accept_revision(uuid,text,jsonb,uuid)'::regprocedure),E'\r\n',E'\n');
  v_old text:=E'insert into public.document_pdf_jobs(surat_id,signature_id,source_file_path,requested_by,refresh)\n    select id,null,file_path,auth.uid(),false from public.surat_registrasi where id=v_surat.id;';
begin
  if strpos(v_body,'requester_revision_internal.permits')=0 then
    if strpos(v_body,v_old)=0 then raise exception 'Unknown KEU10 revision PDF implementation'; end if;
    execute replace(v_body,v_old,'if not exists(select 1 from requester_revision_internal.permits where transaction_id=txid_current() and surat_id=v_surat.id and operation=''submit'') then '||v_old||' end if;');
  end if;
end $patch$;

do $patch$
declare v_body text:=pg_get_functiondef('public.keu10_pdf_render_payload(uuid)'::regprocedure);
  v_old text:='''request_place'',surat.request_place,''request_date'',surat.request_date)';
begin
  if strpos(v_body,'''data_snapshot''')=0 then
    if strpos(v_body,v_old)=0 then raise exception 'Unknown KEU10 PDF snapshot implementation'; end if;
    execute replace(v_body,v_old,'''request_place'',surat.request_place,''request_date'',surat.request_date,''data_snapshot'',jsonb_build_object(''applied_revision'',surat.data_snapshot->''applied_revision'',''revision'',surat.data_snapshot->''revision''))');
  end if;
end $patch$;

do $patch$
declare v_body text:=replace(pg_get_functiondef('keu10_internal.accept_revision(uuid,text,jsonb,uuid)'::regprocedure),E'\r\n',E'\n');
  v_old text:='v_input := v_surat.form_input_data;';
begin
  if strpos(v_body,'requester_confirmed_input')=0 then
    if strpos(v_body,v_old)=0 then raise exception 'Unknown KEU10 confirmed-input implementation'; end if;
    execute replace(v_body,v_old,v_old||E'\n  if v_event.changes->>''requester_edit_required''=''true'' then\n    if not exists(select 1 from requester_revision_internal.permits where transaction_id=txid_current() and surat_id=v_surat.id and operation=''submit'') then\n      raise exception ''Requester input requires canonical draft submission'' using errcode=''42501''; end if;\n    v_input := v_event.changes->''requester_confirmed_input'';\n    if jsonb_typeof(v_input) is distinct from ''object'' then raise exception ''Confirmed requester input missing'' using errcode=''22023''; end if;\n  end if;');
  end if;
end $patch$;

create or replace function requester_revision_internal.resume(p_event_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_event public.surat_revision_events%rowtype; v_surat public.surat_registrasi%rowtype; v_step integer; v_base jsonb;
begin
  select * into v_event from public.surat_revision_events where id=p_event_id;
  select * into v_surat from public.surat_registrasi where id=v_event.surat_id;
  v_step:=(v_event.changes->>'resume_step')::integer;
  v_base:=v_event.changes->'requester_revision_base';
  if public.is_keu10_surat(v_surat.id) then
    insert into keu10_internal.mutation_permits values(txid_current(),v_surat.id,'accept_revision') on conflict do nothing;
  end if;
  -- Restore approvals before the asking step; keep a complete immutable snapshot in history.
  update public.surat_signatures signature set is_signed=(saved->>'is_signed')::boolean,
    signed_at=nullif(saved->>'signed_at','')::timestamptz,catatan=saved->>'catatan',
    file_path_snap=saved->>'file_path_snap',pdf_path_snap=saved->>'pdf_path_snap',status=saved->>'status',
    available_at=nullif(saved->>'available_at','')::timestamptz,
    verification_status=case when signature.id::text=v_event.changes->>'allocation_signature_id' then signature.verification_status else saved->>'verification_status' end,
    verified_at=case when signature.id::text=v_event.changes->>'allocation_signature_id' then signature.verified_at else nullif(saved->>'verified_at','')::timestamptz end,
    verified_by=case when signature.id::text=v_event.changes->>'allocation_signature_id' then signature.verified_by else nullif(saved->>'verified_by','')::uuid end,
    verification_note=case when signature.id::text=v_event.changes->>'allocation_signature_id' then signature.verification_note else saved->>'verification_note' end
    from jsonb_array_elements(v_base->'signatures') saved where signature.surat_id=v_surat.id
      and signature.id=(saved->>'id')::uuid and signature.step_order<v_step;
  update public.surat_signatures set is_signed=false,signed_at=null,catatan=null,status='PENDING',
    file_path_snap=null,pdf_path_snap=null,available_at=case when step_order=v_step then clock_timestamp() end,
    verification_status=case when verification_required then 'pending' else 'not_required' end,
    verified_at=null,verified_by=null,verification_note=null where surat_id=v_surat.id and step_order>=v_step;
  update public.surat_registrasi set current_step=v_step,data_snapshot=jsonb_set(data_snapshot,
    '{applied_revision}',coalesce(data_snapshot->'applied_revision','{}')||jsonb_build_object('changes',
      (select changes-'requester_revision_base' from public.surat_revision_events where id=v_event.id),'restart_step',v_step,
      'restart_reason','Perbaikan kembali ke tahap yang meminta revisi.'),true) where id=v_surat.id;
  insert into public.document_pdf_jobs(surat_id,signature_id,source_file_path,requested_by,refresh)
    select id,null,file_path,auth.uid(),false from public.surat_registrasi where id=v_surat.id;
  delete from public.notifications where data->>'revision_event_id'=v_event.id::text
    and (data->>'event_type'='revision_accepted' or title='KEU10 approval restarted');
  insert into public.notifications(user_id,type,title,message,data,link)
    select user_id,'info','Perbaikan siap diperiksa',
      'Pemohon telah menyelesaikan perbaikan untuk '||v_surat.no_surat||'. Silakan periksa kembali.',
      jsonb_build_object('surat_id',v_surat.id,'revision_event_id',v_event.id,'event_type','requester_revision_resumed','restart_step',v_step),
      '/surat/inbox?task='||id::text from public.surat_signatures where surat_id=v_surat.id and step_order=v_step;
  delete from keu10_internal.mutation_permits where transaction_id=txid_current() and surat_id=v_surat.id;

end $$;

create or replace function requester_revision_internal.finish(p_event_id uuid,p_note text,p_items jsonb default null,p_final uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_event public.surat_revision_events%rowtype; v_surat public.surat_registrasi%rowtype;
  v_step integer; v_base jsonb; v_result boolean;
begin
  select * into v_event from public.surat_revision_events where id=p_event_id;
  perform pg_advisory_xact_lock(hashtextextended('keu10:'||v_event.surat_id::text,0));
  select * into v_surat from public.surat_registrasi where id=v_event.surat_id for update;
  select * into v_event from public.surat_revision_events where id=p_event_id for update;
  if auth.uid() is null or v_surat.created_by is distinct from auth.uid() or not exists(
    select 1 from public.profiles where id=auth.uid() and is_active is true and deleted_at is null) then
    raise exception 'Hanya pemohon aktif yang dapat mengonfirmasi revisi.' using errcode='42501'; end if;
  if v_event.status not in ('open','awaiting_requester') or v_event.target_type<>'requester'
    or v_surat.status<>'MENUNGGU_PERBAIKAN' or v_surat.data_snapshot#>>'{revision,event_id}' is distinct from p_event_id::text then
    raise exception 'Revisi tidak lagi aktif.' using errcode='40001'; end if;
  if v_event.changes->>'requester_edit_required'='true' and not exists(select 1 from requester_revision_internal.permits
    where transaction_id=txid_current() and surat_id=v_surat.id and operation='submit') then
    raise exception 'Perbaiki pengajuan melalui draft Tindak Lanjut.' using errcode='42501'; end if;
  v_base:=v_event.changes->'requester_revision_base';
  v_step:=(v_event.changes->>'resume_step')::integer;
  if v_base is null or v_step is null or not exists(select 1 from public.surat_signatures
    where surat_id=v_surat.id and step_order=v_step) then
    raise exception 'Tahap pengembalian tidak tersedia.' using errcode='40001'; end if;
  insert into requester_revision_internal.permits values(txid_current(),v_surat.id,'submit') on conflict do nothing;
  if public.is_keu10_surat(v_surat.id) then
    v_result:=public.accept_keu10_requester_revision_pre_requester_edit(p_event_id,p_items,p_note,p_final);
    insert into keu10_internal.mutation_permits values(txid_current(),v_surat.id,'accept_revision');
  else
    v_result:=public.accept_surat_process_revision_pre_requester_edit(p_event_id,p_note);
  end if;
  if exists(select 1 from public.surat_registrasi where id=v_surat.id and status='MENUNGGU_PERBAIKAN') then
    -- Canonical Unit acceptance routed inconsistent allocation to the configured checker.
    -- Keep that route; approvals resume at the asking step after the checker resolves it.
    select * into v_event from public.surat_revision_events where id=p_event_id;
    update public.surat_signatures signature set is_signed=(saved->>'is_signed')::boolean,
      signed_at=nullif(saved->>'signed_at','')::timestamptz,status=saved->>'status'
      from jsonb_array_elements(v_base->'signatures') saved where signature.id=(saved->>'id')::uuid
        and signature.step_order<v_event.target_step;
    update public.surat_registrasi set data_snapshot=jsonb_set(data_snapshot,'{revision,changes}',
      v_event.changes-'requester_revision_base',true) where id=v_surat.id;
    return v_result;
  end if;
  perform requester_revision_internal.resume(p_event_id);
  return v_result;
end $$;

create or replace function public.resolve_surat_process_revision(p_event_id uuid,p_note text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_event public.surat_revision_events%rowtype; v_result boolean;
begin
  select * into v_event from public.surat_revision_events where id=p_event_id;
  if not (v_event.changes ? 'requester_revision_base') then
    return public.resolve_surat_process_revision_pre_requester_edit(p_event_id,p_note); end if;
  if v_event.status is distinct from 'open' or v_event.target_type is distinct from 'checker'
    or v_event.changes->>'restart_after_checker' is distinct from 'true' or auth.uid() is null
    or not exists(select 1 from public.profiles where id=auth.uid() and is_active is true and deleted_at is null)
    or (not(auth.uid()=any(v_event.target_user_ids)) and not public.is_current_user_admin()) then
    raise exception 'Hanya pemeriksa alokasi aktif yang dapat menyelesaikan revisi ini.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('keu10:'||v_event.surat_id::text,0));
  insert into requester_revision_internal.permits values(txid_current(),v_event.surat_id,'submit') on conflict do nothing;
  v_result:=public.resolve_surat_process_revision_pre_requester_edit(p_event_id,p_note);
  perform requester_revision_internal.resume(p_event_id);
  delete from requester_revision_internal.permits where transaction_id=txid_current() and surat_id=v_event.surat_id;
  return v_result;
end $$;

create or replace function public.verify_surat_signature_v2(p_sig_id uuid,p_note text default null,p_payload jsonb default '{}')
returns boolean language plpgsql security definer set search_path='' as $$
declare v_event public.surat_revision_events%rowtype; v_signature public.surat_signatures%rowtype; v_result boolean;
begin
  select * into v_signature from public.surat_signatures where id=p_sig_id;
  select * into v_event from public.surat_revision_events where surat_id=v_signature.surat_id and status='open'
    and target_type='checker' and changes ? 'requester_revision_base';
  if v_event.id is null then return public.verify_surat_signature_v2_pre_requester_edit(p_sig_id,p_note,p_payload); end if;
  if auth.uid() is null or (not(auth.uid()=any(v_event.target_user_ids)) and not public.is_current_user_admin())
    or v_signature.step_order is distinct from v_event.target_step then
    raise exception 'Tugas pemeriksaan revisi tidak tersedia.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('keu10:'||v_event.surat_id::text,0));
  insert into requester_revision_internal.permits values(txid_current(),v_event.surat_id,'submit') on conflict do nothing;
  v_result:=public.verify_surat_signature_v2_pre_requester_edit(p_sig_id,p_note,p_payload);
  delete from requester_revision_internal.permits where transaction_id=txid_current() and surat_id=v_event.surat_id;
  return v_result;
end $$;

create or replace function requester_revision_internal.guard_draft_file()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_draft public.surat_registration_drafts%rowtype; v_event public.surat_revision_events%rowtype;
begin
  select * into v_draft from public.surat_registration_drafts
    where id=case when tg_op='DELETE' then old.draft_id else new.draft_id end for update;
  if v_draft.revision_event_id is null then return coalesce(new,old); end if;
  select * into v_event from public.surat_revision_events where id=v_draft.revision_event_id;
  if v_event.changes->>'requester_edit_required' is distinct from 'true' then return coalesce(new,old); end if;
  if auth.uid() is distinct from v_draft.created_by or v_draft.status<>'DRAFT'
    or v_draft.expires_at<=clock_timestamp() or v_event.status<>'open' then
    raise exception 'Lampiran draft perbaikan tidak lagi dapat diubah.' using errcode='42501'; end if;
  if tg_op<>'DELETE' and (new.created_by is distinct from auth.uid()
    or (tg_op='UPDATE' and new.draft_id is distinct from old.draft_id)
    or exists(select 1 from public.surat_attachments where surat_id=v_event.surat_id
      and file_url=new.file_url and (stage<>'initial' or signature_id is not null))) then
    raise exception 'Lampiran pemeriksa tidak dapat diubah oleh pemohon.' using errcode='42501'; end if;
  return coalesce(new,old);
end $$;
drop trigger if exists requester_revision_file_guard on public.surat_registration_draft_files;
create trigger requester_revision_file_guard before insert or update or delete on public.surat_registration_draft_files
  for each row execute function requester_revision_internal.guard_draft_file();

create or replace function public.accept_surat_process_revision(p_event_id uuid,p_note text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_event public.surat_revision_events%rowtype; v_result boolean;
begin
  select * into v_event from public.surat_revision_events where id=p_event_id;
  if not (v_event.changes ? 'requester_revision_base') then
    return public.accept_surat_process_revision_pre_requester_edit(p_event_id,p_note); end if;
  v_result:=requester_revision_internal.finish(p_event_id,p_note);
  insert into public.surat_requester_revision_history(surat_id,revision_event_id,requested_by,submitted_by,
    requested_at,reason,requester_note,resume_step,before_snapshot,after_snapshot)
    values(v_event.surat_id,v_event.id,v_event.actor_id,auth.uid(),v_event.created_at,v_event.reason,p_note,
      (v_event.changes->>'resume_step')::integer,v_event.changes->'requester_revision_base',
      requester_revision_internal.snapshot(v_event.surat_id));
  delete from requester_revision_internal.permits where transaction_id=txid_current() and surat_id=v_event.surat_id;
  return v_result;
end $$;

create or replace function public.accept_keu10_requester_revision(p_event_id uuid,p_items jsonb,p_note text,p_final_signer_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_event public.surat_revision_events%rowtype; v_result boolean;
begin
  select * into v_event from public.surat_revision_events where id=p_event_id;
  if not (v_event.changes ? 'requester_revision_base') then
    return public.accept_keu10_requester_revision_pre_requester_edit(p_event_id,p_items,p_note,p_final_signer_id); end if;
  v_result:=requester_revision_internal.finish(p_event_id,p_note,p_items,p_final_signer_id);
  insert into public.surat_requester_revision_history(surat_id,revision_event_id,requested_by,submitted_by,
    requested_at,reason,requester_note,resume_step,before_snapshot,after_snapshot)
    values(v_event.surat_id,v_event.id,v_event.actor_id,auth.uid(),v_event.created_at,v_event.reason,p_note,
      (v_event.changes->>'resume_step')::integer,v_event.changes->'requester_revision_base',
      requester_revision_internal.snapshot(v_event.surat_id));
  delete from requester_revision_internal.permits where transaction_id=txid_current() and surat_id=v_event.surat_id;
  return v_result;
end $$;

create or replace function public.submit_external_submission_revision(p_revision_event_id uuid,p_draft_id uuid,
  p_form_data jsonb,p_requester_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event public.surat_revision_events%rowtype; v_surat public.surat_registrasi%rowtype;
  v_draft public.surat_registration_drafts%rowtype; v_input jsonb; v_key text; v_note text; v_final uuid;
begin
  select * into v_event from public.surat_revision_events where id=p_revision_event_id;
  if v_event.changes->>'requester_edit_required' is distinct from 'true' then
    return public.submit_external_submission_revision_pre_requester_edit(p_revision_event_id,p_draft_id,p_form_data,p_requester_note);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('keu10:'||v_event.surat_id::text,0));
  select * into v_surat from public.surat_registrasi where id=v_event.surat_id for update;
  select * into v_event from public.surat_revision_events where id=p_revision_event_id for update;
  select * into v_draft from public.surat_registration_drafts where id=p_draft_id for update;
  if auth.uid() is null or v_surat.created_by is distinct from auth.uid() or v_draft.created_by is distinct from auth.uid()
    or not exists(select 1 from public.profiles where id=auth.uid() and is_active is true and deleted_at is null) then
    raise exception 'Draft perbaikan bukan milik pemohon aktif.' using errcode='42501'; end if;
  if v_event.status is distinct from 'open' or v_event.target_type is distinct from 'requester'
    or v_surat.status is distinct from 'MENUNGGU_PERBAIKAN' or v_draft.status is distinct from 'DRAFT'
    or v_draft.revision_event_id is distinct from v_event.id or v_draft.expires_at is null
    or v_draft.expires_at<=clock_timestamp() or v_surat.data_snapshot#>>'{revision,event_id}' is distinct from v_event.id::text
    or v_event.changes#>'{requester_revision_base,document,form_input_data}' is distinct from v_surat.form_input_data then
    raise exception 'Draft atau revisi tidak lagi aktif.' using errcode='40001'; end if;
  if jsonb_typeof(p_form_data) is distinct from 'object' or jsonb_typeof(p_form_data->'form_input_data') is distinct from 'object' then
    raise exception 'Isi perbaikan wajib berupa data formulir.' using errcode='22023'; end if;
  if exists(select 1 from public.surat_registration_draft_files file where draft_id=v_draft.id
    and (created_by is distinct from auth.uid() or exists(select 1 from public.surat_attachments attachment
      where surat_id=v_surat.id and attachment.file_url=file.file_url and (stage is distinct from 'initial' or signature_id is not null)))) then
    raise exception 'Lampiran pemeriksa tidak dapat menjadi lampiran pemohon.' using errcode='42501'; end if;
  foreach v_key in array array['entity_id','office_id','project_id','dept_id','letter_type_id','form_usage_id','penggunaan_id'] loop
    if nullif(p_form_data->>v_key,'') is distinct from nullif(to_jsonb(v_surat)->>v_key,'') then
      raise exception 'Identitas formulir, kegunaan, dan lokasi tidak dapat diganti.' using errcode='22023'; end if;
  end loop;
  v_input:=p_form_data->'form_input_data';
  if coalesce(v_input->>'request_category',v_input->>'request_mode','') is distinct from
    coalesce(v_surat.form_input_data->>'request_category',v_surat.form_input_data->>'request_mode','') then
    raise exception 'Kategori pengajuan tidak boleh diganti.' using errcode='22023'; end if;
  if coalesce(v_input->>'request_category',v_input->>'request_mode','')='unit' and
    (coalesce(v_input->>'requested_unit_count','') !~ '^[0-9]+$' or (v_input->>'requested_unit_count')::numeric<1) then
    raise exception 'Jumlah unit wajib minimal satu.' using errcode='22023'; end if;
  -- Requester can edit their data; allocation and checker output stay server-owned.
  for v_key in select key from jsonb_object_keys(v_input||v_surat.form_input_data) key
    where key like 'allocated_%' or key like 'verification_%' or key like 'checker_%' loop
    v_input:=v_input-v_key;
    if v_surat.form_input_data ? v_key then v_input:=v_input||jsonb_build_object(v_key,v_surat.form_input_data->v_key); end if;
  end loop;
  if v_surat.form_input_data ? 'items' and (jsonb_typeof(v_input->'items') is distinct from 'array'
    or jsonb_array_length(v_input->'items')=0) then
    raise exception 'Minimal satu item pengajuan wajib dipertahankan.' using errcode='22023'; end if;
  insert into requester_revision_internal.permits values(txid_current(),v_surat.id,'submit');
  v_note:=coalesce(nullif(btrim(p_requester_note),''),v_event.reason);
  if public.is_keu10_surat(v_surat.id) then
    insert into keu10_internal.mutation_permits values(txid_current(),v_surat.id,'accept_revision');
    update public.surat_revision_events set changes=changes||jsonb_build_object('requester_confirmed_input',
      public.normalize_keu10_input(v_input,v_surat.policy_snapshot->'keu10_config')) where id=v_event.id;
    update public.surat_registrasi set judul_surat=coalesce(nullif(btrim(p_form_data->>'judul_surat'),''),judul_surat),
      request_place=coalesce(nullif(btrim(p_form_data->>'request_place'),''),request_place),
      request_date=coalesce(nullif(p_form_data->>'request_date','')::date,request_date) where id=v_surat.id;
    delete from keu10_internal.mutation_permits where transaction_id=txid_current() and surat_id=v_surat.id;
    select nullif(signer->>'user_id','')::uuid into v_final from jsonb_array_elements(v_draft.signer_assignments) signer
      where signer->>'role_name'='menyetujui';
    perform requester_revision_internal.finish(v_event.id,v_note,v_input->'items',v_final);
    insert into keu10_internal.mutation_permits values(txid_current(),v_surat.id,'accept_revision');
    -- Canonical KEU10 normalization and director re-evaluation already ran above.
    select form_input_data into v_input from public.surat_registrasi where id=v_surat.id;
  end if;
  update public.surat_registrasi set form_input_data=v_input,
    judul_surat=coalesce(nullif(btrim(p_form_data->>'judul_surat'),''),judul_surat),
    request_place=coalesce(nullif(btrim(p_form_data->>'request_place'),''),request_place),
    request_date=coalesce(nullif(p_form_data->>'request_date','')::date,request_date),pdf_path=null,
    file_path=case when public.is_keu10_surat(id) then file_path else 'native://document/'||id::text||'/revision/'||v_event.id::text end,
    data_snapshot=jsonb_set(data_snapshot,'{input}',v_input,true),updated_at=clock_timestamp() where id=v_surat.id;
  delete from public.surat_attachments attachment where surat_id=v_surat.id and stage='initial' and signature_id is null
    and not exists(select 1 from public.surat_registration_draft_files file where draft_id=v_draft.id
      and file_url=attachment.file_url and coalesce(requirement_key,'')=coalesce(attachment.requirement_key,''));
  insert into public.surat_attachments(surat_id,file_url,file_name,file_type,file_size,requirement_key,requirement_label,stage)
    select v_surat.id,file_url,file_name,file_type,file_size,requirement_key,requirement_label,'initial'
    from public.surat_registration_draft_files file where draft_id=v_draft.id and not exists(
      select 1 from public.surat_attachments attachment where surat_id=v_surat.id and stage='initial' and signature_id is null
        and file_url=file.file_url and coalesce(requirement_key,'')=coalesce(file.requirement_key,''));
  if not public.is_keu10_surat(v_surat.id) then
    perform requester_revision_internal.finish(v_event.id,v_note);
  else
    delete from keu10_internal.mutation_permits where transaction_id=txid_current() and surat_id=v_surat.id;
  end if;
  update public.surat_registration_drafts set status='SUBMITTED',submitted_at=clock_timestamp() where id=v_draft.id;
  insert into public.surat_requester_revision_history(surat_id,revision_event_id,requested_by,submitted_by,
    requested_at,reason,requester_note,resume_step,before_snapshot,after_snapshot)
    values(v_surat.id,v_event.id,v_event.actor_id,auth.uid(),v_event.created_at,v_event.reason,p_requester_note,
      (v_event.changes->>'resume_step')::integer,v_event.changes->'requester_revision_base',
      requester_revision_internal.snapshot(v_surat.id));
  delete from requester_revision_internal.permits where transaction_id=txid_current() and surat_id=v_surat.id;
  return jsonb_build_object('success',true,'next_step',case when (select status from public.surat_registrasi where id=v_surat.id)='MENUNGGU_PERBAIKAN'
    then 'unit_reallocation' else 'requesting_step' end,'surat_id',v_surat.id,'revision_event_id',v_event.id);
end $$;

revoke all on all functions in schema requester_revision_internal from public,anon,authenticated,service_role;
revoke all on function public.request_surat_process_revision(uuid,uuid,text,integer,text,jsonb),
  public.create_external_submission_revision_draft(uuid),public.submit_external_submission_revision(uuid,uuid,jsonb,text),
  public.accept_surat_process_revision(uuid,text),public.accept_keu10_requester_revision(uuid,jsonb,text,uuid) from public,anon;
revoke all on function public.cancel_surat_after_revision(uuid,text) from public,anon;
revoke all on function public.resolve_surat_process_revision(uuid,text),public.verify_surat_signature_v2(uuid,text,jsonb) from public,anon;
grant execute on function public.request_surat_process_revision(uuid,uuid,text,integer,text,jsonb),
  public.create_external_submission_revision_draft(uuid),public.submit_external_submission_revision(uuid,uuid,jsonb,text),
  public.accept_surat_process_revision(uuid,text),public.accept_keu10_requester_revision(uuid,jsonb,text,uuid) to authenticated,service_role;
grant execute on function public.cancel_surat_after_revision(uuid,text) to authenticated,service_role;
grant execute on function public.resolve_surat_process_revision(uuid,text),public.verify_surat_signature_v2(uuid,text,jsonb) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
