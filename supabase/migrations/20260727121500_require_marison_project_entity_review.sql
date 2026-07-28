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
  if new.entity_id is null then
    v_reasons := array_append(v_reasons, 'Entitas proyek belum dipilih');
  end if;

  new.marison_review_reasons := v_reasons;
  new.marison_review_required := cardinality(v_reasons) > 0;
  return new;
end;
$$;

drop trigger if exists refresh_marison_project_review_trg on public.master_projects;
create trigger refresh_marison_project_review_trg
before insert or update of code, name, office_id, entity_id, marison_project_id, marison_review_reasons
on public.master_projects
for each row
execute function public.refresh_marison_project_review();

update public.master_projects
set entity_id = null
where marison_project_id is not null;
