insert into public.profiles(id,role,is_active,full_name) values
 ('61200000-0000-4000-8000-000000000001','user',true,'Marketing Tester'),
 ('61200000-0000-4000-8000-000000000002','user',true,'Pemeriksa Perencanaan'),
 ('61200000-0000-4000-8000-000000000003','user',true,'Pengguna Asing');
insert into public.surat_registrasi(id,created_by,no_surat,judul_surat,status,current_step,form_input_data)
values('61200000-0000-4000-8000-000000000010','61200000-0000-4000-8000-000000000001',
 'UJI-STAGING-PARTIAL','Unit siap bangun','PROSES',3,
 '{"request_mode":"unit","request_category":"unit","requested_unit_count":30,"requested_project":{"id":"23","code":"TEST"}}');
insert into public.surat_signatures(id,surat_id,user_id,step_order,requires_unit_allocation,action_type,
 verification_required,verification_status,verifier_snapshot)
values('61200000-0000-4000-8000-000000000020','61200000-0000-4000-8000-000000000010',
 '61200000-0000-4000-8000-000000000001',3,true,'unit_allocation',true,'pending',
 '[{"user_id":"61200000-0000-4000-8000-000000000002"}]');

set role authenticated;
set "request.jwt.claim.sub"='61200000-0000-4000-8000-000000000002';
do $$
declare v_payload jsonb:='{"allocated_project":{"id":"23","code":"TEST"},"allocated_units":[{"value":"1"},{"value":"2"},{"value":"3"}]}';
begin
  if (select rolsuper from pg_roles where oid=(select proowner from pg_proc
    where oid='public.verify_surat_signature_v2(uuid,text,jsonb)'::regprocedure)) then
    raise exception 'Verification definer must not be a superuser in the regression fixture'; end if;
  -- Before the correction this legitimate 30 -> 3 call reproduces the old equality error.
  perform public.verify_surat_signature_v2('61200000-0000-4000-8000-000000000020','Baru 3 unit siap bangun; 27 unit belum siap.',v_payload);
  if (select form_input_data->>'requested_unit_count' from public.surat_registrasi where id='61200000-0000-4000-8000-000000000010')<>'30' then
    raise exception 'Original marketing request was overwritten'; end if;
  if (select allocated_count from public.surat_unit_allocation_history where surat_id='61200000-0000-4000-8000-000000000010')<>3
    or (select remaining_count from public.surat_unit_allocation_history where surat_id='61200000-0000-4000-8000-000000000010')<>27
    or (select actor_name from public.surat_unit_allocation_history where surat_id='61200000-0000-4000-8000-000000000010')<>'Pemeriksa Perencanaan' then
    raise exception 'Audit counts or examiner identity missing'; end if;
  begin
    perform public.verify_surat_signature_v2('61200000-0000-4000-8000-000000000020','Duplicate verify',v_payload);
    raise exception 'Duplicate verification accepted';
  exception when raise_exception then
    if sqlerrm='Duplicate verification accepted' then raise; end if;
  end;
  begin
    update public.surat_unit_allocation_history set note='altered';
    raise exception 'Authenticated history update allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.surat_unit_allocation_history;
    raise exception 'Authenticated history deletion allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- A later profile rename must not change the recorded examiner identity.
update public.profiles set full_name='Nama baru' where id='61200000-0000-4000-8000-000000000002';
do $$ begin
  if (select actor_name from public.surat_unit_allocation_history where surat_id='61200000-0000-4000-8000-000000000010')<>'Pemeriksa Perencanaan' then
    raise exception 'Historical examiner name changed'; end if;
end $$;
set role authenticated;
set "request.jwt.claim.sub"='61200000-0000-4000-8000-000000000003';
do $$ begin
  if exists(select 1 from public.surat_unit_allocation_history) then raise exception 'Cross-user history leak'; end if;
  begin
    insert into public.surat_unit_allocation_history default values;
    raise exception 'History spoof allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Approval remains necessary; partial allocation is not an approval itself.
do $$ begin
  begin
    update public.surat_registrasi set status='DONE' where id='61200000-0000-4000-8000-000000000010';
    raise exception 'Unsigned finalization allowed';
  exception when raise_exception then
    if sqlerrm='Unsigned finalization allowed' then raise; end if;
  end;
end $$;
update public.surat_signatures set is_signed=true where id='61200000-0000-4000-8000-000000000020';
update public.surat_registrasi set status='DONE' where id='61200000-0000-4000-8000-000000000010';
update public.surat_registrasi set status='PROSES' where id='61200000-0000-4000-8000-000000000010';
update public.surat_signatures set is_signed=false,verification_status='pending' where id='61200000-0000-4000-8000-000000000020';

