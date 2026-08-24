begin;

alter table public.form_usages
  add column if not exists external_revision_policy jsonb not null default '{
    "recipient_type": "requester",
    "recipient_step_order": null,
    "approval_restart_step": 1
  }'::jsonb;

create or replace function public.is_valid_external_revision_policy(p_policy jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_policy) = 'object'
    and coalesce(p_policy->>'recipient_type', '') in ('requester', 'signer')
    and (
      (p_policy->>'recipient_type' = 'requester' and nullif(p_policy->>'recipient_step_order', '') is null)
      or
      (p_policy->>'recipient_type' = 'signer'
        and coalesce(p_policy->>'recipient_step_order', '') ~ '^[1-8]$')
    )
    and coalesce(p_policy->>'approval_restart_step', '') ~ '^[1-8]$';
$$;

alter table public.form_usages
  drop constraint if exists form_usages_external_revision_policy_check;
alter table public.form_usages
  add constraint form_usages_external_revision_policy_check
  check (public.is_valid_external_revision_policy(external_revision_policy));

revoke all on function public.is_valid_external_revision_policy(jsonb) from public, anon, authenticated;
grant execute on function public.is_valid_external_revision_policy(jsonb) to service_role;

alter function public.save_form_usage_config(uuid, jsonb, uuid[], jsonb, jsonb, jsonb)
  rename to save_form_usage_config_pre_external_revision_policy;

revoke all on function public.save_form_usage_config_pre_external_revision_policy(uuid, jsonb, uuid[], jsonb, jsonb, jsonb)
from public, anon, authenticated;

create function public.save_form_usage_config(
  p_usage_id uuid,
  p_payload jsonb,
  p_department_ids uuid[],
  p_steps jsonb,
  p_attachments jsonb,
  p_verifiers jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usage_id uuid;
  v_policy jsonb := coalesce(
    p_payload->'external_revision_policy',
    '{"recipient_type":"requester","recipient_step_order":null,"approval_restart_step":1}'::jsonb
  );
  v_recipient_step integer;
  v_restart_step integer;
begin
  if not public.is_valid_external_revision_policy(v_policy) then
    raise exception 'Konfigurasi keputusan sistem departemen tidak valid.' using errcode = '22023';
  end if;

  v_recipient_step := nullif(v_policy->>'recipient_step_order', '')::integer;
  v_restart_step := (v_policy->>'approval_restart_step')::integer;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) step
    where (step->>'step_order')::integer = v_restart_step
  ) then
    raise exception 'Tahap awal tanda tangan ulang tidak tersedia pada kegunaan ini.' using errcode = '22023';
  end if;
  if v_policy->>'recipient_type' = 'signer' and not exists (
    select 1 from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) step
    where (step->>'step_order')::integer = v_recipient_step
  ) then
    raise exception 'Signer penerima perbaikan tidak tersedia pada kegunaan ini.' using errcode = '22023';
  end if;

  v_usage_id := public.save_form_usage_config_pre_external_revision_policy(
    p_usage_id, p_payload, p_department_ids, p_steps, p_attachments, p_verifiers
  );
  update public.form_usages
  set external_revision_policy = v_policy,
      updated_at = clock_timestamp()
  where id = v_usage_id;
  return v_usage_id;
end;
$$;

