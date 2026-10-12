begin;

-- Follow-up staging fixture (PR #310): split-account test clones.
-- STAGING ONLY. Do not promote to production.
-- Replaces the single-account [UJI STAGING]% clones from 20260919000000
-- (archived here, historical letters untouched) with scope-separated clones:
--   5x [UJI STAGING PUSAT] selectable (tester: system.tuyemaris@gmail.com)
--   3x [UJI STAGING CABANG] selectable (tester: Faizal, Kantor Cabang Magelang)
--   2x internal recommendation templates (is_system_template, not selectable)
-- Canonical workflows are never updated or archived here.
-- Forward-only and idempotent: safe to re-run.

do $$
declare
  v_pusat_id uuid;
  v_pusat_dept uuid;
  v_pusat_office uuid;
  v_cabang_id uuid;
  v_cabang_dept uuid;
  v_cabang_office uuid;
  v_has_fn boolean;
  v_fn_ok boolean;
  v_count integer;
  v_source record;
  v_step record;
  v_clone_id uuid;
  v_clone_name text;
  v_rec_pusat_id uuid;
  v_rec_cabang_id uuid;
  v_new_step_id uuid;
begin
  -- 0. Resolve testers by email (no fake IDs, no remap, no password change).
  select p.id, p.department_id, p.office_id
    into v_pusat_id, v_pusat_dept, v_pusat_office
  from public.profiles p
  where p.email = 'system.tuyemaris@gmail.com'
    and p.role::text = 'admin'
    and p.is_active is true
    and p.deleted_at is null
  limit 1;
  if v_pusat_id is null then
    raise exception 'BLOCKED: tester Pusat system.tuyemaris@gmail.com tidak memenuhi role admin aktif.';
  end if;

  select p.id, p.department_id, p.office_id
    into v_cabang_id, v_cabang_dept, v_cabang_office
  from public.profiles p
  where p.email = 'faizalsyahiddin@gmail.com'
    and p.is_active is true
    and p.deleted_at is null
  limit 1;
  if v_cabang_id is null then
    raise exception 'BLOCKED: tester Cabang faizalsyahiddin@gmail.com tidak aktif.';
  end if;
  if v_pusat_id = v_cabang_id then
    raise exception 'BLOCKED: akun Pusat dan Cabang harus berbeda.';
  end if;

  -- Pusat must sit in Kantor Pusat; Cabang must sit outside Pusat.
  if not exists (
    select 1 from public.master_offices o
    where o.id = v_pusat_office and lower(coalesce(o.kedudukan, '')) = 'pusat'
  ) then
    raise exception 'BLOCKED: akun Pusat tidak berada di Kantor Pusat.';
  end if;
  if not exists (
    select 1 from public.master_offices o
    where o.id = v_cabang_office and lower(coalesce(o.kedudukan, '')) <> 'pusat'
  ) then
    raise exception 'BLOCKED: akun Cabang tidak berada di Kantor Cabang.';
  end if;
  if v_pusat_dept is null or v_cabang_dept is null then
    raise exception 'BLOCKED: department tester tidak valid.';
  end if;

  -- Direct external-identity checks (same functions as runtime when available).
  select exists (
    select 1 from pg_proc
    where proname = 'marison_payload_profile_source_valid'
      and pg_function_is_visible(oid)
  ) into v_has_fn;
  if v_has_fn then
    execute 'select public.marison_payload_profile_source_valid($1)'
      into v_fn_ok using v_pusat_id;
    if v_fn_ok is not true then
      raise exception 'BLOCKED: profile_source_valid(Pusat) = false.';
    end if;
    execute 'select public.marison_payload_profile_source_valid($1)'
      into v_fn_ok using v_cabang_id;
    if v_fn_ok is not true then
      raise exception 'BLOCKED: profile_source_valid(Cabang) = false.';
    end if;
    execute 'select public.marison_payload_office_source_valid($1)'
      into v_fn_ok using v_pusat_office;
    if v_fn_ok is not true then
      raise exception 'BLOCKED: office_source_valid(Pusat) = false.';
    end if;
    execute 'select public.marison_payload_office_source_valid($1)'
      into v_fn_ok using v_cabang_office;
    if v_fn_ok is not true then
      raise exception 'BLOCKED: office_source_valid(Cabang) = false.';
    end if;
  else
    if not exists (
      select 1 from public.profiles p
      where p.id in (v_pusat_id, v_cabang_id)
        and p.deleted_at is null and p.is_active
        and p.marison_employee_id > 0
        and nullif(btrim(p.nik), '') is not null
        and p.marison_synced_at is not null
      having count(*) = 2
    ) then
      raise exception 'BLOCKED: external identity tester tidak valid.';
    end if;
  end if;

  -- Cabang office must own at least one valid project.
  if not exists (
    select 1 from public.master_projects pr
    join public.master_offices o on o.id = pr.office_id
    where pr.office_id = v_cabang_office
      and pr.marison_project_id > 0 and pr.marison_synced_at is not null
      and o.marison_branch_id > 0 and o.marison_synced_at is not null
  ) then
    raise exception 'BLOCKED: kantor Cabang tester tidak memiliki proyek external-ready.';
  end if;

  -- Canonical inventory unchanged: 8 usages + 1 template.
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

  -- 1. Archive legacy single-account fixtures (historical letters keep snapshots).
  update public.form_usages
  set status = 'archived', updated_at = clock_timestamp()
  where status = 'active'
    and name like '[UJI STAGING]%'
    and name not like '[UJI STAGING PUSAT]%'
    and name not like '[UJI STAGING CABANG]%';

  -- 2. Internal recommendation templates per scope.
  for v_source in
    select * from public.form_usages
    where name = 'Rekomendasi Peremajaan Aset' and status = 'active'
      and is_system_template is true
    order by updated_at desc nulls last, created_at desc nulls last limit 1
  loop
    -- Pusat template.
    select id into v_rec_pusat_id from public.form_usages
    where name = '[UJI STAGING PUSAT] Rekomendasi Peremajaan Aset' limit 1;
    if v_rec_pusat_id is null then
      insert into public.form_usages (
        form_id, route_id, name, description, request_category, scope_type,
        status, sort_order, external_revision_policy, recommendation_config,
        is_system_template, created_by
      ) values (
        v_source.form_id, v_source.route_id,
        '[UJI STAGING PUSAT] Rekomendasi Peremajaan Aset',
        'Khusus pengujian staging. Template internal, bukan pengajuan langsung. Akun uji: system.tuyemaris@gmail.com. Sumber: '
          || coalesce(v_source.description, v_source.name),
        v_source.request_category, v_source.scope_type,
        'active', 2035, v_source.external_revision_policy, '{}'::jsonb,
        true, v_pusat_id
      ) returning id into v_rec_pusat_id;
    end if;
    -- Cabang template.
    select id into v_rec_cabang_id from public.form_usages
    where name = '[UJI STAGING CABANG] Rekomendasi Peremajaan Aset' limit 1;
    if v_rec_cabang_id is null then
      insert into public.form_usages (
        form_id, route_id, name, description, request_category, scope_type,
        status, sort_order, external_revision_policy, recommendation_config,
        is_system_template, created_by
      ) values (
        v_source.form_id, v_source.route_id,
        '[UJI STAGING CABANG] Rekomendasi Peremajaan Aset',
        'Khusus pengujian staging. Template internal, bukan pengajuan langsung. Akun uji: faizalsyahiddin@gmail.com. Sumber: '
          || coalesce(v_source.description, v_source.name),
        v_source.request_category, v_source.scope_type,
        'active', 2036, v_source.external_revision_policy, '{}'::jsonb,
        true, v_cabang_id
      ) returning id into v_rec_cabang_id;
    end if;
  end loop;

  -- Seed template departments/steps/users/verifiers/attachments (scope tester only).
  create temporary table split_templates (
    clone_name text primary key,
    tester_id uuid not null,
    tester_dept uuid not null
  ) on commit drop;
  insert into split_templates (clone_name, tester_id, tester_dept)
  values
    ('[UJI STAGING PUSAT] Rekomendasi Peremajaan Aset', v_pusat_id, v_pusat_dept),
    ('[UJI STAGING CABANG] Rekomendasi Peremajaan Aset', v_cabang_id, v_cabang_dept);

  for v_source in
    select u.id, t.tester_dept
    from split_templates t
    join public.form_usages u on u.name = t.clone_name and u.status = 'active'
  loop
    delete from public.form_usage_departments
    where usage_id = v_source.id and department_id <> v_source.tester_dept;
    insert into public.form_usage_departments (usage_id, department_id)
    values (v_source.id, v_source.tester_dept) on conflict do nothing;
  end loop;

  for v_source in
    select t.clone_name, t.tester_id, s.*
    from split_templates t
    join public.form_usages s on s.name = 'Rekomendasi Peremajaan Aset'
      and s.status = 'active' and s.is_system_template is true
  loop
    for v_step in
      select * from public.form_usage_steps where usage_id = v_source.id order by step_order
    loop
      select id into v_clone_id from public.form_usages
      where name = v_source.clone_name limit 1;
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
      if v_step.assignee_mode = 'select' then
        delete from public.form_usage_step_users
        where usage_step_id = v_new_step_id and user_id <> v_source.tester_id;
        insert into public.form_usage_step_users (usage_step_id, user_id)
        values (v_new_step_id, v_source.tester_id) on conflict do nothing;
      else
        delete from public.form_usage_step_users where usage_step_id = v_new_step_id;
      end if;
      if exists (
        select 1 from public.form_usage_step_verifiers where usage_step_id = v_step.id
      ) then
        delete from public.form_usage_step_verifiers
        where usage_step_id = v_new_step_id and user_id <> v_source.tester_id;
        insert into public.form_usage_step_verifiers (usage_step_id, user_id)
        values (v_new_step_id, v_source.tester_id) on conflict do nothing;
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
  end loop;

  -- 3. Eight selectable fixtures (tester department only per scope).
  create temporary table split_claims (
    source_name text primary key,
    clone_name text not null,
    scope text not null,
    tester_id uuid not null,
    tester_dept uuid not null,
    tester_email text not null
  ) on commit drop;
  insert into split_claims (source_name, clone_name, scope, tester_id, tester_dept, tester_email)
  values
    ('SPK Unit - Kantor Pusat', '[UJI STAGING PUSAT] Pengajuan SPK Unit', 'pusat', v_pusat_id, v_pusat_dept, 'system.tuyemaris@gmail.com'),
    ('Pengajuan Aset - Kantor Pusat', '[UJI STAGING PUSAT] Pengajuan Aset', 'pusat', v_pusat_id, v_pusat_dept, 'system.tuyemaris@gmail.com'),
    ('Pengajuan Aset HRD & GA - Kantor Pusat', '[UJI STAGING PUSAT] Pengajuan Aset HRD & GA', 'pusat', v_pusat_id, v_pusat_dept, 'system.tuyemaris@gmail.com'),
    ('Pengajuan Dana - Kantor Pusat', '[UJI STAGING PUSAT] Pengajuan Dana', 'pusat', v_pusat_id, v_pusat_dept, 'system.tuyemaris@gmail.com'),
    ('Pengajuan Dana HRD & GA - Kantor Pusat', '[UJI STAGING PUSAT] Pengajuan Dana HRD & GA', 'pusat', v_pusat_id, v_pusat_dept, 'system.tuyemaris@gmail.com'),
    ('SPK Non Unit - Kantor Cabang', '[UJI STAGING CABANG] Pengajuan SPK Non Unit', 'cabang', v_cabang_id, v_cabang_dept, 'faizalsyahiddin@gmail.com'),
    ('Pengajuan Aset - Kantor Cabang', '[UJI STAGING CABANG] Pengajuan Aset', 'cabang', v_cabang_id, v_cabang_dept, 'faizalsyahiddin@gmail.com'),
    ('Pengajuan Dana - Kantor Cabang', '[UJI STAGING CABANG] Pengajuan Dana', 'cabang', v_cabang_id, v_cabang_dept, 'faizalsyahiddin@gmail.com');

  for v_source in
    select u.*, c.clone_name, c.scope, c.tester_id, c.tester_dept, c.tester_email
    from split_claims c
    join public.form_usages u on u.name = c.source_name
      and u.status = 'active' and u.is_system_template is false
    order by u.sort_order
  loop
    select id into v_clone_id from public.form_usages where name = v_source.clone_name limit 1;
    if v_clone_id is null then
      insert into public.form_usages (
        form_id, route_id, name, description, request_category, scope_type,
        status, sort_order, external_revision_policy, recommendation_config,
        is_system_template, created_by
      ) values (
        v_source.form_id, v_source.route_id, v_source.clone_name,
        'Khusus pengujian staging ' || upper(v_source.scope) || '. Akun uji: '
          || v_source.tester_email || '. Sumber kanonikal: ' || v_source.name
          || '. ' || coalesce(v_source.description, ''),
        v_source.request_category, v_source.scope_type,
        'active', v_source.sort_order + 2000,
        v_source.external_revision_policy, v_source.recommendation_config,
        false, v_source.tester_id
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
          description = 'Khusus pengujian staging ' || upper(v_source.scope) || '. Akun uji: '
            || v_source.tester_email || '. Sumber kanonikal: ' || v_source.name
            || '. ' || coalesce(v_source.description, '')
      where id = v_clone_id;
    end if;

    -- Department ACL: tester department only (same-scope isolation).
    delete from public.form_usage_departments
    where usage_id = v_clone_id and department_id <> v_source.tester_dept;
    insert into public.form_usage_departments (usage_id, department_id)
    values (v_clone_id, v_source.tester_dept) on conflict do nothing;

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

      if v_step.assignee_mode = 'select' then
        delete from public.form_usage_step_users
        where usage_step_id = v_new_step_id and user_id <> v_source.tester_id;
        insert into public.form_usage_step_users (usage_step_id, user_id)
        values (v_new_step_id, v_source.tester_id) on conflict do nothing;
      else
        delete from public.form_usage_step_users where usage_step_id = v_new_step_id;
      end if;

      if exists (
        select 1 from public.form_usage_step_verifiers where usage_step_id = v_step.id
      ) then
        delete from public.form_usage_step_verifiers
        where usage_step_id = v_new_step_id and user_id <> v_source.tester_id;
        insert into public.form_usage_step_verifiers (usage_step_id, user_id)
        values (v_new_step_id, v_source.tester_id) on conflict do nothing;
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

    -- Rewire asset recommendation linkage to the same-scope internal template.
    if v_source.request_category = 'asset'
       and (v_source.recommendation_config ? 'enabled')
       and ((v_source.recommendation_config->>'enabled')::boolean is true) then
      update public.form_usages clone
      set recommendation_config = v_source.recommendation_config
          || jsonb_build_object('usage_id', case
               when v_source.scope = 'pusat' then v_rec_pusat_id else v_rec_cabang_id end),
          updated_at = clock_timestamp()
      where clone.id = v_clone_id;
    end if;
  end loop;

  -- 4. Guardrails.
  select count(*) into v_count from public.form_usages
  where status = 'active'
    and (name like '[UJI STAGING PUSAT]%' or name like '[UJI STAGING CABANG]%');
  if v_count <> 10 then
    raise exception 'Fixture incomplete: expected 10 scoped clones, got %.', v_count;
  end if;
  if exists (
    select 1 from public.form_usages
    where status = 'active' and name like '[UJI STAGING]%'
      and name not like '[UJI STAGING PUSAT]%'
      and name not like '[UJI STAGING CABANG]%'
  ) then
    raise exception 'Legacy single-account fixture still active.';
  end if;
  if exists (
    select 1 from public.form_usages
    where status = 'active'
      and (name like '[UJI STAGING PUSAT]%' or name like '[UJI STAGING CABANG]%')
      and is_system_template is true
      and name not like '%Rekomendasi Peremajaan Aset'
  ) then
    raise exception 'is_system_template hanya untuk template rekomendasi internal.';
  end if;
end $$;

commit;
