alter table public.external_api_clients
  add column if not exists scopes text[] not null default '{}'::text[];

comment on column public.external_api_clients.scopes is
  'Least-privilege capabilities granted to an external API client. submission:decide permits external submission decisions.';
