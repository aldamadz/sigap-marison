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
    case
      when new.raw_user_meta_data->>'role' in ('admin', 'user') then (new.raw_user_meta_data->>'role')::public.user_role
      else 'user'::public.user_role
    end,
    nullif(new.raw_user_meta_data->>'department_id', '')::uuid,
    nullif(new.raw_user_meta_data->>'office_id', '')::uuid,
    nullif(new.raw_user_meta_data->>'parent_id', '')::uuid,
    true
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = excluded.full_name,
    nik = excluded.nik,
    job_title = excluded.job_title,
    role = excluded.role,
    department_id = excluded.department_id,
    office_id = excluded.office_id,
    parent_id = excluded.parent_id,
    is_active = true,
    updated_at = now();

  return new;
end;
$$;
