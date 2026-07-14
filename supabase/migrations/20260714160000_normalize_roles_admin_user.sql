-- Normalize the application role contract to admin/user without rewriting the
-- existing public.user_role enum or other dependent objects.

update public.profiles
set role = 'admin'
where role::text = 'super_admin';

-- A profile-level check is safer than replacing the deployed enum: it closes
-- future writes while preserving unknown enum dependencies in functions,
-- policies, views, defaults, and historical data structures.
alter table public.profiles
  add constraint profiles_role_admin_user_check
  check (
    role is not null
    and role::text = any (array['admin'::text, 'user'::text])
  )
  not valid;

alter table public.profiles
  validate constraint profiles_role_admin_user_check;

-- Keep the latest helper's auth binding, inactive/deleted checks,
-- SECURITY DEFINER setting, search path, and browser-role privileges explicit.
create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role::text = 'admin'
      and coalesce(p.is_active, true) = true
      and p.deleted_at is null
  );
$$;

revoke all on function public.is_current_user_admin() from public, anon;
grant execute on function public.is_current_user_admin() to authenticated;

-- Fail atomically if profile data violates the normalized role contract.
do $migration$
begin
  if exists (
    select 1
    from public.profiles
    where role is null
       or role::text <> all (array['admin'::text, 'user'::text])
  ) then
    raise exception 'A profile still has a role outside the admin/user contract';
  end if;
end;
$migration$;
