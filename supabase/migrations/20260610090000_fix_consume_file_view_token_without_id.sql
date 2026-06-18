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
    update public.file_view_tokens fvt
    set consumed_at = now()
    where fvt.token_hash = p_token_hash;
  end if;

  bucket := v_token.bucket;
  object_path := v_token.object_path;
  storage_origin := v_token.storage_origin;
  return next;
end;
$$;

revoke all on function public.consume_file_view_token(text) from public, anon;
grant execute on function public.consume_file_view_token(text) to service_role;

