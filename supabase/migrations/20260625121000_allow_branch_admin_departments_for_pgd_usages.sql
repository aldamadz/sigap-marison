do $$
declare
  v_usage_id uuid;
  v_dept_umum_keuangan_cabang uuid;
begin
  select id into v_dept_umum_keuangan_cabang
  from public.master_departments
  where name = 'Umum & Keuangan (Cabang)'
  limit 1;

  if v_dept_umum_keuangan_cabang is null then
    raise notice 'Departemen Umum & Keuangan (Cabang) tidak ditemukan.';
    return;
  end if;

  for v_usage_id in
    select id
    from public.form_usages
    where name in ('Permohonan Marketing Cabang', 'Permohonan Teknik Cabang')
  loop
    insert into public.form_usage_departments (usage_id, department_id)
    values (v_usage_id, v_dept_umum_keuangan_cabang)
    on conflict do nothing;
  end loop;
end;
$$;
