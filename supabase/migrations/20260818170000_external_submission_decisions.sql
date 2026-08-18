begin;

create table if not exists public.external_submission_decision_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  surat_id uuid not null references public.surat_registrasi(id) on delete restrict,
  decision text not null check (decision in ('rejected', 'revision_required')),
  reason text not null check (length(btrim(reason)) between 5 and 1000),
  decided_at timestamptz not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  revision_generation integer check (revision_generation is null or revision_generation > 0),
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists external_submission_decision_events_surat_idx
  on public.external_submission_decision_events(surat_id, created_at desc);

alter table public.external_submission_decision_events enable row level security;
revoke all on table public.external_submission_decision_events from public, anon, authenticated;
grant select, insert on table public.external_submission_decision_events to service_role;

create table if not exists public.surat_external_revision_history (
  id uuid primary key default gen_random_uuid(),
  surat_id uuid not null references public.surat_registrasi(id) on delete restrict,
  decision_event_id uuid not null references public.external_submission_decision_events(id) on delete restrict,
  generation integer not null check (generation > 0),
  document_snapshot jsonb not null,
  signatures_snapshot jsonb not null default '[]'::jsonb,
  attachments_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  unique(surat_id, generation)
);

alter table public.surat_external_revision_history enable row level security;
revoke all on table public.surat_external_revision_history from public, anon, authenticated;
grant select, insert on table public.surat_external_revision_history to service_role;

alter table public.surat_registration_drafts
  alter column reservation_id drop not null,
  add column if not exists revision_event_id uuid references public.surat_revision_events(id) on delete restrict;

create unique index if not exists surat_registration_drafts_revision_event_key
  on public.surat_registration_drafts(revision_event_id)
  where revision_event_id is not null;

