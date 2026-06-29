alter table public.form_usage_steps
  add column if not exists candidate_scope text not null default 'manual';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'form_usage_steps_candidate_scope_check'
      and conrelid = 'public.form_usage_steps'::regclass
  ) then
    alter table public.form_usage_steps
      add constraint form_usage_steps_candidate_scope_check
      check (candidate_scope in ('manual', 'request_office', 'head_office', 'all_offices'));
  end if;
end;
$$;

create or replace function public.save_form_usage_config(
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
set search_path = public
as $$
declare
  v_usage_id uuid;
  v_department_id uuid;
  v_step jsonb;
  v_attachment jsonb;
  v_verifier jsonb;
  v_step_id uuid;
  v_step_map jsonb := '{}'::jsonb;
  v_user_id uuid;
  v_stage_order integer;
  v_usage_step_id uuid;
  v_step_orders integer[] := array[]::integer[];
begin
  if not public.is_current_user_admin() then
    raise exception 'Akses ditolak: hanya admin'
      using errcode = '42501';
  end if;

  if p_usage_id is null then
    insert into public.form_usages (
      name,
      description,
      form_id,
      route_id,
      request_category,
      scope_type,
      status,
      sort_order,
      updated_at,
      created_by
    )
    values (
      nullif(trim(p_payload->>'name'), ''),
      nullif(trim(p_payload->>'description'), ''),
      nullif(p_payload->>'form_id', '')::uuid,
      nullif(p_payload->>'route_id', '')::uuid,
      coalesce(nullif(p_payload->>'request_category', ''), 'non_unit'),
      coalesce(nullif(p_payload->>'scope_type', ''), 'all'),
      coalesce(nullif(p_payload->>'status', ''), 'draft'),
      coalesce((p_payload->>'sort_order')::integer, 0),
      now(),
      auth.uid()
    )
    returning id into v_usage_id;
  else
    update public.form_usages
    set
      name = nullif(trim(p_payload->>'name'), ''),
      description = nullif(trim(p_payload->>'description'), ''),
      form_id = nullif(p_payload->>'form_id', '')::uuid,
      route_id = nullif(p_payload->>'route_id', '')::uuid,
      request_category = coalesce(nullif(p_payload->>'request_category', ''), request_category),
      scope_type = coalesce(nullif(p_payload->>'scope_type', ''), scope_type),
      status = coalesce(nullif(p_payload->>'status', ''), status),
      sort_order = coalesce((p_payload->>'sort_order')::integer, sort_order),
      updated_at = now()
    where id = p_usage_id
    returning id into v_usage_id;

    if v_usage_id is null then
      raise exception 'Kegunaan form tidak ditemukan'
        using errcode = 'P0002';
    end if;
  end if;

  delete from public.form_usage_attachment_requirements where usage_id = v_usage_id;
  delete from public.form_usage_departments where usage_id = v_usage_id;

  if p_department_ids is not null then
    foreach v_department_id in array p_department_ids
    loop
      if v_department_id is not null then
        insert into public.form_usage_departments (usage_id, department_id)
        values (v_usage_id, v_department_id);
      end if;
    end loop;
  end if;

  for v_step in select * from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb))
  loop
    v_step_orders := array_append(v_step_orders, (v_step->>'step_order')::integer);

    select id into v_step_id
    from public.form_usage_steps
    where usage_id = v_usage_id
      and step_order = (v_step->>'step_order')::integer;

    if v_step_id is null then
      insert into public.form_usage_steps (
        usage_id,
        step_order,
        role_name,
        label,
        signer_department_id,
        action_type,
        candidate_scope
      )
      values (
        v_usage_id,
        (v_step->>'step_order')::integer,
        coalesce(nullif(v_step->>'role_name', ''), 'memeriksa'),
        nullif(trim(v_step->>'label'), ''),
        nullif(v_step->>'signer_department_id', '')::uuid,
        coalesce(nullif(v_step->>'action_type', ''), 'approval'),
        coalesce(nullif(v_step->>'candidate_scope', ''), 'manual')
      )
      returning id into v_step_id;
    else
      update public.form_usage_steps
      set
        role_name = coalesce(nullif(v_step->>'role_name', ''), role_name),
        label = coalesce(nullif(trim(v_step->>'label'), ''), label),
        signer_department_id = nullif(v_step->>'signer_department_id', '')::uuid,
        action_type = coalesce(nullif(v_step->>'action_type', ''), action_type),
        candidate_scope = coalesce(nullif(v_step->>'candidate_scope', ''), candidate_scope)
      where id = v_step_id;
    end if;

    delete from public.form_usage_step_users where usage_step_id = v_step_id;
    delete from public.form_usage_step_verifiers where usage_step_id = v_step_id;

    v_step_map := jsonb_set(
      v_step_map,
      array[(v_step->>'step_order')],
      to_jsonb(v_step_id::text),
      true
    );

    for v_user_id in
      select value::uuid
      from jsonb_array_elements_text(coalesce(v_step->'eligible_user_ids', '[]'::jsonb)) as value
    loop
      insert into public.form_usage_step_users (usage_step_id, user_id)
      values (v_step_id, v_user_id);
    end loop;

    for v_user_id in
      select value::uuid
      from jsonb_array_elements_text(coalesce(v_step->'verifier_user_ids', '[]'::jsonb)) as value
    loop
      insert into public.form_usage_step_verifiers (usage_step_id, user_id)
      values (v_step_id, v_user_id)
      on conflict do nothing;
    end loop;
  end loop;

  for v_verifier in select * from jsonb_array_elements(coalesce(p_verifiers, '[]'::jsonb))
  loop
    v_usage_step_id := nullif(v_step_map->>(v_verifier->>'step_order'), '')::uuid;
    if v_usage_step_id is not null then
      for v_user_id in
        select value::uuid
        from jsonb_array_elements_text(coalesce(v_verifier->'user_ids', '[]'::jsonb)) as value
      loop
        insert into public.form_usage_step_verifiers (usage_step_id, user_id)
        values (v_usage_step_id, v_user_id)
        on conflict do nothing;
      end loop;
    end if;
  end loop;

  delete from public.form_usage_step_users
  where usage_step_id in (
    select step.id
    from public.form_usage_steps step
    where step.usage_id = v_usage_id
      and not (step.step_order = any(v_step_orders))
      and not exists (
        select 1
        from public.surat_signatures signature
        where signature.form_usage_step_id = step.id
      )
  );

  delete from public.form_usage_step_verifiers
  where usage_step_id in (
    select step.id
    from public.form_usage_steps step
    where step.usage_id = v_usage_id
      and not (step.step_order = any(v_step_orders))
      and not exists (
        select 1
        from public.surat_signatures signature
        where signature.form_usage_step_id = step.id
      )
  );

  delete from public.form_usage_steps step
  where step.usage_id = v_usage_id
    and not (step.step_order = any(v_step_orders))
    and not exists (
      select 1
      from public.surat_signatures signature
      where signature.form_usage_step_id = step.id
    );

  for v_attachment in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb))
  loop
    v_stage_order := coalesce((v_attachment->>'stage_order')::integer, 0);
    v_usage_step_id := case
      when v_stage_order = 0 then null
      else nullif(v_step_map->>v_stage_order::text, '')::uuid
    end;

    insert into public.form_usage_attachment_requirements (
      usage_id,
      usage_step_id,
      stage_order,
      requirement_key,
      label,
      is_required,
      allow_multiple,
      min_files,
      max_files,
      allowed_types,
      max_size_bytes,
      sort_order
    )
    values (
      v_usage_id,
      v_usage_step_id,
      v_stage_order,
      nullif(trim(v_attachment->>'requirement_key'), ''),
      nullif(trim(v_attachment->>'label'), ''),
      coalesce((v_attachment->>'is_required')::boolean, true),
      coalesce((v_attachment->>'allow_multiple')::boolean, false),
      coalesce((v_attachment->>'min_files')::integer, 1),
      coalesce((v_attachment->>'max_files')::integer, 1),
      coalesce(array(select jsonb_array_elements_text(v_attachment->'allowed_types')), array[]::text[]),
      nullif(v_attachment->>'max_size_bytes', '')::bigint,
      coalesce((v_attachment->>'sort_order')::integer, 0)
    );
  end loop;

  return v_usage_id;
