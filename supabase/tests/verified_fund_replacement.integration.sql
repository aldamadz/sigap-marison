-- Additive disposable fixture: no vendor network or live job processing.
insert into public.surat_registrasi(id,status) values
 ('10000000-0000-0000-0000-000000000010','DONE'),
 ('10000000-0000-0000-0000-000000000011','DONE');
insert into public.surat_signatures(surat_id,is_signed,signed_at)
 select id,true,now() from public.surat_registrasi where id::text like '%00001_';
insert into public.marison_outbound_dispatches
 (id,surat_id,environment,generation,kind,endpoint,idempotency_key,status,error_code,response,
  post_started_at,last_attempt_at,attempt_count,payload,payload_body,payload_hash,payload_built_at,contract_version)
 select ('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
   ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
   'production',1,'fund','/fund-submissions','test:fund:'||n,'failed_terminal','marison_http_422',
   '{"message":"fund_submissions_type_check rejected"}',now(),now(),1,payload,payload::text,
   encode(extensions.digest(payload::text,'sha256'),'hex'),now(),'old-fund'
 from generate_series(10,11) n cross join lateral (
   select jsonb_build_object('submission_number','TEST-'||n,'type','marketing_cost','amount',500000,
     'branch_id',1,'division','Marketing','title','TEST','description',null,
     'items',jsonb_build_array(jsonb_build_object('nama_barang','Spanduk','jumlah',1,'satuan','Unit','nominal',500000)),
     'attachments',jsonb_build_array(jsonb_build_object('name','main','link','https://app.test/main.pdf')),
     'approvals',jsonb_build_array(jsonb_build_object('role','manager','nik','TEST','action','approved','actioned_at','2026-10-21T00:00:00Z','notes',null))) payload
 ) p;

do $$
declare
 v_admin uuid:='00000000-0000-0000-0000-000000000001';
 v_id uuid:='20000000-0000-0000-0000-000000000010';
 v_manual uuid:='20000000-0000-0000-0000-000000000011';
 v_old public.marison_outbound_dispatches%rowtype; v_after public.marison_outbound_dispatches%rowtype;
 v_body text; v_time timestamptz; v_new uuid; v_again uuid; v_receipt jsonb; v_fails integer:=0; v_bad jsonb;
begin
 select * into v_old from public.marison_outbound_dispatches where id=v_id;
 select updated_at into v_time from public.surat_registrasi where id=v_old.surat_id;
 v_body:=((v_old.payload-'attachments')||'{"main_document":"https://app.test/main.pdf","attachments":[]}'::jsonb)::text;
 if has_function_privilege('anon','public.create_verified_fund_outbound_replacement(uuid,uuid,text,text,text,timestamptz,boolean,boolean,boolean)','EXECUTE')
   or has_function_privilege('authenticated','public.record_manual_fund_outbound_receipt(uuid,uuid,text,text,jsonb)','EXECUTE') then
   raise exception 'Untrusted roles can invoke Fund recovery';
 end if;
 begin
  perform public.create_verified_fund_outbound_replacement(v_id,v_admin,'vendor fixed',v_old.payload_hash,v_body,v_time,false,true,true);
  raise exception 'Nonreceipt confirmation bypass'; exception when invalid_parameter_value then v_fails:=v_fails+1;
 end;
 begin
  perform public.create_verified_fund_outbound_replacement(v_id,v_admin,'vendor fixed',v_old.payload_hash,v_body,v_time,true,false,true);
  raise exception 'Vendor fix confirmation bypass'; exception when invalid_parameter_value then v_fails:=v_fails+1;
 end;
 begin
  perform public.create_verified_fund_outbound_replacement(v_id,v_admin,'vendor fixed',v_old.payload_hash,v_body,v_time,true,true,false);
  raise exception 'Production confirmation bypass'; exception when insufficient_privilege then v_fails:=v_fails+1;
 end;
 begin
  perform public.create_verified_fund_outbound_replacement(v_id,'00000000-0000-0000-0000-000000000002','vendor fixed',v_old.payload_hash,v_body,v_time,true,true,true);
  raise exception 'Nonadmin bypass'; exception when insufficient_privilege then v_fails:=v_fails+1;
 end;
 begin
  perform public.create_verified_fund_outbound_replacement(v_id,v_admin,'vendor fixed',repeat('f',64),v_body,v_time,true,true,true);
  raise exception 'Stale hash bypass'; exception when sqlstate '55000' then v_fails:=v_fails+1;
 end;
 begin
  perform public.create_verified_fund_outbound_replacement(v_id,v_admin,'vendor fixed',v_old.payload_hash,v_body,v_time-interval '1 second',true,true,true);
  raise exception 'Changed document bypass'; exception when serialization_failure then v_fails:=v_fails+1;
 end;
 begin
  perform public.create_verified_fund_outbound_replacement(v_id,v_admin,'vendor fixed',v_old.payload_hash,jsonb_set(v_body::jsonb,'{amount}','1')::text,v_time,true,true,true);
  raise exception 'Changed amount bypass'; exception when invalid_parameter_value then v_fails:=v_fails+1;
 end;
 update public.surat_signatures set is_signed=false where surat_id=v_old.surat_id;
 begin
  perform public.create_verified_fund_outbound_replacement(v_id,v_admin,'vendor fixed',v_old.payload_hash,v_body,v_time,true,true,true);
  raise exception 'Unsigned document bypass'; exception when serialization_failure then v_fails:=v_fails+1;
 end;
 update public.surat_signatures set is_signed=true where surat_id=v_old.surat_id;
 update public.marison_outbound_dispatches set status='outcome_unknown' where id=v_id;
 begin
  perform public.create_verified_fund_outbound_replacement(v_id,v_admin,'vendor fixed',v_old.payload_hash,v_body,v_time,true,true,true);
  raise exception 'Unknown outcome bypass'; exception when sqlstate '55000' then v_fails:=v_fails+1;
 end;
 update public.marison_outbound_dispatches set status='failed_terminal' where id=v_id;
 v_new:=(public.create_verified_fund_outbound_replacement(v_id,v_admin,'Digivasi fixed type; confirmed not received',v_old.payload_hash,v_body,v_time,true,true,true)->>'dispatch_id')::uuid;
 v_again:=(public.create_verified_fund_outbound_replacement(v_id,v_admin,'duplicate click',v_old.payload_hash,v_body,v_time,true,true,true)->>'dispatch_id')::uuid;
 if v_new is distinct from v_again then raise exception 'Duplicate click produced duplicate generation'; end if;
 select * into v_after from public.marison_outbound_dispatches where id=v_id;
 if v_old is distinct from v_after then raise exception 'Original dispatch mutated'; end if;
 if not exists(select 1 from public.marison_outbound_dispatches where id=v_new and generation=2
   and payload_body=v_body and payload->>'type'='marketing_cost' and post_started_at is null and status='pending'
   and idempotency_key='sigap:production:fund:'||v_old.surat_id::text||':g2') then raise exception 'Candidate not frozen exactly'; end if;
 if (select count(*) from public.marison_outbound_replacement_events where old_dispatch_id=v_id)<>1 then raise exception 'Replacement audit missing'; end if;

 select * into v_old from public.marison_outbound_dispatches where id=v_manual;
 v_receipt:=jsonb_build_object('data',jsonb_build_object('fund_submission_id',8,'submission_number',v_old.payload->'submission_number',
  'type',v_old.payload->'type','amount',v_old.payload->'amount','items',v_old.payload->'items'));
 foreach v_bad in array array[jsonb_set(v_receipt,'{data,amount}','1'),jsonb_set(v_receipt,'{data,type}','"operational"'),jsonb_set(v_receipt,'{data,items}','[]')] loop
  begin
   perform public.record_manual_fund_outbound_receipt(v_manual,v_admin,'user confirms Postman receipt',v_old.payload_hash,v_bad);
   raise exception 'Mismatched manual receipt accepted'; exception when invalid_parameter_value then v_fails:=v_fails+1;
  end;
 end loop;
 perform public.record_manual_fund_outbound_receipt(v_manual,v_admin,'Human confirms Postman receipt ID8',v_old.payload_hash,v_receipt);
 perform public.record_manual_fund_outbound_receipt(v_manual,v_admin,'Human confirms Postman receipt ID8',v_old.payload_hash,v_receipt);
 select * into v_after from public.marison_outbound_dispatches where id=v_manual;
 if v_after.status<>'succeeded' or v_after.external_reference<>'8' or v_after.reconciliation_count<>1
   or v_after.payload_body is distinct from v_old.payload_body or v_after.response is distinct from v_old.response
   or v_after.attempt_count is distinct from v_old.attempt_count then raise exception 'Manual receipt lost history or repeated'; end if;
 select updated_at into v_time from public.surat_registrasi where id=v_old.surat_id;
 begin
  perform public.create_verified_fund_outbound_replacement(v_manual,v_admin,'must block accepted receipt',v_old.payload_hash,v_body,v_time,true,true,true);
  raise exception 'Accepted Fund resent'; exception when sqlstate '55000' then v_fails:=v_fails+1;
 end;
 if (select count(*) from public.marison_outbound_reconciliation_events where dispatch_id=v_manual)<>1 then raise exception 'Manual audit missing'; end if;
 if v_fails<>13 then raise exception 'Unexpected guard coverage %',v_fails; end if;
 raise notice 'Verified Fund replacement and manual receipt: all assertions passed';
end $$;
