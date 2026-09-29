-- MAR-10: Seed master form dan kegunaan KEU 1 (FM-UAI.KEU-01-00)
-- dengan alur persetujuan sesuai keputusan pemilik:
--   Membuat = Staff
--   Memeriksa pertama = BM (cabang) / Mgr dari staff pemohon (pusat)
--   Memeriksa berikutnya = Mgr HRD & GA
--   Menyetujui = Mgr Keuangan

begin;

do $$
declare
  v_form_id uuid;
  v_hrd_id uuid;
  v_keuangan_id uuid;
  v_direksi_id uuid;
  v_usage_id_pusat uuid;
  v_usage_id_cabang uuid;
  v_existing_pusat uuid;
  v_existing_cabang uuid;
begin
  -- Master form KEU 1
  select id into v_form_id
  from public.master_forms
  where upper(coalesce(nama_form, '')) like '%KAS KECIL%'
    and upper(coalesce(nomor_form, '')) like '%KEU%'
  order by created_at desc
  limit 1;

  if v_form_id is null then
    insert into public.master_forms (nama_form, nomor_form, status, signature_layout)
    values (
      'FORM PENGAJUAN KAS KECIL',
      'FM-UAI.KEU-01-00',
      'active',
      '{"enabled":true,"sheet":1,"region":"lower_right","max_per_row":2,"show_role":true,"show_name":true,"show_job_title":true}'::jsonb
    )
    returning id into v_form_id;
  end if;

  select id into v_hrd_id from public.master_departments where name = 'HRD & GA';
  select id into v_keuangan_id from public.master_departments where name = 'Keuangan & Akuntansi';
  select id into v_direksi_id from public.master_departments where name = 'Direksi';

  if v_hrd_id is null or v_keuangan_id is null then
    raise notice 'Departemen HRD & GA atau Keuangan tidak ditemukan; seed KEU 1 dilewati.';
    return;
  end if;

  -- Pusat usage
  select id into v_existing_pusat
  from public.form_usages
  where form_id = v_form_id and scope_type = 'pusat' and status = 'active'
  limit 1;

  if v_existing_pusat is null then
    insert into public.form_usages (
      form_id, name, description, request_category, scope_type, status, sort_order,
      external_revision_policy
    ) values (
      v_form_id,
      'Pengajuan Kas Kecil - Kantor Pusat',
      'Pengajuan kas kecil / dana operasional kantor pusat sesuai FM-UAI.KEU-01-00.',
      'non_asset',
      'pusat',
      'active',
      70,
      '{"recipient_type":"requester","recipient_step_order":null,"approval_restart_step":1}'::jsonb
    ) returning id into v_usage_id_pusat;

    insert into public.form_usage_departments (usage_id, department_id)
    select v_usage_id_pusat, profile.department_id
    from public.profiles profile
    join public.master_offices office on office.id = profile.office_id
    where profile.is_active is true
      and profile.deleted_at is null
      and lower(coalesce(office.kedudukan, '')) = 'pusat'
      and profile.department_id is not null
      and profile.department_id not in (v_direksi_id)
    group by profile.department_id;

    insert into public.form_usage_steps (
      usage_id, step_order, role_name, label, action_type, assignee_mode,
      candidate_scope, input_schema, skip_if_no_candidate
    ) values
      (v_usage_id_pusat, 1, 'membuat', 'Pemohon', 'approval', 'requester', 'manual', '{}'::jsonb, false),
      (v_usage_id_pusat, 2, 'memeriksa', 'Mgr. Departemen Pemohon', 'approval', 'select', 'request_department', '{}'::jsonb, false),
      (v_usage_id_pusat, 3, 'memeriksa', 'Mgr. HRD & GA', 'approval', 'select', 'head_office', '{}'::jsonb, false),
      (v_usage_id_pusat, 4, 'menyetujui', 'Mgr. Keuangan', 'approval', 'select', 'head_office', '{}'::jsonb, false);
  end if;

  -- Cabang usage
  select id into v_existing_cabang
  from public.form_usages
  where form_id = v_form_id and scope_type = 'cabang' and status = 'active'
  limit 1;

  if v_existing_cabang is null then
    insert into public.form_usages (
      form_id, name, description, request_category, scope_type, status, sort_order,
      external_revision_policy
    ) values (
      v_form_id,
      'Pengajuan Kas Kecil - Kantor Cabang',
      'Pengajuan kas kecil / dana operasional kantor cabang sesuai FM-UAI.KEU-01-00.',
      'non_asset',
      'cabang',
      'active',
      71,
      '{"recipient_type":"requester","recipient_step_order":null,"approval_restart_step":1}'::jsonb
    ) returning id into v_usage_id_cabang;

    insert into public.form_usage_departments (usage_id, department_id)
    select v_usage_id_cabang, profile.department_id
    from public.profiles profile
    join public.master_offices office on office.id = profile.office_id
    where profile.is_active is true
      and profile.deleted_at is null
      and lower(coalesce(office.kedudukan, '')) <> 'pusat'
      and profile.department_id is not null
    group by profile.department_id;

    insert into public.form_usage_steps (
      usage_id, step_order, role_name, label, action_type, assignee_mode,
      candidate_scope, input_schema, skip_if_no_candidate, candidate_fallback_mode
    ) values
      (v_usage_id_cabang, 1, 'membuat', 'Pemohon', 'approval', 'requester', 'manual', '{}'::jsonb, false, null),
      (v_usage_id_cabang, 2, 'memeriksa', 'Branch Manager', 'approval', 'select', 'request_office', '{}'::jsonb, false, 'request_office_all'),
      (v_usage_id_cabang, 3, 'memeriksa', 'Mgr. HRD & GA', 'approval', 'select', 'head_office', '{}'::jsonb, false, null),
      (v_usage_id_cabang, 4, 'menyetujui', 'Mgr. Keuangan', 'approval', 'select', 'head_office', '{}'::jsonb, false, null);
  end if;
end;
$$;

commit;
