begin;
insert into auth.users values('10000000-0000-4000-8000-000000000001');
insert into public.profiles values('10000000-0000-4000-8000-000000000001',true);

create function pg_temp.fund_fixture(p_environment text default 'staging') returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid(); v_body text;
begin
  insert into public.surat_registrasi(id,created_by,no_surat,judul_surat,status,current_step,form_input_data,updated_at)
  values(v_id,'10000000-0000-4000-8000-000000000001','FUND-'||v_id,'Synthetic fund','DONE',1,
    '{"request_category":"fund"}',now()-interval '2 days');
  insert into public.surat_signatures(id,surat_id,user_id,step_order,is_signed,signed_at,status)
  values(gen_random_uuid(),v_id,'10000000-0000-4000-8000-000000000001',1,true,now()-interval '2 days','APPROVED');
  v_body := jsonb_build_object('submission_number','FUND-'||v_id,'amount',2200000,'items',jsonb_build_array(
    jsonb_build_object('nama_barang','Synthetic item','jumlah',1,'satuan','Unit','nominal',2200000)))::text;
  insert into public.marison_outbound_dispatches(surat_id,environment,generation,kind,endpoint,idempotency_key,
    status,post_started_at,response,payload,payload_body,payload_hash,payload_built_at)
  values(v_id,p_environment,1,'fund','/fund-submissions','fixture:'||v_id,'failed_terminal',now()-interval '23 hours',
    '{"message":"Historical schema rejection"}',v_body::jsonb,v_body,
    encode(extensions.digest(convert_to(v_body,'UTF8'),'sha256'),'hex'),now()-interval '1 day');
  return v_id;
end $$;

create function pg_temp.expect_denied(p_id uuid,p_environment text default 'staging',p_at timestamptz default now())
returns void language plpgsql as $$
declare v_number text; v_events bigint; v_receipts bigint; v_denied boolean := false;
begin
  select no_surat into v_number from public.surat_registrasi where id=p_id;
  select count(*) into v_events from public.external_submission_decision_events;
  select count(*) into v_receipts from public.external_submission_decision_receipts;
  begin
    perform public.apply_external_submission_decision(gen_random_uuid(),v_number,'revision_required',
      'Synthetic revision reason',p_at,repeat('a',64),p_environment);
  exception when sqlstate '22023' then v_denied := true;
  end;
  if not v_denied then raise exception 'Ineligible callback was accepted'; end if;
  if (select count(*) from public.external_submission_decision_events)<>v_events
     or (select count(*) from public.external_submission_decision_receipts)<>v_receipts then
    raise exception 'Denied callback left audit mutations';
  end if;
end $$;

