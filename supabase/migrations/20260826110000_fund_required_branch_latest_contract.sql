-- MRN-18: align Fund Submission resolution metadata with the vendor contract
-- active on 26 August 2026. branch_id is required for every Fund payload;
-- project_id remains optional and, when present, is validated independently.

begin;

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
  v_required text[] := case
    when p_kind = 'fund' then array['branchId']
    else array['requesterNik', 'branchId']
  end;
  v_key text;
  v_approval_count integer := jsonb_array_length(coalesce(p_payload->'approvals', '[]'::jsonb));
  v_approval_keys integer := 0;
begin
  if jsonb_typeof(v_sources) <> 'object' then raise exception 'Resolution sources must be an object' using errcode = '22023'; end if;
  if v_sources ? 'nik' and not (v_sources ? 'requesterNik') then
    v_sources := (v_sources - 'nik') || jsonb_build_object('requesterNik', v_sources->'nik');
  elsif v_sources ? 'nik' then v_sources := v_sources - 'nik'; end if;
  if p_kind = 'fund' then v_sources := v_sources - 'requesterNik'; end if;
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

revoke all on function public.prepare_marison_outbound_dispatch_with_sources(uuid, uuid, text, text, text, jsonb, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.prepare_marison_outbound_dispatch_with_sources(uuid, uuid, text, text, text, jsonb, text, text, jsonb) to service_role;

commit;
