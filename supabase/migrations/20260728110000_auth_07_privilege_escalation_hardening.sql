create or replace function public.enforce_profile_self_service_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  allowed_fields constant text[] := array[
    'full_name', 'phone', 'avatar_url', 'theme_preference', 'updated_at'
  ];
begin
  if auth.uid() is null or public.is_current_user_admin() then
    return new;
  end if;

  if new.id is distinct from auth.uid() then
    raise exception 'Profile changes are limited to the current user'
      using errcode = '42501';
  end if;

  if (to_jsonb(new) - allowed_fields) is distinct from (to_jsonb(old) - allowed_fields) then
    raise exception 'Sensitive profile fields require an active administrator'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_profile_self_service_fields on public.profiles;
create trigger enforce_profile_self_service_fields
before update on public.profiles
for each row execute function public.enforce_profile_self_service_fields();

revoke execute on function public.enforce_profile_self_service_fields() from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    nik,
    job_title,
    role,
    department_id,
    office_id,
    parent_id,
    is_active
  )
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), 'User Baru'),
    'PENDING-' || upper(substring(new.id::text, 1, 8)),
    'Staff',
    'user'::public.user_role,
    null,
    null,
    null,
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

do $$
declare
  policy_name text;
begin
  for policy_name in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy if exists %I on public.profiles', policy_name);
  end loop;
end;
$$;

create policy profiles_select_authenticated on public.profiles
for select to authenticated using (deleted_at is null);

create policy profiles_update_self_or_admin on public.profiles
for update to authenticated
using (id = (select auth.uid()) or public.is_current_user_admin())
with check (id = (select auth.uid()) or public.is_current_user_admin());

drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin on public.profiles
for insert to authenticated with check (public.is_current_user_admin());

alter table if exists public.master_entities enable row level security;

do $$
declare
  policy_name text;
begin
  for policy_name in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'master_entities'
  loop
    execute format('drop policy if exists %I on public.master_entities', policy_name);
  end loop;
end;
$$;

create policy master_entities_authenticated_read on public.master_entities
for select to authenticated using (true);

drop policy if exists master_entities_admin_insert on public.master_entities;
create policy master_entities_admin_insert on public.master_entities
for insert to authenticated with check (public.is_current_user_admin());

drop policy if exists master_entities_admin_update on public.master_entities;
create policy master_entities_admin_update on public.master_entities
for update to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists master_entities_admin_delete on public.master_entities;
create policy master_entities_admin_delete on public.master_entities
for delete to authenticated using (public.is_current_user_admin());

do $$
declare
  policy_name text;
begin
  for policy_name in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'master_offices'
  loop
    execute format('drop policy if exists %I on public.master_offices', policy_name);
  end loop;
end;
$$;

create policy master_offices_authenticated_read on public.master_offices
for select to authenticated using (true);

create policy master_offices_admin_insert on public.master_offices
for insert to authenticated with check (public.is_current_user_admin());

create policy master_offices_admin_update on public.master_offices
for update to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

create policy master_offices_admin_delete on public.master_offices
for delete to authenticated using (public.is_current_user_admin());

drop policy if exists marison_sync_runs_admin_select on public.marison_sync_runs;
create policy marison_sync_runs_admin_select on public.marison_sync_runs
for select to authenticated using (public.is_current_user_admin());

drop policy if exists marison_sync_issues_admin_select on public.marison_sync_issues;
create policy marison_sync_issues_admin_select on public.marison_sync_issues
for select to authenticated using (public.is_current_user_admin());

drop policy if exists marison_sync_issues_admin_update on public.marison_sync_issues;
create policy marison_sync_issues_admin_update on public.marison_sync_issues
for update to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());
