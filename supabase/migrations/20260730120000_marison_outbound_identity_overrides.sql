alter table public.marison_outbound_settings
  add column if not exists override_nik text,
  add column if not exists override_branch_id bigint,
  add column if not exists override_project_id bigint;

alter table public.marison_outbound_settings
  drop constraint if exists marison_outbound_settings_override_check;

alter table public.marison_outbound_settings
  add constraint marison_outbound_settings_override_check check (
    (override_nik is null or btrim(override_nik) <> '')
    and (override_branch_id is null or override_branch_id > 0)
    and (override_project_id is null or override_project_id > 0)
    and (environment = 'staging' or (
      override_nik is null and override_branch_id is null and override_project_id is null
    ))
  );

alter table public.marison_outbound_configuration_events
  add column if not exists changed_fields jsonb not null default '[]'::jsonb,
  add column if not exists before_overrides jsonb not null default '{}'::jsonb,
  add column if not exists after_overrides jsonb not null default '{}'::jsonb;

alter table public.marison_outbound_dispatches
  add column if not exists payload_resolution_sources jsonb not null default '{}'::jsonb;

create or replace function public.mask_marison_override_nik(p_nik text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when nullif(btrim(p_nik), '') is null then null
    when length(btrim(p_nik)) <= 4 then repeat('*', length(btrim(p_nik)))
    else left(btrim(p_nik), 2) || repeat('*', greatest(length(btrim(p_nik)) - 4, 1)) || right(btrim(p_nik), 2)
  end;
$$;

create or replace function public.get_marison_outbound_configuration()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.marison_outbound_settings%rowtype;
begin
  if not public.is_current_user_admin() then
    raise exception 'Active admin is required' using errcode = '42501';
  end if;

  select * into v_settings
  from public.marison_outbound_settings
  where singleton is true;

  if not found then
    return jsonb_build_object('configured', false, 'environment', null, 'enabled', false);
  end if;

  return jsonb_build_object(
    'configured', true,
    'environment', v_settings.environment,
    'enabled', v_settings.enabled,
    'updated_at', v_settings.updated_at,
    'override_nik', public.mask_marison_override_nik(v_settings.override_nik),
    'override_nik_configured', v_settings.override_nik is not null,
    'override_branch_id', v_settings.override_branch_id,
    'override_project_id', v_settings.override_project_id
  );
end;
$$;

create or replace function public.configure_marison_outbound_identity_overrides(
  p_actor_id uuid,
  p_environment text,
  p_override_nik text,
  p_override_branch_id bigint,
  p_override_project_id bigint,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.marison_outbound_settings%rowtype;
  v_nik text := nullif(btrim(p_override_nik), '');
  v_changed jsonb := '[]'::jsonb;
  v_before_json jsonb;
  v_after_json jsonb;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role::text = 'admin' and is_active is true and deleted_at is null
  ) then
    raise exception 'Active admin is required' using errcode = '42501';
  end if;
  if p_environment <> 'staging' then
    raise exception 'Outbound identity overrides are staging-only' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Reason is required' using errcode = '22023';
  end if;
  if v_nik is not null and (length(v_nik) > 80 or v_nik !~ '^[A-Za-z0-9._/-]+$') then
    raise exception 'Invalid outbound NIK override' using errcode = '22023';
  end if;
  if p_override_branch_id is not null and p_override_branch_id <= 0 then
    raise exception 'Invalid outbound branch override' using errcode = '22023';
  end if;
  if p_override_project_id is not null and p_override_project_id <= 0 then
    raise exception 'Invalid outbound project override' using errcode = '22023';
  end if;
  if p_override_branch_id is not null and not exists (
    select 1 from public.master_offices
    where marison_branch_id = p_override_branch_id
      and coalesce(marison_review_required, false) is false
  ) then
    raise exception 'Unmapped outbound branch override' using errcode = '22023';
  end if;
  if p_override_project_id is not null and not exists (
    select 1
    from public.master_projects mp
    join public.master_offices mo on mo.id = mp.office_id
    where mp.marison_project_id = p_override_project_id
      and coalesce(mp.marison_review_required, false) is false
      and coalesce(mo.marison_review_required, false) is false
      and (p_override_branch_id is null or mo.marison_branch_id = p_override_branch_id)
  ) then
    raise exception 'Unmapped or mismatched outbound project override' using errcode = '22023';
  end if;

  select * into v_before
  from public.marison_outbound_settings
  where singleton is true
  for update;

  if not found or v_before.environment <> 'staging' then
    raise exception 'Staging outbound configuration is not initialized' using errcode = '55000';
  end if;

  v_before_json := jsonb_build_object(
    'override_nik', public.mask_marison_override_nik(v_before.override_nik),
    'override_branch_id', v_before.override_branch_id,
    'override_project_id', v_before.override_project_id
  );
  v_after_json := jsonb_build_object(
    'override_nik', public.mask_marison_override_nik(v_nik),
    'override_branch_id', p_override_branch_id,
    'override_project_id', p_override_project_id
  );
  if v_before.override_nik is distinct from v_nik then v_changed := v_changed || '["nik"]'::jsonb; end if;
  if v_before.override_branch_id is distinct from p_override_branch_id then v_changed := v_changed || '["branch_id"]'::jsonb; end if;
  if v_before.override_project_id is distinct from p_override_project_id then v_changed := v_changed || '["project_id"]'::jsonb; end if;

  update public.marison_outbound_settings
  set override_nik = v_nik,
      override_branch_id = p_override_branch_id,
      override_project_id = p_override_project_id,
      updated_by = p_actor_id,
      updated_at = clock_timestamp()
  where singleton is true;

  insert into public.marison_outbound_configuration_events (
    environment, enabled, actor_id, reason, changed_fields, before_overrides, after_overrides
  ) values (
    'staging', v_before.enabled, p_actor_id, left(btrim(p_reason), 2000),
    v_changed, v_before_json, v_after_json
  );

  return jsonb_build_object(
    'configured', true,
    'environment', 'staging',
    'enabled', v_before.enabled,
    'updated_at', clock_timestamp(),
    'override_nik', public.mask_marison_override_nik(v_nik),
    'override_nik_configured', v_nik is not null,
    'override_branch_id', p_override_branch_id,
    'override_project_id', p_override_project_id
  );
end;
$$;

revoke execute on function public.mask_marison_override_nik(text) from public, anon, authenticated;
revoke execute on function public.get_marison_outbound_configuration() from public, anon;
revoke execute on function public.configure_marison_outbound_identity_overrides(uuid, text, text, bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.get_marison_outbound_configuration() to authenticated;
grant execute on function public.configure_marison_outbound_identity_overrides(uuid, text, text, bigint, bigint, text) to service_role;

create or replace function public.prepare_marison_outbound_dispatch_with_sources(
  p_job_id uuid,
  p_lease_token uuid,
  p_kind text,
  p_endpoint text,
  p_contract_version text,
  p_payload jsonb,
  p_payload_body text,
  p_payload_hash text,
  p_resolution_sources jsonb
)
returns table (kind text, endpoint text, contract_version text, payload jsonb, payload_body text, payload_hash text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_resolution_sources is null
     or jsonb_typeof(p_resolution_sources) <> 'object'
     or not (p_resolution_sources ?& array['nik', 'branchId', 'projectId']) then
    raise exception 'Resolution sources are required' using errcode = '22023';
  end if;
  perform public.prepare_marison_outbound_dispatch(
    p_job_id, p_lease_token, p_kind, p_endpoint, p_contract_version,
    p_payload, p_payload_body, p_payload_hash
  );
  if exists (
    select 1
    from public.marison_outbound_dispatches d
    where d.id = p_job_id
      and d.payload_resolution_sources <> '{}'::jsonb
      and d.payload_resolution_sources is distinct from p_resolution_sources
  ) then
    raise exception 'Payload resolution sources are immutable' using errcode = '55000';
  end if;
  update public.marison_outbound_dispatches
  set payload_resolution_sources = p_resolution_sources,
      updated_at = clock_timestamp()
  where id = p_job_id
    and status = 'processing'
    and lease_token = p_lease_token
    and post_started_at is null;
  if not found then
    raise exception 'Stale or invalid dispatch lease' using errcode = '55000';
  end if;
  return query
  select d.kind, d.endpoint, d.contract_version, d.payload, d.payload_body, d.payload_hash
  from public.marison_outbound_dispatches d
  where d.id = p_job_id;
end;
$$;

revoke execute on function public.prepare_marison_outbound_dispatch_with_sources(uuid, uuid, text, text, text, jsonb, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.prepare_marison_outbound_dispatch_with_sources(uuid, uuid, text, text, text, jsonb, text, text, jsonb) to service_role;
