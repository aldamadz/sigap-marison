begin;
-- Creation through the registration boundary discards every reserved prefix key.
select public.create_surat_registrasi_core(
 '{"id":"61200000-0000-4000-8000-000000000080","form_input_data":{"request_mode":"unit","requested_unit_count":1,"catatan":"retained","allocated_units":[{"value":"forged"}],"allocated_custom":"forged"},
 "data_snapshot":{"input":{"allocated_units":[{"value":"forged"}]},"verification_drafts":{"fake":{}}}}',
 '61200000-0000-4000-8000-000000000001');
do $$begin
 if exists(select 1 from public.surat_registrasi d, jsonb_object_keys(d.form_input_data) k
  where d.id='61200000-0000-4000-8000-000000000080' and left(k,10)='allocated_')
  or (select form_input_data->>'catatan'<>'retained' or data_snapshot ? 'verification_drafts'
   or data_snapshot#>'{input,allocated_units}' is not null from public.surat_registrasi where id='61200000-0000-4000-8000-000000000080')
 then raise exception 'Requester allocation survived registration';end if;
end $$;

insert into public.surat_registrasi(id,created_by,status,current_step,form_input_data)
 values('61200000-0000-4000-8000-000000000081','61200000-0000-4000-8000-000000000001','PROSES',3,
 '{"request_mode":"unit","request_category":"unit","requested_project":{"id":"23","code":"TEST"},"requested_unit_count":1}');
insert into public.surat_signatures(id,surat_id,user_id,step_order,requires_unit_allocation,action_type,verification_required,verification_status,verifier_snapshot)
 values('61200000-0000-4000-8000-000000000082','61200000-0000-4000-8000-000000000081',
 '61200000-0000-4000-8000-000000000001',3,true,'unit_allocation',true,'pending',
 '[{"user_id":"61200000-0000-4000-8000-000000000002"}]');
set local role authenticated;
set local "request.jwt.claim.sub"='61200000-0000-4000-8000-000000000002';
select public.verify_surat_signature_v2('61200000-0000-4000-8000-000000000082','Verified identity',
 '{"allocated_project":{"id":"23","code":"TEST"},"allocated_units":[{"value":"2048","allocation_detail":{"unit_type":"36/72","production_serial":"009","production_block":"6.1","production_date":"2026-11-09","struktur_atas":"100","struktur_bawah":"200"}}]}');
reset role;
set local role service_role;
do $$begin
 if public.get_verified_unit_allocation('61200000-0000-4000-8000-000000000081')#>>'{allocated_units,0,allocation_detail,unit_type}'<>'36/72' then
  raise exception 'Legitimate examiner edit lost';end if;
end $$;
reset role;
set local role postgres;
update public.surat_signatures set is_signed=true where id='61200000-0000-4000-8000-000000000082';
update public.surat_registrasi set status='DONE' where id='61200000-0000-4000-8000-000000000081';
reset role;
grant update on public.surat_registrasi to authenticated;
set local role authenticated;
set local "request.jwt.claim.sub"='61200000-0000-4000-8000-000000000001';
do $$begin
 if not exists(select 1 from public.surat_registrasi where id='61200000-0000-4000-8000-000000000081') then raise exception 'Fixture invisible';end if;
 begin
  update public.surat_registrasi set form_input_data=jsonb_set(form_input_data,'{allocated_units,0,allocation_detail,unit_type}','"forged"')
   where id='61200000-0000-4000-8000-000000000081';
  raise exception 'Requester changed verified identity';
 exception when insufficient_privilege then null;end;
 begin
  update public.surat_registrasi set data_snapshot='{"verification_drafts":{"fake":{}}}'
   where id='61200000-0000-4000-8000-000000000081';
  raise exception 'Requester changed verified snapshot';
 exception when insufficient_privilege then null;end;
 begin perform public.get_verified_unit_allocation('61200000-0000-4000-8000-000000000081');
  raise exception 'Client accessed dispatch authority RPC';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Defence in depth: even a trusted-row mutation must not be dispatched.
set local role postgres;
update public.surat_registrasi set form_input_data=jsonb_set(form_input_data,'{allocated_units,0,allocation_detail,production_serial}','"999"')
 where id='61200000-0000-4000-8000-000000000081';
reset role;
set local role service_role;
do $$begin
 begin perform public.get_verified_unit_allocation('61200000-0000-4000-8000-000000000081');
  raise exception 'Dispatch accepted data outside immutable review';
 exception when insufficient_privilege then null;end;
 begin perform public.get_verified_unit_allocation('61200000-0000-4000-8000-000000000080');
  raise exception 'Dispatch accepted missing history';
 exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'Unit allocation authority assertions passed';
