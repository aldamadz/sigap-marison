alter table public.form_usage_steps
  drop constraint if exists form_usage_steps_candidate_scope_check;

alter table public.form_usage_steps
  add constraint form_usage_steps_candidate_scope_check
  check (candidate_scope in (
    'manual',
    'request_office',
    'request_department',
    'branch_office_or_request_department',
    'head_office',
    'all_offices'
  ));

do $$
declare
  v_marketing_id uuid;
  v_marketing_cabang_id uuid;
begin
  select id into v_marketing_id from public.master_departments where name = 'Marketing';
  select id into v_marketing_cabang_id from public.master_departments where name = 'Marketing (Cabang)';

  if v_marketing_id is not null and v_marketing_cabang_id is not null then
    update public.profiles profile
    set department_id = v_marketing_id,
        updated_at = now()
    from public.master_offices office
    where office.id = profile.office_id
      and lower(coalesce(office.kedudukan, '')) = 'pusat'
      and profile.department_id = v_marketing_cabang_id;

    update public.form_usage_steps step
    set signer_department_id = v_marketing_id
    from public.form_usage_step_users candidate
    join public.profiles profile on profile.id = candidate.user_id
    where candidate.usage_step_id = step.id
      and step.label in ('Mgr. Marketing', 'Manager Marketing')
      and step.candidate_scope = 'head_office'
      and lower(coalesce(profile.job_title, '')) like '%manager marketing%';
  end if;
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
  v_registration_office_kedudukan text;
  v_registration_dept_id uuid;
  v_step public.form_usage_steps;
  v_verifiers jsonb := '[]'::jsonb;
begin
  select
    registration.form_usage_id,
    registration.office_id,
    lower(coalesce(registration_office.kedudukan, '')),
    coalesce(registration.represented_department_id, registration.dept_id),
    coalesce(usage.scope_type, 'all')
  into v_usage_id, v_registration_office_id, v_registration_office_kedudukan, v_registration_dept_id, v_usage_scope
  from public.surat_registrasi as registration
  left join public.form_usages usage on usage.id = registration.form_usage_id
  left join public.master_offices registration_office on registration_office.id = registration.office_id
  where registration.id = new.surat_id;

  if v_usage_id is null then
    return new;
  end if;

  if new.form_usage_step_id is null then
    raise exception 'Tahap kegunaan form wajib disimpan pada signer.';
  end if;

  select *
  into v_step
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
        or (v_step.candidate_scope = 'request_department' and profile.department_id = v_registration_dept_id)
        or (
          v_step.candidate_scope = 'branch_office_or_request_department'
          and (
            (
              v_registration_office_kedudukan = 'pusat'
              and profile.department_id = v_registration_dept_id
              and lower(coalesce(office.kedudukan, '')) = 'pusat'
            )
            or (
              v_registration_office_kedudukan <> 'pusat'
              and profile.office_id = v_registration_office_id
            )
          )
        )
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

update public.form_usage_steps step
set candidate_scope = 'branch_office_or_request_department',
    signer_department_id = null
from public.form_usages usage
where usage.id = step.usage_id
  and usage.name = 'Permohonan Karangan bunga untuk Karyawan Cabang + Pusat, Relasi.'
  and step.label = 'BM / Pimpinan Departemen';

delete from public.form_usage_step_users
where usage_step_id in (
  select step.id
  from public.form_usage_steps step
  join public.form_usages usage on usage.id = step.usage_id
  where (
    usage.name in (
      'Permohonan Aset (Pusat)',
      'Permohonan Non Aset (Pusat)',
      'Entertain Pusat ( perintis, dinas, perbankan, relasi, pemangku wilayah, dll.)'
    )
    and step.label in ('Pimpinan Departemen', 'Mgr. Departemen Terkait')
  )
  or (
    usage.name = 'Permohonan Karangan bunga untuk Karyawan Cabang + Pusat, Relasi.'
    and step.label = 'BM / Pimpinan Departemen'
  )
  or step.label in ('Mgr. Marketing', 'Manager Marketing')
);

