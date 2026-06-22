-- Consolidate old broad public RLS policies into explicit authenticated policies.

drop policy if exists "Users can delete own agendas" on public.agendas;
drop policy if exists "Users can create own agendas" on public.agendas;
drop policy if exists "Users can insert their own agendas" on public.agendas;
drop policy if exists "Atasan bisa melihat agenda bawahan" on public.agendas;
drop policy if exists "Parents can view child agendas" on public.agendas;
drop policy if exists "Users can view own agendas" on public.agendas;
drop policy if exists "Users can update own agendas" on public.agendas;
drop policy if exists "Users can update their own agendas" on public.agendas;

create policy agendas_select_scope on public.agendas
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or created_by in (
      with recursive subordinates as (
        select p.id
        from public.profiles p
        where p.parent_id = (select auth.uid())
        union
        select child.id
        from public.profiles child
        join subordinates s on child.parent_id = s.id
      )
      select id from subordinates
    )
  );

create policy agendas_insert_own on public.agendas
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy agendas_update_own on public.agendas
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy agendas_delete_own on public.agendas
  for delete to authenticated
  using (created_by = (select auth.uid()));

drop policy if exists "Service role can insert notifications" on public.notifications;
drop policy if exists "User can read own notifications" on public.notifications;
drop policy if exists notifications_select_own on public.notifications;
drop policy if exists "User can update own notifications" on public.notifications;
drop policy if exists notifications_update_own on public.notifications;
drop policy if exists notifications_delete_own on public.notifications;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Enable insert for authenticated users" on public.profiles;
drop policy if exists "Enable read access for all authenticated users" on public.profiles;
drop policy if exists "Parents can view child profiles" on public.profiles;
drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;
drop policy if exists "Profiles are viewable by everyone logged in" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;
drop policy if exists "Enable update for users based on id or admin role" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

create policy profiles_select_authenticated on public.profiles
  for select to authenticated
  using (deleted_at is null);

create policy profiles_insert_authenticated on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()) or public.is_current_user_admin());

create policy profiles_update_self_or_admin on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.is_current_user_admin())
  with check (id = (select auth.uid()) or public.is_current_user_admin());
