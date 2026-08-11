begin;

do $$
declare
  v_profile uuid := 'f0000000-0000-4000-8000-000000000001';
  v_surat uuid := 'f0000000-0000-4000-8000-000000000002';
  v_job uuid;
  v_lease uuid := 'f0000000-0000-4000-8000-000000000003';
  v_result jsonb;
  v_payload jsonb := jsonb_build_object(
    'submission_number', 'FUND-SQL-001',
    'type', 'operational',
    'project_id', 12,
    'division', 'Pengembangan Organisasi',
    'title', 'Fixture Fund Submission',
    'attachments', jsonb_build_array(),
    'approvals', jsonb_build_array(jsonb_build_object(
      'role', 'Manager', 'nik', 'EMP001', 'action', 'approved',
      'actioned_at', '2026-08-11T10:00:00+07:00'
    ))
  );
  v_body text;
  v_hash text;
begin
  insert into public.profiles (id, nik, full_name, job_title, role, is_active)
  values (v_profile, 'FUND001', 'Fund Fixture', 'Tester', 'admin', true);
  insert into public.marison_outbound_settings (singleton, environment, enabled)
  values (true, 'staging', true)
  on conflict (singleton) do update set environment = excluded.environment, enabled = excluded.enabled;
  insert into public.surat_registrasi (id, no_surat, judul_surat, status, created_by, form_input_data)
  values (v_surat, 'FUND-SQL-001', 'Fixture Fund Submission', 'SELESAI', v_profile,
    jsonb_build_object('request_category', 'non_asset', 'fund_type', 'operational'));

  v_result := public.ensure_marison_outbound_dispatch(v_surat, 'staging');
  v_job := (v_result->>'dispatch_id')::uuid;
  if v_job is null or v_result->>'no_dispatch' <> 'false' then raise exception 'Fund dispatch was not created'; end if;
  if not exists (
    select 1 from public.marison_outbound_dispatches
    where id = v_job and kind = 'fund' and endpoint = '/fund-submissions'
      and idempotency_key = format('sigap:staging:fund:%s', v_surat)
  ) then raise exception 'Fund dispatch kind, endpoint, or key is invalid'; end if;

  update public.marison_outbound_dispatches
  set status = 'processing', attempt_count = 1, lease_token = v_lease,
      lease_acquired_at = clock_timestamp(), lease_expires_at = clock_timestamp() + interval '2 minutes'
  where id = v_job;
  v_body := v_payload::text;
  v_hash := encode(extensions.digest(convert_to(v_body, 'UTF8'), 'sha256'), 'hex');

  perform public.prepare_marison_outbound_dispatch_with_sources(
    v_job, v_lease, 'fund', '/fund-submissions', 'vendor-openapi-fund-2026-08-11',
    v_payload, v_body, v_hash,
    jsonb_build_object('projectId', 'external_source', 'approval:1:' || v_profile::text, 'staging_mapping')
  );
  if not exists (
    select 1 from public.marison_outbound_dispatches
    where id = v_job and payload_hash = v_hash
      and payload_resolution_sources = jsonb_build_object(
        'projectId', 'external_source', 'approval:1:' || v_profile::text, 'staging_mapping'
      )
  ) then raise exception 'Fund payload or resolution sources were not prepared'; end if;

  begin
    perform public.prepare_marison_outbound_dispatch_with_sources(
      v_job, v_lease, 'fund', '/fund-submissions', 'vendor-openapi-fund-2026-08-11',
      v_payload, v_body, v_hash,
      jsonb_build_object('branchId', 'external_source', 'approval:1:' || v_profile::text, 'staging_mapping')
    );
    raise exception 'Missing projectId was accepted';
  exception when sqlstate '22023' then null;
  end;

  raise notice 'FUND SUBMISSION SQL INTEGRATION PASSED';
end;
$$;

rollback;
