do $$
declare
  v_usage_id constant uuid := '7106caa6-057e-4686-9420-954595c67722';
  v_usage_name constant text := 'Permohonan Teknik Cabang';
  v_current_category text;
begin
  select request_category
  into v_current_category
  from public.form_usages
  where id = v_usage_id
    and name = v_usage_name;

  if not found then
    raise exception
      'Kegunaan form % (%) tidak ditemukan; klasifikasi Non Unit tidak diterapkan.',
      v_usage_name,
      v_usage_id;
  end if;

  if v_current_category not in ('non_asset', 'non_unit') then
    raise exception
      'Kategori kegunaan form % tidak sesuai ekspektasi: %.',
      v_usage_name,
      v_current_category;
  end if;

  update public.form_usages
  set request_category = 'non_unit',
      updated_at = now()
  where id = v_usage_id
    and name = v_usage_name
    and request_category = 'non_asset';
end
$$;