insert into public.form_usage_step_users (usage_step_id, user_id)
select distinct step.id, profile.id
from public.form_usage_steps step
join public.form_usages usage on usage.id = step.usage_id
join public.profiles profile on profile.is_active = true
join public.master_offices office on office.id = profile.office_id
join public.master_departments department on department.id = profile.department_id
where usage.name in (
    'Permohonan Aset (Pusat)',
    'Permohonan Non Aset (Pusat)',
    'Entertain Pusat ( perintis, dinas, perbankan, relasi, pemangku wilayah, dll.)'
  )
  and step.label in ('Pimpinan Departemen', 'Mgr. Departemen Terkait')
  and lower(coalesce(office.kedudukan, '')) = 'pusat'
  and lower(coalesce(profile.job_title, '')) like 'manager %'
  and department.name in (
    'HRD & GA',
    'Keuangan & Akuntansi',
    'Legal Lahan',
    'Legal Proyek',
    'Marketing',
    'Pengadaan',
    'Pengembangan Bisnis',
    'Pengembangan Organisasi',
    'Perencanaan'
  )
on conflict do nothing;

insert into public.form_usage_step_users (usage_step_id, user_id)
select distinct step.id, profile.id
from public.form_usage_steps step
join public.form_usages usage on usage.id = step.usage_id
join public.profiles profile on profile.is_active = true
join public.master_offices office on office.id = profile.office_id
join public.master_departments department on department.id = profile.department_id
where usage.name = 'Permohonan Karangan bunga untuk Karyawan Cabang + Pusat, Relasi.'
  and step.label = 'BM / Pimpinan Departemen'
  and (
    (department.name = 'Branch Manager' and lower(coalesce(profile.job_title, '')) like '%branch manager%')
    or (
      lower(coalesce(office.kedudukan, '')) = 'pusat'
      and lower(coalesce(profile.job_title, '')) like 'manager %'
      and department.name in (
        'HRD & GA',
        'Keuangan & Akuntansi',
        'Legal Lahan',
        'Legal Proyek',
        'Marketing',
        'Pengadaan',
        'Pengembangan Bisnis',
        'Pengembangan Organisasi',
        'Perencanaan'
      )
    )
  )
on conflict do nothing;

insert into public.form_usage_step_users (usage_step_id, user_id)
select distinct step.id, profile.id
from public.form_usage_steps step
join public.profiles profile on profile.is_active = true
join public.master_offices office on office.id = profile.office_id
join public.master_departments department on department.id = profile.department_id
where step.label in ('Mgr. Marketing', 'Manager Marketing')
  and step.candidate_scope = 'head_office'
  and lower(coalesce(office.kedudukan, '')) = 'pusat'
  and department.name = 'Marketing'
  and lower(coalesce(profile.job_title, '')) like '%manager marketing%'
on conflict do nothing;

do $$
declare
  v_form_id uuid;
  v_operasional_id uuid;
  v_hrd_id uuid;
  v_direksi_id uuid;
  v_usage_id uuid;
  v_spv_step uuid;
  v_hrd_step uuid;
  v_dir_i_step uuid;
  v_dirut_step uuid;
