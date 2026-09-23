do $$
declare
  v_count integer;
  v_usage_id uuid;
  v_step_id uuid;
  v_step3_id uuid;
  v_registration_id uuid;
  v_signature_id uuid;
  v_threw boolean;
  v_value text;
begin
  select count(*) into v_count from public.form_usages where status = 'active';
  if v_count <> 9 then raise exception 'expected 8 canonical usages plus linked recommendation template, got %', v_count; end if;

  if not exists (
    select 1 from public.form_usages
    where name = 'Rekomendasi Peremajaan Aset' and status = 'active' and is_system_template is true
  ) then raise exception 'linked recommendation template must remain available for in-flight work'; end if;

  select count(*) into v_count
  from public.form_usages usage
  where usage.status = 'active'
    and usage.request_category = 'asset'
    and usage.name in (
      'Pengajuan Aset - Kantor Pusat',
      'Pengajuan Aset HRD & GA - Kantor Pusat',
      'Pengajuan Aset - Kantor Cabang'
    )
    and usage.recommendation_config @> jsonb_build_object(
      'enabled', true,
      'optional', true,
      'required_before_step', 3,
      'form_id', '10000000-0000-4000-8000-000000000002'::uuid,
      'usage_id', '50000000-0000-4000-8000-000000000005'::uuid,
      'department_id', '30000000-0000-4000-8000-000000000009'::uuid,
      'letter_type_id', '70000000-0000-4000-8000-000000000001'::uuid,
      'entity_id', '80000000-0000-4000-8000-000000000001'::uuid,
      'template_name', 'Rekomendasi Peremajaan Aset'
    );
  if v_count <> 3 then
    raise exception 'asset recommendation configuration is incomplete for % of 3 canonical workflows', 3 - v_count;
  end if;

  if exists (
    select 1
    from public.form_usage_attachment_requirements requirement
    join public.form_usages usage on usage.id = requirement.usage_id
    where usage.name = 'Rekomendasi Peremajaan Aset'
      and usage.is_system_template is true
      and requirement.stage_order = 1
  ) then raise exception 'recommendation creator still has a duplicate approval attachment requirement'; end if;

  if exists (
    select 1
    from public.surat_signatures signature
    where signature.id = 'b0000000-0000-4000-8000-000000000001'
      and signature.attachment_requirements_snapshot <> '[]'::jsonb
  ) then raise exception 'existing unsigned recommendation creator snapshot was not cleaned'; end if;

  v_threw := false;
  begin
    insert into public.form_usage_attachment_requirements (
      usage_id, usage_step_id, stage_order, requirement_key, label
    ) values (
      '50000000-0000-4000-8000-000000000005',
      '60000000-0000-4000-8000-000000000004',
      1, 'duplicate_creator_attachment', 'Duplicate creator attachment'
    );
  exception when others then
    v_threw := position('tidak boleh diminta ulang' in sqlerrm) > 0;
  end;
  if not v_threw then
    raise exception 'recommendation creator approval attachment invariant was not enforced';
  end if;

  if exists (select 1 from public.form_usages where name like 'Legacy %' and status <> 'archived') then
    raise exception 'legacy usage was not archived';
  end if;

  select id into v_usage_id from public.form_usages where name = 'Legacy Pusat Asset';
  insert into public.surat_registrasi (form_usage_id, office_id, dept_id, created_by)
  values (v_usage_id, '20000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000020')
  returning id into v_registration_id;
  perform set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000020', true);
  if not public.can_read_form_usage(v_usage_id) then
    raise exception 'participant lost access to archived workflow';
  end if;
  perform set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000021', true);
  if public.can_read_form_usage(v_usage_id) then
    raise exception 'unrelated user gained access to archived workflow';
  end if;
  update public.profiles set is_active = false where id = '40000000-0000-4000-8000-000000000020';
  perform set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000020', true);
  if public.can_read_form_usage(v_usage_id) then
    raise exception 'inactive participant gained access to archived workflow';
  end if;
  update public.profiles set is_active = true where id = '40000000-0000-4000-8000-000000000020';

  select count(*) into v_count
  from public.form_usage_steps step
  join public.form_usages usage on usage.id = step.usage_id
  where usage.status = 'active' and step.assignee_mode = 'requester';
  if v_count <> 6 then raise exception 'expected 6 requester signer steps, got %', v_count; end if;

  if exists (
    select 1
    from (values
      ('SPK Unit - Kantor Pusat', 'membuat:Asisten Mgr. Marketing, membuat:Mgr. Marketing, memeriksa:Mgr. Perencanaan, menyetujui:Direktur II, menyetujui:Direktur I'),
      ('Pengajuan Aset - Kantor Pusat', 'membuat:Pemohon, membuat:Mgr. Departemen, memeriksa:Mgr. HRD & GA, menyetujui:Direktur I, menyetujui:Direktur Utama'),
      ('Pengajuan Aset HRD & GA - Kantor Pusat', 'membuat:Pemohon HRD & GA, memeriksa:Mgr. HRD & GA, menyetujui:Direktur I, menyetujui:Direktur Utama'),
      ('Pengajuan Dana - Kantor Pusat', 'membuat:Pemohon, membuat:Mgr. Departemen, memeriksa:Mgr. HRD & GA, menyetujui:Direktur I, menyetujui:Direktur Utama'),
      ('Pengajuan Dana HRD & GA - Kantor Pusat', 'membuat:Pemohon HRD & GA, memeriksa:Mgr. HRD & GA, menyetujui:Direktur I, menyetujui:Direktur Utama'),
      ('SPK Non Unit - Kantor Cabang', 'membuat:SPV Teknik, membuat:Assistant Branch Manager, membuat:Branch Manager, memeriksa:Mgr. Perencanaan, menyetujui:Direktur II, menyetujui:Direktur I, menyetujui:Direktur Utama'),
      ('Pengajuan Aset - Kantor Cabang', 'membuat:Pemohon, membuat:Branch Manager, memeriksa:Mgr. HRD & GA, menyetujui:Direktur I, menyetujui:Direktur Utama'),
      ('Pengajuan Dana - Kantor Cabang', 'membuat:Pemohon, membuat:Branch Manager, memeriksa:Manager Terkait, menyetujui:Direktur I, menyetujui:Direktur Utama')
    ) expected(name, path)
    left join lateral (
      select string_agg(step.role_name || ':' || step.label, ', ' order by step.step_order) as path
      from public.form_usages usage
      join public.form_usage_steps step on step.usage_id = usage.id
      where usage.name = expected.name and usage.status = 'active'
    ) actual on true
    where actual.path is distinct from expected.path
  ) then raise exception 'canonical workflow role/order path differs from specification'; end if;

  if exists (
    select 1 from public.form_usage_steps step
    join public.form_usages usage on usage.id = step.usage_id
    where usage.name = 'Pengajuan Dana - Kantor Cabang'
      and exists (
        select 1 from public.form_usage_step_verifiers verifier
        join public.profiles profile on profile.id = verifier.user_id
        join public.master_departments department on department.id = profile.department_id
        where verifier.usage_step_id = step.id and department.name = 'Keuangan & Akuntansi'
      )
  ) then raise exception 'Cabang Dana must not retain a Finance verifier'; end if;

  select count(*) into v_count
  from public.form_usage_steps step
  join public.form_usages usage on usage.id = step.usage_id
  join public.form_usage_attachment_requirements requirement on requirement.usage_step_id = step.id
  where usage.name in ('Pengajuan Dana - Kantor Pusat', 'Pengajuan Dana HRD & GA - Kantor Pusat', 'Pengajuan Dana - Kantor Cabang')
    and step.action_type = 'configured_input'
    and step.verifier_scope = 'head_office'
    and step.verifier_department_id = (
      select id from public.master_departments where name = 'Perencanaan'
    )
    and step.input_schema->'fields'->0->>'key' = 'reviewed_amount'
    and requirement.requirement_key = 'rab' and requirement.is_required is true;
  if v_count <> 3 then raise exception 'Dana checker amount/RAB contract is incomplete'; end if;

  select usage.id into v_usage_id from public.form_usages usage where usage.name = 'Pengajuan Dana - Kantor Cabang';
  select step.id into v_step_id from public.form_usage_steps step where step.usage_id = v_usage_id and step.step_order = 3;
  insert into public.surat_registrasi (form_usage_id, office_id, dept_id, created_by, status, current_step)
  values (v_usage_id, '20000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000020', 'PROSES', 3)
  returning id into v_registration_id;
  insert into public.surat_signatures (surat_id, user_id, form_usage_step_id)
  values (v_registration_id, '40000000-0000-4000-8000-000000000006', v_step_id)
  returning id into v_signature_id;
  if not exists (
    select 1 from public.surat_signatures signature,
      jsonb_array_elements(signature.verifier_snapshot) verifier
    where signature.id = v_signature_id
      and verifier->>'user_id' = '40000000-0000-4000-8000-000000000005'
  ) then raise exception 'Cabang Dana lost its central Planning operator'; end if;

  select count(*) into v_count
  from public.form_usage_steps step
  join public.form_usages usage on usage.id = step.usage_id
  where usage.name = 'SPK Unit - Kantor Pusat';
  if v_count <> 5 then raise exception 'Pusat SPK Unit must have 5 steps'; end if;

  if exists (
    select 1 from public.form_usage_steps step
    join public.form_usages usage on usage.id = step.usage_id
    where usage.name = 'SPK Unit - Kantor Pusat' and step.assignee_mode = 'requester'
  ) then raise exception 'Pusat SPK Unit requester must not sign'; end if;

  select count(*) into v_count
  from public.form_usage_steps step
  join public.form_usages usage on usage.id = step.usage_id
  where usage.name = 'SPK Non Unit - Kantor Cabang';
  if v_count <> 7 then raise exception 'Cabang SPK Non Unit must have 7 steps'; end if;

  if exists (
    select 1
    from public.form_usage_steps step
    join public.form_usages usage on usage.id = step.usage_id
    where usage.status = 'active'
      and step.assignee_mode = 'select'
      and step.skip_if_no_candidate is not true
      and step.candidate_fallback_mode is null
      and not exists (select 1 from public.form_usage_step_users candidate where candidate.usage_step_id = step.id)
  ) then raise exception 'select-mode canonical step without candidates'; end if;

  if exists (
    select 1
    from public.form_usage_steps step
    join public.form_usages usage on usage.id = step.usage_id
    where usage.status = 'active'
      and step.action_type = 'unit_allocation'
      and not exists (select 1 from public.form_usage_step_verifiers verifier where verifier.usage_step_id = step.id)
  ) then raise exception 'unit allocation step without operator'; end if;

  select count(*) into v_count
  from public.form_usage_steps step
  join public.form_usages usage on usage.id = step.usage_id
  join public.form_usage_step_users candidate on candidate.usage_step_id = step.id
  where usage.status = 'active' and step.label like 'Direktur%';
  if v_count <> 51 then
    raise exception 'each of 17 director steps must expose the 3-member Direksi pool, got % rows', v_count;
  end if;

  -- Requester-mode signer is derived from registration.created_by, not a client candidate list.
  select usage.id into v_usage_id from public.form_usages usage where usage.name = 'Pengajuan Dana - Kantor Cabang';
  select step.id into v_step_id from public.form_usage_steps step where step.usage_id = v_usage_id and step.step_order = 1;
  insert into public.surat_registrasi (
    form_usage_id, office_id, dept_id, created_by, status, current_step, form_input_data, data_snapshot
  ) values (
    v_usage_id,
    '20000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000007',
    '40000000-0000-4000-8000-000000000020',
    'PROSES', 1, '{}'::jsonb, '{}'::jsonb
  ) returning id into v_registration_id;

  insert into public.surat_signatures (surat_id, user_id, form_usage_step_id)
  values (v_registration_id, '40000000-0000-4000-8000-000000000020', v_step_id)
  returning id into v_signature_id;

  select action_type into v_value from public.surat_signatures where id = v_signature_id;
  if v_value <> 'approval' then raise exception 'requester signature snapshot was not populated'; end if;

  v_threw := false;
  begin
    insert into public.surat_signatures (surat_id, user_id, form_usage_step_id)
    values (v_registration_id, '40000000-0000-4000-8000-000000000021', v_step_id);
  exception when others then
    v_threw := position('bukan kandidat signer' in sqlerrm) > 0;
  end;
  if not v_threw then raise exception 'forged requester signer was accepted'; end if;

  select usage.id into v_usage_id from public.form_usages usage where usage.name = 'SPK Non Unit - Kantor Cabang';
  select step.id into v_step_id from public.form_usage_steps step where step.usage_id = v_usage_id and step.step_order = 1;
  insert into public.surat_registrasi (
    form_usage_id, office_id, dept_id, created_by, status, current_step
  ) values (
    v_usage_id, '20000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000020', 'PROSES', 1
  ) returning id into v_registration_id;
  v_threw := false;
  begin
    insert into public.surat_signatures (surat_id, user_id, form_usage_step_id)
    values (v_registration_id, '40000000-0000-4000-8000-000000000016', v_step_id);
  exception when others then
    v_threw := position('bukan kandidat signer' in sqlerrm) > 0;
  end;
  if not v_threw then raise exception 'cross-office SPV candidate was accepted'; end if;

  -- Optional ABM disappears without candidates; missing BM falls back to all active employees
  -- in the request office, while preserving the selected employee's real job title.
  if not exists (
    select 1
    from public.form_usage_steps step
    join public.form_usages usage on usage.id = step.usage_id
    where usage.name = 'SPK Non Unit - Kantor Cabang'
      and step.step_order = 2
      and step.skip_if_no_candidate is true
  ) then raise exception 'branch ABM step is not optional'; end if;
  if not exists (
    select 1
    from public.form_usage_steps step
    join public.form_usages usage on usage.id = step.usage_id
    where usage.name = 'SPK Non Unit - Kantor Cabang'
      and step.step_order = 3
      and step.candidate_fallback_mode = 'request_office_all'
  ) then raise exception 'branch BM step does not have office fallback'; end if;

  select usage.id into v_usage_id from public.form_usages usage where usage.name = 'SPK Non Unit - Kantor Cabang';
  select step.id into v_step_id from public.form_usage_steps step where step.usage_id = v_usage_id and step.step_order = 1;
  insert into public.surat_registrasi (
    form_usage_id, office_id, dept_id, created_by, status, current_step
  ) values (
    v_usage_id, '20000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000022', 'PROSES', 1
  ) returning id into v_registration_id;
  select step.id into v_step3_id from public.form_usage_steps step where step.usage_id = v_usage_id and step.step_order = 3;
  insert into public.surat_signatures (surat_id, user_id, form_usage_step_id)
  values
    (v_registration_id, '40000000-0000-4000-8000-000000000022', v_step_id),
    (v_registration_id, '40000000-0000-4000-8000-000000000022', v_step3_id);
  select signature.id into v_signature_id
  from public.surat_signatures signature
  where signature.surat_id = v_registration_id and signature.form_usage_step_id = v_step3_id;
  select label_jabatan, step_order into v_value, v_count
  from public.surat_signatures where id = v_signature_id;
  if v_value <> 'Supervisor Teknik' or v_count <> 2 then
    raise exception 'branch fallback did not preserve actual job title or compact step order';
  end if;

  -- Configured checker input is validated and persisted atomically.
  insert into public.form_usages (form_id, name, request_category, scope_type, status, sort_order)
  values ('10000000-0000-4000-8000-000000000001', 'Test Configured Input', 'non_asset', 'pusat', 'draft', 999)
  returning id into v_usage_id;
  insert into public.form_usage_steps (
    usage_id, step_order, role_name, label, action_type, assignee_mode, candidate_scope, input_schema
  ) values (
    v_usage_id, 1, 'memeriksa', 'Manager Pemeriksa', 'configured_input', 'select', 'head_office',
    '{"title":"Pemeriksaan Dana","fields":[{"key":"approved_amount","label":"Nominal Disetujui","type":"money","required":true,"min":0}]}'::jsonb
  ) returning id into v_step_id;
  insert into public.form_usage_step_users values (v_step_id, '40000000-0000-4000-8000-000000000006');
  insert into public.form_usage_step_verifiers values (v_step_id, '40000000-0000-4000-8000-000000000005');
  insert into public.surat_registrasi (
    form_usage_id, office_id, dept_id, created_by, status, current_step, form_input_data, data_snapshot
  ) values (
    v_usage_id,
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000004',
    '40000000-0000-4000-8000-000000000005',
    'PROSES', 1, '{"request_category":"non_asset"}'::jsonb, '{}'::jsonb
  ) returning id into v_registration_id;
  insert into public.surat_signatures (surat_id, user_id, form_usage_step_id, attachment_requirements_snapshot)
  values (v_registration_id, '40000000-0000-4000-8000-000000000006', v_step_id,
    '[{"requirement_key":"rab","label":"RAB","is_required":true,"min_files":1}]'::jsonb)
  returning id into v_signature_id;

  perform set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000005', true);
  v_threw := false;
  begin
    perform public.verify_surat_signature_v2(v_signature_id, '', '{"checker_input":{}}'::jsonb);
  exception when others then
    v_threw := position('Nominal Disetujui wajib diisi' in sqlerrm) > 0;
  end;
  if not v_threw then raise exception 'required checker input was bypassed'; end if;

  v_threw := false;
  begin
    perform public.verify_surat_signature_v2(v_signature_id, '', '{"checker_input":{"approved_amount":1250000}}'::jsonb);
  exception when others then
    v_threw := position('Lampiran pemeriksaan belum lengkap' in sqlerrm) > 0;
  end;
  if not v_threw then raise exception 'required checker attachment was bypassed'; end if;
  insert into public.surat_attachments (surat_id, signature_id, stage, requirement_key)
  values (v_registration_id, v_signature_id, 'approval', 'rab');

  perform public.verify_surat_signature_v2(
    v_signature_id,
    'Nominal telah diperiksa',
    '{"checker_input":{"approved_amount":1250000,"ignored_key":"must not persist"}}'::jsonb
  );
  select form_input_data #>> array['checker_inputs', v_signature_id::text, 'approved_amount']
  into v_value from public.surat_registrasi where id = v_registration_id;
  if v_value <> '1250000' then raise exception 'checker input was not persisted canonically'; end if;
  if exists (
    select 1 from public.surat_registrasi
    where id = v_registration_id
      and form_input_data #> array['checker_inputs', v_signature_id::text] ? 'ignored_key'
  ) then raise exception 'undeclared checker input key was persisted'; end if;

  -- Friendly duplicate attachment diagnostic occurs before lower-level unique violation.
  v_threw := false;
  begin
    perform public.save_form_usage_config(
      null,
      '{"name":"Duplicate Test","external_revision_policy":{"recipient_type":"requester","recipient_step_order":null,"approval_restart_step":1}}'::jsonb,
      array[]::uuid[],
      '[{"step_order":1,"role_name":"membuat","label":"Pemohon","action_type":"approval","assignee_mode":"requester"}]'::jsonb,
      '[{"stage_order":0,"requirement_key":"rab"},{"stage_order":0,"requirement_key":"RAB"}]'::jsonb,
      '[]'::jsonb
    );
  exception when others then
    v_threw := position('tidak boleh duplikat' in sqlerrm) > 0;
  end;
  if not v_threw then raise exception 'duplicate attachment key was not rejected clearly'; end if;

  v_usage_id := public.save_form_usage_config(
    null,
    '{"name":"Configured Save Test"}'::jsonb,
    array[]::uuid[],
    '[{"step_order":1,"role_name":"memeriksa","label":"Manager Pemeriksa","action_type":"configured_input","assignee_mode":"select","input_schema":{"fields":[{"key":"approved_amount","label":"Nominal","type":"money","required":true}]}}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  );
  if not exists (
    select 1 from public.form_usage_steps
    where usage_id = v_usage_id and action_type = 'configured_input'
      and input_schema->'fields'->0->>'key' = 'approved_amount'
  ) then raise exception 'configured checker schema did not survive the legacy save path'; end if;

  v_threw := false;
  begin
    insert into public.form_usage_steps (usage_id, step_order, role_name, label, action_type)
    values (v_usage_id, 2, 'memeriksa', 'Tahap Tanpa Schema', 'configured_input');
    set constraints require_configured_checker_input_schema_on_write immediate;
  exception when others then
    v_threw := position('Schema input pemeriksa tidak valid' in sqlerrm) > 0;
  end;
  if not v_threw then raise exception 'direct configured input without schema was accepted'; end if;

  raise notice 'SUR-17 canonical submission workflows: all assertions passed';
end;
$$;
