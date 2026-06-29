do $$
declare
  v_usage_id uuid;
  v_department_id uuid;
  v_branch_admin_departments text[] := array[
    'Marketing (Cabang)',
    'Teknik (Cabang)',
    'Umum & Keuangan (Cabang)',
    'Cabang'
  ];
begin
  for v_usage_id in
    select usage.id
    from public.form_usages usage
    where usage.status = 'active'
      and (
        usage.scope_type = 'cabang'
        or usage.name = 'Permohonan Karangan bunga untuk Karyawan Cabang + Pusat, Relasi.'
      )
  loop
    for v_department_id in
      select department.id
      from public.master_departments department
      where department.name = any(v_branch_admin_departments)
    loop
      insert into public.form_usage_departments (usage_id, department_id)
      values (v_usage_id, v_department_id)
      on conflict do nothing;
    end loop;
  end loop;
end;
$$;
