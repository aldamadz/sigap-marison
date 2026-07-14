-- Security hardening for profile privilege fields and auth signup defaults.

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
    coalesce(nullif(new.raw_user_meta_data->>'nik', ''), 'PENDING-' || upper(substring(new.id::text, 1, 8))),
    coalesce(nullif(new.raw_user_meta_data->>'job_title', ''), 'Staff'),
    'user'::public.user_role,
    null,
    null,
    null,
    true
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    updated_at = now();

  return new;
end;
$$;

create or replace function public.prevent_profile_privilege_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
  v_allowed_fields text[] := array[
    'full_name',
    'avatar_url',
    'avatar_thumbnail_url',
    'phone',
    'theme_preference',
    'updated_at'
  ];
begin
  if v_actor is null then
    return new;
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.id = v_actor
      and p.role::text in ('admin', 'super_admin')
      and coalesce(p.is_active, true) = true
      and p.deleted_at is null
  )
  into v_is_admin;

  if v_is_admin then
    return new;
  end if;

  if old.id is distinct from v_actor then
    raise exception 'Tidak diizinkan mengubah profil user lain.';
  end if;

  if (to_jsonb(old) - v_allowed_fields) is distinct from (to_jsonb(new) - v_allowed_fields) then
    raise exception 'Tidak diizinkan mengubah kolom administratif profil.';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_prevent_profile_privilege_self_update on public.profiles;
create trigger tr_prevent_profile_privilege_self_update
before update on public.profiles
for each row
execute function public.prevent_profile_privilege_self_update();

drop policy if exists profiles_insert_authenticated on public.profiles;
drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check (public.is_current_user_admin());

drop policy if exists profiles_update_self_or_admin on public.profiles;
drop policy if exists profiles_update_self_limited on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;

create policy profiles_update_self_limited on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

revoke all on function public.prevent_profile_privilege_self_update() from public, anon, authenticated;