end;
$$;

create or replace function public.validate_form_usage_signature()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage_id uuid;
  v_usage_scope text := 'all';
  v_registration_office_id uuid;
  v_step public.form_usage_steps;
  v_verifiers jsonb := '[]'::jsonb;
begin
  select registration.form_usage_id, registration.office_id, coalesce(usage.scope_type, 'all')
  into v_usage_id, v_registration_office_id, v_usage_scope
  from public.surat_registrasi as registration
  left join public.form_usages usage on usage.id = registration.form_usage_id
  where registration.id = new.surat_id;

  if v_usage_id is null then
    return new;
  end if;

  if new.form_usage_step_id is null then
    raise exception 'Tahap kegunaan form wajib disimpan pada signer.';
  end if;

  select * into v_step
  from public.form_usage_steps
  where id = new.form_usage_step_id
    and usage_id = v_usage_id;

  if not found then
    raise exception 'Tahap signer tidak sesuai kegunaan form.';
  end if;

  if not exists (
    select 1
    from public.form_usage_step_users as candidate
    join public.profiles profile on profile.id = candidate.user_id
    left join public.master_offices office on office.id = profile.office_id
    where candidate.usage_step_id = v_step.id
      and candidate.user_id = new.user_id
      and (
        coalesce(v_step.candidate_scope, 'manual') in ('manual', 'all_offices')
        or (v_step.candidate_scope = 'request_office' and profile.office_id = v_registration_office_id)
        or (v_step.candidate_scope = 'head_office' and lower(coalesce(office.kedudukan, '')) = 'pusat')
      )
  ) then
    raise exception 'User bukan kandidat signer pada tahap ini.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', verifier.user_id,
    'full_name', profile.full_name,
    'job_title', profile.job_title,
    'office_id', profile.office_id
  ) order by profile.full_name), '[]'::jsonb)
  into v_verifiers
  from public.form_usage_step_verifiers verifier
  left join public.profiles profile on profile.id = verifier.user_id
  where verifier.usage_step_id = v_step.id
    and (
      v_usage_scope <> 'cabang'
      or profile.office_id = v_registration_office_id
    );

  new.step_order := v_step.step_order;
  new.role_name := v_step.role_name;
  new.label_jabatan := v_step.label;
  new.action_type := v_step.action_type;
  new.requires_unit_allocation := v_step.action_type = 'unit_allocation';
  new.verifier_snapshot := v_verifiers;
  new.verification_required := jsonb_array_length(v_verifiers) > 0;
  if new.verification_required then
    new.verification_status := coalesce(nullif(new.verification_status, 'not_required'), 'pending');
    if new.verification_status = 'not_required' then
      new.verification_status := 'pending';
    end if;
  else
    new.verification_status := 'not_required';
    new.verified_at := null;
    new.verified_by := null;
    new.verification_note := null;
  end if;

  return new;
