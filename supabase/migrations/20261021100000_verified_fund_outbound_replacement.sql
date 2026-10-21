-- MRN-26: explicit Fund replacement and audited manual receipt; no automatic replay.
begin;

create or replace function public.create_verified_fund_outbound_replacement(
  p_dispatch_id uuid, p_actor_id uuid, p_reason text, p_expected_payload_hash text,
  p_candidate_body text, p_surat_updated_at timestamptz,
  p_confirm_not_received boolean default false, p_confirm_vendor_fixed boolean default false,
  p_confirm_production boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_old public.marison_outbound_dispatches%rowtype;
  v_new uuid; v_generation integer; v_candidate jsonb;
begin
  if not exists (select 1 from public.profiles where id=p_actor_id and role::text='admin'
      and is_active is true and deleted_at is null) then
    raise exception 'Active admin is required' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_reason,'')))<5 or length(p_reason)>2000
      or p_confirm_not_received is distinct from true or p_confirm_vendor_fixed is distinct from true then
    raise exception 'Reason, nonreceipt and vendor correction confirmations are required' using errcode='22023';
  end if;
  select * into v_old from public.marison_outbound_dispatches where id=p_dispatch_id;
  if not found then raise exception 'Dispatch not found' using errcode='P0002'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('marison-dispatch:'||v_old.environment||':'||v_old.surat_id::text,0));
  select * into v_old from public.marison_outbound_dispatches where id=p_dispatch_id for update;
  if v_old.kind is distinct from 'fund' or v_old.endpoint is distinct from '/fund-submissions'
      or v_old.status is distinct from 'failed_terminal' or v_old.error_code is distinct from 'marison_http_422'
      or v_old.post_started_at is null or v_old.response is null or v_old.external_reference is not null
      or v_old.payload_body is null or v_old.payload_hash is distinct from p_expected_payload_hash
      or v_old.payload is distinct from v_old.payload_body::jsonb
      or pg_catalog.encode(extensions.digest(v_old.payload_body,'sha256'),'hex') is distinct from v_old.payload_hash then
    raise exception 'Only verified rejected Fund dispatches can be replaced' using errcode='55000';
  end if;
  if v_old.environment='production' and p_confirm_production is distinct from true then
    raise exception 'Production confirmation is required' using errcode='42501';
  end if;
  if exists (select 1 from public.marison_outbound_dispatches where surat_id=v_old.surat_id
      and environment=v_old.environment and (status in ('succeeded','outcome_unknown') or external_reference is not null)) then
    raise exception 'Vendor receipt exists or delivery outcome is unknown; do not resend' using errcode='55000';
  end if;
  select id into v_new from public.marison_outbound_dispatches where replacement_of_dispatch_id=v_old.id;
  if found then return jsonb_build_object('dispatch_id',v_new,'already_exists',true); end if;
  if exists (select 1 from public.marison_outbound_dispatches where surat_id=v_old.surat_id
      and environment=v_old.environment and (generation>v_old.generation or status in ('pending','processing','failed_retryable'))) then
    raise exception 'Newer or active dispatch exists' using errcode='40001';
  end if;
  if not exists (select 1 from public.marison_outbound_settings where singleton and enabled and environment=v_old.environment) then
    raise exception 'Outbox is disabled' using errcode='55000';
  end if;
  perform 1 from public.surat_registrasi where id=v_old.surat_id and upper(status::text) in ('DONE','SELESAI')
    and updated_at is not distinct from p_surat_updated_at for update;
  if not found or not exists (select 1 from public.surat_signatures where surat_id=v_old.surat_id)
      or exists (select 1 from public.surat_signatures where surat_id=v_old.surat_id and (is_signed is distinct from true or signed_at is null)) then
    raise exception 'Final document changed or signatures are incomplete' using errcode='40001';
  end if;
  perform 1 from public.surat_signatures where surat_id=v_old.surat_id for share;
  if p_candidate_body is null or octet_length(p_candidate_body)>2000000 then
    raise exception 'Candidate body is invalid' using errcode='22023';
  end if;
  v_candidate:=p_candidate_body::jsonb;
  if jsonb_typeof(v_candidate) is distinct from 'object'
      or (v_candidate-'main_document'-'attachments') is distinct from (v_old.payload-'main_document'-'attachments')
      or jsonb_typeof(v_candidate->'main_document') is distinct from 'string'
      or v_candidate->>'main_document' !~ '^https://'
      or jsonb_typeof(v_candidate->'attachments') is distinct from 'array'
      or exists (select 1 from jsonb_array_elements(v_candidate->'attachments') a where a->>'link'=v_candidate->>'main_document') then
    raise exception 'Only document placement may change; Fund business data must remain unchanged' using errcode='22023';
  end if;
  select coalesce(max(generation),0)+1 into v_generation from public.marison_outbound_dispatches
    where surat_id=v_old.surat_id and environment=v_old.environment;
  insert into public.marison_outbound_dispatches
    (surat_id,environment,generation,kind,endpoint,idempotency_key,status,replacement_of_dispatch_id,
     payload,payload_body,payload_hash,payload_built_at,contract_version,payload_resolution_sources)
  values (v_old.surat_id,v_old.environment,v_generation,'fund','/fund-submissions',
    format('sigap:%s:fund:%s:g%s',v_old.environment,v_old.surat_id,v_generation),'pending',v_old.id,
    v_candidate,p_candidate_body,pg_catalog.encode(extensions.digest(p_candidate_body,'sha256'),'hex'),
    pg_catalog.clock_timestamp(),'vendor-openapi-fund-2026-10-15-main-document',v_old.payload_resolution_sources)
  returning id into v_new;
  insert into public.marison_outbound_replacement_events
    (old_dispatch_id,new_dispatch_id,surat_id,environment,actor_id,reason,before_state)
  values (v_old.id,v_new,v_old.surat_id,v_old.environment,p_actor_id,btrim(p_reason),
    jsonb_build_object('generation',v_old.generation,'status',v_old.status,'payload_hash',v_old.payload_hash,
      'post_started_at',v_old.post_started_at,'confirmed_not_received',true,'confirmed_vendor_fixed',true,
      'candidate_hash',pg_catalog.encode(extensions.digest(p_candidate_body,'sha256'),'hex')));
  return jsonb_build_object('dispatch_id',v_new,'already_exists',false);
