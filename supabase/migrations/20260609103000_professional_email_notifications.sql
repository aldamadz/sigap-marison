create table if not exists public.system_email_settings (
  id text primary key default 'global',
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.system_email_settings (id, config)
values (
  'global',
  '{
    "enabled": true,
    "recipients": {
      "user": true,
      "department": true,
      "office": true
    },
    "privacy": {
      "include_nik": false
    },
    "files": {
      "main_pdf": "secure_link",
      "initial_attachments": "secure_link",
      "approval_attachments": "secure_link",
      "max_total_attachment_mb": 15
    },
    "link_ttl_hours": 72
  }'::jsonb
)
on conflict (id) do nothing;

alter table public.system_email_settings enable row level security;

drop policy if exists "Admins can manage email settings" on public.system_email_settings;
create policy "Admins can manage email settings"
on public.system_email_settings
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, true) = true
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, true) = true
  )
);

alter table public.master_forms
  add column if not exists email_config jsonb;

create table if not exists public.file_view_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  bucket text not null,
  object_path text not null,
  storage_origin text not null default 'primary',
  requested_by uuid references auth.users(id),
  surat_id uuid references public.surat_registrasi(id) on delete cascade,
  purpose text not null default 'preview',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.file_view_tokens
  add column if not exists storage_origin text not null default 'primary',
  add column if not exists purpose text not null default 'preview',
  add column if not exists consumed_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

create index if not exists file_view_tokens_token_hash_idx
  on public.file_view_tokens (token_hash);

create index if not exists file_view_tokens_expires_at_idx
  on public.file_view_tokens (expires_at);

alter table public.file_view_tokens enable row level security;
revoke all on table public.file_view_tokens from public, anon, authenticated;

create or replace function public.consume_file_view_token(p_token_hash text)
returns table (
  bucket text,
  object_path text,
  storage_origin text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token public.file_view_tokens%rowtype;
begin
  select *
  into v_token
  from public.file_view_tokens fvt
  where fvt.token_hash = p_token_hash
    and fvt.expires_at > now()
    and (fvt.consumed_at is null or fvt.purpose = 'email')
  order by fvt.created_at desc
  limit 1;

  if not found then
    return;
  end if;

  if v_token.purpose <> 'email' then
    update public.file_view_tokens
    set consumed_at = now()
    where id = v_token.id;
  end if;

  bucket := v_token.bucket;
  object_path := v_token.object_path;
  storage_origin := v_token.storage_origin;
  return next;
end;
$$;
