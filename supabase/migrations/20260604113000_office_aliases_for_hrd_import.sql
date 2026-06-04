create table if not exists public.master_office_aliases (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.master_offices(id) on delete cascade,
  alias_name text not null,
  normalized_alias text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.master_office_aliases enable row level security;

drop policy if exists "master_office_aliases_select_authenticated" on public.master_office_aliases;
create policy "master_office_aliases_select_authenticated"
on public.master_office_aliases for select
to authenticated
using (true);

drop policy if exists "master_office_aliases_admin_write" on public.master_office_aliases;
create policy "master_office_aliases_admin_write"
on public.master_office_aliases for all
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

insert into public.master_offices (code, name, kedudukan)
values ('KSR', 'Kost Slamet Riyadi', 'Kost')
on conflict (code) do nothing;

insert into public.master_office_aliases (office_id, alias_name, normalized_alias)
select o.id, seed.alias_name, seed.normalized_alias
from (
  values
    ('Kantor Pusat', 'KANTOR PUSAT', 'kantor pusat'),
    ('Madiun', 'KC MADIUN', 'kc madiun'),
    ('Purworejo', 'KC PURWOREJO', 'kc purworejo'),
    ('Wonosari', 'KCP WONOSARI', 'kcp wonosari'),
    ('Pati', 'KCP PATI', 'kcp pati'),
    ('Malang', 'KC MALANG', 'kc malang'),
    ('Jepara', 'KC JEPARA', 'kc jepara'),
    ('Magelang', 'KC MAGELANG', 'kc magelang'),
    ('Bandung', 'KC BANDUNG', 'kc bandung'),
    ('Batang', 'KC BATANG', 'kc batang'),
    ('Wonogiri', 'KCP WONOGIRI', 'kcp wonogiri'),
    ('Tegal', 'KCP TEGAL', 'kcp tegal'),
    ('Solo', 'KC SOLO', 'kc solo'),
    ('Sragen', 'KCP SRAGEN', 'kcp sragen'),
    ('Karanganyar', 'KCP KARANGANYAR', 'kcp karanganyar'),
    ('Kost Slamet Riyadi', 'KOST SLAMET RIYADI', 'kost slamet riyadi')
) as seed(target_office_name, alias_name, normalized_alias)
join public.master_offices o on o.name = seed.target_office_name
on conflict (normalized_alias)
do update set
  office_id = excluded.office_id,
  alias_name = excluded.alias_name,
  updated_at = now();