end $$;

create or replace function public.record_manual_fund_outbound_receipt(
  p_dispatch_id uuid, p_actor_id uuid, p_reason text, p_expected_payload_hash text, p_receipt jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_old public.marison_outbound_dispatches%rowtype;
  v_data jsonb:=p_receipt->'data'; v_reference text:=v_data->>'fund_submission_id';
begin
  if not exists (select 1 from public.profiles where id=p_actor_id and role::text='admin'
      and is_active is true and deleted_at is null) then
    raise exception 'Active admin is required' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_reason,'')))<5 or length(p_reason)>2000 or v_reference is null or v_reference !~ '^[1-9][0-9]*$' then
    raise exception 'Reason and vendor Fund receipt are required' using errcode='22023';
  end if;
  select * into v_old from public.marison_outbound_dispatches where id=p_dispatch_id;
  if not found then raise exception 'Dispatch not found' using errcode='P0002'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('marison-dispatch:'||v_old.environment||':'||v_old.surat_id::text,0));
  select * into v_old from public.marison_outbound_dispatches where id=p_dispatch_id for update;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('marison-fund-reference:'||v_old.environment||':'||v_reference,0));
  if v_old.kind is distinct from 'fund' or v_old.endpoint is distinct from '/fund-submissions'
      or v_old.payload_body is null or v_old.payload_hash is distinct from p_expected_payload_hash
      or v_old.payload is distinct from v_old.payload_body::jsonb
      or pg_catalog.encode(extensions.digest(v_old.payload_body,'sha256'),'hex') is distinct from v_old.payload_hash
      or (v_data->'submission_number') is distinct from (v_old.payload->'submission_number')
      or (v_data->'type') is distinct from (v_old.payload->'type')
      or (v_data->'amount') is distinct from (v_old.payload->'amount')
      or (v_data->'items') is distinct from (v_old.payload->'items') then
    raise exception 'Receipt does not match frozen Fund payload' using errcode='22023';
  end if;
  if v_old.status='succeeded' and v_old.external_reference=v_reference then
    return jsonb_build_object('success',true,'already_recorded',true);
  end if;
  if v_old.status not in ('failed_terminal','outcome_unknown') or v_old.post_started_at is null
      or v_old.external_reference is not null or exists (select 1 from public.marison_outbound_dispatches
        where surat_id=v_old.surat_id and environment=v_old.environment and id<>v_old.id
          and (generation>v_old.generation or status in ('pending','processing','failed_retryable','succeeded','outcome_unknown') or external_reference is not null)) then
    raise exception 'Dispatch is not eligible for manual receipt reconciliation' using errcode='55000';
  end if;
  if exists (select 1 from public.marison_outbound_dispatches where environment=v_old.environment
      and kind='fund' and external_reference=v_reference and surat_id<>v_old.surat_id) then
    raise exception 'Vendor reference belongs to another Fund document' using errcode='23505';
  end if;
  insert into public.marison_outbound_reconciliation_events
    (dispatch_id,surat_id,environment,action,from_status,to_status,actor_id,reason,external_reference,before_state)
  values (v_old.id,v_old.surat_id,v_old.environment,'mark_succeeded',v_old.status,'succeeded',p_actor_id,btrim(p_reason),v_reference,
    jsonb_build_object('payload_hash',v_old.payload_hash,'attempt_count',v_old.attempt_count,
      'post_started_at',v_old.post_started_at,'response',v_old.response,'error_code',v_old.error_code,
      'manual_vendor_receipt',v_data,'receipt_source','user_provided_postman_response'));
  update public.marison_outbound_dispatches set status='succeeded',external_reference=v_reference,
    completed_at=pg_catalog.clock_timestamp(),error_code=null,error_message=null,error_details=null,
    reconciliation_count=reconciliation_count+1,updated_at=pg_catalog.clock_timestamp() where id=v_old.id;
  return jsonb_build_object('success',true,'already_recorded',false);
end $$;

revoke all on function public.create_verified_fund_outbound_replacement(uuid,uuid,text,text,text,timestamptz,boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function public.create_verified_fund_outbound_replacement(uuid,uuid,text,text,text,timestamptz,boolean,boolean,boolean) to service_role;
revoke all on function public.record_manual_fund_outbound_receipt(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_manual_fund_outbound_receipt(uuid,uuid,text,text,jsonb) to service_role;
commit;
