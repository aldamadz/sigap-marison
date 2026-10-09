-- Issue 509: selected master parity only. Do not replay historical surat migrations.
begin;

do $$
declare
  v_table text;
  v_definition text;
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'Master realtime requires the known PostgreSQL 15+ catalog';
  end if;
  foreach v_table in array array['master_offices', 'master_projects', 'marison_sync_issues'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_table and c.relkind = 'r' and c.relrowsecurity)
      or not exists (select 1 from pg_constraint k
        where k.conrelid = to_regclass('public.' || v_table) and k.contype = 'p'
          and k.conkey = array[(select a.attnum from pg_attribute a
            where a.attrelid = k.conrelid and a.attname = 'id' and a.atttypid = 'uuid'::regtype)]::smallint[])
      or not exists (select 1 from pg_policy p where p.polrelid = to_regclass('public.' || v_table)
        and p.polcmd in ('r', '*') and 'authenticated'::regrole::oid = any(p.polroles)) then
      raise exception 'Unknown or unprotected master catalog: %', v_table;
    end if;
    if exists (select 1 from pg_policy p where p.polrelid = to_regclass('public.' || v_table)
      and p.polcmd in ('r', '*') and (0::oid = any(p.polroles) or 'anon'::regrole::oid = any(p.polroles))) then
      raise exception 'Anonymous master SELECT policy must be audited: %', v_table;
    end if;
  end loop;
  if to_regprocedure('public.is_current_user_admin()') is null then
    raise exception 'Missing canonical active-admin guard';
  end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables)
    or exists (select 1 from pg_publication_namespace n join pg_publication p on p.oid = n.pnpubid
      where p.pubname = 'supabase_realtime') then
    raise exception 'Expected an explicit supabase_realtime publication';
  end if;

  -- Patch only the known review function body; leave organizational triggers and
  -- their cycle-failclosed resolvers intact on both production and staging.
  select pg_get_functiondef(p.oid) into v_definition from pg_proc p
    where p.oid = to_regprocedure('public.refresh_marison_office_review()')
      and p.prorettype = 'trigger'::regtype;
  if v_definition is null
    or strpos(v_definition, 'if new.marison_branch_id is null then') = 0
    or strpos(v_definition, 'new.marison_review_reasons := v_reasons') = 0
    or strpos(v_definition, 'new.marison_hierarchy_confirmed') = 0 then
    raise exception 'Unknown office review function; audit before applying';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.master_offices'::regclass
    and t.tgname = 'refresh_marison_office_review_trg' and t.tgtype = 23
    and t.tgenabled in ('O', 'A') and t.tgfoid = 'public.refresh_marison_office_review()'::regprocedure) then
    raise exception 'Unknown or disabled office review trigger';
  end if;
  if strpos(v_definition, 'new.parent_id := null;') = 0 then
    v_definition := replace(v_definition, 'if new.marison_branch_id is null then',
      E'if new.kedudukan = ''Pusat'' then\n    new.parent_id := null;\n    new.marison_hierarchy_confirmed := true;\n  end if;\n  if new.marison_branch_id is null then');
    execute v_definition;
  elsif strpos(v_definition, 'new.marison_hierarchy_confirmed := true;') = 0 then
    raise exception 'Unknown headquarters normalization function';
  end if;
end;
$$;

create or replace function public.guard_master_office_hierarchy()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_cursor uuid;
  v_parent uuid;
  v_kind text;
  v_seen uuid[] := array[new.id];
begin
  if new.kedudukan = 'Pusat' then
    new.parent_id := null;
    new.marison_hierarchy_confirmed := true;
    return new;
  end if;
  if new.kedudukan in ('KCP', 'Kost') and new.parent_id is null
    and new.marison_hierarchy_confirmed is true then
    raise exception 'KCP/Kost wajib memiliki kantor induk' using errcode = '23514';
  end if;
  v_cursor := new.parent_id;
  while v_cursor is not null loop
    if v_cursor = any(v_seen) or cardinality(v_seen) >= 128 then
      raise exception 'Hirarki kantor membentuk siklus' using errcode = '23514';
    end if;
    select o.parent_id, o.kedudukan into v_parent, v_kind from public.master_offices o where o.id = v_cursor;
    if not found then raise exception 'Kantor induk tidak ditemukan' using errcode = '23514'; end if;
    if v_cursor = new.parent_id and new.kedudukan = 'KCP' and v_kind <> 'KC' then
      raise exception 'KCP wajib memiliki induk KC' using errcode = '23514';
    end if;
    if v_kind is null or v_kind not in ('Pusat', 'KC', 'KCP') then
      raise exception 'Kedudukan kantor induk tidak valid' using errcode = '23514';
    end if;
    v_seen := array_append(v_seen, v_cursor);
    v_cursor := v_parent;
  end loop;
  return new;
