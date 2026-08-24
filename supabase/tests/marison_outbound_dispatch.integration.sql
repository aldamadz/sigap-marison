begin;

select public.configure_marison_outbound('staging', true, 'Integration test activation');

create temporary table marison_test_context (actor_id uuid not null);
insert into marison_test_context (actor_id)
select p.id
from public.profiles p
where p.role::text = 'admin'
  and p.is_active is true
  and p.deleted_at is null
limit 1;

do $$
begin
  if not exists (select 1 from marison_test_context) then
    raise exception 'An active admin profile is required for this integration test';
  end if;
end;
$$;

-- Completed rows inserted before the transition trigger are not backfilled.
insert into public.surat_registrasi (id, no_surat, judul_surat, created_by, status, data_snapshot, form_input_data)
values (
  '20000000-0000-4000-8000-000000000001',
  'OUTBOX-TEST-001',
  'Outbox Test Historical',
  (select actor_id from marison_test_context),
  'DONE',
  '{}'::jsonb,
  jsonb_build_object('request_category', 'asset')
);

do $$
begin
  if exists (
    select 1 from public.marison_outbound_dispatches
    where surat_id = '20000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Historical completed surat was backfilled';
  end if;
end;
$$;

-- Repeated completion updates and repeated ensure calls keep one business job.
insert into public.surat_registrasi (id, no_surat, judul_surat, created_by, status, data_snapshot, form_input_data)
values (
  '20000000-0000-4000-8000-000000000002',
  'OUTBOX-TEST-002',
  'Outbox Test Asset',
  (select actor_id from marison_test_context),
  'PROSES',
  '{}'::jsonb,
  jsonb_build_object('request_category', 'asset')
);
update public.surat_registrasi set status = 'DONE'
where id = '20000000-0000-4000-8000-000000000002';
update public.surat_registrasi set status = 'DONE'
where id = '20000000-0000-4000-8000-000000000002';
select public.ensure_marison_outbound_dispatch('20000000-0000-4000-8000-000000000002', 'staging');
select public.ensure_marison_outbound_dispatch('20000000-0000-4000-8000-000000000002', 'staging');

do $$
begin
  if (select count(*) from public.marison_outbound_dispatches
      where surat_id = '20000000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'Completion did not produce exactly one job';
  end if;
end;
$$;

-- Recommendation children and unsupported categories are recorded as skipped.
insert into public.surat_registrasi (id, no_surat, judul_surat, created_by, status, data_snapshot, form_input_data)
values
  ('20000000-0000-4000-8000-000000000003', 'OUTBOX-TEST-003', 'Outbox Test Recommendation', (select actor_id from marison_test_context), 'PROSES', '{}'::jsonb, jsonb_build_object('request_category', 'asset')),
  ('20000000-0000-4000-8000-000000000004', 'OUTBOX-TEST-004', 'Outbox Test Unsupported', (select actor_id from marison_test_context), 'PROSES', '{}'::jsonb, jsonb_build_object('request_category', 'other'));
insert into public.surat_linked_documents (parent_surat_id, child_surat_id, link_type, status)
values ('20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003', 'recommendation', 'active');
update public.surat_registrasi set status = 'DONE'
where id in ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000004');

do $$
begin
  if not exists (
    select 1 from public.marison_outbound_dispatches
    where surat_id = '20000000-0000-4000-8000-000000000003'
      and status = 'skipped'
      and skipped_code = 'recommendation_child'
  ) then
    raise exception 'Recommendation child was not skipped';
  end if;
  if not exists (
    select 1 from public.marison_outbound_dispatches
    where surat_id = '20000000-0000-4000-8000-000000000004'
      and status = 'skipped'
      and skipped_code = 'unsupported_category'
  ) then
    raise exception 'Unsupported category was not skipped';
  end if;
end;
$$;

-- Payload is built once, survives a retry, and an old lease cannot mutate the new claim.
do $$
declare
  v_first record;
  v_second record;
  v_hash text := encode(extensions.digest(convert_to('{"request":"stable"}', 'UTF8'), 'sha256'), 'hex');
begin
  select * into v_first from public.claim_marison_outbound_dispatch('staging');
  if v_first.job_id is null or v_first.attempt_count <> 1 then
    raise exception 'First claim failed';
  end if;
  if not exists (
    select 1 from public.marison_outbound_dispatches
    where id = v_first.job_id
      and lease_expires_at between clock_timestamp() + interval '119 seconds' and clock_timestamp() + interval '121 seconds'
  ) then
    raise exception 'Lease is not two minutes';
  end if;

  perform public.prepare_marison_outbound_dispatch(
    v_first.job_id,
    v_first.lease_token,
    'asset',
    '/asset-purchase-requests',
    'test-v1',
    '{"request":"stable"}'::jsonb,
    '{"request":"stable"}',
    v_hash
  );
  perform public.fail_marison_outbound_before_post(
    v_first.job_id,
    v_first.lease_token,
    true,
    'token_unavailable',
    'Token belum tersedia.'
  );
  update public.marison_outbound_dispatches
  set next_attempt_at = clock_timestamp()
  where id = v_first.job_id;

  select * into v_second from public.claim_marison_outbound_dispatch('staging');
  if v_second.job_id <> v_first.job_id
     or v_second.attempt_count <> 2
     or v_second.payload_hash <> v_hash
     or v_second.payload_body <> '{"request":"stable"}' then
    raise exception 'Retry did not preserve the prepared payload';
  end if;

  begin
    perform public.fail_marison_outbound_before_post(
      v_second.job_id,
      v_first.lease_token,
      true,
      'stale',
      'stale'
    );
    raise exception 'Stale lease token was accepted';
  exception
    when sqlstate '55000' then null;
  end;

  perform public.fail_marison_outbound_before_post(
    v_second.job_id,
    v_second.lease_token,
    true,
    'token_unavailable',
    'Token belum tersedia.'
  );
end;
$$;

-- A dead worker is retried after a pre-POST lease expiry.
insert into public.surat_registrasi (id, no_surat, judul_surat, created_by, status, data_snapshot, form_input_data)
values ('20000000-0000-4000-8000-000000000005', 'OUTBOX-TEST-005', 'Outbox Test Non Unit', (select actor_id from marison_test_context), 'PROSES', '{}'::jsonb, jsonb_build_object('request_category', 'non_unit'));
update public.surat_registrasi set status = 'DONE'
where id = '20000000-0000-4000-8000-000000000005';

do $$
declare
  v_claim record;
begin
  select * into v_claim from public.claim_marison_outbound_dispatch('staging');
  update public.marison_outbound_dispatches
  set lease_expires_at = clock_timestamp() - interval '1 second'
  where id = v_claim.job_id;
  perform public.claim_marison_outbound_dispatch('staging');
  if not exists (
    select 1 from public.marison_outbound_dispatches
    where id = v_claim.job_id
      and status = 'failed_retryable'
      and error_code = 'worker_lease_expired_before_post'
  ) then
    raise exception 'Expired pre-POST lease was not recovered';
  end if;
end;
$$;

-- A dead worker after the POST boundary becomes unknown and is never reclaimed.
insert into public.surat_registrasi (id, no_surat, judul_surat, created_by, status, data_snapshot, form_input_data)
values ('20000000-0000-4000-8000-000000000006', 'OUTBOX-TEST-006', 'Outbox Test Unit', (select actor_id from marison_test_context), 'PROSES', '{}'::jsonb, jsonb_build_object('request_category', 'unit'));
update public.surat_registrasi set status = 'DONE'
where id = '20000000-0000-4000-8000-000000000006';

do $$
declare
  v_claim record;
  v_hash text := encode(extensions.digest(convert_to('{"request":"post"}', 'UTF8'), 'sha256'), 'hex');
begin
  select * into v_claim from public.claim_marison_outbound_dispatch('staging');
  perform public.prepare_marison_outbound_dispatch(
    v_claim.job_id,
    v_claim.lease_token,
    v_claim.kind,
    v_claim.endpoint,
    'test-v1',
    '{"request":"post"}'::jsonb,
    '{"request":"post"}',
    v_hash
  );
  perform public.mark_marison_outbound_post_started(v_claim.job_id, v_claim.lease_token);
  update public.marison_outbound_dispatches
  set lease_expires_at = clock_timestamp() - interval '1 second'
  where id = v_claim.job_id;
  perform public.claim_marison_outbound_dispatch('staging');
  if not exists (
    select 1 from public.marison_outbound_dispatches
    where id = v_claim.job_id
      and status = 'outcome_unknown'
      and error_code = 'worker_lease_expired_after_post'
  ) then
    raise exception 'Expired post-start lease was not held for reconciliation';
  end if;
end;
$$;

-- Manual reconciliation is audited and requires an active admin.
do $$
declare
  v_job_id uuid;
  v_actor_id uuid;
begin
  select actor_id into v_actor_id from marison_test_context;
  select id into v_job_id from public.marison_outbound_dispatches
  where status = 'outcome_unknown'
  limit 1;
  perform public.reconcile_marison_outbound_dispatch(
    v_job_id,
    v_actor_id,
    'mark_succeeded',
    'Dikonfirmasi pada sistem vendor.',
    'VENDOR-TEST-1',
    false
  );
  if not exists (
    select 1 from public.marison_outbound_reconciliation_events
    where dispatch_id = v_job_id
      and action = 'mark_succeeded'
      and before_state->>'error_code' = 'worker_lease_expired_after_post'
  ) then
    raise exception 'Reconciliation audit was not written';
  end if;
end;
$$;

-- Browser roles cannot read the outbox or invoke internal RPCs.
do $$
begin
  if has_table_privilege('authenticated', 'public.marison_outbound_dispatches', 'select')
     or has_table_privilege('anon', 'public.marison_outbound_dispatches', 'select')
     or has_table_privilege('authenticated', 'public.marison_outbound_settings', 'select')
     or has_table_privilege('authenticated', 'public.marison_outbound_configuration_events', 'select')
     or has_table_privilege('authenticated', 'public.marison_outbound_reconciliation_events', 'select')
     or has_function_privilege('authenticated', 'public.configure_marison_outbound(text,boolean,text,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.ensure_marison_outbound_dispatch(uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public.claim_marison_outbound_dispatch(text)', 'execute')
     or has_function_privilege('authenticated', 'public.prepare_marison_outbound_dispatch(uuid,uuid,text,text,text,jsonb,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.fail_marison_outbound_before_post(uuid,uuid,boolean,text,text,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.mark_marison_outbound_post_started(uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.complete_marison_outbound_after_post(uuid,uuid,marison_outbound_dispatch_status,jsonb,text,text,jsonb,text)', 'execute')
     or has_function_privilege('anon', 'public.reconcile_marison_outbound_dispatch(uuid,uuid,text,text,text,boolean)', 'execute') then
    raise exception 'Browser role received internal outbox privileges';
  end if;
end;
$$;

rollback;
