insert into public.master_departments (name, code, dept_index)
values
  ('Direktur', 'DIR', 10),
  ('Operasional Kost', 'OPK', 11),
  ('Branch Manager', 'BM', 12)
on conflict do nothing;

insert into public.master_department_aliases (department_id, alias_name, normalized_alias)
select d.id, seed.alias_name, seed.normalized_alias
from (
  values
    ('Direktur', 'Direktur Utama', 'direktur utama'),
    ('Direktur', 'Dirut', 'dirut'),
    ('Direktur', 'Direktur I', 'direktur i'),
    ('Direktur', 'Direktur 1', 'direktur 1'),
    ('Direktur', 'Dir 1', 'dir 1'),
    ('Direktur', 'Sekretaris Direksi', 'sekretaris direksi'),
    ('Operasional Kost', 'Operasional Kost', 'operasional kost'),
    ('Branch Manager', 'Cabang', 'cabang'),
    ('Branch Manager', 'Branch Manager', 'branch manager')
) as seed(target_department_name, alias_name, normalized_alias)
join public.master_departments d on d.name = seed.target_department_name
on conflict (normalized_alias)
do update set
  department_id = excluded.department_id,
  alias_name = excluded.alias_name,
  updated_at = now();
