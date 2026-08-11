begin;

alter table public.marison_outbound_dispatches
  drop constraint if exists marison_outbound_dispatches_kind_check;
alter table public.marison_outbound_dispatches
  add constraint marison_outbound_dispatches_kind_check
  check (kind in ('unit', 'non_unit', 'asset', 'fund'));

alter table public.marison_outbound_dispatches
  drop constraint if exists marison_outbound_dispatch_endpoint_kind;
alter table public.marison_outbound_dispatches
  add constraint marison_outbound_dispatch_endpoint_kind check (
    endpoint is null
    or (kind = 'unit' and endpoint = '/unit-submissions')
    or (kind = 'non_unit' and endpoint = '/non-unit-submissions')
    or (kind = 'asset' and endpoint = '/asset-purchase-requests')
    or (kind = 'fund' and endpoint = '/fund-submissions')
  );

drop function public.ensure_marison_outbound_dispatch(uuid, text);
create function public.ensure_marison_outbound_dispatch(
  p_surat_id uuid,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_surat public.surat_registrasi%rowtype;
  v_effective_input jsonb;
  v_category text;
  v_kind text;
  v_endpoint text;
  v_skip_code text;
  v_skip_reason text;
  v_job_id uuid;
begin
  if p_environment not in ('staging', 'production') then
    raise exception 'Invalid Marison environment' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.marison_outbound_settings s
    where s.singleton is true and s.environment = p_environment and s.enabled is true
  ) then
    return jsonb_build_object('dispatch_id', null, 'skipped', true, 'code', 'dispatch_disabled', 'no_dispatch', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('marison-dispatch:' || p_environment || ':' || p_surat_id::text, 0));
  select sr.* into v_surat from public.surat_registrasi sr where sr.id = p_surat_id for update;
  if not found then raise exception 'Surat not found' using errcode = 'P0002'; end if;
  if upper(coalesce(v_surat.status::text, '')) not in ('SELESAI', 'DONE') then
    return jsonb_build_object('dispatch_id', null, 'skipped', true, 'code', 'surat_not_final', 'no_dispatch', true);
  end if;

  select d.id into v_job_id
  from public.marison_outbound_dispatches d
  where d.surat_id = p_surat_id and d.environment = p_environment
  order by d.generation desc limit 1;
  if found then return jsonb_build_object('dispatch_id', v_job_id, 'skipped', false, 'code', null, 'no_dispatch', false); end if;
  if coalesce(v_surat.data_snapshot->'marison_dispatch'->>'status', '') = 'success'
     and v_surat.data_snapshot->'marison_dispatch'->>'environment' = p_environment then
    return jsonb_build_object('dispatch_id', null, 'skipped', true, 'code', 'legacy_dispatch_succeeded', 'no_dispatch', true);
  end if;

  v_effective_input := coalesce(v_surat.data_snapshot->'input', '{}'::jsonb)
    || coalesce(v_surat.data_snapshot->'verification_inputs'->'latest', '{}'::jsonb)
    || coalesce(v_surat.form_input_data, '{}'::jsonb);
  v_category := lower(trim(coalesce(v_effective_input->>'request_category', v_effective_input->>'request_mode', '')));

  if exists (
    select 1 from public.surat_linked_documents link
    where link.child_surat_id = p_surat_id and link.link_type = 'recommendation' and link.status = 'active'
  ) or lower(coalesce(v_effective_input->>'linked_document_type', '')) = 'recommendation'
    or nullif(v_effective_input->>'linked_parent_surat_id', '') is not null then
    v_skip_code := 'recommendation_child';
    v_skip_reason := 'Dokumen rekomendasi mengikuti pengajuan induk dan tidak dikirim terpisah.';
  elsif v_category = 'unit' then
    v_kind := 'unit'; v_endpoint := '/unit-submissions';
  elsif v_category in ('non_unit', 'nonunit') then
    v_kind := 'non_unit'; v_endpoint := '/non-unit-submissions';
  elsif v_category = 'asset' and public.recommendation_all_items_rejected(p_surat_id) then
    return jsonb_build_object('dispatch_id', null, 'skipped', true, 'code', 'all_recommendations_rejected', 'no_dispatch', true);
  elsif v_category = 'asset' then
    v_kind := 'asset'; v_endpoint := '/asset-purchase-requests';
  elsif v_category in ('non_asset', 'nonasset') then
    v_kind := 'fund'; v_endpoint := '/fund-submissions';
  else
    v_skip_code := 'unsupported_category';
    v_skip_reason := format('Kategori %s belum memiliki endpoint outbound Marison.', coalesce(nullif(v_category, ''), '-'));
  end if;

  insert into public.marison_outbound_dispatches (
    surat_id, environment, generation, kind, endpoint, idempotency_key,
    status, skipped_code, skipped_reason, completed_at
  ) values (
    p_surat_id, p_environment, 1, v_kind, v_endpoint,
    format('sigap:%s:%s:%s', p_environment, coalesce(v_kind, 'skipped'), p_surat_id),
    case when v_skip_code is null then 'pending'::public.marison_outbound_dispatch_status else 'skipped'::public.marison_outbound_dispatch_status end,
    v_skip_code, v_skip_reason, case when v_skip_code is null then null else clock_timestamp() end
  ) returning id into v_job_id;
  return jsonb_build_object('dispatch_id', v_job_id, 'skipped', v_skip_code is not null, 'code', v_skip_code, 'no_dispatch', false);
