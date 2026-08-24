create or replace function public.refresh_marison_project_review()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_reasons text[] := '{}'::text[];
begin
  if new.marison_project_id is null then
    new.marison_review_required := false;
    new.marison_review_reasons := '{}'::text[];
    return new;
  end if;

  if 'Branch proyek external belum tersedia' = any(coalesce(new.marison_review_reasons, '{}'::text[])) then
    v_reasons := array_append(v_reasons, 'Branch proyek external belum tersedia');
  end if;
  if nullif(btrim(coalesce(new.code, '')), '') is null then
    v_reasons := array_append(v_reasons, 'Kode proyek belum diisi');
  end if;
  if nullif(btrim(coalesce(new.name, '')), '') is null then
    v_reasons := array_append(v_reasons, 'Nama proyek belum diisi');
  end if;
  if new.office_id is null then
    v_reasons := array_append(v_reasons, 'Kantor proyek belum dipetakan');
  elsif not exists (
    select 1
    from public.master_offices o
    where o.id = new.office_id
      and o.marison_branch_id is not null
  ) then
    v_reasons := array_append(v_reasons, 'Kantor proyek belum memiliki ID branch external');
  end if;

  new.marison_review_reasons := v_reasons;
  new.marison_review_required := cardinality(v_reasons) > 0;
  return new;
end;
$$;

update public.master_projects
set marison_review_required = true,
    marison_review_reasons = array['Branch proyek external belum tersedia']::text[]
where marison_project_id = 12
  and code = 'NKMZ7';
