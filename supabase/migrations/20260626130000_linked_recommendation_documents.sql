alter table public.form_usages
  add column if not exists recommendation_config jsonb not null default '{}'::jsonb;

create table if not exists public.surat_linked_documents (
  id uuid primary key default gen_random_uuid(),
  parent_surat_id uuid not null references public.surat_registrasi(id) on delete cascade,
  child_surat_id uuid not null references public.surat_registrasi(id) on delete cascade,
  link_type text not null check (link_type in ('recommendation')),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  required_before_step integer,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parent_surat_id, child_surat_id, link_type)
);

create index if not exists surat_linked_documents_parent_type_idx
  on public.surat_linked_documents(parent_surat_id, link_type, status);

create index if not exists surat_linked_documents_child_idx
  on public.surat_linked_documents(child_surat_id);

alter table public.surat_linked_documents enable row level security;

create or replace function public.can_access_surat(p_surat_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.role::text in ('admin', 'super_admin')
  )
  or exists (
    select 1
    from public.surat_registrasi surat
    where surat.id = p_surat_id
      and (
        surat.created_by = auth.uid()
        or surat.represented_by_admin = auth.uid()
      )
  )
  or exists (
    select 1
    from public.surat_signatures signature
    where signature.surat_id = p_surat_id
      and signature.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.surat_signatures signature
    where signature.surat_id = p_surat_id
      and signature.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
  );
$$;

drop policy if exists surat_linked_documents_select_access on public.surat_linked_documents;
create policy surat_linked_documents_select_access
  on public.surat_linked_documents
  for select
  to authenticated
  using (
    public.can_access_surat(parent_surat_id)
    or public.can_access_surat(child_surat_id)
  );

drop policy if exists surat_linked_documents_insert_access on public.surat_linked_documents;
create policy surat_linked_documents_insert_access
  on public.surat_linked_documents
  for insert
  to authenticated
  with check (
    public.can_access_surat(parent_surat_id)
    and public.can_access_surat(child_surat_id)
  );

