do $$
declare
  v_usage uuid;
  v_step uuid;
  v_surat uuid;
  v_requester uuid := '40000000-0000-4000-8000-000000000020';
  v_office uuid := '20000000-0000-4000-8000-000000000002';
  v_entity uuid := '80000000-0000-4000-8000-000000000001';
  v_type uuid := '70000000-0000-4000-8000-000000000001';
  v_spv uuid := '40000000-0000-4000-8000-000000000013';
  v_marketing uuid := gen_random_uuid();
  v_user uuid;
begin
  select usage.id, step.id into strict v_usage, v_step
  from public.form_usages usage join public.master_forms form on form.id = usage.form_id
  join public.form_usage_steps step on step.usage_id = usage.id and step.step_order = 1
  where form.nomor_form = 'FM-UAI.KEU-01-00' and usage.scope_type = 'cabang';
  insert into public.profiles (id, full_name, office_id, job_title, is_active)
  values (v_marketing, 'SPV Marketing A', v_office, 'SPV Marketing', true);
  insert into public.surat_reservations (entity_id, type_id, office_id, year, no_urut, reserved_by, number_scope_type, status)
  values (v_entity, v_type, v_office, extract(year from now())::integer, 17, v_requester, 'branch_keu1_000', 'PENDING');
  -- surat_registrasi intentionally has NO no_urut column: reproduce the real shape.
  insert into public.surat_registrasi (form_usage_id, office_id, entity_id, letter_type_id, created_by, no_surat, form_input_data)
  values (v_usage, v_office, v_entity, v_type, v_requester, '017/UAI/000/X/2026', '{"fund_without_project":true}')
  returning id into v_surat;
  foreach v_user in array array[v_requester, v_spv, v_marketing] loop
    insert into public.surat_signatures (surat_id, user_id, form_usage_step_id)
    values (v_surat, v_user, v_step);
  end loop;
  foreach v_user in array array[
    '40000000-0000-4000-8000-000000000016'::uuid,
    '40000000-0000-4000-8000-000000000021'::uuid
  ] loop
    begin
      insert into public.surat_signatures (surat_id, user_id, form_usage_step_id)
      values (v_surat, v_user, v_step);
      raise exception 'Expected cross-office/non-supervisor rejection';
    exception when raise_exception then
      if sqlerrm <> 'User bukan kandidat signer pada tahap ini.' then raise; end if;
    end;
  end loop;
  update public.profiles set is_active = false where id = v_marketing;
  if public.is_keu1_first_signer_candidate(v_usage, v_step, v_marketing, v_requester, v_office) then
    raise exception 'Inactive supervisor accepted';
  end if;
  update public.profiles set is_active = true, deleted_at = now() where id = v_marketing;
  if public.is_keu1_first_signer_candidate(v_usage, v_step, v_marketing, v_requester, v_office) then
    raise exception 'Deleted supervisor accepted';
  end if;
  if has_function_privilege('authenticated', 'public.is_keu1_first_signer_candidate(uuid,uuid,uuid,uuid,uuid)', 'EXECUTE') then
    raise exception 'Internal helper exposed';
  end if;
  begin
    insert into public.surat_registrasi (form_usage_id, office_id, entity_id, letter_type_id, created_by, no_surat, form_input_data)
    values (v_usage, v_office, v_entity, v_type, v_requester, '018/UAI/000/X/2026', '{"fund_without_project":true}');
    raise exception 'Expected absent reservation rejection';
  exception when sqlstate '22023' then null;
  end;
  begin
    insert into public.surat_registrasi (form_usage_id, office_id, entity_id, letter_type_id, created_by, no_surat, form_input_data)
    values (v_usage, v_office, v_entity, v_type, v_requester, 'INVALID/UAI/000/X/2026', '{"fund_without_project":true}');
    raise exception 'Expected malformed number rejection';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'KEU 1 submit and first signer: all assertions passed';
end;
$$;
