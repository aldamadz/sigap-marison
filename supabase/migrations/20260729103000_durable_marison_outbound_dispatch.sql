create type public.marison_outbound_dispatch_status as enum (
  'pending',
  'processing',
  'succeeded',
  'failed_retryable',
  'failed_terminal',
  'outcome_unknown',
  'skipped'
);

create table public.marison_outbound_settings (
  singleton boolean primary key default true check (singleton),
  environment text not null check (environment in ('staging', 'production')),
  enabled boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default clock_timestamp()
);

create table public.marison_outbound_configuration_events (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('staging', 'production')),
  enabled boolean not null,
  actor_id uuid references public.profiles(id) on delete restrict,
  reason text not null,
  created_at timestamptz not null default clock_timestamp()
);

create table public.marison_outbound_dispatches (
  id uuid primary key default gen_random_uuid(),
  surat_id uuid not null references public.surat_registrasi(id) on delete restrict,
  environment text not null check (environment in ('staging', 'production')),
  kind text check (kind in ('unit', 'non_unit', 'asset')),
  endpoint text,
  contract_version text,
  payload jsonb,
  payload_body text,
  payload_hash text,
  payload_built_at timestamptz,
  idempotency_key text not null unique,
  status public.marison_outbound_dispatch_status not null default 'pending',
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  next_attempt_at timestamptz not null default clock_timestamp(),
  lease_token uuid,
  lease_acquired_at timestamptz,
  lease_expires_at timestamptz,
  post_started_at timestamptz,
  last_attempt_at timestamptz,
  completed_at timestamptz,
  response jsonb,
  error_code text,
  error_message text,
  error_details jsonb,
  external_reference text,
  skipped_code text,
  skipped_reason text,
  reconciliation_count integer not null default 0 check (reconciliation_count >= 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (surat_id, environment),
  constraint marison_outbound_dispatch_lease_state check (
    (status = 'processing' and lease_token is not null and lease_acquired_at is not null and lease_expires_at is not null)
    or
    (status <> 'processing' and lease_token is null and lease_acquired_at is null and lease_expires_at is null)
  ),
  constraint marison_outbound_dispatch_payload_state check (
    (payload is null and payload_body is null and payload_hash is null and payload_built_at is null and contract_version is null)
    or
    (payload is not null and payload_body is not null and payload_hash ~ '^[0-9a-f]{64}$' and payload_built_at is not null and contract_version is not null)
  ),
  constraint marison_outbound_dispatch_post_state check (
    post_started_at is null or (payload is not null and last_attempt_at is not null)
  ),
  constraint marison_outbound_dispatch_skipped_state check (
    (status = 'skipped' and skipped_code is not null and skipped_reason is not null and completed_at is not null)
    or status <> 'skipped'
  ),
  constraint marison_outbound_dispatch_endpoint_kind check (
    endpoint is null
    or (kind = 'unit' and endpoint = '/unit-submissions')
    or (kind = 'non_unit' and endpoint = '/non-unit-submissions')
    or (kind = 'asset' and endpoint = '/asset-purchase-requests')
  )
);

create table public.marison_outbound_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.marison_outbound_dispatches(id) on delete restrict,
  surat_id uuid not null references public.surat_registrasi(id) on delete restrict,
  environment text not null check (environment in ('staging', 'production')),
  action text not null check (action in ('mark_succeeded', 'reopen_confirmed_not_received', 'reopen_terminal_pre_post')),
  from_status public.marison_outbound_dispatch_status not null,
  to_status public.marison_outbound_dispatch_status not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null,
  external_reference text,
  before_state jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);

create index marison_outbound_dispatch_claim_idx
  on public.marison_outbound_dispatches(environment, next_attempt_at, created_at)
  where status in ('pending', 'failed_retryable');

create index marison_outbound_dispatch_lease_idx
  on public.marison_outbound_dispatches(environment, lease_expires_at)
  where status = 'processing';

create index marison_outbound_reconciliation_dispatch_idx
  on public.marison_outbound_reconciliation_events(dispatch_id, created_at desc);

