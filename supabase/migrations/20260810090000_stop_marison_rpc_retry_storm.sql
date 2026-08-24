-- Stop retry storms caused by expected business conflicts being raised as SQL errors.
-- The strict implementations remain the final mutation guard; these wrappers only
-- make repeated commands idempotent or return a structured concurrency conflict.

do $$
begin
  if to_regprocedure('public.create_marison_outbound_replacement_strict(uuid,uuid,text)') is null then
    alter function public.create_marison_outbound_replacement(uuid, uuid, text)
      rename to create_marison_outbound_replacement_strict;
  end if;

  if to_regprocedure('public.configure_marison_payload_mapping_strict(uuid,text,text,uuid,uuid,text,timestamptz)') is null then
    alter function public.configure_marison_payload_mapping(uuid, text, text, uuid, uuid, text, timestamptz)
      rename to configure_marison_payload_mapping_strict;
  end if;
end;
$$;

create or replace function public.create_marison_outbound_replacement(
  p_dispatch_id uuid,
  p_actor_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.marison_outbound_dispatches%rowtype;
  v_existing uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role::text = 'admin' and is_active and deleted_at is null
  ) then
    raise exception 'Active admin is required' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Reason is required' using errcode = '22023';
  end if;

  select * into v_old
  from public.marison_outbound_dispatches
  where id = p_dispatch_id;
  if not found then
    raise exception 'Dispatch not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('marison-dispatch:' || v_old.environment || ':' || v_old.surat_id::text, 0)
  );
  select * into v_old
  from public.marison_outbound_dispatches
  where id = p_dispatch_id
  for update;

  if v_old.environment <> 'staging'
     or v_old.status <> 'failed_terminal'
     or v_old.error_code is distinct from 'marison_http_422'
     or v_old.post_started_at is null
     or v_old.external_reference is not null then
    raise exception 'Only confirmed staging HTTP 422 dispatches can be replaced' using errcode = '55000';
  end if;

  select id into v_existing
  from public.marison_outbound_dispatches
  where replacement_of_dispatch_id = v_old.id
  order by created_at desc, id desc
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  return public.create_marison_outbound_replacement_strict(
    p_dispatch_id,
    p_actor_id,
    p_reason
  );
end;
$$;

create or replace function public.configure_marison_payload_mapping(
  p_actor_id uuid,
  p_environment text,
  p_entity_type text,
  p_record_id uuid,
  p_target_record_id uuid,
  p_reason text,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.marison_outbound_record_mappings%rowtype;
begin
  if p_environment <> 'staging' then
    raise exception 'Payload mappings are staging-only' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_actor_id and p.role::text = 'admin' and p.is_active and p.deleted_at is null
  ) then
    raise exception 'Active admin is required' using errcode = '42501';
  end if;
  if p_entity_type not in ('profile', 'office', 'project') or p_record_id is null then
    raise exception 'Mapping record tidak valid' using errcode = '22023';
  end if;
  if p_entity_type = 'profile' and not exists (
    select 1 from public.profiles p where p.id = p_record_id and p.deleted_at is null
  ) then
    raise exception 'Source profile tidak ditemukan' using errcode = '22023';
  end if;
  if p_entity_type = 'office' and not exists (
    select 1 from public.master_offices o where o.id = p_record_id
  ) then
    raise exception 'Source office tidak ditemukan' using errcode = '22023';
  end if;
  if p_entity_type = 'project' and not exists (
    select 1 from public.master_projects pr where pr.id = p_record_id
  ) then
    raise exception 'Source project tidak ditemukan' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null or length(p_reason) > 2000 then
    raise exception 'Reason is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_environment || ':' || p_entity_type || ':' || p_record_id::text, 0)
  );
  select * into v_old
  from public.marison_outbound_record_mappings
  where environment = p_environment
    and entity_type = p_entity_type
    and record_id = p_record_id
  for update;

  if v_old.id is not null and p_expected_updated_at is null then
    if p_target_record_id is not distinct from v_old.target_record_id then
      return jsonb_build_object(
        'id', v_old.id,
        'record_id', v_old.record_id,
        'target_record_id', v_old.target_record_id,
        'updated_at', v_old.updated_at,
        'unchanged', true
      );
    end if;
    return jsonb_build_object(
      'conflict', true,
      'code', 'EXPECTED_VERSION_REQUIRED',
      'record_id', p_record_id,
      'updated_at', v_old.updated_at
    );
  end if;

  if v_old.id is null and p_expected_updated_at is not null then
    return jsonb_build_object(
      'conflict', true,
      'code', 'MAPPING_MISSING',
      'record_id', p_record_id
    );
  end if;

  if v_old.id is not null and p_expected_updated_at <> v_old.updated_at then
    return jsonb_build_object(
      'conflict', true,
      'code', 'STALE_VERSION',
      'record_id', p_record_id,
      'updated_at', v_old.updated_at
    );
  end if;

  return public.configure_marison_payload_mapping_strict(
    p_actor_id,
    p_environment,
    p_entity_type,
    p_record_id,
    p_target_record_id,
    p_reason,
    p_expected_updated_at
  );
end;
$$;

revoke execute on function public.create_marison_outbound_replacement(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_marison_outbound_replacement(uuid, uuid, text)
  to service_role;

revoke execute on function public.configure_marison_payload_mapping(uuid, text, text, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.configure_marison_payload_mapping(uuid, text, text, uuid, uuid, text, timestamptz)
  to service_role;

revoke execute on function public.create_marison_outbound_replacement_strict(uuid, uuid, text)
  from public, anon, authenticated, service_role;

revoke execute on function public.configure_marison_payload_mapping_strict(uuid, text, text, uuid, uuid, text, timestamptz)
  from public, anon, authenticated, service_role;

comment on function public.create_marison_outbound_replacement(uuid, uuid, text) is
  'Idempotent staging replacement command. Repeated requests return the existing child dispatch.';

comment on function public.configure_marison_payload_mapping(uuid, text, text, uuid, uuid, text, timestamptz) is
  'Staging mapping command. Expected concurrency conflicts are returned as JSON instead of transaction errors.';
