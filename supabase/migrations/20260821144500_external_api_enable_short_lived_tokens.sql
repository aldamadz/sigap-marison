alter table public.external_api_access_tokens
  drop constraint if exists external_api_access_tokens_revoked_check;

alter table public.external_api_access_tokens
  drop constraint if exists external_api_access_tokens_lifecycle_check;

alter table public.external_api_access_tokens
  add constraint external_api_access_tokens_lifecycle_check
  check (
    expires_at > created_at
    and (revoked_at is null or revoked_at >= created_at)
  );

comment on constraint external_api_access_tokens_lifecycle_check
  on public.external_api_access_tokens is
  'Short-lived access tokens may start active; expiry and optional revocation must follow creation.';
