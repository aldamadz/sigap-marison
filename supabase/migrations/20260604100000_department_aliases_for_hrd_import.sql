create table if not exists public.master_department_aliases (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.master_departments(id) on delete cascade,
  alias_name text not null,
  normalized_alias text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.master_department_aliases enable row level security;

drop policy if exists "master_department_aliases_select_authenticated" on public.master_department_aliases;
create policy "master_department_aliases_select_authenticated"
on public.master_department_aliases for select
to authenticated
using (true);

drop policy if exists "master_department_aliases_admin_write" on public.master_department_aliases;
create policy "master_department_aliases_admin_write"
on public.master_department_aliases for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

insert into public.master_department_aliases (department_id, alias_name, normalized_alias)
select d.id, seed.alias_name, seed.normalized_alias
from (
  values
    ('Legal Proyek', 'Legal Proyek & Humas', 'legal proyek humas'),
    ('Marketing (Cabang)', 'Marketing Cabang', 'marketing cabang'),
    ('Teknik (Cabang)', 'Teknik', 'teknik'),
    ('Umum & Keuangan (Cabang)', 'Umum & Keuangan', 'umum keuangan')
) as seed(target_department_name, alias_name, normalized_alias)
join public.master_departments d on d.name = seed.target_department_name
on conflict (normalized_alias)
do update set
  department_id = excluded.department_id,
  alias_name = excluded.alias_name,
  updated_at = now();
