create extension if not exists pgcrypto;

alter table public.external_api_clients
  add column if not exists client_id text,
  add column if not exists client_secret_hash text;

create unique index if not exists external_api_clients_client_id_key
  on public.external_api_clients (client_id)
  where client_id is not null;

create table if not exists public.external_api_access_tokens (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.external_api_clients(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists external_api_access_tokens_client_id_idx
  on public.external_api_access_tokens (client_id);

create index if not exists external_api_access_tokens_expires_at_idx
  on public.external_api_access_tokens (expires_at);

alter table public.external_api_access_tokens enable row level security;

revoke all on table public.external_api_access_tokens from public, anon, authenticated;

comment on column public.external_api_clients.client_secret_hash is
  'Node.js scrypt hash formatted as scrypt$N$r$p$salt_hex$key_hex.';

comment on table public.external_api_access_tokens is
  'Short-lived external API access tokens. Raw tokens are never stored.';
