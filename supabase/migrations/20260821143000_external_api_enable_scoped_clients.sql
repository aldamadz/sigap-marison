alter table public.external_api_clients
  drop constraint if exists external_api_clients_inactive_check;

alter table public.external_api_clients
  drop constraint if exists external_api_clients_active_credentials_check;

alter table public.external_api_clients
  add constraint external_api_clients_active_credentials_check
  check (
    is_active is false
    or (
      nullif(btrim(client_id), '') is not null
      and nullif(btrim(client_secret_hash), '') is not null
      and cardinality(scopes) > 0
    )
  );

comment on constraint external_api_clients_active_credentials_check
  on public.external_api_clients is
  'Active external clients require client credentials and at least one explicit capability scope.';