create or replace function public.apply_external_submission_decision(
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
  v_document_number text := btrim(coalesce(p_document_number, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_surat public.surat_registrasi%rowtype;
  v_existing public.external_submission_decision_events%rowtype;
  v_decision_event public.external_submission_decision_events%rowtype;
  v_generation integer;
  v_revision_event_id uuid;
  v_related_users uuid[] := '{}';
begin
  if p_event_id is null or v_document_number = '' or p_decision not in ('rejected', 'revision_required')
     or length(v_reason) not between 5 and 1000 or p_decided_at is null
     or coalesce(p_payload_hash, '') !~ '^[0-9a-f]{64}$'
     or p_environment not in ('staging', 'production') then
    raise exception 'Keputusan sistem departemen tidak valid.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('external-decision:' || p_event_id::text, 0));
  select * into v_existing from public.external_submission_decision_events where event_id = p_event_id;
  if found then
    if v_existing.payload_hash = p_payload_hash then
      return jsonb_build_object(
        'success', true, 'idempotent', true, 'event_id', p_event_id,
        'document_number', v_document_number, 'decision', v_existing.decision,
        'revision_generation', v_existing.revision_generation
      );
    end if;
    raise exception 'event_id sudah digunakan untuk keputusan yang berbeda.' using errcode = '55000';
  end if;

  select sr.* into v_surat
  from public.surat_registrasi sr
  where btrim(sr.no_surat) = v_document_number
  for update;
  if not found then
    raise exception 'Nomor dokumen tidak ditemukan.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.surat_registrasi duplicate
    where btrim(duplicate.no_surat) = v_document_number and duplicate.id <> v_surat.id
  ) then
    raise exception 'Nomor dokumen tidak unik.' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.surat_linked_documents link
    where link.child_surat_id = v_surat.id and link.link_type = 'recommendation'
  ) then
    raise exception 'Keputusan harus menggunakan nomor dokumen pengajuan induk.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.marison_outbound_dispatches dispatch
    where dispatch.surat_id = v_surat.id
      and dispatch.environment = p_environment
      and dispatch.status = 'succeeded'
      and dispatch.post_started_at is not null
      and (dispatch.response is not null or dispatch.external_reference is not null)
  ) then
    raise exception 'Dokumen belum terbukti berhasil dikirim ke sistem departemen.' using errcode = '22023';
  end if;
  if upper(coalesce(v_surat.status::text, '')) not in ('DONE', 'SELESAI') then
    raise exception 'Dokumen tidak berada pada status final yang dapat diputuskan.' using errcode = '55000';
  end if;

  select coalesce(max(event.revision_generation), 0) + 1 into v_generation
  from public.external_submission_decision_events event
  where event.surat_id = v_surat.id and event.decision = 'revision_required';

  insert into public.external_submission_decision_events(
    event_id, surat_id, decision, reason, decided_at, payload_hash, revision_generation
  ) values (
    p_event_id, v_surat.id, p_decision, v_reason, p_decided_at, p_payload_hash,
    case when p_decision = 'revision_required' then v_generation else null end
  ) returning * into v_decision_event;

  select coalesce(array_agg(distinct related_id), '{}') into v_related_users
  from (
    select v_surat.created_by as related_id
    union all
    select signature.user_id from public.surat_signatures signature where signature.surat_id = v_surat.id
  ) related
  where related_id is not null;

  if p_decision = 'rejected' then
    update public.surat_registrasi
    set status = 'REJECTED',
        data_snapshot = jsonb_set(
          coalesce(data_snapshot, '{}'::jsonb),
          '{external_decision}',
          jsonb_build_object(
            'event_id', p_event_id, 'decision', p_decision, 'reason', v_reason,
            'decided_at', p_decided_at, 'terminal', true, 'source', 'department_system'
          ),
          true
        ),
        updated_at = clock_timestamp()
    where id = v_surat.id;

    insert into public.notifications(user_id, type, title, message, data, link)
    select user_id, 'error', 'Ditolak sistem departemen',
      'Pengajuan ' || v_document_number || ' ditolak. Alasan: ' || v_reason,
      jsonb_build_object('surat_id', v_surat.id, 'event_id', p_event_id, 'event_type', 'external_submission_rejected', 'reason', v_reason),
      '/surat/monitoring?surat=' || v_surat.id::text
    from unnest(v_related_users) user_id;

    return jsonb_build_object(
      'success', true, 'idempotent', false, 'event_id', p_event_id,
      'document_number', v_document_number, 'decision', p_decision,
      'status', 'REJECTED', 'terminal', true
    );
  end if;

  insert into public.surat_external_revision_history(
    surat_id, decision_event_id, generation, document_snapshot, signatures_snapshot, attachments_snapshot
  )
  select
    v_surat.id,
    v_decision_event.id,
    v_generation,
    to_jsonb(v_surat),
    coalesce((select jsonb_agg(to_jsonb(signature) order by signature.step_order, signature.id) from public.surat_signatures signature where signature.surat_id = v_surat.id), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(attachment) order by attachment.created_at, attachment.id) from public.surat_attachments attachment where attachment.surat_id = v_surat.id), '[]'::jsonb);

  update public.surat_revision_events
  set status = 'resolved', resolved_at = clock_timestamp()
  where surat_id = v_surat.id and status in ('open', 'awaiting_requester');

  insert into public.surat_revision_events(
    surat_id, actor_id, target_type, target_user_ids, from_step, target_step, reason, changes
  ) values (
    v_surat.id, null, 'requester', array[v_surat.created_by], v_surat.current_step, 1, v_reason,
    jsonb_build_object(
      'external_submission_revision', true,
      'external_decision_event_id', v_decision_event.id,
      'external_event_id', p_event_id,
      'revision_generation', v_generation,
      'decided_at', p_decided_at,
      'requester_must_edit', true
    )
  ) returning id into v_revision_event_id;

  update public.surat_registrasi
  set status = 'MENUNGGU_PERBAIKAN',
      data_snapshot = jsonb_set(
        coalesce(data_snapshot, '{}'::jsonb) - 'applied_revision',
        '{revision}',
        jsonb_build_object(
          'event_id', v_revision_event_id,
          'target_type', 'requester',
          'target_user_ids', array[v_surat.created_by],
          'from_step', v_surat.current_step,
          'target_step', 1,
          'reason', v_reason,
          'actor_name', 'Sistem departemen',
          'changes', jsonb_build_object(
            'external_submission_revision', true,
            'external_decision_event_id', v_decision_event.id,
            'external_event_id', p_event_id,
            'revision_generation', v_generation,
            'decided_at', p_decided_at,
            'requester_must_edit', true
          ),
          'created_at', clock_timestamp()
        ),
        true
      ),
      updated_at = clock_timestamp()
  where id = v_surat.id;

  insert into public.notifications(user_id, type, title, message, data, link)
  select user_id, 'warning',
    case when user_id = v_surat.created_by then 'Perlu diperbaiki oleh pemohon' else 'Pengajuan diminta diperbaiki' end,
    'Pengajuan ' || v_document_number || ' diminta diperbaiki. Alasan: ' || v_reason,
    jsonb_build_object('surat_id', v_surat.id, 'revision_event_id', v_revision_event_id, 'event_id', p_event_id, 'event_type', 'external_submission_revision_required', 'reason', v_reason),
    case when user_id = v_surat.created_by then '/surat/tindak-lanjut?surat=' || v_surat.id::text else '/surat/monitoring?surat=' || v_surat.id::text end
  from unnest(v_related_users) user_id;

  return jsonb_build_object(
    'success', true, 'idempotent', false, 'event_id', p_event_id,
    'document_number', v_document_number, 'decision', p_decision,
    'status', 'MENUNGGU_PERBAIKAN', 'revision_event_id', v_revision_event_id,
    'revision_generation', v_generation
  );
