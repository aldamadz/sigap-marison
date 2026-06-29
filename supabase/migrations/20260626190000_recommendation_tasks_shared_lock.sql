create table if not exists public.surat_recommendation_tasks (
  id uuid primary key default gen_random_uuid(),
  parent_surat_id uuid not null unique references public.surat_registrasi(id) on delete cascade,
  submitted_surat_id uuid references public.surat_registrasi(id) on delete set null,
  reservation_id uuid not null unique references public.surat_reservations(id) on delete restrict,
  no_surat text not null,
  no_urut integer not null,
  entity_id uuid not null references public.master_entities(id) on delete restrict,
  office_id uuid not null references public.master_offices(id) on delete restrict,
  department_id uuid not null references public.master_departments(id) on delete restrict,
  letter_type_id uuid not null references public.master_letter_types(id) on delete restrict,
  form_id uuid not null references public.master_forms(id) on delete restrict,
  usage_id uuid not null references public.form_usages(id) on delete restrict,
  required_before_step integer not null default 3,
  status text not null default 'waiting' check (status in ('waiting', 'claimed', 'submitted', 'cancelled')),
  candidate_snapshot jsonb not null default '[]'::jsonb,
  claimed_by uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  submitted_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists surat_recommendation_tasks_status_created_idx
  on public.surat_recommendation_tasks(status, created_at);

create index if not exists surat_recommendation_tasks_claimed_by_idx
  on public.surat_recommendation_tasks(claimed_by)
  where claimed_by is not null;

create index if not exists surat_recommendation_tasks_candidate_snapshot_gin_idx
  on public.surat_recommendation_tasks using gin(candidate_snapshot);

create or replace function public.touch_surat_recommendation_task()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_surat_recommendation_task on public.surat_recommendation_tasks;
create trigger trg_touch_surat_recommendation_task
before update on public.surat_recommendation_tasks
for each row execute function public.touch_surat_recommendation_task();

alter table public.surat_recommendation_tasks enable row level security;

drop policy if exists surat_recommendation_tasks_select_access on public.surat_recommendation_tasks;
create policy surat_recommendation_tasks_select_access
on public.surat_recommendation_tasks
for select
to authenticated
using (
  claimed_by = (select auth.uid())
  or candidate_snapshot @> jsonb_build_array(jsonb_build_object('user_id', (select auth.uid())::text))
  or public.can_access_surat(parent_surat_id)
  or public.can_access_surat(submitted_surat_id)
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role::text in ('admin', 'super_admin')
      and coalesce(profile.is_active, true) = true
  )
);

create or replace function public.is_recommendation_task_candidate(
  p_task_id uuid,
  p_user_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.surat_recommendation_tasks task
    join public.form_usage_steps step
      on step.usage_id = task.usage_id
     and step.step_order = 1
    join public.form_usage_step_users candidate
      on candidate.usage_step_id = step.id
     and candidate.user_id = p_user_id
    join public.profiles profile
      on profile.id = candidate.user_id
     and coalesce(profile.is_active, true) = true
    where task.id = p_task_id
  );
$$;

