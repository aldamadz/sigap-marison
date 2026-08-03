-- MRN-16: rejected vendor requests use an auditable, generation-aware replacement job.
alter table public.marison_outbound_dispatches
  add column if not exists generation integer not null default 1,
  add column if not exists replacement_of_dispatch_id uuid references public.marison_outbound_dispatches(id) on delete restrict;

alter table public.marison_outbound_dispatches
  add constraint marison_outbound_dispatch_generation_positive check (generation > 0);

alter table public.marison_outbound_dispatches
  drop constraint if exists marison_outbound_dispatches_surat_id_environment_key;

create unique index marison_outbound_dispatch_generation_idx
  on public.marison_outbound_dispatches(surat_id, environment, generation);

create unique index marison_outbound_single_replacement_idx
  on public.marison_outbound_dispatches(replacement_of_dispatch_id)
  where replacement_of_dispatch_id is not null;

create unique index marison_outbound_one_active_job_idx
  on public.marison_outbound_dispatches(surat_id, environment)
  where status in ('pending', 'processing', 'failed_retryable');

create index marison_outbound_dispatch_latest_idx
  on public.marison_outbound_dispatches(surat_id, environment, generation desc);

create table public.marison_outbound_replacement_events (
  id uuid primary key default gen_random_uuid(),
  old_dispatch_id uuid not null references public.marison_outbound_dispatches(id) on delete restrict,
  new_dispatch_id uuid not null unique references public.marison_outbound_dispatches(id) on delete restrict,
  surat_id uuid not null references public.surat_registrasi(id) on delete restrict,
  environment text not null check (environment = 'staging'),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null,
  before_state jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);

alter table public.marison_outbound_replacement_events enable row level security;
revoke all on public.marison_outbound_replacement_events from public, anon, authenticated;
grant select on public.marison_outbound_replacement_events to service_role;

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
  v_title := case when new.status = 'outcome_unknown'
    then 'Status pengiriman Marison belum pasti' else 'Pengiriman Marison gagal' end;
  v_message := case when new.status = 'outcome_unknown'
    then 'Hasil POST ke Marison belum dapat dipastikan. Periksa sistem vendor sebelum mengambil tindakan.'
    else 'Pengiriman ke Marison berhenti dan memerlukan pemeriksaan admin.' end;
  insert into public.notifications (user_id, type, title, message, data, link)
  select p.id, 'warning', v_title, v_message,
    jsonb_build_object(
      'event_type', 'marison_outbound_attention',
      'dispatch_id', new.id,
      'surat_id', new.surat_id,
      'environment', new.environment,
      'queue_status', new.status::text,
      'generation', new.generation
    ),
    '/admin/configuration/integration'
  from public.profiles p
  where p.role::text = 'admin' and p.is_active is true and p.deleted_at is null;
  return new;
end;
$$;

-- Completion triggers can run again after a replacement exists. Always return the
-- latest generation instead of relying on the removed two-column unique key.
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
    select 1 from public.marison_outbound_settings s
    where s.singleton is true and s.environment = p_environment and s.enabled is true
  ) then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('marison-dispatch:' || p_environment || ':' || p_surat_id::text, 0));

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
  where d.surat_id = p_surat_id and d.environment = p_environment
  order by d.generation desc
  limit 1;
  if found then
    return v_job_id;
  end if;

  if coalesce(v_surat.data_snapshot->'marison_dispatch'->>'status', '') = 'success'
     and v_surat.data_snapshot->'marison_dispatch'->>'environment' = p_environment then
    return null;
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
  elsif v_category = 'asset' then
    v_kind := 'asset'; v_endpoint := '/asset-purchase-requests';
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
  )
  returning id into v_job_id;

  return v_job_id;
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
  v_new uuid;
  v_generation integer;
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

  perform pg_advisory_xact_lock(hashtextextended('marison-dispatch:' || v_old.environment || ':' || v_old.surat_id::text, 0));
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
  if exists (
    select 1 from public.marison_outbound_dispatches
    where replacement_of_dispatch_id = v_old.id
  ) then
    raise exception 'Replacement already exists' using errcode = '40001';
  end if;
  if exists (
    select 1 from public.marison_outbound_dispatches
    where surat_id = v_old.surat_id and environment = v_old.environment
      and status in ('pending', 'processing', 'failed_retryable')
  ) then
    raise exception 'Active dispatch already exists' using errcode = '40001';
  end if;

  select coalesce(max(generation), 0) + 1 into v_generation
  from public.marison_outbound_dispatches
  where surat_id = v_old.surat_id and environment = v_old.environment;

  insert into public.marison_outbound_dispatches (
    surat_id, environment, generation, kind, endpoint, idempotency_key, status, replacement_of_dispatch_id
  ) values (
    v_old.surat_id, 'staging', v_generation, v_old.kind, v_old.endpoint,
    format('sigap:staging:%s:%s:g%s', coalesce(v_old.kind, 'unknown'), v_old.surat_id, v_generation),
    'pending', v_old.id
  ) returning id into v_new;

  insert into public.marison_outbound_replacement_events (
    old_dispatch_id, new_dispatch_id, surat_id, environment, actor_id, reason, before_state
  ) values (
    v_old.id, v_new, v_old.surat_id, 'staging', p_actor_id, left(btrim(p_reason), 2000),
    jsonb_build_object(
      'generation', v_old.generation,
      'status', v_old.status,
      'error_code', v_old.error_code,
      'payload_hash', v_old.payload_hash,
      'post_started_at', v_old.post_started_at,
      'external_reference', v_old.external_reference
    )
  );
  return v_new;
end;
$$;

revoke execute on function public.ensure_marison_outbound_dispatch(uuid, text) from public, anon, authenticated;
grant execute on function public.ensure_marison_outbound_dispatch(uuid, text) to service_role;
revoke execute on function public.create_marison_outbound_replacement(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_marison_outbound_replacement(uuid, uuid, text) to service_role;

comment on column public.marison_outbound_dispatches.generation is
  'Monotonic generation within one surat and environment; generation 1 is the original dispatch.';
comment on column public.marison_outbound_dispatches.replacement_of_dispatch_id is
  'Immediate rejected HTTP 422 dispatch replaced by this generation.';
