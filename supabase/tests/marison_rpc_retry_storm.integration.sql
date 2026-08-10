-- Test: 20260810090000_stop_marison_rpc_retry_storm.sql
-- Run only on a disposable PostgreSQL database after the migration lineage.
-- Safety: fixtures and assertions are rolled back.

begin;

set search_path = public;

insert into public.profiles (
  id, nik, full_name, job_title, role, is_active, theme_preference,
  marison_review_required, marison_review_reasons, marison_employee_id, marison_synced_at
) values
  ('00000000-0000-4000-8000-000000000001', 'ADMIN', 'Admin', 'Admin', 'admin', true, 'system', false, '{}', 1, now()),
  ('00000000-0000-4000-8000-000000000002', 'TRIAL', 'Trial', 'User', 'user', true, 'system', false, '{}', null, null),
  ('00000000-0000-4000-8000-000000000003', 'A 101', 'Mirror A', 'User', 'user', true, 'system', false, '{}', 101, now()),
  ('00000000-0000-4000-8000-000000000004', 'A 102', 'Mirror B', 'User', 'user', true, 'system', false, '{}', 102, now());

insert into public.marison_outbound_settings(singleton, environment, enabled)
values (true, 'staging', true);

insert into public.surat_registrasi (
  id, no_surat, judul_surat, created_by, status, current_step,
  requester_snapshot, location_snapshot, form_input_data, data_snapshot, policy_snapshot
) values (
  '10000000-0000-4000-8000-000000000001', 'RPC-STORM-001', 'RPC storm fixture',
  '00000000-0000-4000-8000-000000000001', 'SELESAI', 1,
  '{}'::jsonb, '{}'::jsonb, '{"request_category":"unit"}'::jsonb, '{}'::jsonb, '{}'::jsonb
);

do $$
declare
  v_original uuid;
  v_first uuid;
  v_repeat uuid;
  v_count integer;
begin
  assert has_function_privilege(
    'service_role', 'public.create_marison_outbound_replacement(uuid,uuid,text)', 'execute'
  ), 'service_role cannot execute replacement wrapper';
  assert not has_function_privilege(
    'service_role', 'public.create_marison_outbound_replacement_strict(uuid,uuid,text)', 'execute'
  ), 'service_role can bypass replacement wrapper';
  assert has_function_privilege(
    'service_role', 'public.configure_marison_payload_mapping(uuid,text,text,uuid,uuid,text,timestamptz)', 'execute'
  ), 'service_role cannot execute mapping wrapper';
  assert not has_function_privilege(
    'service_role', 'public.configure_marison_payload_mapping_strict(uuid,text,text,uuid,uuid,text,timestamptz)', 'execute'
  ), 'service_role can bypass mapping wrapper';

  v_original := public.ensure_marison_outbound_dispatch(
    '10000000-0000-4000-8000-000000000001', 'staging'
  );
  update public.marison_outbound_dispatches
  set status = 'failed_terminal', attempt_count = 1, contract_version = 'test',
      payload = '{}'::jsonb, payload_body = '{}', payload_hash = repeat('a', 64),
      payload_built_at = now(), post_started_at = now(), last_attempt_at = now(),
      completed_at = now(), error_code = 'marison_http_422'
  where id = v_original;

  v_first := public.create_marison_outbound_replacement(
    v_original, '00000000-0000-4000-8000-000000000001', 'correct payload'
  );
  for i in 1..100 loop
    v_repeat := public.create_marison_outbound_replacement(
      v_original, '00000000-0000-4000-8000-000000000001', 'repeated command'
    );
    assert v_repeat = v_first, 'replacement retry returned a different job';
  end loop;

  select count(*) into v_count
  from public.marison_outbound_dispatches
  where replacement_of_dispatch_id = v_original;
  assert v_count = 1, 'replacement retry created duplicate child jobs';

  select count(*) into v_count
  from public.marison_outbound_replacement_events
  where old_dispatch_id = v_original;
  assert v_count = 1, 'replacement retry created duplicate audit events';
end $$;

do $$
declare
  v_result jsonb;
  v_version timestamptz;
  v_count integer;
begin
  v_result := public.configure_marison_payload_mapping(
    '00000000-0000-4000-8000-000000000001', 'staging', 'profile',
    '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003',
    'initial mapping', null
  );
  v_version := (v_result->>'updated_at')::timestamptz;

  for i in 1..100 loop
    v_result := public.configure_marison_payload_mapping(
      '00000000-0000-4000-8000-000000000001', 'staging', 'profile',
      '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003',
      'same command', null
    );
    assert (v_result->>'unchanged')::boolean, 'same mapping was not idempotent';
  end loop;

  v_result := public.configure_marison_payload_mapping(
    '00000000-0000-4000-8000-000000000001', 'staging', 'profile',
    '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000004',
    'different target', null
  );
  assert v_result->>'code' = 'EXPECTED_VERSION_REQUIRED', 'missing-version conflict not returned';

  v_result := public.configure_marison_payload_mapping(
    '00000000-0000-4000-8000-000000000001', 'staging', 'profile',
    '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000004',
    'stale target', '2000-01-01'
  );
  assert v_result->>'code' = 'STALE_VERSION', 'stale-version conflict not returned';

  select count(*) into v_count
  from public.activity_logs
  where table_name = 'marison_outbound_record_mappings';
  assert v_count = 1, 'mapping retries created duplicate audit rows';

  assert exists (
    select 1 from public.marison_outbound_record_mappings
    where record_id = '00000000-0000-4000-8000-000000000002'
      and target_record_id = '00000000-0000-4000-8000-000000000003'
      and updated_at = v_version
  ), 'mapping changed during retry checks';
end $$;

rollback;

select 'Marison idempotency and retry-storm SQL integration passed' result;