revoke all on function public.save_form_usage_config(uuid, jsonb, uuid[], jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_form_usage_config(uuid, jsonb, uuid[], jsonb, jsonb, jsonb) to authenticated, service_role;

alter function public.apply_external_submission_decision(uuid, text, text, text, timestamptz, text, text)
  rename to apply_external_submission_decision_pre_configurable_routing;

revoke all on function public.apply_external_submission_decision_pre_configurable_routing(uuid, text, text, text, timestamptz, text, text)
from public, anon, authenticated;

create function public.apply_external_submission_decision(
  p_event_id uuid,
  p_document_number text,
  p_decision text,
  p_reason text,
  p_decided_at timestamptz,
  p_payload_hash text,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_surat public.surat_registrasi%rowtype;
  v_policy jsonb;
  v_revision public.surat_revision_events%rowtype;
  v_recipient_type text;
  v_recipient_step integer;
  v_restart_step integer;
  v_target_ids uuid[];
begin
  v_result := public.apply_external_submission_decision_pre_configurable_routing(
    p_event_id, p_document_number, p_decision, p_reason, p_decided_at, p_payload_hash, p_environment
  );
  if p_decision <> 'revision_required' or coalesce((v_result->>'idempotent')::boolean, false) is true then
    return v_result;
  end if;

  select surat.* into v_surat
  from public.surat_registrasi surat
  where lower(btrim(surat.no_surat)) = lower(btrim(p_document_number))
  for update;
  if not found then return v_result; end if;

  v_policy := coalesce(
    v_surat.policy_snapshot->'external_revision_policy',
    (select usage.external_revision_policy from public.form_usages usage where usage.id = v_surat.form_usage_id),
    '{"recipient_type":"requester","recipient_step_order":null,"approval_restart_step":1}'::jsonb
  );
  if not public.is_valid_external_revision_policy(v_policy) then
    raise exception 'Konfigurasi keputusan sistem departemen pada dokumen tidak valid.' using errcode = '22023';
  end if;
  v_recipient_type := v_policy->>'recipient_type';
  v_recipient_step := nullif(v_policy->>'recipient_step_order', '')::integer;
  v_restart_step := (v_policy->>'approval_restart_step')::integer;

  select event.* into v_revision
  from public.surat_revision_events event
  where event.surat_id = v_surat.id
    and event.status = 'open'
    and event.changes->>'external_event_id' = p_event_id::text
  order by event.created_at desc
  limit 1
  for update;
  if not found then
    raise exception 'Event revisi external tidak ditemukan.' using errcode = '55000';
  end if;

  if v_recipient_type = 'signer' then
    select array_agg(distinct signature.user_id) into v_target_ids
    from public.surat_signatures signature
    join public.profiles profile on profile.id = signature.user_id and profile.is_active is true
    where signature.surat_id = v_surat.id
      and signature.step_order = v_recipient_step
      and signature.user_id is not null;
    if cardinality(coalesce(v_target_ids, '{}')) = 0 then
      raise exception 'Signer penerima perbaikan belum memiliki profil aktif.' using errcode = '22023';
    end if;
  else
    v_target_ids := array[v_surat.created_by];
    v_recipient_step := 1;
  end if;

  update public.surat_revision_events
  set target_type = v_recipient_type,
      target_user_ids = v_target_ids,
      target_step = v_recipient_step,
      changes = coalesce(changes, '{}'::jsonb) || jsonb_build_object(
        'configured_recipient_type', v_recipient_type,
        'configured_recipient_step', v_recipient_step,
        'restart_step', v_restart_step,
        'external_revision_policy', v_policy
      )
  where id = v_revision.id;

  update public.surat_registrasi
  set data_snapshot = jsonb_set(
        coalesce(data_snapshot, '{}'::jsonb),
        '{revision}',
        coalesce(data_snapshot->'revision', '{}'::jsonb) || jsonb_build_object(
          'target_type', v_recipient_type,
          'target_user_ids', v_target_ids,
          'target_step', v_recipient_step,
          'changes', coalesce(data_snapshot#>'{revision,changes}', '{}'::jsonb) || jsonb_build_object(
            'configured_recipient_type', v_recipient_type,
            'configured_recipient_step', v_recipient_step,
            'restart_step', v_restart_step,
            'external_revision_policy', v_policy
          )
        ),
        true
      ),
      updated_at = clock_timestamp()
  where id = v_surat.id;

  update public.notifications
  set title = case when user_id = any(v_target_ids) then 'Pengajuan perlu Anda perbaiki' else 'Pengajuan diminta diperbaiki' end,
      link = case
        when user_id = any(v_target_ids) and v_recipient_type = 'requester' then '/surat/tindak-lanjut?surat=' || v_surat.id::text
        when user_id = any(v_target_ids) then '/surat/inbox'
        else '/surat/monitoring?surat=' || v_surat.id::text
      end,
      data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
        'revision_event_id', v_revision.id,
        'target_type', v_recipient_type,
        'target_step', v_recipient_step,
        'restart_step', v_restart_step
      )
  where data->>'event_id' = p_event_id::text;

  return v_result || jsonb_build_object(
    'revision_recipient_type', v_recipient_type,
    'revision_recipient_step', v_recipient_step,
    'approval_restart_step', v_restart_step
  );
end;
$$;

revoke all on function public.apply_external_submission_decision(uuid, text, text, text, timestamptz, text, text)
from public, anon, authenticated;
grant execute on function public.apply_external_submission_decision(uuid, text, text, text, timestamptz, text, text)
to service_role;

alter function public.accept_surat_process_revision(uuid, text)
  rename to accept_surat_process_revision_pre_configurable_restart;

revoke all on function public.accept_surat_process_revision_pre_configurable_restart(uuid, text)
from public, anon, authenticated;

create function public.accept_surat_process_revision(p_event_id uuid, p_note text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.surat_revision_events%rowtype;
  v_restart_step integer := 1;
  v_result boolean;
  v_status text;
begin
  select * into v_event from public.surat_revision_events where id = p_event_id for update;
  if found and coalesce((v_event.changes->>'external_submission_revision')::boolean, false) is true then
    v_restart_step := greatest(1, coalesce(nullif(v_event.changes->>'restart_step', '')::integer, 1));
  end if;

  v_result := public.accept_surat_process_revision_pre_configurable_restart(p_event_id, p_note);
  if not v_result or v_restart_step <= 1 then return v_result; end if;

  select status into v_status from public.surat_registrasi where id = v_event.surat_id;
  if upper(coalesce(v_status, '')) <> 'PROSES' then return v_result; end if;

  update public.surat_signatures current_signature
  set is_signed = coalesce((snapshot.value->>'is_signed')::boolean, true),
      signed_at = nullif(snapshot.value->>'signed_at', '')::timestamptz,
      catatan = coalesce(snapshot.value->>'catatan', 'Persetujuan generasi sebelumnya dipertahankan sesuai konfigurasi kegunaan.'),
      file_path_snap = nullif(snapshot.value->>'file_path_snap', ''),
      pdf_path_snap = nullif(snapshot.value->>'pdf_path_snap', ''),
      status = coalesce(nullif(snapshot.value->>'status', ''), 'APPROVED'),
      available_at = nullif(snapshot.value->>'available_at', '')::timestamptz
  from public.surat_external_revision_history history
  cross join lateral jsonb_array_elements(history.signatures_snapshot) snapshot(value)
  where history.surat_id = v_event.surat_id
    and history.generation = nullif(v_event.changes->>'revision_generation', '')::integer
    and current_signature.surat_id = history.surat_id
    and current_signature.id = (snapshot.value->>'id')::uuid
    and current_signature.step_order < v_restart_step;

  update public.surat_signatures
  set is_signed = false,
      signed_at = null,
      catatan = null,
      file_path_snap = null,
      pdf_path_snap = null,
      status = 'PENDING',
      available_at = case when step_order = v_restart_step then clock_timestamp() else null end
  where surat_id = v_event.surat_id and step_order >= v_restart_step;

  update public.surat_registrasi
  set current_step = v_restart_step,
      data_snapshot = jsonb_set(
        coalesce(data_snapshot, '{}'::jsonb),
        '{applied_revision,restart_step}',
        to_jsonb(v_restart_step),
        true
      ),
      updated_at = clock_timestamp()
  where id = v_event.surat_id;

  return v_result;
end;
$$;

revoke all on function public.accept_surat_process_revision(uuid, text) from public, anon;
grant execute on function public.accept_surat_process_revision(uuid, text) to authenticated, service_role;

alter function public.resolve_surat_process_revision(uuid, text)
  rename to resolve_surat_process_revision_pre_external_signer_routing;

revoke all on function public.resolve_surat_process_revision_pre_external_signer_routing(uuid, text)
from public, anon, authenticated;

create function public.resolve_surat_process_revision(p_event_id uuid, p_note text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_event public.surat_revision_events%rowtype;
  v_surat public.surat_registrasi%rowtype;
  v_restart_step integer;
begin
  select * into v_event from public.surat_revision_events where id = p_event_id for update;
  if not found
     or coalesce((v_event.changes->>'external_submission_revision')::boolean, false) is not true
     or v_event.target_type <> 'signer' then
    return public.resolve_surat_process_revision_pre_external_signer_routing(p_event_id, p_note);
  end if;
  if v_actor is null or (
    not (v_actor = any(v_event.target_user_ids))
    and not exists (select 1 from public.profiles profile where profile.id = v_actor and profile.role::text in ('admin', 'super_admin'))
  ) then
    raise exception 'Anda tidak berwenang menyelesaikan perbaikan ini.' using errcode = '42501';
  end if;

  select * into v_surat from public.surat_registrasi where id = v_event.surat_id for update;
  if not found or v_surat.status <> 'MENUNGGU_PERBAIKAN' then
    raise exception 'Pengajuan tidak lagi menunggu perbaikan.' using errcode = '55000';
  end if;
  v_restart_step := greatest(1, coalesce(nullif(v_event.changes->>'restart_step', '')::integer, 1));

  update public.surat_revision_events
  set status = 'resolved', resolved_at = clock_timestamp(), resolved_by = v_actor,
      changes = coalesce(changes, '{}'::jsonb) || jsonb_build_object(
        'resolution_note', nullif(btrim(coalesce(p_note, '')), ''),
        'resolved_by_worker', v_actor,
        'resolved_by_worker_at', clock_timestamp(),
        'requester_acceptance_skipped', true,
        'restart_step', v_restart_step
      )
  where id = p_event_id;

  update public.surat_signatures
  set is_signed = false, signed_at = null, catatan = null, file_path_snap = null,
      pdf_path_snap = null, status = 'PENDING',
      available_at = case when step_order = v_restart_step then clock_timestamp() else null end
  where surat_id = v_event.surat_id and step_order >= v_restart_step;

  delete from public.document_pdf_jobs where surat_id = v_event.surat_id and status <> 'processing';
  update public.surat_registrasi
  set status = 'PROSES', current_step = v_restart_step, pdf_path = null,
      data_snapshot = jsonb_set(
        coalesce(data_snapshot, '{}'::jsonb) - 'revision',
        '{applied_revision}',
        jsonb_build_object(
          'event_id', v_event.id,
          'target_type', v_event.target_type,
          'target_user_ids', v_event.target_user_ids,
          'reason', v_event.reason,
          'resolved_at', clock_timestamp(),
          'resolved_by', v_actor,
          'restart_step', v_restart_step
        ),
        true
      ),
      updated_at = clock_timestamp()
  where id = v_event.surat_id;

  insert into public.notifications(user_id, type, title, message, data, link)
  select signature.user_id, 'info', 'Approval revisi dimulai',
    'Perbaikan untuk ' || coalesce(v_surat.no_surat, 'pengajuan') || ' selesai. Silakan meninjau ulang pengajuan.',
    jsonb_build_object('surat_id', v_event.surat_id, 'revision_event_id', v_event.id, 'event_type', 'external_revision_approval_restarted'),
    '/surat/inbox?task=' || signature.id::text
  from public.surat_signatures signature
  where signature.surat_id = v_event.surat_id
    and signature.step_order = v_restart_step
    and signature.user_id is not null;
  return true;
end;
$$;

revoke all on function public.resolve_surat_process_revision(uuid, text) from public, anon;
grant execute on function public.resolve_surat_process_revision(uuid, text) to authenticated, service_role;

create or replace function public.enqueue_native_document_pdf_for_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text;
begin
  v_source := nullif(btrim(coalesce(new.file_path, '')), '');
  if v_source is null or v_source not like 'native://document/%' then return new; end if;
  if nullif(new.form_input_data->>'linked_parent_surat_id', '') is not null
     or exists (
       select 1 from public.surat_linked_documents link
       where link.child_surat_id = new.id and link.link_type = 'recommendation' and link.status = 'active'
     ) then
    return new;
  end if;

  if not exists (
    select 1 from public.document_pdf_jobs job
    where job.surat_id = new.id
      and job.source_file_path = v_source
      and job.signature_id is null
      and job.status in ('queued', 'processing', 'done')
  ) then
    insert into public.document_pdf_jobs(
      surat_id, signature_id, source_file_path, requested_by, refresh
    ) values (
      new.id, null, v_source, new.created_by, false
    );
  end if;
  return new;
end;
$$;

create or replace function public.enqueue_native_document_pdf_for_signature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_surat public.surat_registrasi%rowtype;
  v_source text;
begin
  if old.is_signed is true or new.is_signed is not true then return new; end if;
  select * into v_surat from public.surat_registrasi where id = new.surat_id;
  if not found then return new; end if;

  v_source := nullif(btrim(coalesce(new.file_path_snap, '')), '');
  if v_source is null or v_source not like 'native://document/%' then return new; end if;
  if nullif(v_surat.form_input_data->>'linked_parent_surat_id', '') is not null
     or exists (
       select 1 from public.surat_linked_documents link
       where link.child_surat_id = v_surat.id and link.link_type = 'recommendation' and link.status = 'active'
     ) then
    return new;
  end if;

  if not exists (
    select 1 from public.document_pdf_jobs job
    where job.surat_id = v_surat.id
      and job.source_file_path = v_source
      and job.signature_id = new.id
      and job.status in ('queued', 'processing', 'done')
  ) then
    insert into public.document_pdf_jobs(
      surat_id, signature_id, source_file_path, requested_by, refresh
    ) values (
      v_surat.id, new.id, v_source, coalesce(auth.uid(), new.user_id, v_surat.created_by), false
    );
  end if;
  return new;
end;
$$;

drop trigger if exists enqueue_native_pdf_after_registration on public.surat_registrasi;
create trigger enqueue_native_pdf_after_registration
after insert on public.surat_registrasi
for each row execute function public.enqueue_native_document_pdf_for_registration();

drop trigger if exists enqueue_native_pdf_after_signature on public.surat_signatures;
create trigger enqueue_native_pdf_after_signature
after update of is_signed on public.surat_signatures
for each row execute function public.enqueue_native_document_pdf_for_signature();

revoke all on function public.enqueue_native_document_pdf_for_registration() from public, anon, authenticated;
revoke all on function public.enqueue_native_document_pdf_for_signature() from public, anon, authenticated;

commit;
