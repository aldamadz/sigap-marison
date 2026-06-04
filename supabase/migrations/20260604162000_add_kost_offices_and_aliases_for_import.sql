with office_rows(code, name, kedudukan) as (
  values
    ('MKE', 'Maris Kost Ekslusif', 'Kost'),
    ('KPL', 'Kost Palur', 'Kost'),
    ('KPW', 'Kost Pakuwon', 'Kost'),
    ('KSR', 'Kost Slamet Riyadi', 'Kost')
)
insert into public.master_offices (code, name, kedudukan)
select code, name, kedudukan
from office_rows
on conflict (code) do update
set name = excluded.name,
    kedudukan = excluded.kedudukan;

with alias_rows(code, alias_name, normalized_alias) as (
  values
    ('MKE', 'MARIS KOST EKSLUSIF', 'maris kost ekslusif'),
    ('MKE', 'MARIS KOST EKSKLUSIF', 'maris kost eksklusif'),
    ('KPL', 'KOST PALUR', 'kost palur'),
    ('KPW', 'KOST PAKUWON', 'kost pakuwon'),
    ('KSR', 'KOST SLAMET RIYADI', 'kost slamet riyadi')
)
insert into public.master_office_aliases (office_id, alias_name, normalized_alias)
select o.id, a.alias_name, a.normalized_alias
from alias_rows a
join public.master_offices o on o.code = a.code
on conflict (normalized_alias) do update
set office_id = excluded.office_id,
    alias_name = excluded.alias_name,
    updated_at = now();
