-- Real allocator, draft/void/submit RPCs and canonical registration triggers.
-- The shared runner supplies only the minimal canonical schema and usage fixture.
do $$
declare
  entity uuid := 'a0000000-0000-4000-8000-000000000010';
  dept uuid := 'a0000000-0000-4000-8000-000000000020';
  office uuid := 'a0000000-0000-4000-8000-000000000031';
  actor uuid := '20000000-0000-4000-8000-000000000002';
  lt uuid := 'a0000000-0000-4000-8000-000000000050';
  usage uuid := 'a0000000-0000-4000-8000-000000000064';
  form uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  n integer; k integer; draft public.surat_registration_drafts; res uuid;
  data jsonb; reg public.surat_registrasi; caught boolean;
begin
  update public.profiles set office_id=office where id=actor;
  update public.form_usages set scope_type='cabang',form_id=form where id=usage;
  insert into public.master_forms(id,nomor_form) values(form,'FM-UAI.PGD-01-00');
  insert into public.master_projects(id,office_id) values(project,office);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  n := public.generate_fund_branch_letter_number(entity,lt,office,actor,dept,usage);
  if n<>1 then raise exception 'KC Dana Umum must allocate 01 even with registered projects'; end if;
  draft := public.create_surat_registration_draft(n,'001/UAI/02.1.1/X/2026',
    jsonb_build_object('office_id',office,'form_input_data',jsonb_build_object('fund_without_project',true)));
  if draft.id is null then raise exception 'Draft persistence failed'; end if;
  perform public.void_surat_registration_draft(draft.id);
  k := public.generate_fund_branch_letter_number(entity,lt,office,actor,dept,usage);
  if k<>n then raise exception 'Fund scope must use admin reuse window'; end if;
  draft := public.create_surat_registration_draft(n,'001/UAI/02.1.1/X/2026','{}');
  res := draft.reservation_id;
  data := jsonb_build_object('reservation_id',res,'no_surat',draft.no_surat,
    'entity_id',entity,'office_id',office,'dept_id',dept,'letter_type_id',lt,
    'form_usage_id',usage,'form_input_data',jsonb_build_object('request_category','non_asset','fund_without_project',true));
  reg := public.create_surat_registrasi(data);
  if reg.id is null or (select status from public.surat_reservations where id=res)<>'USED' then
    raise exception 'PGD Fund submit must consume reservation';
  end if;
  update public.master_offices set kedudukan='KCP' where id=office;
  n := public.generate_fund_branch_letter_number(entity,lt,office,actor,dept,usage);
  if n<>2 then raise exception 'KCP Dana Umum must skip USED 01'; end if;

  -- KEU 1 shares the lock/counter, not the authorization or reservation scope.
  update public.master_forms set nomor_form='FM-UAI.KEU-01-00' where id=form;
  k := public.generate_keu1_branch_letter_number(entity,lt,office,actor,dept,usage);
  if k<>3 then raise exception 'KEU 1 and Fund counters collided'; end if;
  update public.master_forms set nomor_form='FM-UAI.PGD-01-00' where id=form;
  caught:=false;
  begin
    insert into public.surat_registrasi(entity_id,office_id,dept_id,letter_type_id,form_usage_id,
      created_by,no_surat,form_input_data) values(entity,office,dept,lt,usage,actor,'003/UAI/02.1.1/X/2026',
      '{"fund_without_project":true}');
  exception when sqlstate '22023' then caught:=true; end;
  if not caught then raise exception 'PGD must not consume KEU reservation'; end if;
  caught:=false;
  begin
    insert into public.surat_registrasi(entity_id,office_id,dept_id,letter_type_id,form_usage_id,
      created_by,no_surat,form_input_data) values(entity,office,dept,lt,usage,actor,'002/UAI/02.1.1/X/2026','{}');
  exception when sqlstate '22023' then caught:=true; end;
  if not caught then raise exception 'Explicit no-project intent required at submit'; end if;
  caught:=false;
  begin
    insert into public.surat_registrasi(entity_id,office_id,project_id,dept_id,letter_type_id,form_usage_id,
      created_by,no_surat,form_input_data) values(entity,office,project,dept,lt,usage,actor,'002/UAI/02.1.1/X/2026',
      '{"fund_without_project":true}');
  exception when sqlstate '22023' then caught:=true; end;
  if not caught then raise exception 'Conflicting project and Dana Umum must fail'; end if;
  caught:=false;
  begin perform public.generate_fund_branch_letter_number(entity,lt,office,gen_random_uuid(),dept,usage);
  exception when insufficient_privilege then caught:=true; end;
  if not caught then raise exception 'Actor spoof accepted'; end if;
  caught:=false;
  begin perform public.generate_fund_branch_letter_number(entity,lt,gen_random_uuid(),actor,dept,usage);
  exception when insufficient_privilege then caught:=true; end;
  if not caught then raise exception 'Cross-office allocation accepted'; end if;
  update public.master_forms set nomor_form='FM-UAI.KEU-10-00' where id=form;
  caught:=false;
  begin perform public.generate_fund_branch_letter_number(entity,lt,office,actor,dept,usage);
  exception when sqlstate '22023' then caught:=true; end;
  if not caught then raise exception 'KEU 10 exempted'; end if;
  update public.master_forms set nomor_form='FM-UAI.PGD-01-00' where id=form;
  update public.form_usages set request_category='non_unit' where id=usage;
  caught:=false;
  begin perform public.generate_fund_branch_letter_number(entity,lt,office,actor,dept,usage);
  exception when sqlstate '22023' then caught:=true; end;
  if not caught then raise exception 'Non Unit exempted'; end if;
  update public.form_usages set request_category='non_asset',status='draft' where id=usage;
  caught:=false;
  begin perform public.generate_fund_branch_letter_number(entity,lt,office,actor,dept,usage);
  exception when others then caught:=true; end;
  if not caught then raise exception 'Inactive usage accepted'; end if;
  update public.form_usages set status='active' where id=usage;
  if has_function_privilege('anon','public.generate_fund_branch_letter_number(uuid,uuid,uuid,uuid,uuid,uuid)','execute') then
    raise exception 'Anon allocator execute leaked';
  end if;
  if not exists(select 1 from pg_policies where tablename='surat_reservations'
    and permissive='RESTRICTIVE' and with_check like '%branch_fund_general%') then
    raise exception 'Direct browser reservation insertion not restricted';
  end if;
  raise notice 'Branch Fund numbering: all assertions passed';
end $$;

-- A browser cannot manufacture this privileged reservation scope directly.
alter table public.surat_reservations enable row level security;
grant select,insert on public.surat_reservations to authenticated;
grant select on public.master_offices,public.master_projects to authenticated;
create policy fixture_own_insert on public.surat_reservations for insert to authenticated
  with check(reserved_by=auth.uid());
set role authenticated;
do $$
declare caught boolean:=false;
begin
  begin
    insert into public.surat_reservations(entity_id,office_id,type_id,year,no_urut,reserved_by,number_scope_type)
    values('a0000000-0000-4000-8000-000000000010','a0000000-0000-4000-8000-000000000031',
      'a0000000-0000-4000-8000-000000000050',extract(year from now())::integer,999,
      auth.uid(),'branch_fund_general');
  exception when insufficient_privilege then caught:=true; end;
  if not caught then raise exception 'Browser forged Fund reservation'; end if;
end $$;
reset role;
