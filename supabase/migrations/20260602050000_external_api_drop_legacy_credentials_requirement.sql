alter table public.external_api_clients
  alter column token_hash drop not null,
  alter column hmac_secret drop not null;

comment on column public.external_api_clients.token_hash is
  'Deprecated legacy static token hash. New clients use short-lived tokens from external_api_access_tokens.';

comment on column public.external_api_clients.hmac_secret is
  'Deprecated legacy static HMAC secret. New requests use the short-lived access token as HMAC key.';
