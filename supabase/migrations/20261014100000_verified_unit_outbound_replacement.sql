-- MRN-18: service-only, reference-verified Unit replacement; original POST is immutable.
begin;
alter table public.marison_outbound_replacement_events
  drop constraint if exists marison_outbound_replacement_events_environment_check;
alter table public.marison_outbound_replacement_events
  add constraint marison_outbound_replacement_events_environment_check
  check (environment in ('staging', 'production'));

create or replace function public.create_verified_unit_outbound_replacement(
  p_dispatch_id uuid, p_actor_id uuid, p_reason text,
  p_expected_payload_hash text, p_reference_receipt jsonb,
  p_confirm_production boolean default false
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.marison_outbound_dispatches%rowtype;
  v_new uuid;
  v_generation integer;
  v_observed timestamptz;
  v_units jsonb;
  v_original_ids jsonb;
  v_verified_ids jsonb;
begin
  if not exists (select 1 from public.profiles where id=p_actor_id
      and role::text='admin' and is_active is true and deleted_at is null) then
    raise exception 'Active admin is required' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_reason,''))) < 5 or length(p_reason)>2000 then
    raise exception 'A clear replacement reason is required' using errcode='22023';
  end if;
  select * into v_old from public.marison_outbound_dispatches where id=p_dispatch_id;
  if not found then raise exception 'Dispatch not found' using errcode='P0002'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'marison-dispatch:'||v_old.environment||':'||v_old.surat_id::text,0));
  select * into v_old from public.marison_outbound_dispatches where id=p_dispatch_id for update;
  if v_old.environment not in ('staging','production') or v_old.kind <> 'unit'
      or v_old.endpoint is distinct from '/unit-submissions'
      or v_old.status <> 'failed_terminal' or v_old.error_code is distinct from 'marison_http_422'
      or v_old.post_started_at is null or v_old.response is null or v_old.external_reference is not null
      or v_old.payload_body is null or v_old.payload_hash is distinct from p_expected_payload_hash
      or v_old.payload is distinct from v_old.payload_body::jsonb
      or pg_catalog.encode(extensions.digest(v_old.payload_body,'sha256'),'hex') is distinct from v_old.payload_hash then
    raise exception 'Only verified rejected Unit dispatches can be replaced' using errcode='55000';
  end if;
  if v_old.environment='production' and p_confirm_production is distinct from true then
    raise exception 'Production send confirmation is required' using errcode='42501';
  end if;
  if not exists (select 1 from public.marison_outbound_settings where singleton
      and enabled and environment=v_old.environment) then
    raise exception 'Outbox is disabled for this environment' using errcode='55000';
  end if;
  if not exists (select 1 from public.surat_registrasi where id=v_old.surat_id
      and upper(status::text) in ('SELESAI','DONE'))
      or not exists (select 1 from public.surat_signatures where surat_id=v_old.surat_id)
      or exists (select 1 from public.surat_signatures where surat_id=v_old.surat_id
        and (is_signed is distinct from true or signed_at is null)) then
    raise exception 'Document and every signature must be final' using errcode='55000';
  end if;
  v_observed := (p_reference_receipt->>'observed_at')::timestamptz;
  v_units := p_reference_receipt->'units';
  if v_observed is null or v_observed < pg_catalog.clock_timestamp()-interval '2 minutes'
      or v_observed > pg_catalog.clock_timestamp()+interval '5 seconds'
      or (p_reference_receipt->>'project_id') is distinct from (v_old.payload->>'project_id')
      or jsonb_typeof(v_units) is distinct from 'array' or jsonb_array_length(v_units)=0 then
    raise exception 'Fresh matching project/unit references are required' using errcode='22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_units) u where jsonb_typeof(u) <> 'object'
      or (u->>'unit_id') !~ '^[1-9][0-9]*$' or u->>'unit_id' is null
      or jsonb_typeof(u->'type') is distinct from 'string' or nullif(btrim(u->>'type'),'') is null
      or length(u->>'type')>100 or u->'has_submitted' is distinct from 'false'::jsonb) then
    raise exception 'Every unit must have a type and explicit unsubmitted status' using errcode='22023';
  end if;
  select jsonb_agg((u->>'unit_id')::bigint order by (u->>'unit_id')::bigint) into v_original_ids
    from jsonb_array_elements(v_old.payload->'units') u;
  select jsonb_agg((u->>'unit_id')::bigint order by (u->>'unit_id')::bigint) into v_verified_ids
    from jsonb_array_elements(v_units) u;
  if v_original_ids is null or v_original_ids is distinct from v_verified_ids
      or (select count(distinct u->>'unit_id') from jsonb_array_elements(v_units) u) <> jsonb_array_length(v_units) then
    raise exception 'Unit identities cannot change through replacement' using errcode='22023';
  end if;
  select id into v_new from public.marison_outbound_dispatches where replacement_of_dispatch_id=v_old.id;
  if found then return jsonb_build_object('dispatch_id',v_new,'already_exists',true); end if;
  if exists (select 1 from public.marison_outbound_dispatches where surat_id=v_old.surat_id
      and environment=v_old.environment and (generation>v_old.generation
        or status in ('pending','processing','failed_retryable'))) then
    raise exception 'Newer or active dispatch already exists' using errcode='40001';
  end if;
  select coalesce(max(generation),0)+1 into v_generation from public.marison_outbound_dispatches
    where surat_id=v_old.surat_id and environment=v_old.environment;
  insert into public.marison_outbound_dispatches
    (surat_id,environment,generation,kind,endpoint,idempotency_key,status,replacement_of_dispatch_id)
  values (v_old.surat_id,v_old.environment,v_generation,'unit','/unit-submissions',
    format('sigap:%s:unit:%s:g%s',v_old.environment,v_old.surat_id,v_generation),'pending',v_old.id)
  returning id into v_new;
  insert into public.marison_outbound_replacement_events
    (old_dispatch_id,new_dispatch_id,surat_id,environment,actor_id,reason,before_state)
  values (v_old.id,v_new,v_old.surat_id,v_old.environment,p_actor_id,btrim(p_reason),
    jsonb_build_object('generation',v_old.generation,'status',v_old.status,
      'payload_hash',v_old.payload_hash,'post_started_at',v_old.post_started_at,
      'reference_receipt',jsonb_build_object('project_id',p_reference_receipt->'project_id',
        'observed_at',v_observed,'units',(select jsonb_agg(jsonb_build_object(
          'unit_id',u->'unit_id','type',u->'type','has_submitted',false)) from jsonb_array_elements(v_units) u))));
  return jsonb_build_object('dispatch_id',v_new,'already_exists',false);
end;
$$;
revoke all on function public.create_verified_unit_outbound_replacement(uuid,uuid,text,text,jsonb,boolean)
  from public,anon,authenticated;
grant execute on function public.create_verified_unit_outbound_replacement(uuid,uuid,text,text,jsonb,boolean) to service_role;
commit;
