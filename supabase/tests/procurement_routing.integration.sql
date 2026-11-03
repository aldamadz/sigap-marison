do $$
declare
  v_result jsonb;
  v_job record;
  v_id uuid;
  v_count integer;
  i integer;
begin
  if exists(select 1 from public.marison_outbound_dispatches d where d.surat_id='10000000-0000-0000-0000-000000000005'
    and (d.status<>'skipped' or d.skipped_code<>'finance_not_connected')) then
    raise exception 'Legacy unsent KEU was not safely skipped'; end if;
  if not exists(select 1 from public.marison_outbound_dispatches d,old_posted old
    where d.surat_id='10000000-0000-0000-0000-000000000006' and to_jsonb(d)=old.body) then
    raise exception 'Historical POST evidence was modified'; end if;

  for i in 1..4 loop
    v_id:=('10000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid;
    if public.marison_procurement_routing_block(v_id) is not null then raise exception 'PGD blocked'; end if;
    v_result:=public.ensure_marison_outbound_dispatch(v_id,'staging');
    if (v_result->>'no_dispatch')::boolean then raise exception 'PGD did not enqueue'; end if;
  end loop;
  for i in 5..7 loop
    v_id:=('10000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid;
    if public.marison_procurement_routing_block(v_id) is distinct from 'finance_not_connected' then raise exception 'KEU gate missing'; end if;
    v_result:=public.ensure_marison_outbound_dispatch(v_id,'staging');
    if v_result->>'code'<>'finance_not_connected' or not (v_result->>'no_dispatch')::boolean then raise exception 'KEU enqueued'; end if;
  end loop;
  if exists(select 1 from public.marison_outbound_dispatches where surat_id='10000000-0000-0000-0000-000000000007') then
    raise exception 'New KEU queue record was created'; end if;

  -- Historical status can be reconciled, but never reopened or replaced.
  begin
    update public.marison_outbound_dispatches set status='pending' where surat_id='10000000-0000-0000-0000-000000000006';
    raise exception 'KEU reopen bypassed guard';
  exception when sqlstate '55000' then null; end;
  begin
    insert into public.marison_outbound_dispatches(surat_id,environment,generation,kind,endpoint,idempotency_key)
    values('10000000-0000-0000-0000-000000000006','staging',2,'fund','/fund-submissions','test:replacement');
    raise exception 'KEU replacement bypassed guard';
  exception when sqlstate '55000' then null; end;

  select * into v_job from public.claim_marison_outbound_dispatch('staging');
  if v_job.job_id is null or public.marison_procurement_routing_block(v_job.surat_id) is not null then
    raise exception 'Claim returned non-PGD or no job'; end if;
  -- Prepare a valid payload, then change trusted form metadata before the POST boundary.
  perform public.prepare_marison_outbound_dispatch(v_job.job_id,v_job.lease_token,v_job.kind,v_job.endpoint,'test',
    '{}'::jsonb,'{}',encode(extensions.digest('{}','sha256'),'hex'));
  update public.surat_registrasi set location_snapshot='{"form":{"nomor_form":"FM-UAI.KEU-99-00"}}' where id=v_job.surat_id;
  begin
    perform public.mark_marison_outbound_post_started(v_job.job_id,v_job.lease_token);
    raise exception 'Cached payload bypassed post-boundary guard';
  exception when sqlstate '55000' then null; end;
  if exists(select 1 from public.marison_outbound_dispatches where id=v_job.job_id and post_started_at is not null) then
    raise exception 'Blocked form reached POST marker'; end if;

  -- Unknown identities and conflicting snapshots fail closed; input cannot spoof form identity.
  insert into public.surat_registrasi(id,status,form_input_data)
  values('20000000-0000-0000-0000-000000000001','DONE','{"request_category":"asset","nomor_form":"FM-UAI.PGD-01-00"}');
  if public.marison_procurement_routing_block('20000000-0000-0000-0000-000000000001') is distinct from 'form_identity_unavailable' then
    raise exception 'Editable input spoofed form identity'; end if;
  update public.surat_registrasi set location_snapshot='{"form":{"nomor_form":"FM-UAI.PGD-01-00"}}',
    data_snapshot='{"form":{"nomor_form":"FM-UAI.PBO-04-00"}}' where id='20000000-0000-0000-0000-000000000001';
  if public.marison_procurement_routing_block('20000000-0000-0000-0000-000000000001') is distinct from 'form_not_procurement' then
    raise exception 'Conflicting form identities did not fail closed'; end if;
  if public.marison_procurement_routing_block('ffffffff-ffff-ffff-ffff-ffffffffffff') is distinct from 'form_identity_unavailable' then
    raise exception 'Missing surat did not fail closed'; end if;

  select count(*) into v_count from public.surat_registrasi where status='DONE';
  if v_count<>8 then raise exception 'Business status changed'; end if;
  if has_function_privilege('authenticated','public.marison_procurement_routing_block(uuid)','execute')
    or has_function_privilege('anon','public.marison_procurement_routing_block(uuid)','execute') then
    raise exception 'Private routing RPC exposed'; end if;
end;
$$;
select 'Procurement routing: all assertions passed; no vendor POST' as result;