alter table public.marison_outbound_settings enable row level security;
alter table public.marison_outbound_configuration_events enable row level security;
alter table public.marison_outbound_dispatches enable row level security;
alter table public.marison_outbound_reconciliation_events enable row level security;

revoke all on table public.marison_outbound_settings from public, anon, authenticated;
revoke all on table public.marison_outbound_configuration_events from public, anon, authenticated;
revoke all on table public.marison_outbound_dispatches from public, anon, authenticated;
revoke all on table public.marison_outbound_reconciliation_events from public, anon, authenticated;
grant select on table public.marison_outbound_settings to service_role;
grant select on table public.marison_outbound_configuration_events to service_role;
grant select on table public.marison_outbound_dispatches to service_role;
grant select on table public.marison_outbound_reconciliation_events to service_role;

create or replace function public.sync_marison_outbound_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing jsonb;
  v_summary jsonb;
begin
  if new.status = 'processing' then
    return new;
  end if;

  select coalesce(sr.data_snapshot->'marison_dispatch', '{}'::jsonb)
    into v_existing
  from public.surat_registrasi sr
  where sr.id = new.surat_id;

  v_summary := jsonb_build_object(
    'status', case
      when new.status = 'succeeded' then 'success'
      when new.status in ('failed_terminal', 'outcome_unknown') then 'failed'
      else new.status::text
    end,
    'queue_status', new.status::text,
    'environment', new.environment,
    'kind', new.kind,
    'endpoint', new.endpoint,
    'contract_version', new.contract_version,
    'payload_hash', new.payload_hash,
    'job_id', new.id,
    'attempt_count', new.attempt_count,
    'next_attempt_at', new.next_attempt_at,
    'post_started_at', new.post_started_at,
    'completed_at', new.completed_at,
    'sent_at', case when new.status = 'succeeded' then new.completed_at else null end,
    'requested_at', new.created_at,
    'failed_at', case when new.status in ('failed_terminal', 'outcome_unknown') then new.completed_at else null end,
    'external_reference', new.external_reference,
    'skipped_code', new.skipped_code,
    'skipped_reason', new.skipped_reason,
    'error_code', new.error_code,
    'error', new.error_message,
    'details', null
  );

  update public.surat_registrasi sr
  set data_snapshot = jsonb_set(
    coalesce(sr.data_snapshot, '{}'::jsonb),
    '{marison_dispatch}',
    v_existing || v_summary,
    true
  )
  where sr.id = new.surat_id;

  return new;
end;
$$;

create trigger sync_marison_outbound_snapshot_after_change
after insert or update of status on public.marison_outbound_dispatches
for each row execute function public.sync_marison_outbound_snapshot();

create or replace function public.notify_marison_outbound_attention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_message text;
begin
  if new.status not in ('failed_terminal', 'outcome_unknown')
     or new.status is not distinct from old.status then
    return new;
  end if;

  v_title := case
    when new.status = 'outcome_unknown' then 'Status pengiriman Marison belum pasti'
    else 'Pengiriman Marison gagal'
  end;
  v_message := case
    when new.status = 'outcome_unknown' then
      'Hasil POST ke Marison belum dapat dipastikan. Periksa sistem vendor sebelum mengambil tindakan.'
    else
      'Pengiriman ke Marison berhenti dan memerlukan pemeriksaan admin.'
  end;

  insert into public.notifications (user_id, type, title, message, data, link)
  select
    p.id,
    'warning',
    v_title,
    v_message,
    jsonb_build_object(
      'event_type', 'marison_outbound_attention',
      'dispatch_id', new.id,
      'surat_id', new.surat_id,
      'environment', new.environment,
      'queue_status', new.status::text
    ),
    '/admin/configuration/form-usages?section=marison'
  from public.profiles p
  where p.role::text = 'admin'
    and p.is_active is true
    and p.deleted_at is null;

  return new;
end;
$$;

create trigger notify_marison_outbound_attention_after_change
after update of status on public.marison_outbound_dispatches
for each row execute function public.notify_marison_outbound_attention();

