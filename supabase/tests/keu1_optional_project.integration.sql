do $$
declare
  v_branch_usage uuid;
  v_hq_usage uuid;
  v_office uuid := '20000000-0000-4000-8000-000000000002';
  v_requester uuid := '40000000-0000-4000-8000-000000000020';
  v_project uuid := gen_random_uuid();
  v_other_project uuid := gen_random_uuid();
begin
  select usage.id into strict v_branch_usage from public.form_usages usage
  join public.master_forms form on form.id=usage.form_id
  where form.nomor_form='FM-UAI.KEU-01-00' and usage.scope_type='cabang';
  select usage.id into strict v_hq_usage from public.form_usages usage
  join public.master_forms form on form.id=usage.form_id
  where form.nomor_form='FM-UAI.KEU-01-00' and usage.scope_type='pusat';
  insert into public.master_projects(id,office_id) values (v_project,v_office),
    (v_other_project,'20000000-0000-4000-8000-000000000001');
  insert into public.surat_registrasi(form_usage_id,office_id,project_id,created_by,no_surat,form_input_data)
  values(v_branch_usage,v_office,v_project,v_requester,'021/UAI/06-KWS1.1.1/X/2026','{"fund_without_project":false}');
  begin
    insert into public.surat_registrasi(form_usage_id,office_id,project_id,created_by,no_surat,form_input_data)
    values(v_branch_usage,v_office,v_project,v_requester,'022/UAI/TEST/X/2026','{"fund_without_project":true}');
    raise exception 'Expected contradictory marker rejection';
  exception when sqlstate '22023' then null; end;
  begin
    insert into public.surat_registrasi(form_usage_id,office_id,project_id,created_by,no_surat,form_input_data)
    values(v_branch_usage,v_office,v_other_project,v_requester,'022/UAI/TEST/X/2026','{"fund_without_project":false}');
    raise exception 'Expected foreign-office rejection';
  exception when sqlstate '22023' then null; end;
  begin
    insert into public.surat_registrasi(form_usage_id,office_id,project_id,created_by,no_surat,form_input_data)
    values(v_hq_usage,'20000000-0000-4000-8000-000000000001',v_other_project,v_requester,'022/UAI/TEST/X/2026','{"fund_without_project":false}');
    raise exception 'Expected headquarters project rejection';
  exception when sqlstate '22023' then null; end;
  -- Existing no-project submission retains the corrected reservation validation.
  if position('reservation.type_id = new.letter_type_id' in pg_get_functiondef('public.enforce_surat_registration_branch_project()'::regprocedure))=0 then
    raise exception 'Existing no-project reservation guard lost';
  end if;
  raise notice 'KEU 1 optional project: all assertions passed';
end;
$$;
