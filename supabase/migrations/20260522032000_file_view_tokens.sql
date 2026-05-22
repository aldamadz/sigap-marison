create table if not exists public.file_view_tokens (
  token_hash text primary key,
  bucket text not null,
  object_path text not null,
  requested_by uuid references auth.users(id) on delete set null,
  surat_id uuid references public.surat_registrasi(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.file_view_tokens enable row level security;

create index if not exists idx_file_view_tokens_expires_at
  on public.file_view_tokens (expires_at);

create or replace function public.consume_file_view_token(p_token_hash text)
returns table(bucket text, object_path text)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  delete from public.file_view_tokens fvt
  where fvt.token_hash = p_token_hash
    and fvt.expires_at > now()
  returning fvt.bucket, fvt.object_path;
end;
$function$;

revoke all on public.file_view_tokens from public;
revoke all on public.file_view_tokens from anon;
revoke all on public.file_view_tokens from authenticated;

revoke execute on function public.consume_file_view_token(text) from public;
revoke execute on function public.consume_file_view_token(text) from anon;
revoke execute on function public.consume_file_view_token(text) from authenticated;
