-- Restore the one-time bearer contract for browser preview tokens.
-- REC-03 canonical-link hardening accidentally stopped filtering consumed_at.
create or replace function public.consume_file_view_token(p_token_hash text)
returns table(token_id uuid,surat_id uuid,bucket text,object_path text,storage_origin text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.file_view_tokens%rowtype;
begin
  select * into v
  from public.file_view_tokens f
  where f.token_hash = p_token_hash
    and f.revoked_at is null
    and (f.expires_at is null or f.expires_at > now())
    and (
      f.consumed_at is null
      or f.purpose in ('email', 'external_marison', 'external_marison_recommendation_pdf')
    )
  for update;

  if not found then
    return;
  end if;

  if v.purpose = 'external_marison_recommendation_pdf' then
    select s.pdf_bucket,s.pdf_object_path,s.pdf_storage_origin
      into bucket,object_path,storage_origin
    from public.surat_linked_documents l
    join public.surat_registrasi s on s.id = l.child_surat_id
    where s.id = v.surat_id
      and l.link_type = 'recommendation'
      and l.status = 'active'
      and public.recommendation_pdf_is_current(s.id)
    order by l.updated_at desc,l.id desc
    limit 1
    for share of l,s;

    if not found
      or bucket is distinct from v.bucket
      or object_path is distinct from v.object_path
      or storage_origin is distinct from v.storage_origin then
      return;
    end if;

    update public.file_view_tokens
    set last_accessed_at = clock_timestamp()
    where id = v.id;

    insert into public.file_view_token_audit(token_id,token_hash,surat_id,purpose,action)
    values(v.id,v.token_hash,v.surat_id,v.purpose,'resolved');
  else
    bucket := v.bucket;
    object_path := v.object_path;
    storage_origin := v.storage_origin;

    if v.purpose not in ('email', 'external_marison') then
      update public.file_view_tokens
      set consumed_at = clock_timestamp()
      where id = v.id;
    end if;
  end if;

  token_id := v.id;
  surat_id := v.surat_id;
  return next;
end;
$$;

revoke all on function public.consume_file_view_token(text) from public,anon,authenticated;
grant execute on function public.consume_file_view_token(text) to service_role;

comment on function public.consume_file_view_token(text) is
  'Atomically resolves file bearers; preview tokens are single-use, while explicitly persistent email/Marison purposes remain reusable until expiry or revocation.';
