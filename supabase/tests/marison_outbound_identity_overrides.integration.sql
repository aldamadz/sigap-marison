begin;

create temporary table marison_identity_test_context (admin_id uuid, non_admin_id uuid);
insert into marison_identity_test_context (admin_id, non_admin_id)
select
  (select p.id from public.profiles p where p.role::text = 'admin' and p.is_active and p.deleted_at is null limit 1),
  (select p.id from public.profiles p where p.role::text <> 'admin' and p.is_active and p.deleted_at is null limit 1);

insert into public.marison_outbound_settings (singleton, environment, enabled)
values (true, 'staging', true)
on conflict (singleton) do update
set environment = excluded.environment;

insert into public.master_offices (id, code, name, marison_branch_id)
values
  ('30000000-0000-4000-8000-000000000001', 'IDENTITY-TEST-BRANCH-A', 'Identity Test Branch A', 990001),
  ('30000000-0000-4000-8000-000000000002', 'IDENTITY-TEST-BRANCH-B', 'Identity Test Branch B', 990002)
on conflict (id) do nothing;
insert into public.master_projects (id, office_id, code, name, marison_project_id)
values ('30000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'IDENTITY-TEST-PROJECT', 'Identity Test Project', 990001)
on conflict (id) do nothing;
update public.master_offices
set marison_review_required = false, marison_review_reasons = '{}'
where id in ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002');
update public.master_projects
set marison_review_required = false, marison_review_reasons = '{}'
where id = '30000000-0000-4000-8000-000000000003';

do $$
declare
  v_admin uuid;
  v_non_admin uuid;
  v_project bigint;
  v_other_branch bigint;
  v_error text;
begin
  select admin_id, non_admin_id into v_admin, v_non_admin from marison_identity_test_context;
  if v_admin is null then raise exception 'Active admin profile is required'; end if;

  begin
    perform public.configure_marison_outbound_identity_overrides(
      coalesce(v_non_admin, '00000000-0000-0000-0000-000000000001'::uuid),
      'staging', null, null, null, 'unauthorized test'
    );
    raise exception 'Unauthorized actor was accepted';
  exception when sqlstate '42501' then null;
  end;

  begin
    perform public.configure_marison_outbound_identity_overrides(v_admin, 'production', null, null, null, 'production test');
    raise exception 'Production override was accepted';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.configure_marison_outbound_identity_overrides(v_admin, 'staging', 'bad value!', null, null, 'invalid NIK test');
    raise exception 'Invalid NIK was accepted';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.configure_marison_outbound_identity_overrides(v_admin, 'staging', null, 0, null, 'invalid branch test');
    raise exception 'Invalid branch was accepted';
  exception when sqlstate '22023' then null;
  end;

  v_project := 990001;
  v_other_branch := 990002;
  begin
    perform public.configure_marison_outbound_identity_overrides(v_admin, 'staging', null, v_other_branch, v_project, 'mismatch test');
    raise exception 'Project-branch mismatch was accepted';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

do $$
declare
  v_admin uuid;
  v_before jsonb;
  v_after jsonb;
begin
  select admin_id into v_admin from marison_identity_test_context;
  select public.configure_marison_outbound_identity_overrides(v_admin, 'staging', 'AB1234', null, null, 'mask test') into v_before;
  select public.configure_marison_outbound_identity_overrides(v_admin, 'staging', null, null, null, 'fallback test') into v_after;
  if v_after->>'environment' <> 'staging'
     or v_after->>'override_nik_configured' <> 'false'
     or jsonb_typeof(v_after->'override_branch_id') <> 'null'
     or jsonb_typeof(v_after->'override_project_id') <> 'null' then
    raise exception 'Empty override did not fall back to synchronized configuration';
  end if;

  select before_overrides, after_overrides
  into v_before, v_after
  from public.marison_outbound_configuration_events
  where actor_id = v_admin
  order by created_at desc
  limit 1;
  if v_before->>'override_nik' is distinct from 'AB**34'
     or v_after->>'override_nik' is not null then
    raise exception 'Audit NIK masking or clearing failed';
  end if;
end;
$$;

do $$
declare
  v_admin uuid;
  v_claim record;
  v_hash text := encode(extensions.digest(convert_to('{"identity":"stable"}', 'UTF8'), 'sha256'), 'hex');
begin
  select admin_id into v_admin from marison_identity_test_context;
  insert into public.surat_registrasi (id, no_surat, judul_surat, created_by, status, data_snapshot, form_input_data)
  values (
    '20000000-0000-4000-8000-000000000099', 'IDENTITY-TEST-001', 'Identity Override Test', v_admin,
    'DONE', '{}'::jsonb, jsonb_build_object('request_category', 'asset')
  );
  perform public.ensure_marison_outbound_dispatch('20000000-0000-4000-8000-000000000099', 'staging');
  select * into v_claim from public.claim_marison_outbound_dispatch('staging');
  if v_claim.job_id is null then raise exception 'Identity test dispatch was not claimed'; end if;

  perform public.prepare_marison_outbound_dispatch_with_sources(
    v_claim.job_id, v_claim.lease_token, 'asset', '/asset-purchase-requests', 'test-v1',
    '{"identity":"stable"}'::jsonb, '{"identity":"stable"}', v_hash,
    '{"nik":"override","branchId":"synchronized","projectId":"synchronized"}'::jsonb
  );
  begin
    perform public.prepare_marison_outbound_dispatch_with_sources(
      v_claim.job_id, v_claim.lease_token, 'asset', '/asset-purchase-requests', 'test-v1',
      '{"identity":"stable"}'::jsonb, '{"identity":"stable"}', v_hash,
      '{"nik":"synchronized","branchId":"synchronized","projectId":"synchronized"}'::jsonb
    );
    raise exception 'Payload resolution source was mutated';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

rollback;
