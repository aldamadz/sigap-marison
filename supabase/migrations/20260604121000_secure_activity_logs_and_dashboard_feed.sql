create or replace function public.is_admin_user(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.role = 'admin'
      and coalesce(p.is_active, true) = true
      and p.deleted_at is null
  );
$$;

create or replace function public.get_my_recent_operational_activities(p_limit integer default 10)
returns table (
  id bigint,
  user_id uuid,
  action public.activity_action,
  table_name text,
  record_id text,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz,
  profile_full_name text,
  profile_avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    al.id,
    al.user_id,
    al.action,
    al.table_name,
    al.record_id,
    al.old_values,
    case
      when al.table_name = 'surat_signatures' and sr.judul_surat is not null then
        jsonb_set(coalesce(al.new_values, '{}'::jsonb), '{judul_surat}', to_jsonb(sr.judul_surat), true)
      else al.new_values
    end as new_values,
    al.created_at,
    p.full_name as profile_full_name,
    p.avatar_url as profile_avatar_url
  from public.activity_logs al
  left join public.profiles p on p.id = al.user_id
  left join public.surat_registrasi sr on sr.id = nullif(coalesce(al.new_values->>'surat_id', al.old_values->>'surat_id'), '')::uuid
  where al.user_id = auth.uid()
    and (
      (al.table_name = 'agendas' and al.action in ('INSERT'::public.activity_action, 'CREATE'::public.activity_action))
      or (al.table_name = 'surat_registrasi' and al.action in ('INSERT'::public.activity_action, 'CREATE'::public.activity_action))
      or (
        al.table_name = 'surat_signatures'
        and al.action = 'UPDATE'::public.activity_action
        and coalesce((al.old_values->>'is_signed')::boolean, false) = false
        and coalesce((al.new_values->>'is_signed')::boolean, false) = true
      )
    )
  order by al.created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

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

alter table public.activity_logs enable row level security;

drop policy if exists "Admins can read activity logs" on public.activity_logs;
drop policy if exists "Authenticated users can insert own auth audit events" on public.activity_logs;

create policy "Admins can read activity logs"
on public.activity_logs
for select
to authenticated
using (public.is_admin_user(auth.uid()));

grant execute on function public.is_admin_user(uuid) to authenticated;
grant execute on function public.get_my_recent_operational_activities(integer) to authenticated;
grant execute on function public.record_auth_audit_event(text) to authenticated;