create or replace function public.get_surat_linked_documents(p_parent_surat_id uuid)
returns table (
  id uuid,
  parent_surat_id uuid,
  child_surat_id uuid,
  link_type text,
  status text,
  required_before_step integer,
  created_at timestamptz,
  child_no_surat text,
  child_judul_surat text,
  child_status text,
  child_current_step integer,
  child_file_path text,
  child_pdf_path text,
  child_created_at timestamptz,
  child_created_by uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_access_surat(p_parent_surat_id) then
    raise exception 'Akses dokumen tidak diizinkan.';
  end if;

  return query
  select
    link.id,
    link.parent_surat_id,
    link.child_surat_id,
    link.link_type,
    link.status,
    link.required_before_step,
    link.created_at,
    child.no_surat,
    child.judul_surat,
    child.status,
    child.current_step,
    child.file_path,
    child.pdf_path,
    child.created_at,
    child.created_by
  from public.surat_linked_documents link
  join public.surat_registrasi child on child.id = link.child_surat_id
  where link.parent_surat_id = p_parent_surat_id
    and link.status = 'active'
  order by link.created_at desc;
end;
$$;

create or replace function public.link_surat_recommendation(
  p_parent_surat_id uuid,
  p_child_surat_id uuid,
  p_required_before_step integer default null
)
returns public.surat_linked_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.surat_linked_documents;
begin
  if not public.can_access_surat(p_parent_surat_id) then
    raise exception 'Akses surat induk tidak diizinkan.';
  end if;

  if not public.can_access_surat(p_child_surat_id) then
    raise exception 'Akses surat rekomendasi tidak diizinkan.';
  end if;

  insert into public.surat_linked_documents (
    parent_surat_id,
    child_surat_id,
    link_type,
    required_before_step,
    created_by
  )
  values (
    p_parent_surat_id,
    p_child_surat_id,
    'recommendation',
    p_required_before_step,
    auth.uid()
  )
  on conflict (parent_surat_id, child_surat_id, link_type)
  do update set
    status = 'active',
    required_before_step = excluded.required_before_step,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.can_access_surat(uuid) from public, anon;
revoke all on function public.get_surat_linked_documents(uuid) from public, anon;
revoke all on function public.link_surat_recommendation(uuid, uuid, integer) from public, anon;
grant execute on function public.can_access_surat(uuid) to authenticated, service_role;
grant execute on function public.get_surat_linked_documents(uuid) to authenticated, service_role;
grant execute on function public.link_surat_recommendation(uuid, uuid, integer) to authenticated, service_role;

do $$
declare
  v_recommendation_form_id uuid;
  v_recommendation_usage_id uuid;
  v_pbo_department_id uuid;
  v_director_department_id uuid;
  v_recommendation_letter_type_id uuid;
  v_step_id uuid;
begin
  select id
  into v_recommendation_form_id
  from public.master_forms
  where nama_form = 'REKOMENDASI PEREMAJAAN BARANG / ALAT KERJA'
  order by created_at desc nulls last
  limit 1;

  select id
  into v_pbo_department_id
  from public.master_departments
  where code = 'PBO' or lower(name) = lower('Pengembangan Organisasi')
  order by case when code = 'PBO' then 0 else 1 end
  limit 1;

  select id
  into v_director_department_id
  from public.master_departments
  where lower(name) = lower('Direksi')
  limit 1;

  select id
  into v_recommendation_letter_type_id
  from public.master_letter_types
  where lower(name) = lower('Rekomendasi')
     or lower(code) = lower('REK')
  limit 1;

  if v_recommendation_letter_type_id is null then
    insert into public.master_letter_types (name, code, type_index)
    values ('Rekomendasi', 'REK', 7)
    returning id into v_recommendation_letter_type_id;
  end if;

  if v_pbo_department_id is not null and v_recommendation_letter_type_id is not null then
    insert into public.master_dept_letter_types (dept_id, letter_type_id, sort_index)
    values (v_pbo_department_id, v_recommendation_letter_type_id, 7)
    on conflict (dept_id, letter_type_id)
    do update set sort_index = excluded.sort_index;
  end if;

  if v_recommendation_form_id is not null and v_pbo_department_id is not null then
    select id
    into v_recommendation_usage_id
    from public.form_usages
    where name = 'Rekomendasi Peremajaan Aset'
    limit 1;

    if v_recommendation_usage_id is null then
      insert into public.form_usages (
        name,
        description,
        form_id,
        request_category,
        scope_type,
        status,
        sort_order,
        recommendation_config,
        updated_at
      )
      values (
        'Rekomendasi Peremajaan Aset',
        'Dokumen rekomendasi peremajaan barang/alat kerja yang ditautkan ke permohonan aset.',
        v_recommendation_form_id,
        'non_asset',
        'pusat',
        'active',
        30,
        '{}'::jsonb,
        now()
      )
      returning id into v_recommendation_usage_id;
    else
      update public.form_usages
      set form_id = v_recommendation_form_id,
          request_category = 'non_asset',
          scope_type = 'pusat',
          status = 'active',
          updated_at = now()
      where id = v_recommendation_usage_id;
    end if;

    delete from public.form_usage_departments where usage_id = v_recommendation_usage_id;
    insert into public.form_usage_departments (usage_id, department_id)
    values (v_recommendation_usage_id, v_pbo_department_id)
    on conflict do nothing;

    delete from public.form_usage_steps where usage_id = v_recommendation_usage_id;

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
      v_recommendation_usage_id,
      1,
      'membuat',
      'Staff IT',
      v_pbo_department_id,
      'approval',
      'head_office'
    )
    returning id into v_step_id;

    insert into public.form_usage_step_users (usage_step_id, user_id)
    select distinct v_step_id, profile.id
    from public.profiles profile
    join public.master_departments department on department.id = profile.department_id
    where profile.is_active is distinct from false
      and department.id = v_pbo_department_id
      and lower(coalesce(profile.job_title, '')) like '%staff%';

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
      v_recommendation_usage_id,
      2,
      'memeriksa',
      'Mgr. Pengembangan Organisasi',
      v_pbo_department_id,
      'approval',
      'head_office'
    )
    returning id into v_step_id;

    insert into public.form_usage_step_users (usage_step_id, user_id)
    select distinct v_step_id, profile.id
    from public.profiles profile
    join public.master_departments department on department.id = profile.department_id
    where profile.is_active is distinct from false
      and department.id = v_pbo_department_id
      and lower(coalesce(profile.job_title, '')) like 'manager%';

    if v_director_department_id is not null then
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
        v_recommendation_usage_id,
        3,
        'menyetujui',
        'Direktur I',
        v_director_department_id,
        'approval',
        'head_office'
      )
      returning id into v_step_id;

      insert into public.form_usage_step_users (usage_step_id, user_id)
      select distinct v_step_id, profile.id
      from public.profiles profile
      join public.master_departments department on department.id = profile.department_id
      where profile.is_active is distinct from false
        and department.id = v_director_department_id
        and lower(coalesce(profile.job_title, '')) like '%direktur i%';
    end if;

    update public.form_usages usage
    set recommendation_config = jsonb_build_object(
          'enabled', true,
          'optional', true,
          'required_before_step', 3,
          'form_id', v_recommendation_form_id,
          'usage_id', v_recommendation_usage_id,
          'department_id', v_pbo_department_id,
          'letter_type_id', v_recommendation_letter_type_id,
          'template_name', 'Rekomendasi Peremajaan Aset'
        ),
        updated_at = now()
    where usage.name in ('Permohonan Aset (Pusat)', 'Permohonan Aset (Cabang)');
  end if;
end $$;
