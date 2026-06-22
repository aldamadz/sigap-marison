-- Security hardening: service-only tables stay inaccessible to browser roles.
alter table if exists public.external_api_access_tokens enable row level security;
alter table if exists public.external_api_audit_logs enable row level security;
alter table if exists public.external_api_clients enable row level security;
alter table if exists public.file_view_tokens enable row level security;

do $$
declare
  rel regclass;
  policy_name text;
begin
  foreach rel in array array[
    'public.external_api_access_tokens'::regclass,
    'public.external_api_audit_logs'::regclass,
    'public.external_api_clients'::regclass,
    'public.file_view_tokens'::regclass
  ] loop
    policy_name := replace(rel::text, '.', '_') || '_deny_browser_roles';
    execute format('drop policy if exists %I on %s', policy_name, rel);
    execute format(
      'create policy %I on %s for all to anon, authenticated using (false) with check (false)',
      policy_name,
      rel
    );
  end loop;
end $$;

-- PostgREST should not expose public-schema functions to anonymous users by default.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
grant execute on all functions in schema public to authenticated;

-- Lock function name resolution to avoid role/session search_path hijacking.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) cfg
        where cfg like 'search_path=%'
      )
  loop
    execute format('alter function %s set search_path = public, pg_temp', fn.signature);
  end loop;
end $$;

-- Add indexes for currently unindexed foreign keys. This is generated from catalog metadata.
do $$
declare
  item record;
  index_name text;
begin
  for item in
    select
      c.conrelid,
      c.conrelid::regclass as table_name,
      array_agg(a.attname order by key_pos.ordinality) as columns
    from pg_constraint c
    join lateral unnest(c.conkey) with ordinality as key_pos(attnum, ordinality) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = key_pos.attnum
    where c.contype = 'f'
      and c.connamespace = 'public'::regnamespace
      and not exists (
        select 1
        from pg_index i
        where i.indrelid = c.conrelid
          and i.indpred is null
          and (select array_agg(att.attname order by key_pos2.ordinality)
               from unnest(i.indkey) with ordinality key_pos2(attnum, ordinality)
               join pg_attribute att on att.attrelid = i.indrelid and att.attnum = key_pos2.attnum
               where key_pos2.ordinality <= array_length(c.conkey, 1)) =
              (select array_agg(att.attname order by key_pos3.ordinality)
               from unnest(c.conkey) with ordinality key_pos3(attnum, ordinality)
               join pg_attribute att on att.attrelid = c.conrelid and att.attnum = key_pos3.attnum)
      )
    group by c.conrelid, c.oid
  loop
    index_name := left(replace(item.table_name::text, '.', '_') || '_' || array_to_string(item.columns, '_') || '_fk_idx', 63);
    execute format('create index if not exists %I on %s (%s)', index_name, item.table_name, array_to_string(item.columns, ', '));
  end loop;
end $$;

-- Remove duplicate indexes on file_view_tokens. The primary key already covers token_hash.
drop index if exists public.idx_file_view_tokens_expires_at;
drop index if exists public.file_view_tokens_token_hash_idx;