create or replace function public.create_recommendation_task_for_parent(
  p_parent_surat_id uuid
)
returns public.surat_recommendation_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
  v_parent public.surat_registrasi;
  v_config jsonb;
  v_form_id uuid;
  v_usage_id uuid;
  v_department_id uuid;
  v_letter_type_id uuid;
  v_office_id uuid;
  v_no_urut integer;
  v_year integer := extract(year from now())::integer;
  v_reservation_id uuid;
  v_task public.surat_recommendation_tasks;
  v_entity_code text;
  v_dept_code text;
  v_type_index integer;
  v_month text;
  v_no_surat text;
  v_candidates jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    raise exception 'Sesi login tidak tersedia.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_parent_surat_id::text, 190001));

  select exists (
    select 1 from public.profiles profile
    where profile.id = v_actor
      and profile.role::text in ('admin', 'super_admin')
      and coalesce(profile.is_active, true) = true
  ) into v_is_admin;

  select *
  into v_parent
  from public.surat_registrasi
  where id = p_parent_surat_id
  for update;

  if not found then
    raise exception 'Surat induk tidak ditemukan.';
  end if;

  if not (
    v_parent.created_by = v_actor
    or v_parent.represented_by_admin = v_actor
    or v_is_admin
  ) then
    raise exception 'Anda tidak diizinkan membuat tugas rekomendasi.';
  end if;

  if lower(coalesce(v_parent.form_input_data->>'requires_recommendation', 'false')) <> 'true' then
    return null;
  end if;

  select *
  into v_task
  from public.surat_recommendation_tasks
  where parent_surat_id = p_parent_surat_id
    and status <> 'cancelled'
  limit 1;

  if found then
    return v_task;
  end if;

  v_config := coalesce(v_parent.policy_snapshot->'recommendation_config', '{}'::jsonb);
  v_form_id := nullif(v_config->>'form_id', '')::uuid;
  v_usage_id := nullif(v_config->>'usage_id', '')::uuid;
  v_department_id := nullif(v_config->>'department_id', '')::uuid;
  v_letter_type_id := nullif(v_config->>'letter_type_id', '')::uuid;

  if v_form_id is null or v_usage_id is null or v_department_id is null or v_letter_type_id is null then
    raise exception 'Konfigurasi rekomendasi aset belum lengkap.';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user_id', profile.id::text,
      'full_name', profile.full_name,
      'job_title', profile.job_title
    )
    order by profile.full_name
  ), '[]'::jsonb)
  into v_candidates
  from public.form_usage_steps step
  join public.form_usage_step_users candidate
    on candidate.usage_step_id = step.id
  join public.profiles profile
    on profile.id = candidate.user_id
  where step.usage_id = v_usage_id
    and step.step_order = 1
    and coalesce(profile.is_active, true) = true;

  if jsonb_array_length(v_candidates) = 0 then
    raise exception 'Kandidat pembuat rekomendasi belum dikonfigurasi.';
  end if;

  select case
    when office.kedudukan = 'Pusat' then office.id
    else (
      select pusat.id
      from public.master_offices pusat
      where pusat.kedudukan = 'Pusat'
      order by pusat.code nulls last, pusat.name
      limit 1
    )
  end
  into v_office_id
  from public.master_offices office
  where office.id = v_parent.office_id;

  if v_office_id is null then
    raise exception 'Kantor pusat untuk rekomendasi belum tersedia.';
  end if;

  v_no_urut := public.generate_new_letter_number(
    v_parent.entity_id,
    v_letter_type_id,
    v_office_id,
    null,
    null,
    v_department_id
  );

  select reservation.id
  into v_reservation_id
  from public.surat_reservations reservation
  where reservation.entity_id = v_parent.entity_id
    and reservation.dept_id = v_department_id
    and reservation.project_id is null
    and reservation.year = v_year
    and reservation.no_urut = v_no_urut
    and reservation.status = 'PENDING'
  order by reservation.created_at desc
  limit 1;

  if v_reservation_id is null then
    raise exception 'Reservation nomor rekomendasi gagal dibuat.';
  end if;

  select entity.code into v_entity_code
  from public.master_entities entity
  where entity.id = v_parent.entity_id;

  select department.code into v_dept_code
  from public.master_departments department
  where department.id = v_department_id;

  select sort_index into v_type_index
  from public.master_dept_letter_types
  where dept_id = v_department_id
    and letter_type_id = v_letter_type_id;

  v_month := (array['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'])[extract(month from now())::integer];
  v_no_surat := lpad(v_no_urut::text, 3, '0') || '/'
    || coalesce(v_entity_code, '??') || '/'
    || coalesce(v_dept_code, 'PBO') || '.'
    || coalesce(v_type_index, 0)::text || '/'
    || v_month || '/'
    || v_year::text;

  insert into public.surat_recommendation_tasks (
    parent_surat_id,
    reservation_id,
    no_surat,
    no_urut,
    entity_id,
    office_id,
    department_id,
    letter_type_id,
    form_id,
    usage_id,
    required_before_step,
    candidate_snapshot,
    created_by
  )
  values (
    p_parent_surat_id,
    v_reservation_id,
    v_no_surat,
    v_no_urut,
    v_parent.entity_id,
    v_office_id,
    v_department_id,
    v_letter_type_id,
    v_form_id,
    v_usage_id,
    greatest(1, coalesce(nullif(v_config->>'required_before_step', '')::integer, 3)),
    v_candidates,
    v_actor
  )
  returning * into v_task;

  return v_task;
end;
$$;

