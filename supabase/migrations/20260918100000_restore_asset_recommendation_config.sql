begin;

do $$
declare
  v_recommendation_usage_id uuid;
  v_recommendation_form_id uuid;
  v_pbo_department_id uuid;
  v_recommendation_letter_type_id uuid;
  v_uai_entity_id uuid;
  v_updated_count integer;
begin
  select usage.id, usage.form_id
  into v_recommendation_usage_id, v_recommendation_form_id
  from public.form_usages usage
  where usage.name = 'Rekomendasi Peremajaan Aset'
    and usage.status = 'active'
    and usage.is_system_template is true
  order by usage.updated_at desc nulls last, usage.created_at desc nulls last
  limit 1;

  select department.id
  into v_pbo_department_id
  from public.master_departments department
  where department.code = 'PBO'
     or lower(department.name) = lower('Pengembangan Organisasi')
  order by case when department.code = 'PBO' then 0 else 1 end
  limit 1;

  select letter_type.id
  into v_recommendation_letter_type_id
  from public.master_letter_types letter_type
  where upper(letter_type.code) = 'REK'
     or lower(letter_type.name) = lower('Rekomendasi')
  order by case when upper(letter_type.code) = 'REK' then 0 else 1 end
  limit 1;

  select entity.id
  into v_uai_entity_id
  from public.master_entities entity
  where upper(entity.code) = 'UAI'
  order by entity.id
  limit 1;

  if v_recommendation_usage_id is null or v_recommendation_form_id is null then
    raise exception 'Template aktif Rekomendasi Peremajaan Aset belum tersedia.';
  end if;
  if v_pbo_department_id is null then
    raise exception 'Departemen PBO untuk rekomendasi aset belum tersedia.';
  end if;
  if v_recommendation_letter_type_id is null then
    raise exception 'Jenis surat REK untuk rekomendasi aset belum tersedia.';
  end if;
  if v_uai_entity_id is null then
    raise exception 'Entitas UAI untuk rekomendasi aset belum tersedia.';
  end if;
  if not exists (
    select 1
    from public.form_usage_steps step
    join public.form_usage_step_users candidate on candidate.usage_step_id = step.id
    join public.profiles profile on profile.id = candidate.user_id
    where step.usage_id = v_recommendation_usage_id
      and step.step_order = 1
      and profile.is_active is true
      and profile.deleted_at is null
  ) then
    raise exception 'Kandidat aktif langkah pertama rekomendasi aset belum tersedia.';
  end if;

  update public.form_usages usage
  set recommendation_config = coalesce(usage.recommendation_config, '{}'::jsonb)
      || jsonb_build_object(
        'enabled', true,
        'optional', true,
        'required_before_step', 3,
        'form_id', v_recommendation_form_id,
        'usage_id', v_recommendation_usage_id,
        'department_id', v_pbo_department_id,
        'letter_type_id', v_recommendation_letter_type_id,
        'entity_id', v_uai_entity_id,
        'template_name', 'Rekomendasi Peremajaan Aset'
      ),
      updated_at = clock_timestamp()
  where usage.status = 'active'
    and usage.is_system_template is false
    and usage.request_category = 'asset'
    and usage.name in (
      'Pengajuan Aset - Kantor Pusat',
      'Pengajuan Aset HRD & GA - Kantor Pusat',
      'Pengajuan Aset - Kantor Cabang'
    );

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 3 then
    raise exception 'Konfigurasi rekomendasi aset hanya terpasang pada % dari 3 workflow kanonikal.', v_updated_count;
  end if;
end $$;

commit;
