create table if not exists public.external_api_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token_hash text not null unique,
  hmac_secret text not null,
  allowed_ips text[] not null default '{}'::text[],
  is_active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.external_api_audit_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.external_api_clients(id) on delete set null,
  method text not null,
  path text not null,
  status_code integer not null,
  ip_address text,
  user_agent text,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.external_api_clients enable row level security;
alter table public.external_api_audit_logs enable row level security;

create index if not exists idx_external_api_clients_token_hash
  on public.external_api_clients(token_hash)
  where is_active = true;

create index if not exists idx_external_api_audit_logs_client_created
  on public.external_api_audit_logs(client_id, created_at desc);

revoke all on public.external_api_clients from public;
revoke all on public.external_api_clients from anon;
revoke all on public.external_api_clients from authenticated;

revoke all on public.external_api_audit_logs from public;
revoke all on public.external_api_audit_logs from anon;
revoke all on public.external_api_audit_logs from authenticated;