do $$
declare v_id uuid; v_number text; v_event uuid := gen_random_uuid(); v_result jsonb; v_before jsonb; v_receipt uuid;
begin
  v_id := pg_temp.fund_fixture();
  select no_surat into v_number from public.surat_registrasi where id=v_id;
  select to_jsonb(d) into v_before from public.marison_outbound_dispatches d where surat_id=v_id;
  v_result := public.apply_external_submission_decision(v_event,v_number,'revision_required',
    'Correct the supporting information',now(),repeat('a',64),'staging');
  if v_result->>'status'<>'MENUNGGU_PERBAIKAN' then raise exception 'Revision did not open requester follow-up'; end if;
  if (select count(*) from public.surat_external_revision_history where surat_id=v_id)<>1
     or (select count(*) from public.surat_revision_events where surat_id=v_id and status='open')<>1 then
    raise exception 'Revision history or follow-up missing';
  end if;
  select id into strict v_receipt from public.external_submission_decision_receipts where surat_id=v_id
    and environment='staging' and dispatch_status='failed_terminal' and document_number=v_number;
  if (select to_jsonb(d) from public.marison_outbound_dispatches d where surat_id=v_id) is distinct from v_before then
    raise exception 'Historical failed dispatch was rewritten';
  end if;
  v_result := public.apply_external_submission_decision(v_event,v_number,'revision_required',
    'Correct the supporting information',now(),repeat('a',64),'staging');
  if v_result->>'idempotent'<>'true' or (select count(*) from public.external_submission_decision_receipts where surat_id=v_id)<>1 then
    raise exception 'Callback replay duplicated receipt';
  end if;
  begin
    perform public.apply_external_submission_decision(v_event,v_number,'rejected','Different decision',now(),repeat('b',64),'staging');
    raise exception 'Conflicting event was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin update public.external_submission_decision_receipts set document_number='CHANGED' where id=v_receipt;
    raise exception 'Receipt update allowed'; exception when sqlstate '55000' then null; end;
  begin delete from public.external_submission_decision_receipts where id=v_receipt;
    raise exception 'Receipt deletion allowed'; exception when sqlstate '55000' then null; end;

  v_id := pg_temp.fund_fixture('production');
  select no_surat into v_number from public.surat_registrasi where id=v_id;
  v_result := public.apply_external_submission_decision(gen_random_uuid(),v_number,'rejected',
    'Not permitted by department policy',now(),repeat('c',64),'production');
  if v_result->>'status'<>'REJECTED' or not exists(select 1 from public.surat_registrasi where id=v_id
    and data_snapshot#>>'{external_decision,terminal}'='true') then raise exception 'Rejection not terminal'; end if;
  if (select count(*) from public.external_submission_decision_receipts where surat_id=v_id and environment='production')<>1 then
    raise exception 'Production receipt missing';
  end if;

  v_id := pg_temp.fund_fixture();
  update public.marison_outbound_dispatches set status='outcome_unknown' where surat_id=v_id;
  select no_surat into v_number from public.surat_registrasi where id=v_id;
  perform public.apply_external_submission_decision(gen_random_uuid(),v_number,'rejected','Department confirms rejection',now(),repeat('d',64),'staging');
  if not exists(select 1 from public.external_submission_decision_receipts where surat_id=v_id and dispatch_status='outcome_unknown') then
    raise exception 'Unknown outcome receipt missing'; end if;

  v_id := pg_temp.fund_fixture();
  update public.marison_outbound_dispatches set status='succeeded',external_reference='known-vendor-id' where surat_id=v_id;
  select no_surat into v_number from public.surat_registrasi where id=v_id;
  perform public.apply_external_submission_decision(gen_random_uuid(),v_number,'rejected','Existing successful delivery',now(),repeat('e',64),'staging');
  if exists(select 1 from public.external_submission_decision_receipts where surat_id=v_id) then raise exception 'Existing success used fallback'; end if;
end $$;

do $$
declare v_id uuid; v_state text;
begin
  foreach v_state in array array['pending','processing','failed_retryable','skipped'] loop
    v_id:=pg_temp.fund_fixture();
    update public.marison_outbound_dispatches set status=v_state::public.marison_outbound_dispatch_status where surat_id=v_id;
    perform pg_temp.expect_denied(v_id);
  end loop;
  v_id:=pg_temp.fund_fixture(); perform pg_temp.expect_denied(v_id,'production');
  v_id:=pg_temp.fund_fixture(); perform pg_temp.expect_denied(v_id,'staging',now()+interval '10 minutes');
  v_id:=pg_temp.fund_fixture(); perform pg_temp.expect_denied(v_id,'staging',now()-interval '2 days');
  v_id:=pg_temp.fund_fixture(); update public.marison_outbound_dispatches set post_started_at=null where surat_id=v_id; perform pg_temp.expect_denied(v_id);
  v_id:=pg_temp.fund_fixture(); update public.marison_outbound_dispatches set payload_hash=repeat('f',64) where surat_id=v_id; perform pg_temp.expect_denied(v_id);
  v_id:=pg_temp.fund_fixture(); update public.marison_outbound_dispatches set payload_body='not-json',
    payload_hash=encode(extensions.digest('not-json','sha256'),'hex') where surat_id=v_id; perform pg_temp.expect_denied(v_id);
  v_id:=pg_temp.fund_fixture(); update public.marison_outbound_dispatches set payload=jsonb_set(payload,'{submission_number}','"WRONG"') where surat_id=v_id; perform pg_temp.expect_denied(v_id);
  v_id:=pg_temp.fund_fixture(); update public.marison_outbound_dispatches set payload=jsonb_set(payload,'{amount}','99') where surat_id=v_id; perform pg_temp.expect_denied(v_id);
  v_id:=pg_temp.fund_fixture(); update public.marison_outbound_dispatches set payload_body=null where surat_id=v_id; perform pg_temp.expect_denied(v_id);
  v_id:=pg_temp.fund_fixture(); update public.marison_outbound_dispatches set kind='asset',endpoint='/asset-purchase-requests' where surat_id=v_id; perform pg_temp.expect_denied(v_id);
  v_id:=pg_temp.fund_fixture(); update public.marison_outbound_dispatches set kind='unit',endpoint='/unit-submissions' where surat_id=v_id; perform pg_temp.expect_denied(v_id);
  v_id:=pg_temp.fund_fixture(); update public.marison_outbound_dispatches set endpoint='/wrong-endpoint' where surat_id=v_id; perform pg_temp.expect_denied(v_id);
  v_id:=pg_temp.fund_fixture(); update public.surat_registrasi set updated_at=now() where id=v_id; perform pg_temp.expect_denied(v_id);
  v_id:=pg_temp.fund_fixture(); update public.surat_registrasi set status='PROSES' where id=v_id; perform pg_temp.expect_denied(v_id);
  v_id:=pg_temp.fund_fixture(); update public.surat_registrasi set form_input_data='{"test_form":"KEU"}' where id=v_id; perform pg_temp.expect_denied(v_id);
  v_id:=pg_temp.fund_fixture(); update public.surat_signatures set is_signed=false where surat_id=v_id; perform pg_temp.expect_denied(v_id);
  v_id:=pg_temp.fund_fixture(); update public.surat_signatures set signed_at=now() where surat_id=v_id; perform pg_temp.expect_denied(v_id);
  v_id:=pg_temp.fund_fixture(); delete from public.surat_signatures where surat_id=v_id; perform pg_temp.expect_denied(v_id);
  v_id:=pg_temp.fund_fixture();
  insert into public.marison_outbound_dispatches(surat_id,environment,generation,kind,endpoint,idempotency_key,status)
    values(v_id,'staging',2,'fund','/fund-submissions','new-generation:'||v_id,'pending');
  perform pg_temp.expect_denied(v_id);
end $$;

-- A later business failure must roll back the new receipt and the decision.
create function pg_temp.reject_fixture_notification() returns trigger language plpgsql as $$
begin
  if exists(select 1 from public.surat_registrasi where id=(new.data->>'surat_id')::uuid
    and form_input_data->>'fail_notification'='true') then raise exception 'Synthetic downstream failure' using errcode='22023'; end if;
  return new;
end $$;
create trigger receipt_fixture_failure before insert on public.notifications for each row execute function pg_temp.reject_fixture_notification();
do $$declare v_id uuid;begin
  v_id:=pg_temp.fund_fixture(); update public.surat_registrasi set form_input_data='{"fail_notification":true}' where id=v_id;
  perform pg_temp.expect_denied(v_id);
end $$;

do $$begin
  if has_table_privilege('anon','public.external_submission_decision_receipts','select')
    or has_table_privilege('authenticated','public.external_submission_decision_receipts','select')
    or has_table_privilege('service_role','public.external_submission_decision_receipts','insert')
    or has_function_privilege('authenticated','public.resolve_external_decision_dispatch(uuid,text,text,timestamptz)','execute')
    or has_function_privilege('anon','public.apply_external_submission_decision(uuid,text,text,text,timestamptz,text,text)','execute') then
    raise exception 'Private callback evidence is exposed';
  end if;
end $$;
set local role authenticated;
do $$begin
  begin perform public.apply_external_submission_decision(gen_random_uuid(),'FUND','rejected','Not allowed',now(),repeat('a',64),'staging');
    raise exception 'User bypassed machine authentication'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'External decision receipts: all assertions passed' result;