create or replace function public.maybe_create_recommendation_task_for_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.form_input_data->>'requires_recommendation', 'false')) = 'true' then
    perform public.create_recommendation_task_for_parent(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_create_recommendation_task_for_parent on public.surat_registrasi;
create trigger trg_create_recommendation_task_for_parent
after insert on public.surat_registrasi
for each row execute function public.maybe_create_recommendation_task_for_parent();

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
  v_is_admin boolean := false;
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
  where task.status in ('waiting', 'claimed')
    and (
      v_is_admin
      or task.claimed_by = v_actor
      or public.is_recommendation_task_candidate(task.id, v_actor)
    )
  order by task.created_at asc;
end;
$$;

create or replace function public.claim_recommendation_task(
  p_task_id uuid
)
returns public.surat_registration_drafts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_task public.surat_recommendation_tasks;
  v_parent public.surat_registrasi;
  v_draft public.surat_registration_drafts;
  v_step record;
  v_user_id uuid;
  v_eligible jsonb;
  v_signers jsonb := '[]'::jsonb;
  v_payload jsonb;
  v_claimer_name text;
begin
  if v_actor is null then
    raise exception 'Sesi login tidak tersedia.';
  end if;

  select *
  into v_task
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
      claimed_at = coalesce(claimed_at, now())
  where id = p_task_id
    and (claimed_by is null or claimed_by = v_actor)
  returning * into v_task;

  if v_task.id is null then
    raise exception 'Tugas rekomendasi gagal dikunci.';
  end if;

  update public.surat_reservations
  set reserved_by = v_actor,
      expires_at = now() + interval '7 days'
  where id = v_task.reservation_id
    and status = 'PENDING';

  select *
  into v_parent
  from public.surat_registrasi
  where id = v_task.parent_surat_id;

  for v_step in
    select *
    from public.form_usage_steps
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
      select candidate.user_id
      into v_user_id
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

  v_payload := jsonb_build_object(
    'formData', jsonb_build_object(
      'entity_id', v_task.entity_id,
      'dept_id', v_task.department_id,
      'letter_type_id', v_task.letter_type_id,
      'office_id', v_task.office_id,
      'project_id', '',
      'judul_surat', 'Rekomendasi ' || coalesce(v_parent.judul_surat, 'Permohonan Aset'),
      'penggunaan_id', '',
      'is_aset', false,
      'form_usage_id', v_task.usage_id,
      'request_place', coalesce(v_parent.request_place, ''),
      'request_date', to_char(current_date, 'YYYY-MM-DD'),
      'form_input_data', jsonb_build_object(
        'request_category', 'non_asset',
        'request_mode', 'barang',
        'linked_document_type', 'recommendation',
        'linked_parent_surat_id', v_task.parent_surat_id,
        'linked_parent_no_surat', coalesce(v_parent.no_surat, ''),
        'recommendation_parent_note', 'Rekomendasi untuk ' || coalesce(v_parent.no_surat, 'surat aset induk')
      )
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
    reservation_id,
    created_by,
    no_surat,
    payload,
    signer_assignments
  )
  values (
    v_task.reservation_id,
    v_actor,
    v_task.no_surat,
    v_payload,
    v_signers
  )
  on conflict (reservation_id) do update
  set created_by = excluded.created_by,
      no_surat = excluded.no_surat,
      payload = excluded.payload,
      signer_assignments = excluded.signer_assignments,
      status = 'DRAFT',
      expires_at = now() + interval '7 days',
      voided_at = null
  where public.surat_registration_drafts.created_by = v_actor
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

  if not exists (
    select 1
    from public.surat_registrasi child
    where child.id = p_child_surat_id
      and (child.created_by = v_actor or v_is_admin)
  ) then
    raise exception 'Surat rekomendasi tidak valid.';
  end if;

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
    and status = 'PENDING';

  update public.surat_recommendation_tasks
  set status = 'submitted',
      submitted_surat_id = p_child_surat_id,
      submitted_at = now()
  where id = p_task_id
  returning * into v_task;

  return v_task;
end;
$$;

revoke all on function public.is_recommendation_task_candidate(uuid, uuid) from public, anon;
revoke all on function public.create_recommendation_task_for_parent(uuid) from public, anon;
revoke all on function public.get_my_recommendation_tasks() from public, anon;
revoke all on function public.claim_recommendation_task(uuid) from public, anon;
revoke all on function public.complete_recommendation_task(uuid, uuid) from public, anon;
revoke all on function public.maybe_create_recommendation_task_for_parent() from public, anon, authenticated;
revoke all on function public.touch_surat_recommendation_task() from public, anon, authenticated;

grant execute on function public.create_recommendation_task_for_parent(uuid) to authenticated, service_role;
grant execute on function public.get_my_recommendation_tasks() to authenticated, service_role;
grant execute on function public.claim_recommendation_task(uuid) to authenticated, service_role;
grant execute on function public.complete_recommendation_task(uuid, uuid) to authenticated, service_role;