create or replace function public.configure_marison_outbound(
  p_environment text,
  p_enabled boolean,
  p_reason text,
  p_actor_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_environment not in ('staging', 'production')
     or p_enabled is null
     or nullif(trim(p_reason), '') is null then
    raise exception 'Invalid outbound configuration' using errcode = '22023';
  end if;

  if p_actor_id is not null and not exists (
    select 1
    from public.profiles p
    where p.id = p_actor_id
      and p.role::text = 'admin'
      and p.is_active is true
      and p.deleted_at is null
  ) then
    raise exception 'Active admin is required' using errcode = '42501';
  end if;

  insert into public.marison_outbound_settings (singleton, environment, enabled, updated_by, updated_at)
  values (true, p_environment, p_enabled, p_actor_id, clock_timestamp())
  on conflict (singleton) do update
  set environment = excluded.environment,
      enabled = excluded.enabled,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  insert into public.marison_outbound_configuration_events (environment, enabled, actor_id, reason)
  values (p_environment, p_enabled, p_actor_id, left(trim(p_reason), 2000));

  return true;
end;
$$;

create or replace function public.ensure_marison_outbound_dispatch(
  p_surat_id uuid,
  p_environment text
)
returns uuid
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
    select 1
    from public.marison_outbound_settings s
    where s.singleton is true
      and s.environment = p_environment
      and s.enabled is true
  ) then
    return null;
  end if;

  select sr.* into v_surat
  from public.surat_registrasi sr
  where sr.id = p_surat_id
  for update;

  if not found then
    raise exception 'Surat not found' using errcode = 'P0002';
  end if;

  if upper(coalesce(v_surat.status::text, '')) not in ('SELESAI', 'DONE') then
    return null;
  end if;

  select d.id into v_job_id
  from public.marison_outbound_dispatches d
  where d.surat_id = p_surat_id
    and d.environment = p_environment;
  if found then
    return v_job_id;
  end if;

  if coalesce(v_surat.data_snapshot->'marison_dispatch'->>'status', '') = 'success'
     and v_surat.data_snapshot->'marison_dispatch'->>'environment' = p_environment then
    return null;
  end if;

  v_effective_input :=
    coalesce(v_surat.data_snapshot->'input', '{}'::jsonb)
    || coalesce(v_surat.data_snapshot->'verification_inputs'->'latest', '{}'::jsonb)
    || coalesce(v_surat.form_input_data, '{}'::jsonb);
  v_category := lower(trim(coalesce(
    v_effective_input->>'request_category',
    v_effective_input->>'request_mode',
    ''
  )));

  if exists (
    select 1
    from public.surat_linked_documents link
    where link.child_surat_id = p_surat_id
      and link.link_type = 'recommendation'
      and link.status = 'active'
  ) or lower(coalesce(v_effective_input->>'linked_document_type', '')) = 'recommendation'
    or nullif(v_effective_input->>'linked_parent_surat_id', '') is not null then
    v_skip_code := 'recommendation_child';
    v_skip_reason := 'Dokumen rekomendasi mengikuti pengajuan induk dan tidak dikirim terpisah.';
  elsif v_category = 'unit' then
    v_kind := 'unit';
    v_endpoint := '/unit-submissions';
  elsif v_category in ('non_unit', 'nonunit') then
    v_kind := 'non_unit';
    v_endpoint := '/non-unit-submissions';
  elsif v_category = 'asset' then
    v_kind := 'asset';
    v_endpoint := '/asset-purchase-requests';
  else
    v_skip_code := 'unsupported_category';
    v_skip_reason := format('Kategori %s belum memiliki endpoint outbound Marison.', coalesce(nullif(v_category, ''), '-'));
  end if;

  insert into public.marison_outbound_dispatches (
    surat_id,
    environment,
    kind,
    endpoint,
    idempotency_key,
    status,
    skipped_code,
    skipped_reason,
    completed_at
  ) values (
    p_surat_id,
    p_environment,
    v_kind,
    v_endpoint,
    format('sigap:%s:%s:%s', p_environment, coalesce(v_kind, 'skipped'), p_surat_id),
    case when v_skip_code is null then 'pending'::public.marison_outbound_dispatch_status else 'skipped'::public.marison_outbound_dispatch_status end,
    v_skip_code,
    v_skip_reason,
    case when v_skip_code is null then null else clock_timestamp() end
  )
  on conflict (surat_id, environment) do nothing
  returning id into v_job_id;

  if v_job_id is null then
    select d.id into v_job_id
    from public.marison_outbound_dispatches d
    where d.surat_id = p_surat_id
      and d.environment = p_environment;
  end if;

  return v_job_id;
