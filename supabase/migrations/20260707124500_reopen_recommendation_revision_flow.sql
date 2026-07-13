alter table public.surat_recommendation_tasks
  drop constraint if exists surat_recommendation_tasks_status_check;

alter table public.surat_recommendation_tasks
  add constraint surat_recommendation_tasks_status_check
  check (status in ('waiting', 'claimed', 'submitted', 'revision_requested', 'cancelled'));

create or replace function public.reopen_recommendation_task_on_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.surat_recommendation_tasks;
  v_surat public.surat_registrasi%rowtype;
begin
  if new.target_type <> 'recommendation' then
    return new;
  end if;

  select *
  into v_task
  from public.surat_recommendation_tasks
  where parent_surat_id = new.surat_id
    and status <> 'cancelled'
  order by updated_at desc
  limit 1
  for update;

  if not found then
    return new;
  end if;

  update public.surat_recommendation_tasks
  set status = 'revision_requested',
      claimed_by = null,
      claimed_at = null,
      updated_at = now()
  where id = v_task.id;

  select *
  into v_surat
  from public.surat_registrasi
  where id = new.surat_id;

  insert into public.notifications (user_id, type, title, message, data, link)
  select distinct
    nullif(candidate->>'user_id', '')::uuid,
    'warning',
    'Rekomendasi Perlu Direvisi',
    'Rekomendasi untuk "' || coalesce(v_surat.judul_surat, '') || '" perlu diperbarui. Catatan: ' || coalesce(new.reason, ''),
    jsonb_build_object(
      'surat_id', new.surat_id,
      'recommendation_task_id', v_task.id,
      'revision_event_id', new.id,
      'event_type', 'recommendation_revision_requested'
    ),
    '/surat/rekomendasi'
  from jsonb_array_elements(coalesce(v_task.candidate_snapshot, '[]'::jsonb)) candidate
  where nullif(candidate->>'user_id', '') is not null
    and nullif(candidate->>'user_id', '')::uuid <> all(coalesce(new.target_user_ids, '{}'));

  return new;
end;
$$;

drop trigger if exists trg_reopen_recommendation_task_on_revision on public.surat_revision_events;
create trigger trg_reopen_recommendation_task_on_revision
after insert on public.surat_revision_events
for each row execute function public.reopen_recommendation_task_on_revision();