end;
$$;

do $$
declare
  v_form_id uuid;
  v_marketing_usage_id uuid;
  v_teknik_usage_id uuid;
  v_dept_marketing_cabang uuid;
  v_dept_teknik_cabang uuid;
  v_dept_bm uuid;
  v_dept_direksi uuid;
  v_dept_cabang uuid;
  v_step_id uuid;
begin
  select id into v_form_id
  from public.master_forms
  where nama_form ilike '%FORM PERMINTAAN BARANG%JASA%'
  order by created_at desc nulls last
  limit 1;

  select id into v_dept_marketing_cabang from public.master_departments where name = 'Marketing (Cabang)' limit 1;
  select id into v_dept_teknik_cabang from public.master_departments where name = 'Teknik (Cabang)' limit 1;
  select id into v_dept_bm from public.master_departments where name = 'Branch Manager' limit 1;
  select id into v_dept_direksi from public.master_departments where name = 'Direksi' limit 1;
  select id into v_dept_cabang from public.master_departments where name = 'Cabang' limit 1;

  if v_form_id is null then
    raise notice 'Form PGD tidak ditemukan. Seed kegunaan cabang dilewati.';
    return;
  end if;

  select id into v_marketing_usage_id
  from public.form_usages
  where name = 'Permohonan Marketing Cabang'
  limit 1;

  if v_marketing_usage_id is null then
    insert into public.form_usages (name, description, form_id, request_category, scope_type, status, sort_order, updated_at)
    values (
      'Permohonan Marketing Cabang',
      'Kegunaan PGD untuk kebutuhan promosi, iklan, sponsorship, souvenir, pameran, dan perlengkapan marketing cabang.',
      v_form_id,
      'non_asset',
      'cabang',
      'active',
      210,
      now()
    )
    returning id into v_marketing_usage_id;
  else
    update public.form_usages
    set description = 'Kegunaan PGD untuk kebutuhan promosi, iklan, sponsorship, souvenir, pameran, dan perlengkapan marketing cabang.',
        form_id = v_form_id,
        request_category = 'non_asset',
        scope_type = 'cabang',
        status = 'active',
        sort_order = 210,
        updated_at = now()
    where id = v_marketing_usage_id;
  end if;

  delete from public.form_usage_departments where usage_id = v_marketing_usage_id;
  insert into public.form_usage_departments (usage_id, department_id)
  select v_marketing_usage_id, department_id
  from (values (v_dept_marketing_cabang), (v_dept_cabang)) as allowed(department_id)
  where department_id is not null;

  delete from public.form_usage_steps where usage_id = v_marketing_usage_id;

  insert into public.form_usage_steps (usage_id, step_order, role_name, label, signer_department_id, action_type, candidate_scope)
  values
    (v_marketing_usage_id, 1, 'membuat', 'Spv. Marketing', v_dept_marketing_cabang, 'approval', 'request_office'),
    (v_marketing_usage_id, 2, 'memeriksa', 'Branch Manager', v_dept_bm, 'approval', 'request_office'),
    (v_marketing_usage_id, 3, 'memeriksa', 'Mgr. Marketing', v_dept_marketing_cabang, 'approval', 'head_office'),
    (v_marketing_usage_id, 4, 'menyetujui', 'Direktur Utama', v_dept_direksi, 'approval', 'head_office');

  for v_step_id in
    select id from public.form_usage_steps where usage_id = v_marketing_usage_id and step_order = 1
  loop
    insert into public.form_usage_step_users (usage_step_id, user_id)
    select v_step_id, id from public.profiles
    where coalesce(is_active, true) = true
      and lower(coalesce(job_title, '')) = 'supervisor marketing'
      and department_id = v_dept_marketing_cabang;
  end loop;

  for v_step_id in
    select id from public.form_usage_steps where usage_id = v_marketing_usage_id and step_order = 2
  loop
    insert into public.form_usage_step_users (usage_step_id, user_id)
    select v_step_id, id from public.profiles
    where coalesce(is_active, true) = true
      and lower(coalesce(job_title, '')) = 'branch manager'
      and department_id = v_dept_bm;
  end loop;

  for v_step_id in
    select id from public.form_usage_steps where usage_id = v_marketing_usage_id and step_order = 3
  loop
    insert into public.form_usage_step_users (usage_step_id, user_id)
    select v_step_id, id from public.profiles
    where coalesce(is_active, true) = true
      and lower(coalesce(job_title, '')) = 'manager marketing'
      and department_id = v_dept_marketing_cabang;
  end loop;

  for v_step_id in
    select id from public.form_usage_steps where usage_id = v_marketing_usage_id and step_order = 4
  loop
    insert into public.form_usage_step_users (usage_step_id, user_id)
    select v_step_id, id from public.profiles
    where coalesce(is_active, true) = true
      and lower(coalesce(job_title, '')) = 'direktur utama'
      and department_id = v_dept_direksi;
  end loop;

  select id into v_teknik_usage_id
  from public.form_usages
  where name = 'Permohonan Teknik Cabang'
  limit 1;

  if v_teknik_usage_id is null then
    insert into public.form_usages (name, description, form_id, request_category, scope_type, status, sort_order, updated_at)
    values (
      'Permohonan Teknik Cabang',
      'Kegunaan PGD untuk pekerjaan proyek cabang seperti SPK, infrastruktur, perbaikan, material, tenaga, dan kawasan.',
      v_form_id,
      'non_asset',
      'cabang',
      'active',
      211,
      now()
    )
    returning id into v_teknik_usage_id;
  else
    update public.form_usages
    set description = 'Kegunaan PGD untuk pekerjaan proyek cabang seperti SPK, infrastruktur, perbaikan, material, tenaga, dan kawasan.',
        form_id = v_form_id,
        request_category = 'non_asset',
        scope_type = 'cabang',
        status = 'active',
        sort_order = 211,
        updated_at = now()
    where id = v_teknik_usage_id;
  end if;

  delete from public.form_usage_departments where usage_id = v_teknik_usage_id;
  insert into public.form_usage_departments (usage_id, department_id)
  select v_teknik_usage_id, department_id
  from (values (v_dept_teknik_cabang), (v_dept_cabang)) as allowed(department_id)
  where department_id is not null;

  delete from public.form_usage_steps where usage_id = v_teknik_usage_id;

  insert into public.form_usage_steps (usage_id, step_order, role_name, label, signer_department_id, action_type, candidate_scope)
  values
    (v_teknik_usage_id, 1, 'membuat', 'Spv. Teknik', v_dept_teknik_cabang, 'approval', 'request_office'),
    (v_teknik_usage_id, 2, 'memeriksa', 'Branch Manager', v_dept_bm, 'approval', 'request_office'),
    (v_teknik_usage_id, 3, 'memeriksa', 'Mgr. Marketing', v_dept_marketing_cabang, 'approval', 'head_office'),
    (v_teknik_usage_id, 4, 'menyetujui', 'Direktur Utama', v_dept_direksi, 'approval', 'head_office');

  for v_step_id in
    select id from public.form_usage_steps where usage_id = v_teknik_usage_id and step_order = 1
  loop
    insert into public.form_usage_step_users (usage_step_id, user_id)
    select v_step_id, id from public.profiles
    where coalesce(is_active, true) = true
      and lower(coalesce(job_title, '')) = 'supervisor teknik'
      and department_id = v_dept_teknik_cabang;
  end loop;

  for v_step_id in
    select id from public.form_usage_steps where usage_id = v_teknik_usage_id and step_order = 2
  loop
    insert into public.form_usage_step_users (usage_step_id, user_id)
    select v_step_id, id from public.profiles
    where coalesce(is_active, true) = true
      and lower(coalesce(job_title, '')) = 'branch manager'
      and department_id = v_dept_bm;
  end loop;

  for v_step_id in
    select id from public.form_usage_steps where usage_id = v_teknik_usage_id and step_order = 3
  loop
    insert into public.form_usage_step_users (usage_step_id, user_id)
    select v_step_id, id from public.profiles
    where coalesce(is_active, true) = true
      and lower(coalesce(job_title, '')) = 'manager marketing'
      and department_id = v_dept_marketing_cabang;
  end loop;

  for v_step_id in
    select id from public.form_usage_steps where usage_id = v_teknik_usage_id and step_order = 4
  loop
    insert into public.form_usage_step_users (usage_step_id, user_id)
    select v_step_id, id from public.profiles
    where coalesce(is_active, true) = true
      and lower(coalesce(job_title, '')) = 'direktur utama'
      and department_id = v_dept_direksi;
  end loop;
end;
$$;

revoke all on function public.save_form_usage_config(uuid, jsonb, uuid[], jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_form_usage_config(uuid, jsonb, uuid[], jsonb, jsonb, jsonb) to authenticated, service_role;

revoke all on function public.validate_form_usage_signature() from public, anon, authenticated;
grant execute on function public.validate_form_usage_signature() to service_role;