begin
  select id into v_form_id
  from public.master_forms
  where upper(coalesce(nama_form, '')) like '%PERMINTAAN BARANG%JASA%'
  order by created_at desc
  limit 1;

  select id into v_operasional_id from public.master_departments where name = 'Operasional Kost';
  select id into v_hrd_id from public.master_departments where name = 'HRD & GA';
  select id into v_direksi_id from public.master_departments where name = 'Direksi';

  if v_form_id is not null and v_operasional_id is not null and v_hrd_id is not null and v_direksi_id is not null then
    select id into v_usage_id
    from public.form_usages
    where name = 'Permohonan Operasional Kost'
    order by created_at desc
    limit 1;

    if v_usage_id is null then
      insert into public.form_usages (form_id, name, description, request_category, scope_type, status, sort_order)
      values (
        v_form_id,
        'Permohonan Operasional Kost',
        'Kegunaan PGD untuk pengajuan dari Operasional Kost.',
        'non_asset',
        'all',
        'active',
        350
      )
      returning id into v_usage_id;
    else
      update public.form_usages
      set form_id = v_form_id,
          description = 'Kegunaan PGD untuk pengajuan dari Operasional Kost.',
          request_category = 'non_asset',
          scope_type = 'all',
          status = 'active',
          sort_order = 350,
          updated_at = now()
      where id = v_usage_id;
    end if;

    insert into public.form_usage_departments (usage_id, department_id)
    values (v_usage_id, v_operasional_id)
    on conflict do nothing;

    delete from public.form_usage_step_users
    where usage_step_id in (select id from public.form_usage_steps where usage_id = v_usage_id);
    delete from public.form_usage_steps where usage_id = v_usage_id;

    insert into public.form_usage_steps (usage_id, step_order, role_name, label, signer_department_id, action_type, candidate_scope)
    values
      (v_usage_id, 1, 'membuat', 'SPV Kost', v_operasional_id, 'approval', 'all_offices'),
      (v_usage_id, 2, 'memeriksa', 'Mgr. HRD GA', v_hrd_id, 'approval', 'head_office'),
      (v_usage_id, 3, 'menyetujui', 'Direktur I', v_direksi_id, 'approval', 'head_office'),
      (v_usage_id, 4, 'menyetujui', 'Direktur Utama', v_direksi_id, 'approval', 'head_office');

    select id into v_spv_step from public.form_usage_steps where usage_id = v_usage_id and step_order = 1;
    select id into v_hrd_step from public.form_usage_steps where usage_id = v_usage_id and step_order = 2;
    select id into v_dir_i_step from public.form_usage_steps where usage_id = v_usage_id and step_order = 3;
    select id into v_dirut_step from public.form_usage_steps where usage_id = v_usage_id and step_order = 4;

    insert into public.form_usage_step_users (usage_step_id, user_id)
    select v_spv_step, profile.id
    from public.profiles profile
    where profile.is_active = true
      and profile.department_id = v_operasional_id
      and lower(coalesce(profile.job_title, '')) like '%supervisor%';

    insert into public.form_usage_step_users (usage_step_id, user_id)
    select v_hrd_step, profile.id
    from public.profiles profile
    join public.master_offices office on office.id = profile.office_id
    where profile.is_active = true
      and profile.department_id = v_hrd_id
      and lower(coalesce(office.kedudukan, '')) = 'pusat'
      and lower(coalesce(profile.job_title, '')) like 'manager hrd%';

    insert into public.form_usage_step_users (usage_step_id, user_id)
    select v_dir_i_step, profile.id
    from public.profiles profile
    join public.master_offices office on office.id = profile.office_id
    where profile.is_active = true
      and profile.department_id = v_direksi_id
      and lower(coalesce(office.kedudukan, '')) = 'pusat'
      and lower(coalesce(profile.job_title, '')) in ('direktur i', 'direktur 1');

    insert into public.form_usage_step_users (usage_step_id, user_id)
    select v_dirut_step, profile.id
    from public.profiles profile
    join public.master_offices office on office.id = profile.office_id
    where profile.is_active = true
      and profile.department_id = v_direksi_id
      and lower(coalesce(office.kedudukan, '')) = 'pusat'
      and lower(coalesce(profile.job_title, '')) = 'direktur utama';
  end if;
end;
$$;

revoke all on function public.validate_form_usage_signature() from public, anon, authenticated;
grant execute on function public.validate_form_usage_signature() to service_role;