end;
$$;
revoke all on function public.guard_master_office_hierarchy() from public, anon, authenticated;

-- Same advisory key as organization_internal.lock_reporting: serialize before
-- row locks, including direct BFF writes. Never replace the organization lock.
create or replace function public.lock_master_office_hierarchy()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(820081400);
  return null;
end;
$$;
revoke all on function public.lock_master_office_hierarchy() from public, anon, authenticated;
drop trigger if exists a_master_office_hierarchy_lock on public.master_offices;
create trigger a_master_office_hierarchy_lock before insert or update or delete on public.master_offices
  for each statement execute function public.lock_master_office_hierarchy();
drop trigger if exists a_master_office_hierarchy_guard on public.master_offices;
create trigger a_master_office_hierarchy_guard before insert or update on public.master_offices
  for each row execute function public.guard_master_office_hierarchy();

-- Only HQ rows need parity normalization. Existing organization AFTER triggers
-- see the parent change and reconcile affected reporting through their resolver.
update public.master_offices set parent_id = null, marison_hierarchy_confirmed = true
where kedudukan = 'Pusat' and (parent_id is not null or marison_hierarchy_confirmed is distinct from true
  or 'Hirarki hasil deteksi nama belum dikonfirmasi' = any(marison_review_reasons));

create or replace function public.save_master_office(
  p_id uuid, p_code text, p_name text, p_email text, p_kedudukan text,
  p_parent_id uuid, p_marison_branch_id bigint, p_create boolean default false
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_existing public.master_offices%rowtype;
  v_code text := upper(btrim(p_code));
  v_name text := btrim(p_name);
  v_email text := nullif(btrim(p_email), '');
  v_parent uuid := case when p_kedudukan = 'Pusat' then null else p_parent_id end;
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'Admin aktif diperlukan' using errcode = '42501';
  end if;
  if p_id is null or nullif(v_code, '') is null or nullif(v_name, '') is null
    or p_kedudukan is null or p_kedudukan not in ('Pusat', 'KC', 'KCP', 'Kost') then
    raise exception 'Data kantor belum lengkap' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(820081400);
  select * into v_existing from public.master_offices where id = p_id for update;
  if found then
    -- A retried create may only acknowledge the same payload, not overwrite an
    -- unrelated existing ID. No-op retries avoid audit/realtime/reporting churn.
    if (v_existing.code, v_existing.name, v_existing.email, v_existing.kedudukan,
        v_existing.parent_id, v_existing.marison_branch_id, v_existing.marison_hierarchy_confirmed)
      is not distinct from (v_code, v_name, v_email, p_kedudukan, v_parent, p_marison_branch_id, true) then
      return p_id;
    end if;
    if p_create then raise exception 'ID kantor sudah digunakan' using errcode = '23505'; end if;
    update public.master_offices set code = v_code, name = v_name, email = v_email,
      kedudukan = p_kedudukan, parent_id = v_parent, marison_branch_id = p_marison_branch_id,
      marison_hierarchy_confirmed = true where id = p_id;
    if not found then raise exception 'Kantor tidak dapat diperbarui' using errcode = '42501'; end if;
  else
    if not coalesce(p_create, false) then raise exception 'Kantor tidak ditemukan' using errcode = 'P0002'; end if;
    insert into public.master_offices(id, code, name, email, kedudukan, parent_id,
      marison_branch_id, marison_hierarchy_confirmed)
    values(p_id, v_code, v_name, v_email, p_kedudukan, v_parent, p_marison_branch_id, true);
  end if;
  return p_id;
end;
$$;
revoke all on function public.save_master_office(uuid,text,text,text,text,uuid,bigint,boolean) from public, anon;
grant execute on function public.save_master_office(uuid,text,text,text,text,uuid,bigint,boolean) to authenticated;

-- Issues can contain employee PII in details/reason. A restrictive SELECT policy
-- intersects every permissive policy, including any environment-specific drift.
drop policy if exists marison_sync_issues_active_admin_realtime on public.marison_sync_issues;
create policy marison_sync_issues_active_admin_realtime on public.marison_sync_issues
  as restrictive for select to authenticated using (public.is_current_user_admin());
revoke select on public.marison_sync_issues from public, anon;

do $$
declare v_table text;
begin
  -- Directory reads remain intentionally authenticated; profiles are never events.
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename = 'profiles') then
    alter publication supabase_realtime drop table public.profiles;
  end if;
  foreach v_table in array array['master_offices', 'master_projects', 'marison_sync_issues'] loop
    -- RLS cannot filter DELETE. Publish only the UUID as old row identity.
    execute format('alter table public.%I replica identity default', v_table);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = v_table) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;
notify pgrst, 'reload schema';
commit;
