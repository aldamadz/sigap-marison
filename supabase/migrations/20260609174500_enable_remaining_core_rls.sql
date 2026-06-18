alter table if exists public.agendas enable row level security;
alter table if exists public.offices enable row level security;
alter table if exists public.master_offices enable row level security;
alter table if exists public.master_projects enable row level security;
alter table if exists public.master_dept_letter_types enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'offices',
    'master_offices',
    'master_projects',
    'master_dept_letter_types'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;

    execute format('drop policy if exists %I_authenticated_read on public.%I', table_name, table_name);
    execute format(
      'create policy %I_authenticated_read on public.%I for select to authenticated using (true)',
      table_name,
      table_name
    );

    execute format('drop policy if exists %I_admin_insert on public.%I', table_name, table_name);
    execute format(
      'create policy %I_admin_insert on public.%I for insert to authenticated with check (public.is_current_user_admin())',
      table_name,
      table_name
    );

    execute format('drop policy if exists %I_admin_update on public.%I', table_name, table_name);
    execute format(
      'create policy %I_admin_update on public.%I for update to authenticated using (public.is_current_user_admin()) with check (public.is_current_user_admin())',
      table_name,
      table_name
    );

    execute format('drop policy if exists %I_admin_delete on public.%I', table_name, table_name);
    execute format(
      'create policy %I_admin_delete on public.%I for delete to authenticated using (public.is_current_user_admin())',
      table_name,
      table_name
    );
  end loop;
end;
$$;

comment on table public.master_projects is
  'Master proyek dengan RLS aktif: user terautentikasi dapat membaca dan hanya admin dapat mengubah.';