set role authenticated;
set "request.jwt.claim.sub"='61200000-0000-4000-8000-000000000002';
do $$
declare v_payload jsonb:='{"allocated_units":[{"value":"1"},{"value":"2"},{"value":"3"}]}';
begin
  begin
    perform public.verify_surat_signature_v2('61200000-0000-4000-8000-000000000020','Tidak ada unit siap.','{"allocated_units":[]}');
    raise exception 'Zero ready units accepted';
  exception when raise_exception then
    if sqlerrm='Zero ready units accepted' then raise; end if;
  end;
  begin
    perform public.verify_surat_signature_v2('61200000-0000-4000-8000-000000000020','Kavling dobel.',
      '{"allocated_units":[{"value":"1"},{"value":"1"}]}');
    raise exception 'Duplicate units accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.verify_surat_signature_v2('61200000-0000-4000-8000-000000000020','Terlalu banyak unit.',
      jsonb_build_object('allocated_units',(select jsonb_agg(jsonb_build_object('value',n)) from generate_series(1,31)n)));
    raise exception 'More units than requested accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.verify_surat_signature_v2('61200000-0000-4000-8000-000000000020','',v_payload);
    raise exception 'Missing partial reason accepted';
  exception when invalid_parameter_value then null; end;
  if (select count(*) from public.surat_unit_allocation_history where surat_id='61200000-0000-4000-8000-000000000010')<>1 then
    raise exception 'Failed verification wrote history'; end if;
  perform public.verify_surat_signature_v2('61200000-0000-4000-8000-000000000020','Masih 3 unit siap bangun.',v_payload);
end $$;

-- The real legacy revision resolver must accept an audited partial reallocation.
do $$ begin
  if to_regprocedure('public.resolve_surat_process_revision_pre_unit_reallocation(uuid,text)') is not null then
    update public.surat_signatures set is_signed=false,verification_status='pending'
      where id='61200000-0000-4000-8000-000000000020';
    insert into public.surat_revision_events(id,surat_id,signature_id,actor_id,target_type,target_user_ids,
      from_step,target_step,reason,changes,status)
    values('61200000-0000-4000-8000-000000000030','61200000-0000-4000-8000-000000000010',
      '61200000-0000-4000-8000-000000000020','61200000-0000-4000-8000-000000000001','checker',
      array['61200000-0000-4000-8000-000000000002'::uuid],3,3,'Periksa ulang kesiapan unit.',
      '{"restart_after_checker":true,"allocation_signature_id":"61200000-0000-4000-8000-000000000020"}','open');
    perform set_config('request.jwt.claim.sub','61200000-0000-4000-8000-000000000002',true);
    perform public.verify_surat_signature_v2('61200000-0000-4000-8000-000000000020','Pemeriksaan ulang: 3 unit siap bangun.',
      '{"allocated_units":[{"value":"1"},{"value":"2"},{"value":"3"}]}');
    if (select status from public.surat_revision_events where id='61200000-0000-4000-8000-000000000030')<>'resolved' then
      raise exception 'Partial reallocation revision not resolved'; end if;
    if (select form_input_data->>'requested_unit_count' from public.surat_registrasi where id='61200000-0000-4000-8000-000000000010')<>'30' then
      raise exception 'Revision erased original request'; end if;
  end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.surat_unit_allocation_history where surat_id='61200000-0000-4000-8000-000000000010')<>
    (case when to_regprocedure('public.resolve_surat_process_revision_pre_unit_reallocation(uuid,text)') is not null then 3 else 2 end) then
    raise exception 'Re-examination erased history'; end if;
  -- Same-size substitution cannot reuse an older partial allocation receipt.
  update public.surat_registrasi set form_input_data=jsonb_set(form_input_data,'{allocated_units,0,value}','"forged"')
    where id='61200000-0000-4000-8000-000000000010';
  update public.surat_signatures set is_signed=true where id='61200000-0000-4000-8000-000000000020';
  begin
    update public.surat_registrasi set status='DONE' where id='61200000-0000-4000-8000-000000000010';
    raise exception 'Forged allocation reused valid receipt';
  exception when invalid_parameter_value then null; end;
  if has_function_privilege('authenticated','unit_allocation_internal.has_valid_review(uuid,jsonb)','execute')
    or has_function_privilege('anon','unit_allocation_internal.has_valid_review(uuid,jsonb)','execute') then
    raise exception 'Private helper exposed'; end if;
  raise notice 'Unit partial readiness: all assertions passed';
end $$;
