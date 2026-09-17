begin;

do $$
declare
  v_form_id uuid;
  v_marketing_id uuid;
  v_hrd_id uuid;
  v_planning_id uuid;
  v_direksi_id uuid;
  v_usage_id uuid;
  v_usage record;
  v_step record;
begin
  select id into v_form_id
  from public.master_forms
  where upper(coalesce(nama_form, '')) like '%PERMINTAAN BARANG%JASA%'
  order by created_at desc
  limit 1;
  select id into v_marketing_id from public.master_departments where name = 'Marketing';
  select id into v_hrd_id from public.master_departments where name = 'HRD & GA';
  select id into v_planning_id from public.master_departments where name = 'Perencanaan';
  select id into v_direksi_id from public.master_departments where name = 'Direksi';

  if v_form_id is null or v_marketing_id is null or v_hrd_id is null or v_planning_id is null or v_direksi_id is null then
    raise exception 'Master form atau departemen wajib untuk workflow kanonikal belum tersedia.';
  end if;

  create temporary table canonical_usages (
    workflow_key text primary key,
    usage_id uuid,
    name text not null,
    description text not null,
    request_category text not null,
    scope_type text not null,
    sort_order integer not null,
    department_mode text not null
  ) on commit drop;

  insert into canonical_usages (workflow_key, name, description, request_category, scope_type, sort_order, department_mode)
  values
    ('pusat_spk_unit', 'SPK Unit - Kantor Pusat', 'Pengajuan SPK Unit oleh departemen Marketing. Pemohon tidak ikut tanda tangan.', 'unit', 'pusat', 10, 'marketing'),
    ('pusat_asset', 'Pengajuan Aset - Kantor Pusat', 'Pengajuan aset Pusat dari departemen selain HRD & GA.', 'asset', 'pusat', 20, 'pusat_non_hrd'),
    ('pusat_asset_hrd', 'Pengajuan Aset HRD & GA - Kantor Pusat', 'Jalur khusus pengajuan aset dari HRD & GA.', 'asset', 'pusat', 21, 'hrd'),
    ('pusat_fund', 'Pengajuan Dana - Kantor Pusat', 'Pengajuan dana Pusat dari departemen selain HRD & GA.', 'non_asset', 'pusat', 30, 'pusat_non_hrd'),
    ('pusat_fund_hrd', 'Pengajuan Dana HRD & GA - Kantor Pusat', 'Jalur khusus pengajuan dana dari HRD & GA.', 'non_asset', 'pusat', 31, 'hrd'),
    ('cabang_spk_non_unit', 'SPK Non Unit - Kantor Cabang', 'Pengajuan SPK Non Unit dari kantor cabang.', 'non_unit', 'cabang', 40, 'cabang_all'),
    ('cabang_asset', 'Pengajuan Aset - Kantor Cabang', 'Pengajuan aset yang dapat dibuat seluruh karyawan cabang.', 'asset', 'cabang', 50, 'cabang_all'),
    ('cabang_fund', 'Pengajuan Dana - Kantor Cabang', 'Pengajuan dana cabang; pemohon ikut tanda tangan.', 'non_asset', 'cabang', 60, 'cabang_all');

  update public.form_usages
  set status = 'archived', updated_at = clock_timestamp()
  where status = 'active' and name <> 'Rekomendasi Peremajaan Aset';

  update public.form_usages
  set is_system_template = true, updated_at = clock_timestamp()
  where status = 'active' and name = 'Rekomendasi Peremajaan Aset';

  for v_usage in select * from canonical_usages order by sort_order
  loop
    insert into public.form_usages (
      form_id, name, description, request_category, scope_type, status, sort_order,
      external_revision_policy
    ) values (
      v_form_id, v_usage.name, v_usage.description, v_usage.request_category,
      v_usage.scope_type, 'active', v_usage.sort_order,
      '{"recipient_type":"requester","recipient_step_order":null,"approval_restart_step":1}'::jsonb
    ) returning id into v_usage_id;
    update canonical_usages set usage_id = v_usage_id where workflow_key = v_usage.workflow_key;
  end loop;

  insert into public.form_usage_departments (usage_id, department_id)
  select usage.usage_id, v_marketing_id from canonical_usages usage where usage.department_mode = 'marketing'
  union all
  select usage.usage_id, v_hrd_id from canonical_usages usage where usage.department_mode = 'hrd'
  union all
  select distinct usage.usage_id, profile.department_id
  from canonical_usages usage
  join public.profiles profile on profile.is_active is true and profile.deleted_at is null
  join public.master_offices office on office.id = profile.office_id
  where usage.department_mode = 'pusat_non_hrd'
    and lower(coalesce(office.kedudukan, '')) = 'pusat'
    and profile.department_id is not null
    and profile.department_id not in (v_hrd_id, v_direksi_id)
  union all
  select distinct usage.usage_id, profile.department_id
  from canonical_usages usage
  join public.profiles profile on profile.is_active is true and profile.deleted_at is null
  join public.master_offices office on office.id = profile.office_id
  where usage.department_mode = 'cabang_all'
    and lower(coalesce(office.kedudukan, '')) <> 'pusat'
    and profile.department_id is not null
  on conflict do nothing;

  create temporary table canonical_steps (
    workflow_key text not null,
    step_order integer not null,
    role_name text not null,
    label text not null,
    action_type text not null default 'approval',
    assignee_mode text not null default 'select',
    candidate_scope text not null default 'manual',
    candidate_key text,
    verifier_key text,
    verifier_scope text not null default 'request_office',
    input_schema jsonb not null default '{}'::jsonb,
    skip_if_no_candidate boolean not null default false,
    candidate_fallback_mode text,
    primary key (workflow_key, step_order)
  ) on commit drop;

  insert into canonical_steps (workflow_key, step_order, role_name, label, action_type, assignee_mode, candidate_scope, candidate_key, verifier_key)
  values
    ('pusat_spk_unit', 1, 'membuat', 'Asisten Mgr. Marketing', 'approval', 'select', 'head_office', 'assistant_marketing', null),
    ('pusat_spk_unit', 2, 'membuat', 'Mgr. Marketing', 'approval', 'select', 'head_office', 'manager_marketing', null),
    ('pusat_spk_unit', 3, 'memeriksa', 'Mgr. Perencanaan', 'unit_allocation', 'select', 'head_office', 'planning_manager', 'planning_admin'),
    ('pusat_spk_unit', 4, 'menyetujui', 'Direktur II', 'approval', 'select', 'head_office', 'directors', null),
    ('pusat_spk_unit', 5, 'menyetujui', 'Direktur I', 'approval', 'select', 'head_office', 'directors', null),

    ('pusat_asset', 1, 'membuat', 'Pemohon', 'approval', 'requester', 'manual', null, null),
    ('pusat_asset', 2, 'membuat', 'Mgr. Departemen', 'approval', 'select', 'request_department', 'department_managers', null),
    ('pusat_asset', 3, 'memeriksa', 'Mgr. HRD & GA', 'approval', 'select', 'head_office', 'hrd_manager', null),
    ('pusat_asset', 4, 'menyetujui', 'Direktur I', 'approval', 'select', 'head_office', 'directors', null),
    ('pusat_asset', 5, 'menyetujui', 'Direktur Utama', 'approval', 'select', 'head_office', 'directors', null),

    ('pusat_asset_hrd', 1, 'membuat', 'Pemohon HRD & GA', 'approval', 'requester', 'manual', null, null),
    ('pusat_asset_hrd', 2, 'memeriksa', 'Mgr. HRD & GA', 'approval', 'select', 'request_department', 'hrd_manager', null),
    ('pusat_asset_hrd', 3, 'menyetujui', 'Direktur I', 'approval', 'select', 'head_office', 'directors', null),
    ('pusat_asset_hrd', 4, 'menyetujui', 'Direktur Utama', 'approval', 'select', 'head_office', 'directors', null),

    ('pusat_fund', 1, 'membuat', 'Pemohon', 'approval', 'requester', 'manual', null, null),
    ('pusat_fund', 2, 'membuat', 'Mgr. Departemen', 'approval', 'select', 'request_department', 'department_managers', null),
    ('pusat_fund', 3, 'memeriksa', 'Mgr. HRD & GA', 'approval', 'select', 'head_office', 'hrd_manager', null),
    ('pusat_fund', 4, 'menyetujui', 'Direktur I', 'approval', 'select', 'head_office', 'directors', null),
    ('pusat_fund', 5, 'menyetujui', 'Direktur Utama', 'approval', 'select', 'head_office', 'directors', null),

    ('pusat_fund_hrd', 1, 'membuat', 'Pemohon HRD & GA', 'approval', 'requester', 'manual', null, null),
    ('pusat_fund_hrd', 2, 'memeriksa', 'Mgr. HRD & GA', 'approval', 'select', 'request_department', 'hrd_manager', null),
    ('pusat_fund_hrd', 3, 'menyetujui', 'Direktur I', 'approval', 'select', 'head_office', 'directors', null),
    ('pusat_fund_hrd', 4, 'menyetujui', 'Direktur Utama', 'approval', 'select', 'head_office', 'directors', null),

    ('cabang_spk_non_unit', 1, 'membuat', 'SPV Teknik', 'approval', 'select', 'request_office', 'branch_spv_technical', null),
    ('cabang_spk_non_unit', 2, 'membuat', 'Assistant Branch Manager', 'approval', 'select', 'request_office', 'branch_abm', null),
    ('cabang_spk_non_unit', 3, 'membuat', 'Branch Manager', 'approval', 'select', 'request_office', 'branch_manager', null),
    ('cabang_spk_non_unit', 4, 'memeriksa', 'Mgr. Perencanaan', 'approval', 'select', 'head_office', 'planning_manager', null),
    ('cabang_spk_non_unit', 5, 'menyetujui', 'Direktur II', 'approval', 'select', 'head_office', 'directors', null),
    ('cabang_spk_non_unit', 6, 'menyetujui', 'Direktur I', 'approval', 'select', 'head_office', 'directors', null),
    ('cabang_spk_non_unit', 7, 'menyetujui', 'Direktur Utama', 'approval', 'select', 'head_office', 'directors', null),

    ('cabang_asset', 1, 'membuat', 'Pemohon', 'approval', 'requester', 'manual', null, null),
    ('cabang_asset', 2, 'membuat', 'Branch Manager', 'approval', 'select', 'request_office', 'branch_manager', null),
    ('cabang_asset', 3, 'memeriksa', 'Mgr. HRD & GA', 'approval', 'select', 'head_office', 'hrd_manager', null),
    ('cabang_asset', 4, 'menyetujui', 'Direktur I', 'approval', 'select', 'head_office', 'directors', null),
    ('cabang_asset', 5, 'menyetujui', 'Direktur Utama', 'approval', 'select', 'head_office', 'directors', null),

    ('cabang_fund', 1, 'membuat', 'Pemohon', 'approval', 'requester', 'manual', null, null),
    ('cabang_fund', 2, 'membuat', 'Branch Manager', 'approval', 'select', 'request_office', 'branch_manager', null),
    ('cabang_fund', 3, 'memeriksa', 'Manager Terkait', 'approval', 'select', 'head_office', 'department_managers', null),
    ('cabang_fund', 4, 'menyetujui', 'Direktur I', 'approval', 'select', 'head_office', 'directors', null),
    ('cabang_fund', 5, 'menyetujui', 'Direktur Utama', 'approval', 'select', 'head_office', 'directors', null);

  update canonical_steps
  set action_type = 'configured_input', verifier_key = 'planning_admin',
      verifier_scope = 'head_office',
      input_schema = '{"title":"Pemeriksaan Dana","description":"Operator Perencanaan melengkapi nominal hasil pemeriksaan sebelum persetujuan.","fields":[{"key":"reviewed_amount","label":"Nominal hasil pemeriksaan (Rp)","type":"money","required":true,"min":0}]}'::jsonb
  where (workflow_key = 'pusat_fund' and step_order = 3)
     or (workflow_key = 'pusat_fund_hrd' and step_order = 2)
     or (workflow_key = 'cabang_fund' and step_order = 3);

  update canonical_steps
  set skip_if_no_candidate = true
  where workflow_key = 'cabang_spk_non_unit' and step_order = 2;

  update canonical_steps
  set candidate_fallback_mode = 'request_office_all'
  where (workflow_key = 'cabang_spk_non_unit' and step_order = 3)
     or (workflow_key = 'cabang_asset' and step_order = 2)
     or (workflow_key = 'cabang_fund' and step_order = 2);

  insert into public.form_usage_steps (
    usage_id, step_order, role_name, label, action_type, assignee_mode,
    candidate_scope, signer_department_id, input_schema, verifier_department_id, verifier_scope,
    skip_if_no_candidate, candidate_fallback_mode
  )
  select usage.usage_id, step.step_order, step.role_name, step.label, step.action_type,
         step.assignee_mode, step.candidate_scope,
         case
           when step.candidate_key in ('assistant_marketing', 'manager_marketing') then v_marketing_id
           when step.candidate_key = 'hrd_manager' then v_hrd_id
           when step.candidate_key = 'directors' then v_direksi_id
           else null
         end,
         step.input_schema,
         case when step.verifier_key = 'planning_admin' then v_planning_id else null end,
         step.verifier_scope,
         step.skip_if_no_candidate,
         step.candidate_fallback_mode
  from canonical_steps step
  join canonical_usages usage using (workflow_key);

  insert into public.form_usage_step_users (usage_step_id, user_id)
  select distinct target_step.id, profile.id
  from canonical_steps definition
  join canonical_usages usage using (workflow_key)
  join public.form_usage_steps target_step
    on target_step.usage_id = usage.usage_id and target_step.step_order = definition.step_order
  join public.profiles profile on profile.is_active is true and profile.deleted_at is null
  left join public.master_departments department on department.id = profile.department_id
  left join public.master_offices office on office.id = profile.office_id
  where definition.assignee_mode = 'select'
    and (
      (definition.candidate_key = 'assistant_marketing' and department.name = 'Marketing' and lower(coalesce(profile.job_title, '')) like '%assistant%manager%marketing%')
      or (definition.candidate_key = 'manager_marketing' and department.name = 'Marketing' and lower(coalesce(profile.job_title, '')) like '%manager marketing%' and lower(coalesce(profile.job_title, '')) not like '%assistant%')
      or (definition.candidate_key = 'hrd_manager' and department.name = 'HRD & GA' and lower(coalesce(office.kedudukan, '')) = 'pusat' and lower(coalesce(profile.job_title, '')) in ('manager', 'manager hrd & ga', 'manager hrd ga'))
      or (definition.candidate_key = 'directors' and department.name = 'Direksi' and lower(coalesce(office.kedudukan, '')) = 'pusat' and lower(coalesce(profile.job_title, '')) like 'direktur%')
      or (definition.candidate_key = 'branch_spv_technical' and department.name = 'Teknik (Cabang)' and lower(coalesce(profile.job_title, '')) like '%supervisor teknik%')
      or (definition.candidate_key = 'branch_abm' and department.name = 'Branch Manager' and lower(coalesce(profile.job_title, '')) like '%assistant branch manager%')
      or (definition.candidate_key = 'branch_manager' and department.name = 'Branch Manager' and lower(coalesce(profile.job_title, '')) = 'branch manager')
      or (
        definition.candidate_key = 'department_managers'
        and lower(coalesce(office.kedudukan, '')) = 'pusat'
        and department.name <> 'Direksi'
        and (
          lower(coalesce(profile.job_title, '')) like 'manager%'
          or exists (
            select 1
            from public.form_usages old_usage
            join public.form_usage_steps old_step on old_step.usage_id = old_usage.id
            join public.form_usage_step_users old_candidate on old_candidate.usage_step_id = old_step.id
            where old_usage.name in ('Permohonan Aset (Pusat)', 'Permohonan Non Aset (Pusat)')
              and old_step.label in ('Pimpinan Departemen', 'Mgr. Departemen Terkait')
              and old_candidate.user_id = profile.id
          )
        )
      )
      or (
        definition.candidate_key = 'planning_manager'
        and exists (
          select 1
          from public.form_usages old_usage
          join public.form_usage_steps old_step on old_step.usage_id = old_usage.id
          join public.form_usage_step_users old_candidate on old_candidate.usage_step_id = old_step.id
          where old_usage.name in ('Permohonan Order Bangun Marketing', 'Permohonan Teknik Cabang')
            and old_step.label = 'Mgr. Perencanaan'
            and old_candidate.user_id = profile.id
        )
      )
    )
  on conflict do nothing;

  insert into public.form_usage_attachment_requirements (
    usage_id, usage_step_id, stage_order, requirement_key, label,
    is_required, allow_multiple, min_files, max_files, allowed_types, max_size_bytes, sort_order
  )
  select usage.usage_id, target_step.id, definition.step_order, 'rab', 'RAB hasil pemeriksaan',
         true, false, 1, 1, array['application/pdf'], 10485760, 0
  from canonical_steps definition
  join canonical_usages usage using (workflow_key)
  join public.form_usage_steps target_step
    on target_step.usage_id = usage.usage_id and target_step.step_order = definition.step_order
  where definition.action_type = 'configured_input';

  insert into public.form_usage_step_verifiers (usage_step_id, user_id)
  select distinct target_step.id, profile.id
  from canonical_steps definition
  join canonical_usages usage using (workflow_key)
  join public.form_usage_steps target_step
    on target_step.usage_id = usage.usage_id and target_step.step_order = definition.step_order
  join public.profiles profile on profile.is_active is true and profile.deleted_at is null
  join public.master_departments department on department.id = profile.department_id
  where definition.verifier_key = 'planning_admin'
    and department.name = 'Perencanaan'
    and lower(coalesce(profile.job_title, '')) like '%admin%perencanaan%'
  on conflict do nothing;

  for v_step in
    select usage.name as usage_name, step.id, step.label, step.assignee_mode, step.action_type,
           step.skip_if_no_candidate, step.candidate_fallback_mode
    from canonical_usages usage
    join public.form_usage_steps step on step.usage_id = usage.usage_id
  loop
    if v_step.assignee_mode = 'select'
       and v_step.skip_if_no_candidate is not true
       and v_step.candidate_fallback_mode is null
       and not exists (
      select 1 from public.form_usage_step_users candidate where candidate.usage_step_id = v_step.id
    ) then
      raise exception 'Workflow % tidak memiliki kandidat untuk tahap %.', v_step.usage_name, v_step.label;
    end if;
    if v_step.action_type in ('unit_allocation', 'configured_input') and not exists (
      select 1 from public.form_usage_step_verifiers verifier where verifier.usage_step_id = v_step.id
    ) then
      raise exception 'Workflow % tidak memiliki operator untuk tahap %.', v_step.usage_name, v_step.label;
    end if;
  end loop;
end;
$$;

commit;
