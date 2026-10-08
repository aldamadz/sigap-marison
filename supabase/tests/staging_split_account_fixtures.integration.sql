-- Disposable integration test for split-account [UJI STAGING PUSAT/CABANG] fixtures.
-- Covers: 8 selectable, 2 internal templates, per-scope visibility, same
-- form/category/scope/integration, single-tester resolution per scope,
-- action/input/attachment parity, recommendation linkage per scope,
-- canonical unchanged, idempotent names, archive simulation.
do $$
declare
  v_count integer;
  v_pusat uuid;
  v_cabang uuid;
  v_pusat_dept uuid;
  v_cabang_dept uuid;
  v_rec_pusat uuid;
  v_rec_cabang uuid;
  v_rec_canonical uuid;
  v_usage record;
  v_step record;
  v_src_id uuid;
begin
  select id, department_id into v_pusat, v_pusat_dept from public.profiles
  where email = 'system.tuyemaris@gmail.com' limit 1;
  select id, department_id into v_cabang, v_cabang_dept from public.profiles
  where email = 'faizalsyahiddin@gmail.com' limit 1;
  if v_pusat is null or v_cabang is null then
    raise exception 'fixture test: testers not seeded';
  end if;

  -- 16. Canonical unchanged.
  select count(*) into v_count from public.form_usages
  where status = 'active' and name not like '[UJI STAGING%'
    and name in (
      'SPK Unit - Kantor Pusat','Pengajuan Aset - Kantor Pusat',
      'Pengajuan Aset HRD & GA - Kantor Pusat','Pengajuan Dana - Kantor Pusat',
      'Pengajuan Dana HRD & GA - Kantor Pusat','SPK Non Unit - Kantor Cabang',
      'Pengajuan Aset - Kantor Cabang','Pengajuan Dana - Kantor Cabang');
  if v_count <> 8 then raise exception 'canonical 8 changed, got %', v_count; end if;
  if not exists (select 1 from public.form_usages
    where name='Rekomendasi Peremajaan Aset' and status='active' and is_system_template is true) then
    raise exception 'canonical recommendation template changed';
  end if;
  if exists (select 1 from public.form_usages
    where status='active' and name like '[UJI STAGING]%') then
    raise exception 'legacy single-account fixture still active';
  end if;

  -- 1. Exactly 8 selectable fixtures (5 Pusat + 3 Cabang).
  select count(*) into v_count from public.form_usages
  where status='active' and is_system_template is false
    and (name like '[UJI STAGING PUSAT]%' or name like '[UJI STAGING CABANG]%');
  if v_count <> 8 then raise exception 'expected 8 selectable, got %', v_count; end if;
  select count(*) into v_count from public.form_usages
  where status='active' and is_system_template is false and name like '[UJI STAGING PUSAT]%';
  if v_count <> 5 then raise exception 'expected 5 Pusat selectable, got %', v_count; end if;
  select count(*) into v_count from public.form_usages
  where status='active' and is_system_template is false and name like '[UJI STAGING CABANG]%';
  if v_count <> 3 then raise exception 'expected 3 Cabang selectable, got %', v_count; end if;
  if exists (
    select 1 from (values
      ('[UJI STAGING PUSAT] Pengajuan SPK Unit'),
      ('[UJI STAGING PUSAT] Pengajuan Aset'),
      ('[UJI STAGING PUSAT] Pengajuan Aset HRD & GA'),
      ('[UJI STAGING PUSAT] Pengajuan Dana'),
      ('[UJI STAGING PUSAT] Pengajuan Dana HRD & GA'),
      ('[UJI STAGING CABANG] Pengajuan SPK Non Unit'),
      ('[UJI STAGING CABANG] Pengajuan Aset'),
      ('[UJI STAGING CABANG] Pengajuan Dana')
    ) expected(name)
    where not exists (
      select 1 from public.form_usages
      where status='active' and is_system_template is false and name = expected.name
    )
  ) then raise exception 'selectable fixture names differ from contract'; end if;

  -- 2. Exactly 2 internal templates.
  select count(*) into v_count from public.form_usages
  where status='active' and is_system_template is true
    and name in ('[UJI STAGING PUSAT] Rekomendasi Peremajaan Aset',
                 '[UJI STAGING CABANG] Rekomendasi Peremajaan Aset');
  if v_count <> 2 then raise exception 'expected 2 internal templates, got %', v_count; end if;
  select id into v_rec_pusat from public.form_usages
  where name='[UJI STAGING PUSAT] Rekomendasi Peremajaan Aset' and status='active' limit 1;
  select id into v_rec_cabang from public.form_usages
  where name='[UJI STAGING CABANG] Rekomendasi Peremajaan Aset' and status='active' limit 1;
  select id into v_rec_canonical from public.form_usages
  where name='Rekomendasi Peremajaan Aset' and status='active' and is_system_template is true limit 1;

  -- 3-5. Per-scope department ACL (tester dept only).
  for v_usage in select * from public.form_usages
    where status='active'
      and (name like '[UJI STAGING PUSAT]%' or name like '[UJI STAGING CABANG]%') loop
    if v_usage.name like '[UJI STAGING PUSAT]%' then
      if not exists (select 1 from public.form_usage_departments
        where usage_id=v_usage.id and department_id=v_pusat_dept) then
        raise exception 'Pusat fixture % missing Pusat dept', v_usage.name;
      end if;
      if exists (select 1 from public.form_usage_departments
        where usage_id=v_usage.id and department_id <> v_pusat_dept) then
        raise exception 'Pusat fixture % has extra dept', v_usage.name;
      end if;
      if exists (select 1 from public.form_usage_departments
        where usage_id=v_usage.id and department_id=v_cabang_dept) then
        raise exception 'Pusat fixture % visible to Cabang dept', v_usage.name;
      end if;
    else
      if not exists (select 1 from public.form_usage_departments
        where usage_id=v_usage.id and department_id=v_cabang_dept) then
        raise exception 'Cabang fixture % missing Cabang dept', v_usage.name;
      end if;
      if exists (select 1 from public.form_usage_departments
        where usage_id=v_usage.id and department_id <> v_cabang_dept) then
        raise exception 'Cabang fixture % has extra dept', v_usage.name;
      end if;
      if exists (select 1 from public.form_usage_departments
        where usage_id=v_usage.id and department_id=v_pusat_dept) then
        raise exception 'Cabang fixture % visible to Pusat dept', v_usage.name;
      end if;
    end if;
    if coalesce(v_usage.description,'') not ilike '%Khusus pengujian staging%'
       or coalesce(v_usage.description,'') not ilike '%Akun uji:%' then
      raise exception 'clone % missing staging/tester description', v_usage.name;
    end if;
  end loop;

  -- 6. Templates hidden from picker for both dept lenses.
  -- Picker contract: selectable = active AND not system template.
  -- Templates are active + system template, hence never selectable.
  select count(*) into v_count from public.form_usages u
  where u.status='active' and u.is_system_template is false
    and (u.name like '[UJI STAGING PUSAT]%' or u.name like '[UJI STAGING CABANG]%')
    and exists (select 1 from public.form_usage_departments d
      where d.usage_id=u.id and d.department_id=v_pusat_dept);
  if v_count <> 5 then raise exception 'Pusat lens sees %, want 5', v_count; end if;
  select count(*) into v_count from public.form_usages u
  where u.status='active' and u.is_system_template is false
    and (u.name like '[UJI STAGING PUSAT]%' or u.name like '[UJI STAGING CABANG]%')
    and exists (select 1 from public.form_usage_departments d
      where d.usage_id=u.id and d.department_id=v_cabang_dept);
  if v_count <> 3 then raise exception 'Cabang lens sees %, want 3', v_count; end if;

  -- Same form/category/scope/integration as canonical source.
  if exists (
    select 1 from public.form_usages clone
    join split_source_map src on src.clone_name = clone.name
    join public.form_usages origin on origin.name = src.source_name and origin.status='active'
    where clone.status='active'
      and (clone.form_id is distinct from origin.form_id
        or clone.request_category is distinct from origin.request_category
        or clone.scope_type is distinct from origin.scope_type
        or coalesce(clone.route_id::text,'') is distinct from coalesce(origin.route_id::text,'')
        or clone.external_revision_policy is distinct from origin.external_revision_policy)
  ) then raise exception 'clone form/category/scope/integration differs'; end if;

  -- Per-scope single-tester resolution, no other candidates.
  for v_usage in select * from public.form_usages
    where status='active'
      and (name like '[UJI STAGING PUSAT]%' or name like '[UJI STAGING CABANG]%') loop
    for v_step in select * from public.form_usage_steps where usage_id=v_usage.id loop
      if v_step.assignee_mode='select' then
        select count(*) into v_count from public.form_usage_step_users
        where usage_step_id=v_step.id;
        if v_count <> 1 then
          raise exception 'clone % step % must have exactly 1 candidate, got %',
            v_usage.name, v_step.step_order, v_count;
        end if;
        if v_usage.name like '[UJI STAGING PUSAT]%' then
          if not exists (select 1 from public.form_usage_step_users
            where usage_step_id=v_step.id and user_id=v_pusat) then
            raise exception 'Pusat clone % step % not resolved to Pusat tester', v_usage.name, v_step.step_order;
          end if;
        else
          if not exists (select 1 from public.form_usage_step_users
            where usage_step_id=v_step.id and user_id=v_cabang) then
            raise exception 'Cabang clone % step % not resolved to Cabang tester', v_usage.name, v_step.step_order;
          end if;
        end if;
      else
        if exists (select 1 from public.form_usage_step_users where usage_step_id=v_step.id) then
          raise exception 'requester clone % step % must have no candidates', v_usage.name, v_step.step_order;
        end if;
      end if;
    end loop;
  end loop;
  if exists (
    select 1 from public.form_usage_step_users u
    join public.form_usage_steps s on s.id=u.usage_step_id
    join public.form_usages f on f.id=s.usage_id
    where f.status='active'
      and (f.name like '[UJI STAGING PUSAT]%' or f.name like '[UJI STAGING CABANG]%')
      and u.user_id not in (v_pusat, v_cabang)
  ) then raise exception 'foreign candidate in fixtures'; end if;
  if exists (
    select 1 from public.form_usage_step_users u
    join public.form_usage_steps s on s.id=u.usage_step_id
    join public.form_usages f on f.id=s.usage_id
    where f.status='active' and f.name like '[UJI STAGING PUSAT]%' and u.user_id <> v_pusat
  ) then raise exception 'Cabang tester in Pusat fixture'; end if;
  if exists (
    select 1 from public.form_usage_step_users u
    join public.form_usage_steps s on s.id=u.usage_step_id
    join public.form_usages f on f.id=s.usage_id
    where f.status='active' and f.name like '[UJI STAGING CABANG]%' and u.user_id <> v_cabang
  ) then raise exception 'Pusat tester in Cabang fixture'; end if;

  -- Action/input parity + step counts vs canonical source.
  if exists (
    select 1 from public.form_usage_steps cs
    join public.form_usages cf on cf.id=cs.usage_id
    join split_source_map mp on mp.clone_name=cf.name
    join public.form_usages sf on sf.name=mp.source_name and sf.status='active'
    join public.form_usage_steps ss on ss.usage_id=sf.id and ss.step_order=cs.step_order
    where cf.status='active'
      and (cs.action_type is distinct from ss.action_type
        or cs.role_name is distinct from ss.role_name
        or cs.label is distinct from ss.label
        or cs.assignee_mode is distinct from ss.assignee_mode
        or cs.input_schema is distinct from ss.input_schema
        or cs.signer_department_id is distinct from ss.signer_department_id)
  ) then raise exception 'action/input parity failed'; end if;
  for v_usage in select * from public.form_usages
    where status='active'
      and (name like '[UJI STAGING PUSAT]%' or name like '[UJI STAGING CABANG]%')
      and is_system_template is false loop
    select count(*) into v_count from public.form_usage_steps where usage_id=v_usage.id;
    if v_count <> (select count(*) from public.form_usage_steps ss
      join public.form_usages sf on sf.id=ss.usage_id
      join split_source_map mp on mp.source_name=sf.name
      where mp.clone_name=v_usage.name and sf.status='active') then
      raise exception 'step count differs for %', v_usage.name;
    end if;
  end loop;

  -- Attachments identical to source (remapped step).
  if exists (
    with src as (
      select mp.clone_name as n, r.stage_order, r.requirement_key, r.label,
        r.is_required, r.allow_multiple, r.min_files, r.max_files,
        r.allowed_types, r.max_size_bytes
      from public.form_usage_attachment_requirements r
      join public.form_usages sf on sf.id=r.usage_id
      join split_source_map mp on mp.source_name=sf.name
      where sf.status='active'
    ), cln as (
      select cf.name as n, r.stage_order, r.requirement_key, r.label,
        r.is_required, r.allow_multiple, r.min_files, r.max_files,
        r.allowed_types, r.max_size_bytes
      from public.form_usage_attachment_requirements r
      join public.form_usages cf on cf.id=r.usage_id
      where cf.status='active'
        and (cf.name like '[UJI STAGING PUSAT]%' or cf.name like '[UJI STAGING CABANG]%')
        and cf.is_system_template is false
    )
    select 1 from (
      (select * from src except select * from cln)
      union all
      (select * from cln except select * from src)
    ) d
  ) then raise exception 'attachment parity failed'; end if;

  -- 7-8. Recommendation linkage per scope.
  for v_usage in select * from public.form_usages
    where status='active' and is_system_template is false
      and request_category='asset'
      and (name like '[UJI STAGING PUSAT]%' or name like '[UJI STAGING CABANG]%') loop
    if not ((v_usage.recommendation_config->>'enabled')::boolean is true) then
      raise exception 'asset clone % missing recommendation enabled', v_usage.name;
    end if;
    if v_usage.name like '[UJI STAGING PUSAT]%'
       and (v_usage.recommendation_config->>'usage_id') <> v_rec_pusat::text then
      raise exception 'Pusat asset % not linked to Pusat template', v_usage.name;
    end if;
    if v_usage.name like '[UJI STAGING CABANG]%'
       and (v_usage.recommendation_config->>'usage_id') <> v_rec_cabang::text then
      raise exception 'Cabang asset % not linked to Cabang template', v_usage.name;
    end if;
  end loop;
  if exists (
    select 1 from public.form_usages
    where status='active' and name not like '[UJI STAGING%' and request_category='asset'
      and (recommendation_config ? 'enabled')
      and ((recommendation_config->>'enabled')::boolean is true)
      and (recommendation_config->>'usage_id') <> v_rec_canonical::text
  ) then raise exception 'canonical recommendation linkage disturbed'; end if;
  if exists (select 1 from public.form_usage_attachment_requirements
    where usage_id in (v_rec_pusat, v_rec_cabang) and stage_order=1) then
    raise exception 'internal template re-requests creator attachment';
  end if;

  -- 17. Idempotent names.
  if exists (select name, count(*) from public.form_usages
    where status='active' group by name having count(*) > 1) then
    raise exception 'duplicate usage names (not idempotent)';
  end if;
  if exists (select 1 from public.form_usages
    where status='active'
      and (name like '[UJI STAGING PUSAT]%' or name like '[UJI STAGING CABANG]%')
      and is_system_template is true and name not like '%Rekomendasi Peremajaan Aset') then
    raise exception 'is_system_template misused';
  end if;

  -- 18. Archive simulation: new prefixes only, canonical intact.
  update public.form_usages set status='archived'
  where status='active'
    and (name like '[UJI STAGING PUSAT]%' or name like '[UJI STAGING CABANG]%');
  if (select count(*) from public.form_usages
    where status='active'
      and (name like '[UJI STAGING PUSAT]%' or name like '[UJI STAGING CABANG]%')) <> 0 then
    raise exception 'archive did not disable all fixtures';
  end if;
  if (select count(*) from public.form_usages
    where status='active' and name not like '[UJI STAGING%') <> 9 then
    raise exception 'archive touched canonical';
  end if;
  update public.form_usages set status='active'
  where name like '[UJI STAGING PUSAT]%' or name like '[UJI STAGING CABANG]%';

  raise notice 'SPLIT single-account fixtures: all assertions passed';
end $$;