create or replace function public.get_my_recommendation_tasks()
returns table (
  id uuid,
  parent_surat_id uuid,
  submitted_surat_id uuid,
  no_surat text,
  status text,
  required_before_step integer,
  claimed_by uuid,
  claimed_by_name text,
  claimed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  candidate_snapshot jsonb,
  draft_id uuid,
  parent_no_surat text,
  parent_judul_surat text,
  parent_status text,
  parent_created_at timestamptz,
  parent_requester_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_pbo boolean := false;
begin
  if v_actor is null then
    raise exception 'Sesi login tidak tersedia.';
  end if;

  select exists (
    select 1
    from public.profiles profile
    left join public.master_departments department on department.id = profile.department_id
    where profile.id = v_actor
      and coalesce(profile.is_active, true) = true
      and (
        upper(coalesce(department.code, '')) = 'PBO'
        or lower(coalesce(department.name, '')) in ('pengembangan organisasi', 'po')
      )
  ) into v_is_pbo;

  if not v_is_pbo then
    return;
  end if;

  return query
  select
    task.id,
    task.parent_surat_id,
    task.submitted_surat_id,
    task.no_surat,
    task.status,
    task.required_before_step,
    task.claimed_by,
    claimer.full_name,
    task.claimed_at,
    task.created_at,
    task.updated_at,
    task.candidate_snapshot,
    draft.id,
    parent.no_surat,
    parent.judul_surat,
    parent.status,
    parent.created_at,
    creator.full_name
  from public.surat_recommendation_tasks task
  join public.surat_registrasi parent on parent.id = task.parent_surat_id
  left join public.profiles claimer on claimer.id = task.claimed_by
  left join public.profiles creator on creator.id = parent.created_by
  left join public.surat_registration_drafts draft
    on draft.reservation_id = task.reservation_id
   and draft.status = 'DRAFT'
  where task.status in ('waiting', 'claimed', 'revision_requested')
    and (
      task.claimed_by = v_actor
      or public.is_recommendation_task_candidate(task.id, v_actor)
    )
  order by
    case when task.status = 'revision_requested' then 0 else 1 end,
    task.created_at asc;
end;
$$;

create or replace function public.claim_recommendation_task(p_task_id uuid)
returns public.surat_registration_drafts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_task public.surat_recommendation_tasks;
  v_parent public.surat_registrasi;
  v_previous_child public.surat_registrasi;
  v_draft public.surat_registration_drafts;
  v_step record;
  v_user_id uuid;
  v_eligible jsonb;
  v_signers jsonb := '[]'::jsonb;
  v_payload jsonb;
  v_claimer_name text;
  v_previous_input jsonb := '{}'::jsonb;
  v_initial_input jsonb;
begin
  if v_actor is null then
    raise exception 'Sesi login tidak tersedia.';
  end if;

  select * into v_task
  from public.surat_recommendation_tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'Tugas rekomendasi tidak ditemukan.';
  end if;
  if v_task.status in ('submitted', 'cancelled') then
    raise exception 'Tugas rekomendasi sudah tidak aktif.';
  end if;
  if not public.is_recommendation_task_candidate(p_task_id, v_actor) then
    raise exception 'Anda bukan kandidat pembuat rekomendasi ini.';
  end if;
  if v_task.claimed_by is not null and v_task.claimed_by <> v_actor then
    select full_name into v_claimer_name from public.profiles where id = v_task.claimed_by;
    raise exception 'Tugas rekomendasi sedang dikerjakan oleh %.', coalesce(v_claimer_name, 'user lain');
  end if;

  update public.surat_recommendation_tasks
  set status = 'claimed',
      claimed_by = v_actor,
      claimed_at = now()
  where id = p_task_id and (claimed_by is null or claimed_by = v_actor)
  returning * into v_task;

  if v_task.id is null then
    raise exception 'Tugas rekomendasi gagal dikunci.';
  end if;

  update public.surat_reservations
  set reserved_by = v_actor, expires_at = now() + interval '7 days'
  where id = v_task.reservation_id and status in ('PENDING', 'USED');

  select * into v_parent
  from public.surat_registrasi
  where id = v_task.parent_surat_id;

  if v_task.submitted_surat_id is not null then
    select *
    into v_previous_child
    from public.surat_registrasi
    where id = v_task.submitted_surat_id;

    if found then
      v_previous_input := coalesce(v_previous_child.form_input_data, '{}'::jsonb);
    end if;
  end if;

  for v_step in
    select * from public.form_usage_steps
    where usage_id = v_task.usage_id
    order by step_order
  loop
    select coalesce(jsonb_agg(candidate.user_id::text order by profile.full_name), '[]'::jsonb)
    into v_eligible
    from public.form_usage_step_users candidate
    join public.profiles profile on profile.id = candidate.user_id
    where candidate.usage_step_id = v_step.id
      and coalesce(profile.is_active, true) = true;

    if v_step.step_order = 1 then
      v_user_id := v_actor;
    else
      select candidate.user_id into v_user_id
      from public.form_usage_step_users candidate
      join public.profiles profile on profile.id = candidate.user_id
      where candidate.usage_step_id = v_step.id
        and coalesce(profile.is_active, true) = true
      order by profile.full_name
      limit 1;
    end if;

    if v_user_id is null then
      raise exception 'Kandidat signer tahap % belum tersedia.', v_step.step_order;
    end if;

    v_signers := v_signers || jsonb_build_array(jsonb_build_object(
      'step_order', v_step.step_order,
      'role_name', v_step.role_name,
      'label_jabatan', coalesce(v_step.label, v_step.role_name),
      'user_id', v_user_id,
      'form_usage_step_id', v_step.id,
      'action_type', coalesce(v_step.action_type, 'approval'),
      'candidate_scope', coalesce(v_step.candidate_scope, 'head_office'),
      'eligible_user_ids', v_eligible,
      'verifier_user_ids', '[]'::jsonb,
      'attachment_requirements', '[]'::jsonb,
      'requires_unit_allocation', false
    ));
  end loop;

  v_initial_input := jsonb_build_object(
    'request_category', 'asset',
    'request_mode', 'barang',
    'linked_document_type', 'recommendation',
    'linked_parent_surat_id', v_task.parent_surat_id,
    'linked_parent_no_surat', coalesce(v_parent.no_surat, ''),
    'recommendation_parent_note', 'Rekomendasi untuk ' || coalesce(v_parent.no_surat, 'surat aset induk')
  );

  if jsonb_typeof(v_previous_input->'recommendation_items') = 'array' then
    v_initial_input := v_initial_input || jsonb_build_object(
      'recommendation_items', v_previous_input->'recommendation_items',
      'catatan', coalesce(v_previous_input->'catatan', '""'::jsonb),
      'revision_source_surat_id', v_task.submitted_surat_id
    );
  end if;

  v_payload := jsonb_build_object(
    'formData', jsonb_build_object(
      'entity_id', v_task.entity_id,
      'dept_id', v_task.department_id,
      'letter_type_id', v_task.letter_type_id,
      'office_id', v_task.office_id,
      'project_id', '',
      'judul_surat', coalesce(nullif(v_previous_child.judul_surat, ''), 'Rekomendasi Peremajaan Alat'),
      'penggunaan_id', '',
      'is_aset', true,
      'form_usage_id', v_task.usage_id,
      'request_place', coalesce(v_parent.request_place, ''),
      'request_date', to_char(current_date, 'YYYY-MM-DD'),
      'form_input_data', v_initial_input
    ),
    'selectedFormId', v_task.form_id,
    'selectedUsageId', v_task.usage_id,
    'linkedDocumentContext', jsonb_build_object(
      'type', 'recommendation',
      'parentSuratId', v_task.parent_surat_id,
      'parentNoSurat', coalesce(v_parent.no_surat, ''),
      'requiredBeforeStep', v_task.required_before_step,
      'formId', v_task.form_id,
      'usageId', v_task.usage_id,
      'departmentId', v_task.department_id,
      'letterTypeId', v_task.letter_type_id,
      'taskId', v_task.id
    )
  );

  insert into public.surat_registration_drafts (
    reservation_id, created_by, no_surat, payload, signer_assignments
  )
  values (v_task.reservation_id, v_actor, v_task.no_surat, v_payload, v_signers)
  on conflict (reservation_id) do update
  set created_by = excluded.created_by,
      no_surat = excluded.no_surat,
      payload = excluded.payload,
      signer_assignments = excluded.signer_assignments,
      status = 'DRAFT',
      submitted_at = null,
      expires_at = now() + interval '7 days',
      voided_at = null
  where public.surat_registration_drafts.status <> 'DRAFT'
     or public.surat_registration_drafts.created_by = v_actor
     or public.surat_registration_drafts.created_by is null
  returning * into v_draft;

  if v_draft.id is null then
    raise exception 'Draft rekomendasi sedang dikunci user lain.';
  end if;

  return v_draft;
end;
$$;

create or replace function public.complete_recommendation_task(
  p_task_id uuid,
  p_child_surat_id uuid
)
returns public.surat_recommendation_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
  v_task public.surat_recommendation_tasks;
  v_child public.surat_registrasi%rowtype;
  v_items jsonb := '[]'::jsonb;
  v_not_recommended_count integer := 0;
begin
  if v_actor is null then
    raise exception 'Sesi login tidak tersedia.';
  end if;

  select exists (
    select 1 from public.profiles profile
    where profile.id = v_actor
      and profile.role::text in ('admin', 'super_admin')
      and coalesce(profile.is_active, true) = true
  ) into v_is_admin;

  select *
  into v_task
  from public.surat_recommendation_tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'Tugas rekomendasi tidak ditemukan.';
  end if;

  if not (v_task.claimed_by = v_actor or v_is_admin) then
    raise exception 'Tugas rekomendasi dikunci user lain.';
  end if;

  select *
  into v_child
  from public.surat_registrasi child
  where child.id = p_child_surat_id
    and (child.created_by = v_actor or v_is_admin);

  if not found then
    raise exception 'Surat rekomendasi tidak valid.';
  end if;

  v_items := coalesce(v_child.form_input_data->'recommendation_items', '[]'::jsonb);
  if jsonb_typeof(v_items) <> 'array' then
    v_items := '[]'::jsonb;
  end if;

  select count(*)
  into v_not_recommended_count
  from jsonb_array_elements(v_items) item
  where item->>'recommendation_action' = 'tidak_direkomendasikan'
     or coalesce((nullif(item->>'is_recommended', ''))::boolean, true) = false;

  update public.surat_linked_documents
  set status = 'cancelled',
      updated_at = now()
  where parent_surat_id = v_task.parent_surat_id
    and link_type = 'recommendation'
    and status = 'active'
    and child_surat_id <> p_child_surat_id;

  insert into public.surat_linked_documents (
    parent_surat_id,
    child_surat_id,
    link_type,
    required_before_step,
    created_by
  )
  values (
    v_task.parent_surat_id,
    p_child_surat_id,
    'recommendation',
    v_task.required_before_step,
    v_actor
  )
  on conflict (parent_surat_id, child_surat_id, link_type)
  do update set
    status = 'active',
    required_before_step = excluded.required_before_step,
    updated_at = now();

  update public.surat_reservations
  set status = 'USED',
      reserved_by = coalesce(reserved_by, v_actor)
  where id = v_task.reservation_id
    and status in ('PENDING', 'USED');

  update public.surat_recommendation_tasks
  set status = 'submitted',
      submitted_surat_id = p_child_surat_id,
      submitted_at = now()
  where id = p_task_id
  returning * into v_task;

  update public.surat_registrasi
  set data_snapshot = jsonb_set(
        jsonb_set(
          coalesce(data_snapshot, '{}'::jsonb),
          '{recommendation}',
          jsonb_build_object(
            'task_id', p_task_id,
            'child_surat_id', p_child_surat_id,
            'items', v_items,
            'submitted_at', now(),
            'not_recommended_count', v_not_recommended_count
          ),
          true
        ),
        '{recommendation_decisions}',
        v_items,
        true
      ),
      updated_at = now()
  where id = v_task.parent_surat_id;

  return v_task;
end;
$$;

create or replace function public.finalize_recommendation_revision_if_needed(
  p_child_surat_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_child public.surat_registrasi%rowtype;
  v_task public.surat_recommendation_tasks;
  v_parent public.surat_registrasi%rowtype;
  v_event public.surat_revision_events%rowtype;
  v_parent_creator uuid;
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi';
  end if;

  select *
  into v_child
  from public.surat_registrasi
  where id = p_child_surat_id;

  if not found or v_child.status <> 'SELESAI' then
    return false;
  end if;

  select *
  into v_task
  from public.surat_recommendation_tasks
  where submitted_surat_id = p_child_surat_id
    and status = 'submitted'
  order by updated_at desc
  limit 1;

  if not found then
    return false;
  end if;

  select *
  into v_parent
  from public.surat_registrasi
  where id = v_task.parent_surat_id
  for update;

  if not found then
    return false;
  end if;

  select *
  into v_event
  from public.surat_revision_events
  where surat_id = v_parent.id
    and target_type = 'recommendation'
    and status = 'open'
  order by created_at desc
  limit 1
  for update;

  if not found then
    return true;
  end if;

  v_parent_creator := v_parent.created_by;

  update public.surat_revision_events
  set status = 'awaiting_requester',
      target_type = 'requester',
      target_user_ids = array[v_parent_creator],
      changes = coalesce(changes, '{}'::jsonb) || jsonb_build_object(
        'resolution_note', 'Rekomendasi revisi sudah selesai dan ditandatangani ulang.',
        'resolved_by_worker', v_actor,
        'resolved_by_worker_at', now(),
        'recommendation_child_surat_id', p_child_surat_id
      )
  where id = v_event.id;

  update public.surat_registrasi
  set data_snapshot = jsonb_set(
        coalesce(data_snapshot, '{}'::jsonb),
        '{revision}',
        jsonb_build_object(
          'event_id', v_event.id,
          'target_type', 'requester',
          'target_user_ids', array[v_parent_creator],
          'from_step', v_event.from_step,
          'target_step', v_event.target_step,
          'reason', v_event.reason,
          'changes', coalesce(v_event.changes, '{}'::jsonb) || jsonb_build_object(
            'resolution_note', 'Rekomendasi revisi sudah selesai dan ditandatangani ulang.',
            'resolved_by_worker', v_actor,
            'resolved_by_worker_at', now(),
            'recommendation_child_surat_id', p_child_surat_id
          ),
          'awaiting_requester_acceptance', true,
          'created_at', v_event.created_at
        ),
        true
      ),
      updated_at = now()
  where id = v_parent.id;

  insert into public.notifications (user_id, type, title, message, data, link)
  select
    v_parent_creator,
    'warning',
    'Rekomendasi Revisi Selesai',
    'Rekomendasi revisi untuk "' || coalesce(v_parent.judul_surat, '') || '" sudah selesai. Silakan lanjutkan atau batalkan pengajuan.',
    jsonb_build_object(
      'surat_id', v_parent.id,
      'recommendation_task_id', v_task.id,
      'recommendation_child_surat_id', p_child_surat_id,
      'revision_event_id', v_event.id,
      'event_type', 'recommendation_revision_waiting_requester'
    ),
    '/surat/monitoring'
  where v_parent_creator is not null;

  return true;
end;
$$;

revoke all on function public.reopen_recommendation_task_on_revision() from public, anon, authenticated;
revoke all on function public.get_my_recommendation_tasks() from public, anon;
revoke all on function public.claim_recommendation_task(uuid) from public, anon;
revoke all on function public.complete_recommendation_task(uuid, uuid) from public, anon;
revoke all on function public.finalize_recommendation_revision_if_needed(uuid) from public, anon;

grant execute on function public.get_my_recommendation_tasks() to authenticated, service_role;
grant execute on function public.claim_recommendation_task(uuid) to authenticated, service_role;
grant execute on function public.complete_recommendation_task(uuid, uuid) to authenticated, service_role;
grant execute on function public.finalize_recommendation_revision_if_needed(uuid) to authenticated, service_role;