end;
$$;

create or replace function public.prepare_marison_outbound_dispatch(
  p_job_id uuid, p_lease_token uuid, p_kind text, p_endpoint text,
  p_contract_version text, p_payload jsonb, p_payload_body text, p_payload_hash text
)
returns table (kind text, endpoint text, contract_version text, payload jsonb, payload_body text, payload_hash text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_job public.marison_outbound_dispatches%rowtype;
  v_expected_key text;
begin
  if p_lease_token is null or p_payload is null or nullif(p_payload_body, '') is null
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or encode(extensions.digest(convert_to(p_payload_body, 'UTF8'), 'sha256'), 'hex') <> p_payload_hash then
    raise exception 'Invalid prepared payload' using errcode = '22023';
  end if;
  if not (
    (p_kind = 'unit' and p_endpoint = '/unit-submissions')
    or (p_kind = 'non_unit' and p_endpoint = '/non-unit-submissions')
    or (p_kind = 'asset' and p_endpoint = '/asset-purchase-requests')
    or (p_kind = 'fund' and p_endpoint = '/fund-submissions')
  ) then
    raise exception 'Invalid dispatch kind or endpoint' using errcode = '22023';
  end if;

  select d.* into v_job from public.marison_outbound_dispatches d where d.id = p_job_id for update;
  if not found or v_job.status <> 'processing' or v_job.lease_token is distinct from p_lease_token
     or v_job.lease_expires_at <= clock_timestamp() or v_job.post_started_at is not null then
    raise exception 'Stale or invalid dispatch lease' using errcode = '55000';
  end if;
  if v_job.generation = 1 then
    v_expected_key := format('sigap:%s:%s:%s', v_job.environment, p_kind, v_job.surat_id);
  else
    v_expected_key := format('sigap:%s:%s:%s:g%s', v_job.environment, p_kind, v_job.surat_id, v_job.generation);
  end if;
  if v_job.idempotency_key is not null and v_job.idempotency_key <> v_expected_key then
    raise exception 'Stored idempotency key does not match expected key for generation %', v_job.generation using errcode = '55000';
  end if;

  if v_job.payload is null then
    update public.marison_outbound_dispatches d
    set kind = p_kind, endpoint = p_endpoint, contract_version = p_contract_version,
        payload = p_payload, payload_body = p_payload_body, payload_hash = p_payload_hash,
        payload_built_at = clock_timestamp(), idempotency_key = v_expected_key, updated_at = clock_timestamp()
    where d.id = p_job_id;
  elsif v_job.kind is distinct from p_kind or v_job.endpoint is distinct from p_endpoint
     or v_job.contract_version is distinct from p_contract_version or v_job.payload is distinct from p_payload
     or v_job.payload_body is distinct from p_payload_body or v_job.payload_hash is distinct from p_payload_hash then
    raise exception 'Prepared payload is immutable' using errcode = '55000';
  end if;

  update public.marison_outbound_dispatches d
  set lease_acquired_at = clock_timestamp(), lease_expires_at = clock_timestamp() + interval '2 minutes', updated_at = clock_timestamp()
  where d.id = p_job_id and d.status = 'processing' and d.lease_token = p_lease_token;
  return query select d.kind, d.endpoint, d.contract_version, d.payload, d.payload_body, d.payload_hash
    from public.marison_outbound_dispatches d where d.id = p_job_id;
end;
$$;

create or replace function public.prepare_marison_outbound_dispatch_with_sources(
  p_job_id uuid, p_lease_token uuid, p_kind text, p_endpoint text,
  p_contract_version text, p_payload jsonb, p_payload_body text, p_payload_hash text,
  p_resolution_sources jsonb
)
returns table (kind text, endpoint text, contract_version text, payload jsonb, payload_body text, payload_hash text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_sources jsonb := coalesce(p_resolution_sources, '{}'::jsonb);
  v_required text[] := case when p_kind = 'fund' then array['projectId'] else array['requesterNik', 'branchId'] end;
  v_key text;
  v_approval_count integer := jsonb_array_length(coalesce(p_payload->'approvals', '[]'::jsonb));
  v_approval_keys integer := 0;
begin
  if jsonb_typeof(v_sources) <> 'object' then raise exception 'Resolution sources must be an object' using errcode = '22023'; end if;
  if v_sources ? 'nik' and not (v_sources ? 'requesterNik') then
    v_sources := (v_sources - 'nik') || jsonb_build_object('requesterNik', v_sources->'nik');
  elsif v_sources ? 'nik' then v_sources := v_sources - 'nik'; end if;
  if p_kind = 'fund' then v_sources := v_sources - 'requesterNik' - 'branchId'; end if;
  if p_kind in ('unit', 'non_unit') then v_required := array_append(v_required, 'projectId'); end if;

  foreach v_key in array v_required loop
    if v_sources->>v_key is null or v_sources->>v_key not in ('external_source', 'staging_mapping') then
      raise exception 'Resolution source % is missing or invalid', v_key using errcode = '22023';
    end if;
  end loop;
  select count(*) into v_approval_keys from jsonb_object_keys(v_sources) as keys(key) where key like 'approval:%';
  if v_approval_keys <> v_approval_count then raise exception 'Approval resolution sources do not match payload' using errcode = '22023'; end if;
  for v_key in select jsonb_object_keys(v_sources) loop
    if v_key not in ('requesterNik', 'branchId', 'projectId') and v_key not like 'approval:%' then
      raise exception 'Unknown resolution source key %', v_key using errcode = '22023';
    end if;
    if v_key like 'approval:%' and v_key !~ '^approval:[1-9][0-9]*:[^:]+$' then
      raise exception 'Invalid approval resolution source key' using errcode = '22023';
    end if;
    if v_sources->>v_key is null or v_sources->>v_key not in ('external_source', 'staging_mapping') then
      raise exception 'Resolution source % is missing or invalid', v_key using errcode = '22023';
    end if;
  end loop;

  perform public.prepare_marison_outbound_dispatch(
    p_job_id, p_lease_token, p_kind, p_endpoint, p_contract_version, p_payload, p_payload_body, p_payload_hash
  );
  if exists (
    select 1 from public.marison_outbound_dispatches d where d.id = p_job_id
      and d.payload_resolution_sources <> '{}'::jsonb and d.payload_resolution_sources is distinct from v_sources
  ) then raise exception 'Payload resolution sources are immutable' using errcode = '55000'; end if;
  update public.marison_outbound_dispatches
  set payload_resolution_sources = v_sources, updated_at = clock_timestamp()
  where id = p_job_id and status = 'processing' and lease_token = p_lease_token and post_started_at is null;
  if not found then raise exception 'Stale or invalid dispatch lease' using errcode = '55000'; end if;
  return query select d.kind, d.endpoint, d.contract_version, d.payload, d.payload_body, d.payload_hash
    from public.marison_outbound_dispatches d where d.id = p_job_id;
end;
$$;

revoke all on function public.ensure_marison_outbound_dispatch(uuid, text) from public, anon, authenticated;
grant execute on function public.ensure_marison_outbound_dispatch(uuid, text) to service_role;
revoke all on function public.prepare_marison_outbound_dispatch(uuid, uuid, text, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.prepare_marison_outbound_dispatch(uuid, uuid, text, text, text, jsonb, text, text) to service_role;
revoke all on function public.prepare_marison_outbound_dispatch_with_sources(uuid, uuid, text, text, text, jsonb, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.prepare_marison_outbound_dispatch_with_sources(uuid, uuid, text, text, text, jsonb, text, text, jsonb) to service_role;

commit;
