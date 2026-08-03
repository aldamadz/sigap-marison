-- MRN-16: rejected vendor requests use an auditable replacement job.
alter table public.marison_outbound_dispatches
  add column if not exists replacement_of_dispatch_id uuid references public.marison_outbound_dispatches(id) on delete restrict;

alter table public.marison_outbound_dispatches
  drop constraint if exists marison_outbound_dispatches_surat_id_environment_key;

create unique index if not exists marison_outbound_one_active_job_idx
  on public.marison_outbound_dispatches(surat_id, environment)
  where status in ('pending', 'processing', 'failed_retryable');

create table if not exists public.marison_outbound_replacement_events (
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

create or replace function public.create_marison_outbound_replacement(
  p_dispatch_id uuid,
  p_actor_id uuid,
  p_reason text
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.marison_outbound_dispatches%rowtype;
  v_new uuid;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and role::text = 'admin' and is_active and deleted_at is null) then
    raise exception 'Active admin is required' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'Reason is required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('marison-replacement:' || p_dispatch_id::text, 0));
  select * into v_old from public.marison_outbound_dispatches where id = p_dispatch_id for update;
  if not found then raise exception 'Dispatch not found' using errcode = 'P0002'; end if;
  if v_old.environment <> 'staging' or v_old.status <> 'failed_terminal' or v_old.error_code not like 'marison_http_422%' then
    raise exception 'Only staging HTTP 422 dispatches can be replaced' using errcode = '55000';
  end if;
  if exists (select 1 from public.marison_outbound_dispatches where replacement_of_dispatch_id = v_old.id and status in ('pending', 'processing', 'failed_retryable')) then
    raise exception 'Active replacement already exists' using errcode = '40001';
  end if;
  insert into public.marison_outbound_dispatches (surat_id, environment, kind, endpoint, idempotency_key, status, replacement_of_dispatch_id)
  values (v_old.surat_id, 'staging', v_old.kind, v_old.endpoint, format('sigap:staging:replacement:%s', gen_random_uuid()), 'pending', v_old.id)
  returning id into v_new;
  insert into public.marison_outbound_replacement_events (old_dispatch_id, new_dispatch_id, surat_id, environment, actor_id, reason, before_state)
  values (v_old.id, v_new, v_old.surat_id, 'staging', p_actor_id, left(btrim(p_reason), 2000), jsonb_build_object('status', v_old.status, 'error_code', v_old.error_code, 'payload_hash', v_old.payload_hash, 'post_started_at', v_old.post_started_at, 'external_reference', v_old.external_reference));
  return v_new;
end;
$$;

revoke execute on function public.create_marison_outbound_replacement(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_marison_outbound_replacement(uuid, uuid, text) to service_role;
