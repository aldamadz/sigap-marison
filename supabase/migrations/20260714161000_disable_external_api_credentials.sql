-- Retire the inbound read-only External API without dropping audit/history
-- tables or making credential reactivation part of any rollback path.

update public.external_api_access_tokens
set revoked_at = clock_timestamp()
where revoked_at is null;

update public.external_api_clients
set is_active = false
where is_active is distinct from false;

-- Make retirement durable for future writes while allowing existing rows to
-- be normalized before validation. Named constraints are added only once so
-- this retirement remains safe to reapply.
do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.external_api_access_tokens'::regclass
      and conname = 'external_api_access_tokens_revoked_check'
  ) then
    alter table public.external_api_access_tokens
      add constraint external_api_access_tokens_revoked_check
      check (revoked_at is not null)
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.external_api_clients'::regclass
      and conname = 'external_api_clients_inactive_check'
  ) then
    alter table public.external_api_clients
      add constraint external_api_clients_inactive_check
      check (is_active is false)
      not valid;
  end if;
end;
$migration$;

alter table public.external_api_access_tokens
  validate constraint external_api_access_tokens_revoked_check;

alter table public.external_api_clients
  validate constraint external_api_clients_inactive_check;

-- Keep the historical service-only tables protected if this migration is
-- applied to an environment that predates the June hardening migration.
alter table public.external_api_access_tokens enable row level security;
alter table public.external_api_clients enable row level security;

revoke all on table public.external_api_access_tokens from public, anon, authenticated;
revoke all on table public.external_api_clients from public, anon, authenticated;

do $migration$
begin
  if exists (
    select 1
    from public.external_api_access_tokens
    where revoked_at is null
  ) then
    raise exception 'An External API access token remains unrevoked';
  end if;

  if exists (
    select 1
    from public.external_api_clients
    where is_active is distinct from false
  ) then
    raise exception 'An External API client remains active';
  end if;
end;
$migration$;

comment on table public.external_api_access_tokens is
  'Retired inbound External API token history. All tokens were revoked; raw tokens were never stored.';

comment on table public.external_api_clients is
  'Retired inbound External API client history. All clients are inactive; reintroduction requires newly issued credentials.';
