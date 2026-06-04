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
      and p.role = 'admin'
      and coalesce(p.is_active, true) = true
      and p.deleted_at is null
  );
$$;

drop policy if exists "Admins can read activity logs" on public.activity_logs;

create policy "Admins can read activity logs"
on public.activity_logs
for select
to authenticated
using (public.is_current_user_admin());

create or replace function public.record_auth_audit_event(p_event text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_event not in ('password_changed') then
    raise exception 'Unsupported auth audit event';
  end if;

  insert into public.activity_logs (user_id, action, table_name, record_id, old_values, new_values)
  values (
    auth.uid(),
    'UPDATE'::public.activity_action,
    'auth.users',
    auth.uid()::text,
    null,
    jsonb_build_object('event', p_event)
  );
end;
$$;

revoke execute on function public.is_admin_user(uuid) from public, anon, authenticated;
grant execute on function public.is_current_user_admin() to authenticated;

