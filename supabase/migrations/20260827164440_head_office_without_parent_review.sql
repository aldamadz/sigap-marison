create or replace function public.refresh_marison_office_review()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_reasons text[] := '{}'::text[];
begin
  if new.kedudukan = 'Pusat' then
    new.parent_id := null;
    new.marison_hierarchy_confirmed := true;
  end if;

  if new.marison_branch_id is null then
    new.marison_review_required := false;
    new.marison_review_reasons := '{}'::text[];
    return new;
  end if;

  if nullif(btrim(coalesce(new.code, '')), '') is null then
    v_reasons := array_append(v_reasons, 'Kode kantor belum diisi');
  end if;
  if nullif(btrim(coalesce(new.name, '')), '') is null then
    v_reasons := array_append(v_reasons, 'Nama kantor belum diisi');
  end if;
  if coalesce(new.kedudukan, '') not in ('Pusat', 'KC', 'KCP', 'Kost') then
    v_reasons := array_append(v_reasons, 'Kedudukan kantor belum valid');
  end if;
  if new.kedudukan in ('KCP', 'Kost') and new.parent_id is null then
    v_reasons := array_append(v_reasons, 'Kantor induk belum dipilih');
  end if;
  if new.kedudukan <> 'Pusat' and not coalesce(new.marison_hierarchy_confirmed, false) then
    v_reasons := array_append(v_reasons, 'Hirarki hasil deteksi nama belum dikonfirmasi');
  end if;

  new.marison_review_reasons := v_reasons;
  new.marison_review_required := cardinality(v_reasons) > 0;
  return new;
end;
$$;

update public.master_offices
set
  parent_id = null,
  marison_hierarchy_confirmed = true
where kedudukan = 'Pusat'
  and (
    parent_id is not null
    or not coalesce(marison_hierarchy_confirmed, false)
    or coalesce(marison_review_required, false)
    or cardinality(coalesce(marison_review_reasons, '{}'::text[])) > 0
  );
