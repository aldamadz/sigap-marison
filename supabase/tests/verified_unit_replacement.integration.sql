-- Disposable fixture from scripts/test-outbound-replacement-sql.mjs only.
create table public.surat_signatures (
  id uuid primary key default gen_random_uuid(),
  surat_id uuid not null references public.surat_registrasi(id),
  is_signed boolean, signed_at timestamptz
);
update public.marison_outbound_settings set environment='production';
insert into public.surat_registrasi(id,status) values ('10000000-0000-0000-0000-000000000004','SELESAI');
insert into public.surat_signatures(surat_id,is_signed,signed_at)
  values ('10000000-0000-0000-0000-000000000004',true,now());
insert into public.marison_outbound_dispatches
  (id,surat_id,environment,kind,endpoint,idempotency_key,status,error_code,response,
   post_started_at,payload,payload_body,payload_hash,contract_version,payload_built_at,last_attempt_at,attempt_count)
values ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000004',
  'production','unit','/unit-submissions','fixture:production:unit','failed_terminal','marison_http_422',
  '{"message":"type rejected"}',now(),'{"project_id":24,"units":[{"unit_id":2579,"type":"3052"}]}',
  '{"project_id":24,"units":[{"unit_id":2579,"type":"3052"}]}',
  encode(extensions.digest('{"project_id":24,"units":[{"unit_id":2579,"type":"3052"}]}','sha256'),'hex'),'test',now(),now(),1);
do $$
declare
  v_old uuid := '20000000-0000-0000-0000-000000000004';
  v_admin uuid := '00000000-0000-0000-0000-000000000001';
  v_hash text;
  v_receipt jsonb := jsonb_build_object('project_id',24,'observed_at',clock_timestamp(),
    'units',jsonb_build_array(jsonb_build_object('unit_id',2579,'type','30','has_submitted',false)));
  v_result jsonb;
  v_new uuid;
begin
  select payload_hash into v_hash from public.marison_outbound_dispatches where id=v_old;
  if has_function_privilege('anon','public.create_verified_unit_outbound_replacement(uuid,uuid,text,text,jsonb,boolean)','EXECUTE')
     or has_function_privilege('authenticated','public.create_verified_unit_outbound_replacement(uuid,uuid,text,text,jsonb,boolean)','EXECUTE') then
    raise exception 'Untrusted roles can execute replacement';
  end if;
  begin
    perform public.create_verified_unit_outbound_replacement(v_old,'00000000-0000-0000-0000-000000000002','type corrected',v_hash,v_receipt,true);
    raise exception 'Non-admin accepted'; exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_verified_unit_outbound_replacement(v_old,v_admin,'type corrected',v_hash,v_receipt,false);
    raise exception 'Production without confirmation accepted'; exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_verified_unit_outbound_replacement(v_old,v_admin,'type corrected',v_hash,
      jsonb_set(v_receipt,'{observed_at}',to_jsonb(clock_timestamp()-interval '3 minutes')),true);
    raise exception 'Expired references accepted'; exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_verified_unit_outbound_replacement(v_old,v_admin,'type corrected',v_hash,
      jsonb_set(v_receipt,'{units,0,has_submitted}','true'),true);
    raise exception 'Submitted unit accepted'; exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_verified_unit_outbound_replacement(v_old,v_admin,'type corrected',v_hash,
      jsonb_set(v_receipt,'{units,0,unit_id}','2580'),true);
    raise exception 'Different unit identity accepted'; exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_verified_unit_outbound_replacement(v_old,v_admin,'type corrected',repeat('a',64),v_receipt,true);
    raise exception 'Wrong frozen hash accepted'; exception when sqlstate '55000' then null;
  end;
  update public.surat_signatures set is_signed=false where surat_id='10000000-0000-0000-0000-000000000004';
  begin
    perform public.create_verified_unit_outbound_replacement(v_old,v_admin,'type corrected',v_hash,v_receipt,true);
    raise exception 'Unsigned document accepted'; exception when sqlstate '55000' then null;
  end;
  update public.surat_signatures set is_signed=true where surat_id='10000000-0000-0000-0000-000000000004';
  v_result := public.create_verified_unit_outbound_replacement(v_old,v_admin,'type corrected from fresh API',v_hash,v_receipt,true);
  v_new := (v_result->>'dispatch_id')::uuid;
  if not exists (select 1 from public.marison_outbound_dispatches where id=v_new
      and generation=2 and status='pending' and payload is null and post_started_at is null
      and replacement_of_dispatch_id=v_old and idempotency_key='sigap:production:unit:10000000-0000-0000-0000-000000000004:g2') then
    raise exception 'Fresh pending generation is invalid';
  end if;
  if not exists (select 1 from public.marison_outbound_dispatches where id=v_old
      and status='failed_terminal' and payload_hash=v_hash and payload->'units'->0->>'type'='3052') then
    raise exception 'Original frozen dispatch was modified';
  end if;
  v_result := public.create_verified_unit_outbound_replacement(v_old,v_admin,'duplicate safe request',v_hash,v_receipt,true);
  if (v_result->>'dispatch_id')::uuid <> v_new or v_result->>'already_exists' <> 'true' then
    raise exception 'Replacement request is not idempotent';
  end if;
  if (select count(*) from public.marison_outbound_replacement_events where old_dispatch_id=v_old
      and environment='production' and before_state->'reference_receipt'->'units'->0->>'type'='30') <> 1 then
    raise exception 'Production audit receipt is missing or duplicated';
  end if;
end $$;
select 'Verified Unit replacement SQL integration passed' as result;
