begin;

-- Staging-only fixture: single-account test clones for all canonical Form PGD usages.
-- STAGING ONLY. Do not promote to production. Do not apply removal now.
-- Tester: system.tuyemaris@gmail.com (admin, Pusat, PBO, external employee 17, branch 1).
-- Clones use prefix [UJI STAGING], same Form/category/scope/department-auth/input/attachment/
-- recommendation/external-revision/route targets as canonical. Candidate scope is
-- relaxed to manual/all_offices so one tester resolves every select/verifier slot;
-- action_type, order, input_schema, attachments, and scope_type are preserved.
-- Canonical workflows are never updated or archived here.

do $$
declare
  v_tester_id uuid;
  v_tester_dept uuid;
  v_tester_office uuid;
  v_has_fn boolean;
  v_fn_ok boolean;
  v_source record;
  v_clone_id uuid;
  v_clone_name text;
  v_rec_clone_id uuid;
  v_step record;
  v_new_step_id uuid;
  v_src_step_id uuid;
  v_count integer;
begin
  -- 1. Resolve tester by email (no fake external ID, no remap, no password change).
  select p.id, p.department_id, p.office_id
    into v_tester_id, v_tester_dept, v_tester_office
  from public.profiles p
  where p.email = 'system.tuyemaris@gmail.com'
    and p.role::text = 'admin'
    and p.is_active is true
    and p.deleted_at is null
  limit 1;

  if v_tester_id is null then
    raise exception 'BLOCKED: tester system.tuyemaris@gmail.com tidak memenuhi role admin aktif (role/admin/is_active/deleted_at).';
  end if;
  if v_tester_dept is null or v_tester_office is null then
    raise exception 'BLOCKED: tester tidak memiliki department/office valid.';
  end if;
  if not exists (
    select 1 from public.master_departments d where d.id = v_tester_dept
  ) then
    raise exception 'BLOCKED: department tester tidak valid.';
  end if;
  if not exists (
    select 1 from public.master_offices o
    where o.id = v_tester_office
      and o.marison_branch_id > 0
      and o.marison_synced_at is not null
  ) then
    raise exception 'BLOCKED: office/branch mapping tester tidak valid.';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_tester_id
      and p.deleted_at is null and p.is_active
      and p.marison_employee_id > 0
      and nullif(btrim(p.nik), '') is not null
      and p.marison_synced_at is not null
  ) then
    raise exception 'BLOCKED: requester external identity tester tidak valid (nik/employee/sync).';
  end if;

  -- Same readiness function as runtime when available.
  select exists (
    select 1 from pg_proc
    where proname = 'marison_payload_profile_source_valid'
      and pg_function_is_visible(oid)
  ) into v_has_fn;
  if v_has_fn then
    execute 'select public.marison_payload_profile_source_valid($1)'
      into v_fn_ok using v_tester_id;
    if v_fn_ok is not true then
      raise exception 'BLOCKED: marison_payload_profile_source_valid(tester) = false.';
    end if;
    execute 'select public.marison_payload_office_source_valid($1)'
      into v_fn_ok using v_tester_office;
    if v_fn_ok is not true then
      raise exception 'BLOCKED: marison_payload_office_source_valid(tester office) = false.';
    end if;
  end if;

  -- At least one project valid for flows needing projects (read-only check).
  if not exists (
    select 1 from public.master_projects pr
    join public.master_offices o on o.id = pr.office_id
    where pr.marison_project_id > 0 and pr.marison_synced_at is not null
      and o.marison_branch_id > 0 and o.marison_synced_at is not null
  ) then
    raise exception 'BLOCKED: tidak ada project mapping valid untuk flow proyek.';
  end if;

  -- 2. Canonical inventory must be exactly 8 + 1 template.
  select count(*) into v_count from public.form_usages
  where status = 'active' and is_system_template is false
    and name in (
      'SPK Unit - Kantor Pusat',
      'Pengajuan Aset - Kantor Pusat',
      'Pengajuan Aset HRD & GA - Kantor Pusat',
      'Pengajuan Dana - Kantor Pusat',
      'Pengajuan Dana HRD & GA - Kantor Pusat',
      'SPK Non Unit - Kantor Cabang',
      'Pengajuan Aset - Kantor Cabang',
      'Pengajuan Dana - Kantor Cabang'
    );
  if v_count <> 8 then
    raise exception 'BLOCKED: expected 8 canonical usages, got %.', v_count;
  end if;
  if not exists (
    select 1 from public.form_usages
    where name = 'Rekomendasi Peremajaan Aset' and status = 'active'
      and is_system_template is true
  ) then
    raise exception 'BLOCKED: template rekomendasi kanonikal tidak tersedia.';
  end if;

  -- 3. Clone recommendation template first (test-only pair).
  select id into v_source from public.form_usages
  where name = 'Rekomendasi Peremajaan Aset' and status = 'active'
    and is_system_template is true
  order by updated_at desc nulls last, created_at desc nulls last limit 1;

  -- Re-resolve with full row.
  for v_source in
    select * from public.form_usages
    where name = 'Rekomendasi Peremajaan Aset' and status = 'active'
      and is_system_template is true
    order by updated_at desc nulls last, created_at desc nulls last limit 1
  loop
    v_clone_name := '[UJI STAGING] Rekomendasi Peremajaan Aset';
    select id into v_rec_clone_id from public.form_usages where name = v_clone_name limit 1;
    if v_rec_clone_id is null then
      insert into public.form_usages (
        form_id, route_id, name, description, request_category, scope_type,
        status, sort_order, external_revision_policy, recommendation_config,
        is_system_template, created_by
      ) values (
        v_source.form_id, v_source.route_id, v_clone_name,
        'Khusus pengujian staging. Akun uji: system.tuyemaris@gmail.com. Pasangan test-only rekomendasi aset satu akun. Sumber: '
          || coalesce(v_source.description, v_source.name),
        v_source.request_category, v_source.scope_type,
        'active', 1035, v_source.external_revision_policy, '{}'::jsonb,
        true, v_tester_id
      ) returning id into v_rec_clone_id;
    end if;
  end loop;

  -- Copy departments/steps/users/verifiers/attachments for recommendation clone.
  for v_source in
    select * from public.form_usages
    where name = 'Rekomendasi Peremajaan Aset' and status = 'active'
      and is_system_template is true
    order by updated_at desc nulls last, created_at desc nulls last limit 1
  loop
    insert into public.form_usage_departments (usage_id, department_id)
    select v_rec_clone_id, department_id from public.form_usage_departments
    where usage_id = v_source.id
    on conflict do nothing;

    for v_step in
      select * from public.form_usage_steps where usage_id = v_source.id order by step_order
    loop
      select id into v_new_step_id from public.form_usage_steps
      where usage_id = v_rec_clone_id and step_order = v_step.step_order limit 1;
      if v_new_step_id is null then
        insert into public.form_usage_steps (
          usage_id, route_step_id, step_order, role_name, label,
          signer_department_id, action_type, candidate_scope,
          assignee_mode, input_schema,
          verifier_department_id, verifier_scope,
          skip_if_no_candidate, candidate_fallback_mode
        ) values (
          v_rec_clone_id, null, v_step.step_order, v_step.role_name, v_step.label,
          v_step.signer_department_id, v_step.action_type, 'manual',
          v_step.assignee_mode, v_step.input_schema,
          null, 'all_offices',
          coalesce(v_step.skip_if_no_candidate, false), null
        ) returning id into v_new_step_id;
      else
        update public.form_usage_steps
        set role_name = v_step.role_name, label = v_step.label,
            action_type = v_step.action_type, assignee_mode = v_step.assignee_mode,
            candidate_scope = 'manual', signer_department_id = v_step.signer_department_id,
            input_schema = v_step.input_schema,
            verifier_department_id = null,
            verifier_scope = 'all_offices',
            skip_if_no_candidate = coalesce(v_step.skip_if_no_candidate, false),
            candidate_fallback_mode = null
        where id = v_new_step_id;
      end if;

      if v_step.assignee_mode = 'select' then
        delete from public.form_usage_step_users
        where usage_step_id = v_new_step_id and user_id <> v_tester_id;
        insert into public.form_usage_step_users (usage_step_id, user_id)
        values (v_new_step_id, v_tester_id) on conflict do nothing;
      else
        delete from public.form_usage_step_users where usage_step_id = v_new_step_id;
      end if;

      if exists (
        select 1 from public.form_usage_step_verifiers where usage_step_id = v_step.id
      ) then
        delete from public.form_usage_step_verifiers
        where usage_step_id = v_new_step_id and user_id <> v_tester_id;
        insert into public.form_usage_step_verifiers (usage_step_id, user_id)
        values (v_new_step_id, v_tester_id) on conflict do nothing;
      else
        delete from public.form_usage_step_verifiers where usage_step_id = v_new_step_id;
      end if;

      insert into public.form_usage_attachment_requirements (
        usage_id, usage_step_id, stage_order, requirement_key, label,
        is_required, allow_multiple, min_files, max_files,
        allowed_types, max_size_bytes, sort_order
      )
      select v_rec_clone_id, v_new_step_id, stage_order, requirement_key, label,
        is_required, allow_multiple, min_files, max_files,
        allowed_types, max_size_bytes, sort_order
      from public.form_usage_attachment_requirements
      where usage_id = v_source.id and usage_step_id = v_step.id
      on conflict (usage_id, stage_order, requirement_key) do nothing;
    end loop;
  end loop;

  -- 4. Clone 8 canonical usages.
  for v_source in
    select * from public.form_usages
    where status = 'active' and is_system_template is false
      and name in (
        'SPK Unit - Kantor Pusat',
        'Pengajuan Aset - Kantor Pusat',
        'Pengajuan Aset HRD & GA - Kantor Pusat',
        'Pengajuan Dana - Kantor Pusat',
        'Pengajuan Dana HRD & GA - Kantor Pusat',
        'SPK Non Unit - Kantor Cabang',
        'Pengajuan Aset - Kantor Cabang',
        'Pengajuan Dana - Kantor Cabang'
      )
    order by sort_order
  loop
    v_clone_name := '[UJI STAGING] ' || v_source.name;
    select id into v_clone_id from public.form_usages where name = v_clone_name limit 1;
    if v_clone_id is null then
      insert into public.form_usages (
        form_id, route_id, name, description, request_category, scope_type,
        status, sort_order, external_revision_policy, recommendation_config,
        is_system_template, created_by
      ) values (
        v_source.form_id, v_source.route_id, v_clone_name,
        'Khusus pengujian staging satu akun. Akun uji: system.tuyemaris@gmail.com. Sumber kanonikal: ' || v_source.name
          || '. ' || coalesce(v_source.description, ''),
        v_source.request_category, v_source.scope_type,
        'active', v_source.sort_order + 1000,
        v_source.external_revision_policy, v_source.recommendation_config,
        false, v_tester_id
      ) returning id into v_clone_id;
    else
      update public.form_usages
      set form_id = v_source.form_id,
          route_id = v_source.route_id,
          request_category = v_source.request_category,
          scope_type = v_source.scope_type,
          status = 'active',
          external_revision_policy = v_source.external_revision_policy,
          recommendation_config = v_source.recommendation_config,
          is_system_template = false,
          description = 'Khusus pengujian staging satu akun. Akun uji: system.tuyemaris@gmail.com. Sumber kanonikal: '
            || v_source.name || '. ' || coalesce(v_source.description, '')
      where id = v_clone_id;
    end if;

    -- Same department authorization.
    insert into public.form_usage_departments (usage_id, department_id)
    select v_clone_id, department_id from public.form_usage_departments
    where usage_id = v_source.id
    on conflict do nothing;

    -- Same steps, single-account candidate scope.
    for v_step in
      select * from public.form_usage_steps where usage_id = v_source.id order by step_order
    loop
      select id into v_new_step_id from public.form_usage_steps
      where usage_id = v_clone_id and step_order = v_step.step_order limit 1;
      if v_new_step_id is null then
        insert into public.form_usage_steps (
          usage_id, route_step_id, step_order, role_name, label,
          signer_department_id, action_type, candidate_scope,
          assignee_mode, input_schema,
          verifier_department_id, verifier_scope,
          skip_if_no_candidate, candidate_fallback_mode
        ) values (
          v_clone_id, null, v_step.step_order, v_step.role_name, v_step.label,
          v_step.signer_department_id, v_step.action_type, 'manual',
          v_step.assignee_mode, v_step.input_schema,
          null, 'all_offices',
          coalesce(v_step.skip_if_no_candidate, false), null
        ) returning id into v_new_step_id;
      else
        update public.form_usage_steps
        set role_name = v_step.role_name, label = v_step.label,
            action_type = v_step.action_type, assignee_mode = v_step.assignee_mode,
            candidate_scope = 'manual', signer_department_id = v_step.signer_department_id,
            input_schema = v_step.input_schema,
            verifier_department_id = null,
            verifier_scope = 'all_offices',
            skip_if_no_candidate = coalesce(v_step.skip_if_no_candidate, false),
            candidate_fallback_mode = null
        where id = v_new_step_id;
      end if;

      -- Requester step keeps creator/requester; select steps only tester.
      if v_step.assignee_mode = 'select' then
        delete from public.form_usage_step_users
        where usage_step_id = v_new_step_id and user_id <> v_tester_id;
        insert into public.form_usage_step_users (usage_step_id, user_id)
        values (v_new_step_id, v_tester_id) on conflict do nothing;
      else
        delete from public.form_usage_step_users where usage_step_id = v_new_step_id;
      end if;

      if exists (
        select 1 from public.form_usage_step_verifiers where usage_step_id = v_step.id
      ) then
        delete from public.form_usage_step_verifiers
        where usage_step_id = v_new_step_id and user_id <> v_tester_id;
        insert into public.form_usage_step_verifiers (usage_step_id, user_id)
        values (v_new_step_id, v_tester_id) on conflict do nothing;
      else
        delete from public.form_usage_step_verifiers where usage_step_id = v_new_step_id;
      end if;

      insert into public.form_usage_attachment_requirements (
        usage_id, usage_step_id, stage_order, requirement_key, label,
        is_required, allow_multiple, min_files, max_files,
        allowed_types, max_size_bytes, sort_order
      )
      select v_clone_id, v_new_step_id, stage_order, requirement_key, label,
        is_required, allow_multiple, min_files, max_files,
        allowed_types, max_size_bytes, sort_order
      from public.form_usage_attachment_requirements
      where usage_id = v_source.id and usage_step_id = v_step.id
      on conflict (usage_id, stage_order, requirement_key) do nothing;
    end loop;

    -- Rewire asset recommendation linkage to test-only template.
    if v_source.request_category = 'asset'
       and (v_source.recommendation_config ? 'enabled')
       and ((v_source.recommendation_config->>'enabled')::boolean is true) then
      update public.form_usages clone
      set recommendation_config = v_source.recommendation_config
          || jsonb_build_object('usage_id', v_rec_clone_id),
          updated_at = clock_timestamp()
      where clone.id = v_clone_id;
    end if;
  end loop;

  -- 5. Guardrails: canonical untouched, clones valid.
  select count(*) into v_count from public.form_usages
  where status = 'active' and name like '[UJI STAGING]%';
  if v_count <> 9 then
    raise exception 'Fixture incomplete: expected 9 [UJI STAGING] clones, got %.', v_count;
  end if;
  if exists (
    select 1 from public.form_usages
    where status = 'active' and name like '[UJI STAGING]%'
      and is_system_template is true and name <> '[UJI STAGING] Rekomendasi Peremajaan Aset'
  ) then
    raise exception 'is_system_template hanya untuk template rekomendasi uji.';
  end if;
end $$;

commit;