end;
$$;

create or replace function public.enqueue_marison_outbound_on_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_environment text;
begin
  select s.environment into v_environment
  from public.marison_outbound_settings s
  where s.singleton is true
    and s.enabled is true;

  if v_environment is not null then
    perform public.ensure_marison_outbound_dispatch(new.id, v_environment);
  end if;

  return new;
end;
$$;

create trigger enqueue_marison_outbound_after_completion
after update of status on public.surat_registrasi
for each row
when (
  upper(coalesce(old.status::text, '')) not in ('SELESAI', 'DONE')
  and upper(coalesce(new.status::text, '')) in ('SELESAI', 'DONE')
)
execute function public.enqueue_marison_outbound_on_completion();

create or replace function public.claim_marison_outbound_dispatch(p_environment text)
returns table (
  job_id uuid,
  surat_id uuid,
  environment text,
  kind text,
  endpoint text,
  contract_version text,
  payload jsonb,
  payload_body text,
  payload_hash text,
  idempotency_key text,
  attempt_count integer,
  lease_token uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired record;
  v_job_id uuid;
  v_lease_token uuid := gen_random_uuid();
begin
  if not exists (
    select 1
    from public.marison_outbound_settings s
    where s.singleton is true
      and s.environment = p_environment
      and s.enabled is true
  ) then
    return;
  end if;

  for v_expired in
    select d.id, d.attempt_count, d.post_started_at
    from public.marison_outbound_dispatches d
    where d.environment = p_environment
      and d.status = 'processing'
      and d.lease_expires_at <= clock_timestamp()
    order by d.lease_expires_at
    for update skip locked
  loop
    if v_expired.post_started_at is not null then
      update public.marison_outbound_dispatches d
      set status = 'outcome_unknown',
          error_code = 'worker_lease_expired_after_post',
          error_message = 'Worker berhenti setelah POST dimulai; hasil pengiriman harus direkonsiliasi.',
          completed_at = clock_timestamp(),
          lease_token = null,
          lease_acquired_at = null,
          lease_expires_at = null,
          updated_at = clock_timestamp()
      where d.id = v_expired.id;
    elsif v_expired.attempt_count >= 3 then
      update public.marison_outbound_dispatches d
      set status = 'failed_terminal',
          error_code = 'pre_post_attempts_exhausted',
          error_message = 'Worker gagal menyelesaikan persiapan sebelum batas percobaan.',
          completed_at = clock_timestamp(),
          lease_token = null,
          lease_acquired_at = null,
          lease_expires_at = null,
          updated_at = clock_timestamp()
      where d.id = v_expired.id;
    else
      update public.marison_outbound_dispatches d
      set status = 'failed_retryable',
          error_code = 'worker_lease_expired_before_post',
          error_message = 'Worker berhenti sebelum POST dimulai; percobaan akan dijadwalkan ulang.',
          next_attempt_at = clock_timestamp() + make_interval(secs => 15 * (2 ^ greatest(v_expired.attempt_count - 1, 0))::integer),
          lease_token = null,
          lease_acquired_at = null,
          lease_expires_at = null,
          updated_at = clock_timestamp()
      where d.id = v_expired.id;
    end if;
  end loop;

  update public.marison_outbound_dispatches d
  set status = 'succeeded',
      response = sr.data_snapshot->'marison_dispatch'->'response',
      external_reference = coalesce(
        sr.data_snapshot->'marison_dispatch'->>'external_reference',
        sr.data_snapshot->'marison_dispatch'->'response'->>'submission_id',
        sr.data_snapshot->'marison_dispatch'->'response'->>'asset_purchase_request_id',
        sr.data_snapshot->'marison_dispatch'->'response'->'data'->>'submission_id',
        sr.data_snapshot->'marison_dispatch'->'response'->'data'->>'asset_purchase_request_id',
        array_to_string(array(
          select jsonb_array_elements_text(
            coalesce(
              sr.data_snapshot->'marison_dispatch'->'response'->'asset_purchase_request_ids',
              sr.data_snapshot->'marison_dispatch'->'response'->'data'->'asset_purchase_request_ids',
              '[]'::jsonb
            )
          )
        ), ',')
      ),
      completed_at = clock_timestamp(),
      error_code = null,
      error_message = null,
      updated_at = clock_timestamp()
  from public.surat_registrasi sr
  where d.surat_id = sr.id
    and d.environment = p_environment
    and d.status in ('pending', 'failed_retryable')
    and sr.data_snapshot->'marison_dispatch'->>'status' = 'success'
    and sr.data_snapshot->'marison_dispatch'->>'environment' = p_environment;

  select candidate.id into v_job_id
  from public.marison_outbound_dispatches candidate
  where candidate.environment = p_environment
    and candidate.status in ('pending', 'failed_retryable')
    and candidate.attempt_count < 3
    and candidate.next_attempt_at <= clock_timestamp()
  order by candidate.next_attempt_at, candidate.created_at
  limit 1
  for update skip locked;

  if v_job_id is null then
    return;
  end if;

  return query
  update public.marison_outbound_dispatches d
  set status = 'processing',
      attempt_count = d.attempt_count + 1,
      lease_token = v_lease_token,
      lease_acquired_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + interval '2 minutes',
      error_code = null,
      error_message = null,
      error_details = null,
      updated_at = clock_timestamp()
  where d.id = v_job_id
  returning
    d.id,
    d.surat_id,
    d.environment,
    d.kind,
    d.endpoint,
    d.contract_version,
    d.payload,
    d.payload_body,
    d.payload_hash,
    d.idempotency_key,
    d.attempt_count,
    d.lease_token;
end;
$$;

create or replace function public.prepare_marison_outbound_dispatch(
  p_job_id uuid,
  p_lease_token uuid,
  p_kind text,
  p_endpoint text,
  p_contract_version text,
  p_payload jsonb,
  p_payload_body text,
  p_payload_hash text
)
returns table (
  kind text,
  endpoint text,
  contract_version text,
  payload jsonb,
  payload_body text,
  payload_hash text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.marison_outbound_dispatches%rowtype;
begin
  if p_lease_token is null
     or p_payload is null
     or nullif(p_payload_body, '') is null
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or encode(extensions.digest(convert_to(p_payload_body, 'UTF8'), 'sha256'), 'hex') <> p_payload_hash then
    raise exception 'Invalid prepared payload' using errcode = '22023';
  end if;

  if not (
    (p_kind = 'unit' and p_endpoint = '/unit-submissions')
    or (p_kind = 'non_unit' and p_endpoint = '/non-unit-submissions')
    or (p_kind = 'asset' and p_endpoint = '/asset-purchase-requests')
  ) then
    raise exception 'Invalid dispatch kind or endpoint' using errcode = '22023';
  end if;

  select d.* into v_job
  from public.marison_outbound_dispatches d
  where d.id = p_job_id
  for update;

  if not found
     or v_job.status <> 'processing'
     or v_job.lease_token is distinct from p_lease_token
     or v_job.lease_expires_at <= clock_timestamp()
     or v_job.post_started_at is not null then
    raise exception 'Stale or invalid dispatch lease' using errcode = '55000';
  end if;

  if v_job.payload is null then
    update public.marison_outbound_dispatches d
    set kind = p_kind,
        endpoint = p_endpoint,
        contract_version = p_contract_version,
        payload = p_payload,
        payload_body = p_payload_body,
        payload_hash = p_payload_hash,
        payload_built_at = clock_timestamp(),
        idempotency_key = format('sigap:%s:%s:%s', d.environment, p_kind, d.surat_id),
        updated_at = clock_timestamp()
    where d.id = p_job_id;
  elsif v_job.kind is distinct from p_kind
     or v_job.endpoint is distinct from p_endpoint
     or v_job.contract_version is distinct from p_contract_version
     or v_job.payload is distinct from p_payload
     or v_job.payload_body is distinct from p_payload_body
     or v_job.payload_hash is distinct from p_payload_hash then
    raise exception 'Prepared payload is immutable' using errcode = '55000';
  end if;

  update public.marison_outbound_dispatches d
  set lease_acquired_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + interval '2 minutes',
      updated_at = clock_timestamp()
  where d.id = p_job_id
    and d.status = 'processing'
    and d.lease_token = p_lease_token;

  return query
  select d.kind, d.endpoint, d.contract_version, d.payload, d.payload_body, d.payload_hash
  from public.marison_outbound_dispatches d
  where d.id = p_job_id;
end;
$$;

create or replace function public.fail_marison_outbound_before_post(
  p_job_id uuid,
  p_lease_token uuid,
  p_retryable boolean,
  p_error_code text,
  p_error_message text,
  p_error_details jsonb default null
)
returns public.marison_outbound_dispatch_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.marison_outbound_dispatches%rowtype;
  v_status public.marison_outbound_dispatch_status;
begin
  if p_lease_token is null then
    raise exception 'Lease token is required' using errcode = '22023';
  end if;

  select d.* into v_job
  from public.marison_outbound_dispatches d
  where d.id = p_job_id
  for update;

  if not found
     or v_job.status <> 'processing'
     or v_job.lease_token is distinct from p_lease_token
     or v_job.post_started_at is not null then
    raise exception 'Stale lease or POST already started' using errcode = '55000';
  end if;

  v_status := case
    when p_retryable is true and v_job.attempt_count < 3 then 'failed_retryable'::public.marison_outbound_dispatch_status
    else 'failed_terminal'::public.marison_outbound_dispatch_status
  end;

  update public.marison_outbound_dispatches d
  set status = v_status,
      next_attempt_at = case
        when v_status = 'failed_retryable' then clock_timestamp() + make_interval(secs => 15 * (2 ^ greatest(v_job.attempt_count - 1, 0))::integer)
        else d.next_attempt_at
      end,
      completed_at = case when v_status = 'failed_terminal' then clock_timestamp() else null end,
      error_code = left(coalesce(nullif(trim(p_error_code), ''), 'pre_post_failure'), 120),
      error_message = left(coalesce(nullif(trim(p_error_message), ''), 'Persiapan dispatch gagal.'), 1000),
      error_details = p_error_details,
      lease_token = null,
      lease_acquired_at = null,
      lease_expires_at = null,
      updated_at = clock_timestamp()
  where d.id = p_job_id;

  return v_status;
end;
$$;

create or replace function public.mark_marison_outbound_post_started(
  p_job_id uuid,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_lease_token is null then
    raise exception 'Lease token is required' using errcode = '22023';
  end if;

  update public.marison_outbound_dispatches d
  set post_started_at = clock_timestamp(),
      last_attempt_at = clock_timestamp(),
      lease_acquired_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + interval '2 minutes',
      updated_at = clock_timestamp()
  where d.id = p_job_id
    and d.status = 'processing'
    and d.lease_token = p_lease_token
    and d.lease_expires_at > clock_timestamp()
    and d.post_started_at is null
    and d.payload is not null
    and d.payload_body is not null
    and d.payload_hash is not null;

  if not found then
    raise exception 'Stale lease or payload is not prepared' using errcode = '55000';
  end if;

  return true;
end;
$$;

create or replace function public.complete_marison_outbound_after_post(
  p_job_id uuid,
  p_lease_token uuid,
  p_status public.marison_outbound_dispatch_status,
  p_response jsonb default null,
  p_error_code text default null,
  p_error_message text default null,
  p_error_details jsonb default null,
  p_external_reference text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_lease_token is null
     or p_status not in ('succeeded', 'failed_terminal', 'outcome_unknown') then
    raise exception 'Invalid post completion' using errcode = '22023';
  end if;

  if p_status = 'succeeded' and nullif(trim(p_external_reference), '') is null then
    raise exception 'External reference is required for a successful dispatch' using errcode = '22023';
  end if;

  update public.marison_outbound_dispatches d
  set status = p_status,
      response = p_response,
      error_code = left(nullif(trim(p_error_code), ''), 120),
      error_message = left(nullif(trim(p_error_message), ''), 1000),
      error_details = p_error_details,
      external_reference = nullif(trim(p_external_reference), ''),
      completed_at = clock_timestamp(),
      lease_token = null,
      lease_acquired_at = null,
      lease_expires_at = null,
      updated_at = clock_timestamp()
  where d.id = p_job_id
    and d.status = 'processing'
    and d.lease_token = p_lease_token
    and d.post_started_at is not null;

  if not found then
    raise exception 'Stale lease or POST was not started' using errcode = '55000';
  end if;

  return true;
end;
$$;

create or replace function public.reconcile_marison_outbound_dispatch(
  p_job_id uuid,
  p_actor_id uuid,
  p_action text,
  p_reason text,
  p_external_reference text default null,
  p_confirm_duplicate_risk boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.marison_outbound_dispatches%rowtype;
  v_to_status public.marison_outbound_dispatch_status;
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = p_actor_id
      and p.role::text = 'admin'
      and p.is_active is true
      and p.deleted_at is null
  ) then
    raise exception 'Active admin is required' using errcode = '42501';
  end if;

  if p_action is null
     or p_action not in ('mark_succeeded', 'reopen_confirmed_not_received', 'reopen_terminal_pre_post')
     or nullif(trim(p_reason), '') is null then
    raise exception 'Invalid reconciliation request' using errcode = '22023';
  end if;

  select d.* into v_job
  from public.marison_outbound_dispatches d
  where d.id = p_job_id
  for update;

  if not found then
    raise exception 'Dispatch not found' using errcode = 'P0002';
  end if;
  if p_action in ('mark_succeeded', 'reopen_confirmed_not_received')
     and v_job.status <> 'outcome_unknown' then
    raise exception 'Unknown-outcome reconciliation requires outcome_unknown status' using errcode = '55000';
  end if;
  if p_action = 'reopen_terminal_pre_post'
     and (v_job.status <> 'failed_terminal' or v_job.post_started_at is not null) then
    raise exception 'Only a terminal pre-POST dispatch can be reopened safely' using errcode = '55000';
  end if;

  if p_action = 'mark_succeeded' then
    if nullif(trim(p_external_reference), '') is null then
      raise exception 'External reference is required' using errcode = '22023';
    end if;
    v_to_status := 'succeeded';
  elsif p_action = 'reopen_confirmed_not_received' then
    if p_confirm_duplicate_risk is not true then
      raise exception 'Duplicate risk confirmation is required' using errcode = '22023';
    end if;
    v_to_status := 'pending';
  else
    v_to_status := 'pending';
  end if;

  insert into public.marison_outbound_reconciliation_events (
    dispatch_id,
    surat_id,
    environment,
    action,
    from_status,
    to_status,
    actor_id,
    reason,
    external_reference,
    before_state
  ) values (
    v_job.id,
    v_job.surat_id,
    v_job.environment,
    p_action,
    v_job.status,
    v_to_status,
    p_actor_id,
    left(trim(p_reason), 2000),
    nullif(trim(p_external_reference), ''),
    jsonb_build_object(
      'payload_hash', v_job.payload_hash,
      'idempotency_key', v_job.idempotency_key,
      'attempt_count', v_job.attempt_count,
      'post_started_at', v_job.post_started_at,
      'last_attempt_at', v_job.last_attempt_at,
      'completed_at', v_job.completed_at,
      'response', v_job.response,
      'error_code', v_job.error_code,
      'error_message', v_job.error_message,
      'error_details', v_job.error_details,
      'external_reference', v_job.external_reference
    )
  );

  if p_action = 'mark_succeeded' then
    update public.marison_outbound_dispatches d
    set status = 'succeeded',
        external_reference = trim(p_external_reference),
        completed_at = clock_timestamp(),
        error_code = null,
        error_message = null,
        error_details = null,
        reconciliation_count = d.reconciliation_count + 1,
        updated_at = clock_timestamp()
    where d.id = p_job_id;
  else
    update public.marison_outbound_dispatches d
    set status = 'pending',
        attempt_count = 0,
        next_attempt_at = clock_timestamp(),
        post_started_at = null,
        last_attempt_at = null,
        completed_at = null,
        response = null,
        error_code = null,
        error_message = null,
        error_details = null,
        external_reference = null,
        reconciliation_count = d.reconciliation_count + 1,
        updated_at = clock_timestamp()
    where d.id = p_job_id;
  end if;

  insert into public.notifications (user_id, type, title, message, data, link)
  select
    p.id,
    'info',
    'Rekonsiliasi pengiriman Marison',
    case
      when p_action = 'mark_succeeded' then 'Pengiriman telah ditandai diterima berdasarkan pemeriksaan sistem vendor.'
      when p_action = 'reopen_confirmed_not_received' then 'Pengiriman dibuka ulang setelah admin memastikan request sebelumnya tidak diterima vendor.'
      else 'Kegagalan sebelum POST dibuka ulang setelah konfigurasi diperbaiki.'
    end,
    jsonb_build_object(
      'event_type', 'marison_outbound_reconciled',
      'dispatch_id', v_job.id,
      'surat_id', v_job.surat_id,
      'environment', v_job.environment,
      'action', p_action,
      'actor_id', p_actor_id
    ),
    '/admin/configuration/form-usages?section=marison'
  from public.profiles p
  where p.role::text = 'admin'
    and p.is_active is true
    and p.deleted_at is null;

  return true;
end;
$$;

revoke execute on function public.sync_marison_outbound_snapshot() from public, anon, authenticated;
revoke execute on function public.notify_marison_outbound_attention() from public, anon, authenticated;
revoke execute on function public.enqueue_marison_outbound_on_completion() from public, anon, authenticated;
revoke execute on function public.configure_marison_outbound(text, boolean, text, uuid) from public, anon, authenticated;
revoke execute on function public.ensure_marison_outbound_dispatch(uuid, text) from public, anon, authenticated;
revoke execute on function public.claim_marison_outbound_dispatch(text) from public, anon, authenticated;
revoke execute on function public.prepare_marison_outbound_dispatch(uuid, uuid, text, text, text, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.fail_marison_outbound_before_post(uuid, uuid, boolean, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.mark_marison_outbound_post_started(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.complete_marison_outbound_after_post(uuid, uuid, public.marison_outbound_dispatch_status, jsonb, text, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.reconcile_marison_outbound_dispatch(uuid, uuid, text, text, text, boolean) from public, anon, authenticated;

grant execute on function public.ensure_marison_outbound_dispatch(uuid, text) to service_role;
grant execute on function public.configure_marison_outbound(text, boolean, text, uuid) to service_role;
grant execute on function public.claim_marison_outbound_dispatch(text) to service_role;
grant execute on function public.prepare_marison_outbound_dispatch(uuid, uuid, text, text, text, jsonb, text, text) to service_role;
grant execute on function public.fail_marison_outbound_before_post(uuid, uuid, boolean, text, text, jsonb) to service_role;
grant execute on function public.mark_marison_outbound_post_started(uuid, uuid) to service_role;
grant execute on function public.complete_marison_outbound_after_post(uuid, uuid, public.marison_outbound_dispatch_status, jsonb, text, text, jsonb, text) to service_role;
grant execute on function public.reconcile_marison_outbound_dispatch(uuid, uuid, text, text, text, boolean) to service_role;

comment on table public.marison_outbound_dispatches is
  'Durable, service-only Marison outbound outbox. One business job per surat and environment.';
comment on column public.marison_outbound_dispatches.idempotency_key is
  'Internal stable key only. It is not sent to Marison until the vendor contract supports idempotency.';
comment on column public.marison_outbound_dispatches.post_started_at is
  'Durability boundary: an expired lease after this time becomes outcome_unknown and is never retried automatically.';