end;
$$;

revoke all on function public.apply_external_submission_decision(uuid, text, text, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.apply_external_submission_decision(uuid, text, text, text, timestamptz, text, text) to service_role;

create or replace function public.create_external_submission_revision_draft(p_revision_event_id uuid)
returns public.surat_registration_drafts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_event public.surat_revision_events%rowtype;
  v_surat public.surat_registrasi%rowtype;
  v_draft public.surat_registration_drafts%rowtype;
  v_payload jsonb;
  v_signers jsonb;
begin
  if v_actor is null then raise exception 'Sesi login tidak tersedia.' using errcode = '42501'; end if;
  select * into v_event from public.surat_revision_events where id = p_revision_event_id for update;
  if not found or v_event.status <> 'open' or v_event.target_type <> 'requester'
     or coalesce((v_event.changes->>'external_submission_revision')::boolean, false) is not true then
    raise exception 'Permintaan perbaikan tidak tersedia.' using errcode = 'P0002';
  end if;
  select * into v_surat from public.surat_registrasi where id = v_event.surat_id for update;
  if not found or v_surat.created_by <> v_actor or v_surat.status <> 'MENUNGGU_PERBAIKAN' then
    raise exception 'Anda tidak berwenang memperbaiki pengajuan ini.' using errcode = '42501';
  end if;

  v_signers := coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', signature.user_id,
      'role_name', signature.role_name,
      'label_jabatan', signature.label_jabatan,
      'step_order', signature.step_order,
      'form_usage_step_id', signature.form_usage_step_id,
      'action_type', signature.action_type,
      'requires_unit_allocation', signature.requires_unit_allocation,
      'verifier_user_ids', coalesce((select jsonb_agg(verifier->>'user_id') from jsonb_array_elements(coalesce(signature.verifier_snapshot, '[]'::jsonb)) verifier), '[]'::jsonb),
      'attachment_requirements', coalesce(signature.attachment_requirements_snapshot, '[]'::jsonb)
    ) order by signature.step_order)
    from public.surat_signatures signature where signature.surat_id = v_surat.id
  ), '[]'::jsonb);

  v_payload := jsonb_build_object(
    'formData', jsonb_build_object(
      'entity_id', v_surat.entity_id,
      'office_id', v_surat.office_id,
      'project_id', v_surat.project_id,
      'dept_id', v_surat.dept_id,
      'letter_type_id', v_surat.letter_type_id,
      'penggunaan_id', v_surat.penggunaan_id,
      'form_usage_id', v_surat.form_usage_id,
      'judul_surat', v_surat.judul_surat,
      'request_place', v_surat.request_place,
      'request_date', v_surat.request_date,
      'form_input_data', coalesce(v_surat.form_input_data, '{}'::jsonb)
    ),
    'selectedFormId', coalesce(v_surat.data_snapshot#>>'{policy,form_id}', v_surat.data_snapshot#>>'{policy_snapshot,form_id}', ''),
    'selectedUsageId', coalesce(v_surat.form_usage_id::text, v_surat.penggunaan_id::text, ''),
    'externalRevision', jsonb_build_object(
      'eventId', v_event.id,
      'generation', v_event.changes->'revision_generation',
      'category', coalesce(v_surat.form_input_data->>'request_category', v_surat.form_input_data->>'request_mode'),
      'reason', v_event.reason
    )
  );

  insert into public.surat_registration_drafts(
    reservation_id, revision_event_id, created_by, no_surat, payload, signer_assignments
  ) values (null, v_event.id, v_actor, v_surat.no_surat, v_payload, v_signers)
  on conflict (revision_event_id) where revision_event_id is not null do update
  set payload = case
        when public.surat_registration_drafts.status = 'DRAFT' then public.surat_registration_drafts.payload
        else excluded.payload
      end,
      signer_assignments = case
        when public.surat_registration_drafts.status = 'DRAFT' then public.surat_registration_drafts.signer_assignments
        else excluded.signer_assignments
      end,
      status = 'DRAFT', expires_at = clock_timestamp() + interval '7 days', submitted_at = null, voided_at = null
  returning * into v_draft;

  insert into public.surat_registration_draft_files(
    draft_id, created_by, file_url, file_name, file_type, file_size, requirement_key, requirement_label
  )
  select v_draft.id, v_actor, attachment.file_url, coalesce(attachment.file_name, 'Lampiran'),
    attachment.file_type, attachment.file_size, attachment.requirement_key, attachment.requirement_label
  from public.surat_attachments attachment
  where attachment.surat_id = v_surat.id
    and attachment.stage in ('initial', 'recommendation_item')
    and not exists (
      select 1 from public.surat_registration_draft_files existing
      where existing.draft_id = v_draft.id and existing.file_url = attachment.file_url
        and coalesce(existing.requirement_key, '') = coalesce(attachment.requirement_key, '')
    );

  return v_draft;
end;
$$;

revoke all on function public.create_external_submission_revision_draft(uuid) from public, anon;
grant execute on function public.create_external_submission_revision_draft(uuid) to authenticated, service_role;

create or replace function public.submit_external_submission_revision(
  p_revision_event_id uuid,
  p_draft_id uuid,
  p_form_data jsonb,
  p_requester_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_event public.surat_revision_events%rowtype;
  v_surat public.surat_registrasi%rowtype;
  v_draft public.surat_registration_drafts%rowtype;
  v_input jsonb;
  v_category text;
  v_requested_count integer;
  v_has_recommendation boolean;
  v_recommendation_event_id uuid;
begin
  if v_actor is null then raise exception 'Sesi login tidak tersedia.' using errcode = '42501'; end if;
  if p_form_data is null or jsonb_typeof(p_form_data) <> 'object' then
    raise exception 'Data perbaikan tidak valid.' using errcode = '22023';
  end if;
  select * into v_event from public.surat_revision_events where id = p_revision_event_id for update;
  if not found or v_event.status <> 'open' or v_event.target_type <> 'requester'
     or coalesce((v_event.changes->>'external_submission_revision')::boolean, false) is not true then
    raise exception 'Permintaan perbaikan tidak tersedia.' using errcode = 'P0002';
  end if;
  select * into v_surat from public.surat_registrasi where id = v_event.surat_id for update;
  select * into v_draft from public.surat_registration_drafts where id = p_draft_id and revision_event_id = v_event.id for update;
  if not found or v_draft.created_by <> v_actor or v_draft.status <> 'DRAFT' or v_surat.created_by <> v_actor then
    raise exception 'Draft perbaikan tidak tersedia.' using errcode = '42501';
  end if;

  if nullif(p_form_data->>'entity_id', '')::uuid is distinct from v_surat.entity_id
     or nullif(p_form_data->>'office_id', '')::uuid is distinct from v_surat.office_id
     or nullif(p_form_data->>'project_id', '')::uuid is distinct from v_surat.project_id
     or nullif(p_form_data->>'dept_id', '')::uuid is distinct from v_surat.dept_id
     or nullif(p_form_data->>'letter_type_id', '')::uuid is distinct from v_surat.letter_type_id
     or nullif(p_form_data->>'form_usage_id', '')::uuid is distinct from v_surat.form_usage_id then
    raise exception 'Identitas, kantor, proyek, dan konfigurasi dokumen tidak boleh diubah pada revisi.' using errcode = '22023';
  end if;

  v_input := coalesce(p_form_data->'form_input_data', '{}'::jsonb);
  v_category := lower(coalesce(v_surat.form_input_data->>'request_category', v_surat.form_input_data->>'request_mode', ''));
  if lower(coalesce(v_input->>'request_category', v_input->>'request_mode', '')) is distinct from v_category then
    raise exception 'Kategori pengajuan tidak boleh diubah pada revisi.' using errcode = '22023';
  end if;
  if v_category = 'unit' then
    v_requested_count := nullif(regexp_replace(coalesce(v_input->>'requested_unit_count', ''), '[^0-9]', '', 'g'), '')::integer;
    if v_requested_count is null or v_requested_count < 1 then
      raise exception 'Jumlah unit perbaikan wajib minimal 1.' using errcode = '22023';
    end if;
    if coalesce(v_input->'requested_project', 'null'::jsonb) is distinct from coalesce(v_surat.form_input_data->'requested_project', 'null'::jsonb) then
      raise exception 'Proyek unit tidak boleh diubah oleh pemohon.' using errcode = '22023';
    end if;
    v_input := coalesce(v_surat.form_input_data, '{}'::jsonb)
      || jsonb_build_object(
        'requested_unit_count', v_requested_count,
        'requester_revision_note', nullif(btrim(coalesce(p_requester_note, '')), '')
      );
  end if;

  update public.surat_registrasi
  set judul_surat = case when v_category = 'unit' then judul_surat else coalesce(nullif(btrim(p_form_data->>'judul_surat'), ''), judul_surat) end,
      request_place = case when v_category = 'unit' then request_place else coalesce(nullif(btrim(p_form_data->>'request_place'), ''), request_place) end,
      request_date = case when v_category = 'unit' then request_date else coalesce(nullif(p_form_data->>'request_date', '')::date, request_date) end,
      form_input_data = v_input,
      pdf_path = null,
      data_snapshot = jsonb_set(
        jsonb_set(coalesce(data_snapshot, '{}'::jsonb), '{input}', v_input, true),
        '{external_revision_current}',
        jsonb_build_object(
          'generation', v_event.changes->'revision_generation',
          'revision_event_id', v_event.id,
          'submitted_at', clock_timestamp(),
          'requester_note', nullif(btrim(coalesce(p_requester_note, '')), '')
        ),
        true
      ),
      updated_at = clock_timestamp()
  where id = v_surat.id;

  delete from public.surat_attachments attachment
  where attachment.surat_id = v_surat.id
    and attachment.stage = 'initial'
    and not exists (
      select 1 from public.surat_registration_draft_files draft_file
      where draft_file.draft_id = v_draft.id and draft_file.file_url = attachment.file_url
    );

  insert into public.surat_attachments(
    surat_id, file_url, file_name, file_type, file_size, requirement_key, requirement_label, stage
  )
  select v_surat.id, draft_file.file_url, draft_file.file_name, draft_file.file_type,
    draft_file.file_size, draft_file.requirement_key, draft_file.requirement_label, 'initial'
  from public.surat_registration_draft_files draft_file
  where draft_file.draft_id = v_draft.id
    and not exists (
      select 1 from public.surat_attachments attachment
      where attachment.surat_id = v_surat.id
        and attachment.file_url = draft_file.file_url
        and coalesce(attachment.requirement_key, '') = coalesce(draft_file.requirement_key, '')
    );

  update public.surat_registration_drafts set status = 'SUBMITTED', submitted_at = clock_timestamp() where id = v_draft.id;
  delete from public.document_pdf_jobs where surat_id = v_surat.id and status not in ('processing');

  select exists(
    select 1 from public.surat_recommendation_tasks task
    where task.parent_surat_id = v_surat.id and task.status <> 'cancelled'
  ) and coalesce((v_input->>'requires_recommendation')::boolean, false)
  into v_has_recommendation;

  if v_has_recommendation then
    update public.surat_revision_events
    set status = 'resolved', resolved_at = clock_timestamp(), resolved_by = v_actor,
        changes = coalesce(changes, '{}'::jsonb) || jsonb_build_object('requester_submitted_at', clock_timestamp())
    where id = v_event.id;

    insert into public.surat_revision_events(
      surat_id, actor_id, target_type, target_user_ids, from_step, target_step, reason, changes
    )
    select v_surat.id, v_actor, 'recommendation',
      coalesce(array_agg(distinct coalesce(task.claimed_by, nullif(candidate->>'user_id', '')::uuid)) filter (where coalesce(task.claimed_by::text, candidate->>'user_id') is not null), '{}'),
      v_surat.current_step, 1, v_event.reason,
      coalesce(v_event.changes, '{}'::jsonb) || jsonb_build_object(
        'requester_submitted_at', clock_timestamp(),
        'parent_external_revision_event_id', v_event.id,
        'external_submission_revision', true
      )
    from public.surat_recommendation_tasks task
    left join lateral jsonb_array_elements(coalesce(task.candidate_snapshot, '[]'::jsonb)) candidate on true
    where task.parent_surat_id = v_surat.id and task.status <> 'cancelled'
    group by task.parent_surat_id
    returning id into v_recommendation_event_id;

    if v_recommendation_event_id is null then
      raise exception 'Tim rekomendasi belum dikonfigurasi.' using errcode = '22023';
    end if;
    update public.surat_registrasi
    set status = 'MENUNGGU_PERBAIKAN',
        data_snapshot = jsonb_set(coalesce(data_snapshot, '{}'::jsonb), '{revision}', jsonb_build_object(
          'event_id', v_recommendation_event_id, 'target_type', 'recommendation',
          'reason', v_event.reason, 'actor_name', 'Sistem departemen',
          'changes', coalesce(v_event.changes, '{}'::jsonb) || jsonb_build_object('external_submission_revision', true)
        ), true)
    where id = v_surat.id;
    return jsonb_build_object('success', true, 'next_step', 'recommendation', 'surat_id', v_surat.id, 'revision_event_id', v_recommendation_event_id);
  end if;

  perform public.accept_surat_process_revision(v_event.id, p_requester_note);
  return jsonb_build_object(
    'success', true,
    'next_step', case when v_category = 'unit' then 'unit_allocation_or_approval' else 'approval' end,
    'surat_id', v_surat.id,
    'revision_event_id', v_event.id
  );
end;
$$;

revoke all on function public.submit_external_submission_revision(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.submit_external_submission_revision(uuid, uuid, jsonb, text) to authenticated, service_role;

create or replace function public.enqueue_external_revision_dispatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_generation integer;
  v_previous public.marison_outbound_dispatches%rowtype;
begin
  if upper(coalesce(new.status::text, '')) not in ('DONE', 'SELESAI')
     or upper(coalesce(old.status::text, '')) in ('DONE', 'SELESAI')
     or coalesce(new.data_snapshot#>>'{external_revision_current,generation}', '') !~ '^[1-9][0-9]*$' then
    return new;
  end if;
  select * into v_previous from public.marison_outbound_dispatches dispatch
  where dispatch.surat_id = new.id and dispatch.status = 'succeeded'
  order by dispatch.generation desc limit 1;
  if not found then return new; end if;
  v_generation := v_previous.generation + 1;
  if v_previous.kind = 'asset' and public.recommendation_all_items_rejected(new.id) then return new; end if;
  insert into public.marison_outbound_dispatches(
    surat_id, environment, generation, replacement_of_dispatch_id, kind, endpoint,
    idempotency_key, status
  ) values (
    new.id, v_previous.environment, v_generation, v_previous.id, v_previous.kind, v_previous.endpoint,
    format('sigap:%s:%s:%s:g%s', v_previous.environment, v_previous.kind, new.id, v_generation),
    'pending'
  ) on conflict (surat_id, environment, generation) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_external_revision_dispatch on public.surat_registrasi;
create trigger trg_enqueue_external_revision_dispatch
after update of status on public.surat_registrasi
for each row execute function public.enqueue_external_revision_dispatch();

revoke all on function public.enqueue_external_revision_dispatch() from public, anon, authenticated;

create or replace function public.continue_external_revision_after_recommendation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_surat public.surat_registrasi%rowtype;
  v_first public.surat_signatures%rowtype;
  v_next_step integer;
begin
  if new.status <> 'awaiting_requester'
     or old.status is not distinct from new.status
     or coalesce((new.changes->>'external_submission_revision')::boolean, false) is not true
     or new.changes->>'recommendation_child_surat_id' is null then
    return new;
  end if;

  select * into v_surat from public.surat_registrasi where id = new.surat_id for update;
  if not found then return new; end if;

  update public.surat_revision_events
  set status = 'resolved', resolved_at = clock_timestamp(),
      changes = coalesce(changes, '{}'::jsonb) || jsonb_build_object(
        'recommendation_confirmed_at', clock_timestamp(),
        'parent_approval_restarted', true
      )
  where id = new.id;

  update public.surat_signatures
  set is_signed = false, signed_at = null, catatan = null, file_path_snap = null,
      pdf_path_snap = null, status = 'PENDING',
      available_at = case when step_order = 1 then clock_timestamp() else null end
  where surat_id = new.surat_id;

  select * into v_first from public.surat_signatures
  where surat_id = new.surat_id and step_order = 1
  order by id limit 1 for update;

  if found and v_first.user_id = v_surat.created_by
     and coalesce(v_first.action_type, 'approval') = 'approval'
     and coalesce(v_first.requires_unit_allocation, false) is false
     and coalesce(v_first.verification_required, false) is false then
    update public.surat_signatures
    set is_signed = true, signed_at = clock_timestamp(), status = 'APPROVED',
        catatan = 'Disetujui otomatis karena pemohon adalah penandatangan tahap pertama pada revisi.'
    where id = v_first.id;
    select min(step_order) into v_next_step from public.surat_signatures
    where surat_id = new.surat_id and step_order > 1;
    if v_next_step is not null then
      update public.surat_signatures set available_at = clock_timestamp()
      where surat_id = new.surat_id and step_order = v_next_step;
    end if;
  else
    v_next_step := 1;
  end if;

  delete from public.document_pdf_jobs where surat_id = new.surat_id and status <> 'processing';
  update public.surat_registrasi
  set status = 'PROSES', current_step = coalesce(v_next_step, 1), pdf_path = null,
      data_snapshot = jsonb_set(
        coalesce(data_snapshot, '{}'::jsonb) - 'revision',
        '{external_revision_current,parent_approval_restarted_at}',
        to_jsonb(clock_timestamp()),
        true
      ),
      updated_at = clock_timestamp()
  where id = new.surat_id;

  insert into public.notifications(user_id, type, title, message, data, link)
  select signature.user_id, 'warning', 'Approval revisi dimulai',
    'Rekomendasi revisi untuk ' || coalesce(v_surat.no_surat, 'pengajuan') || ' sudah selesai. Approval parent dimulai ulang.',
    jsonb_build_object('surat_id', new.surat_id, 'revision_event_id', new.id, 'event_type', 'external_revision_parent_approval_restarted'),
    '/surat/inbox'
  from public.surat_signatures signature
  where signature.surat_id = new.surat_id
    and signature.step_order = coalesce(v_next_step, 1)
    and signature.user_id is not null;

  return new;
end;
$$;

drop trigger if exists trg_continue_external_revision_after_recommendation on public.surat_revision_events;
create trigger trg_continue_external_revision_after_recommendation
after update of status, changes on public.surat_revision_events
for each row execute function public.continue_external_revision_after_recommendation();

revoke all on function public.continue_external_revision_after_recommendation() from public, anon, authenticated;

commit;
