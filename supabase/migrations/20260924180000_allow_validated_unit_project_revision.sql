-- Staging candidate: a returned Unit request may change its Marison project.
-- The letter identity stays fixed; a changed project invalidates old allocations.
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
  v_project_changed boolean;
  v_project_id text;
  v_project_code text;
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
    v_project_changed := coalesce(v_input->'requested_project', 'null'::jsonb)
      is distinct from coalesce(v_surat.form_input_data->'requested_project', 'null'::jsonb);
    if v_project_changed then
      v_project_id := v_input#>>'{requested_project,id}';
      v_project_code := v_input#>>'{requested_project,code}';
      if jsonb_typeof(v_input->'requested_project') <> 'object'
         or coalesce(v_project_id, '') !~ '^[0-9]{1,18}$'
         or nullif(btrim(coalesce(v_project_code, '')), '') is null then
        raise exception 'Proyek unit perbaikan belum terhubung ke Marison.' using errcode = '22023';
      end if;
      if not exists (
        select 1 from public.master_projects project
        where project.marison_project_id = v_project_id::bigint
          and project.code = v_project_code
          and project.marison_synced_at is not null
      ) then
        raise exception 'Proyek unit perbaikan belum terhubung ke Marison.' using errcode = '22023';
      end if;
    end if;
    v_input := (case when v_project_changed then
      coalesce(v_surat.form_input_data, '{}'::jsonb)
        - 'allocated_units' - 'allocated_unit_count' - 'unit_config_snapshot'
      else coalesce(v_surat.form_input_data, '{}'::jsonb) end)
      || jsonb_build_object(
        'requested_project', v_input->'requested_project',
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
