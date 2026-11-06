begin;
insert into auth.users values('80000000-0000-4000-8000-000000000001');
insert into public.profiles values('80000000-0000-4000-8000-000000000001',true);
insert into public.surat_registrasi(id,created_by,no_surat,status,current_step,form_input_data,updated_at)
values('80000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000001','FUND-REVISION','DONE',1,
  '{"request_category":"fund","items":[]}',now()-interval '2 days');
insert into public.surat_signatures(id,surat_id,user_id,step_order,is_signed,signed_at,status)
values(gen_random_uuid(),'80000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000001',1,true,now()-interval '2 days','APPROVED');
insert into public.marison_outbound_dispatches(id,surat_id,environment,generation,kind,endpoint,idempotency_key,status,post_started_at,payload_built_at,payload,payload_body,payload_hash)
values('80000000-0000-4000-8000-000000000003','80000000-0000-4000-8000-000000000002','staging',1,'fund','/fund-submissions','fund-revision-1','failed_terminal',now()-interval '23 hours',now()-interval '1 day',
  '{"submission_number":"FUND-REVISION"}','{"submission_number":"FUND-REVISION"}',
  encode(extensions.digest('{"submission_number":"FUND-REVISION"}','sha256'),'hex'));
select public.apply_external_submission_decision('80000000-0000-4000-8000-000000000004','FUND-REVISION','revision_required',
  'Correct the supporting documents',now(),repeat('a',64),'staging');

create function pg_temp.expect_blocked_replacement(p_environment text default 'staging',p_generation integer default 2)
returns void language plpgsql as $$
begin
  begin
    insert into public.marison_outbound_dispatches(surat_id,environment,generation,kind,endpoint,idempotency_key,status,replacement_of_dispatch_id)
    values('80000000-0000-4000-8000-000000000002',p_environment,p_generation,'fund','/fund-submissions',gen_random_uuid()::text,'pending','80000000-0000-4000-8000-000000000003');
    raise exception 'Unapproved replacement was accepted';
  exception when sqlstate '55000' then null;
  end;
end $$;
select pg_temp.expect_blocked_replacement();
do $$begin
  begin update public.marison_outbound_dispatches set status='pending' where id='80000000-0000-4000-8000-000000000003';
    raise exception 'Receipted original was reopened'; exception when sqlstate '55000' then null; end;
  begin update public.marison_outbound_dispatches set payload_hash=repeat('b',64) where id='80000000-0000-4000-8000-000000000003';
    raise exception 'Receipted original payload was rewritten'; exception when sqlstate '55000' then null; end;
end $$;

select set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000001',true);
do $$declare v_event uuid; v_draft public.surat_registration_drafts;begin
  select id into strict v_event from public.surat_revision_events where surat_id='80000000-0000-4000-8000-000000000002';
  v_draft:=public.create_external_submission_revision_draft(v_event);
  perform public.submit_external_submission_revision(v_event,v_draft.id,
    '{"form_input_data":{"request_category":"fund","items":[],"catatan":"Revised supporting information"}}','Revised fixture');
  if not exists(select 1 from public.surat_revision_events where id=v_event and status='resolved') then raise exception 'Revision unresolved';end if;
  if public.receipt_allows_external_fund_revision('80000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000003') then
    raise exception 'Unsigned revision may dispatch';end if;
end $$;
select pg_temp.expect_blocked_replacement();

update public.surat_signatures set is_signed=true,signed_at=clock_timestamp(),status='APPROVED'
where surat_id='80000000-0000-4000-8000-000000000002';
update public.surat_registrasi set status='DONE',updated_at=clock_timestamp() where id='80000000-0000-4000-8000-000000000002';
do $$declare v_child uuid;begin
  select id into strict v_child from public.marison_outbound_dispatches where surat_id='80000000-0000-4000-8000-000000000002'
    and generation=2 and status='pending' and replacement_of_dispatch_id='80000000-0000-4000-8000-000000000003';
  if (select status::text from public.marison_outbound_dispatches where id='80000000-0000-4000-8000-000000000003')<>'failed_terminal'
    or (select count(*) from public.external_submission_decision_receipts where surat_id='80000000-0000-4000-8000-000000000002')<>1 then
    raise exception 'Original failure or receipt changed';end if;
  update public.marison_outbound_dispatches set status='processing' where id=v_child;
  begin update public.marison_outbound_dispatches set environment='production' where id=v_child;
    raise exception 'Child dispatch identity changed'; exception when sqlstate '55000' then null; end;
end $$;
select pg_temp.expect_blocked_replacement('production');
select pg_temp.expect_blocked_replacement('staging',3);
update public.surat_registrasi set status='PROSES' where id='80000000-0000-4000-8000-000000000002';
update public.surat_registrasi set status='DONE' where id='80000000-0000-4000-8000-000000000002';
do $$begin
  if (select count(*) from public.marison_outbound_dispatches where surat_id='80000000-0000-4000-8000-000000000002')<>2 then
    raise exception 'Revision completion replay created another generation';end if;
  if has_function_privilege('authenticated','public.receipt_allows_external_fund_revision(uuid,uuid)','execute') then
    raise exception 'Private revision evidence helper exposed';end if;
end $$;
rollback;
select 'Fund receipt revision: corrected and approved generation only, original retry blocked' result;
