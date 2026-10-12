-- Disposable integration test for [UJI STAGING] single-account fixtures.
-- Covers: canonical unchanged, prefix, same form/category/scope/integration,
-- single tester resolution, action/input preserved, attachments identical,
-- recommendation linkage, no other candidates, idempotent, no production ids,
-- archive plan only fixtures.
do $$
declare
  v_count integer;
  v_tester uuid;
  v_rec_clone uuid;
  v_rec_canonical uuid;
  v_usage record;
  v_step record;
  v_src_id uuid;
begin
  select id into v_tester from public.profiles
  where email = 'system.tuyemaris@gmail.com' limit 1;
  if v_tester is null then
    raise exception 'fixture test: tester not seeded';
  end if;

  -- 1. Canonical unchanged.
  select count(*) into v_count from public.form_usages
  where status = 'active' and name not like '[UJI STAGING]%'
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
    where status='active' and name not like '[UJI STAGING]%' and name like '%UJI%') then
    raise exception 'canonical polluted with test prefix';
  end if;

  -- 2. Clones have prefix.
  select count(*) into v_count from public.form_usages
  where status='active' and name like '[UJI STAGING]%';
  if v_count <> 9 then raise exception 'expected 9 clones, got %', v_count; end if;
  if exists (select 1 from public.form_usages
    where status='active' and name like '[UJI STAGING]%'
      and (coalesce(description,'') not ilike '%Khusus pengujian staging%'
        or coalesce(description,'') not ilike '%system.tuyemaris@gmail.com%')) then
    raise exception 'clone missing staging-only description or tester account';
  end if;

  -- 3. Same form/category/scope/integration.
  if exists (
    select 1 from public.form_usages clone
    join public.form_usages src
      on src.name = replace(clone.name, '[UJI STAGING] ', '')
     and src.status='active'
     and ((src.is_system_template is true and src.name='Rekomendasi Peremajaan Aset')
       or (src.is_system_template is false))
    where clone.status='active' and clone.name like '[UJI STAGING]%'
      and (clone.form_id is distinct from src.form_id
        or clone.request_category is distinct from src.request_category
        or clone.scope_type is distinct from src.scope_type
        or coalesce(clone.route_id::text,'') is distinct from coalesce(src.route_id::text,'')
        or clone.external_revision_policy is distinct from src.external_revision_policy)
  ) then raise exception 'clone form/category/scope/integration differs'; end if;

  -- 4+8. Single tester resolution, no other candidates.
  for v_usage in select * from public.form_usages
    where status='active' and name like '[UJI STAGING]%' loop
    for v_step in select * from public.form_usage_steps where usage_id=v_usage.id loop
      if v_step.assignee_mode='select' then
        select count(*) into v_count from public.form_usage_step_users
        where usage_step_id=v_step.id;
        if v_count <> 1 then
          raise exception 'clone % step % must have exactly 1 candidate, got %',
            v_usage.name, v_step.step_order, v_count;
        end if;
        if not exists (select 1 from public.form_usage_step_users
          where usage_step_id=v_step.id and user_id=v_tester) then
          raise exception 'clone % step % not resolved to tester', v_usage.name, v_step.step_order;
        end if;
      else
        if exists (select 1 from public.form_usage_step_users where usage_step_id=v_step.id) then
          raise exception 'requester clone % step % must have no candidates', v_usage.name, v_step.step_order;
        end if;
      end if;
    end loop;
    -- Verifiers: where source had verifiers, clone has only tester.
    select id into v_src_id from public.form_usages
    where name = replace(v_usage.name, '[UJI STAGING] ', '') and status='active' limit 1;
    for v_step in select * from public.form_usage_steps where usage_id=v_usage.id loop
      select count(*) into v_count from public.form_usage_step_verifiers
      where usage_step_id = (select id from public.form_usage_steps
        where usage_id=v_src_id and step_order=v_step.step_order limit 1);
      if v_count > 0 then
        select count(*) into v_count from public.form_usage_step_verifiers
        where usage_step_id=v_step.id;
        if v_count <> 1 then
          raise exception 'clone % step % verifier must be exactly tester', v_usage.name, v_step.step_order;
        end if;
        if not exists (select 1 from public.form_usage_step_verifiers
          where usage_step_id=v_step.id and user_id=v_tester) then
          raise exception 'clone % step % verifier not tester', v_usage.name, v_step.step_order;
        end if;
      end if;
    end loop;
  end loop;
  if exists (
    select 1 from public.form_usage_step_users u
    join public.form_usage_steps s on s.id=u.usage_step_id
    join public.form_usages f on f.id=s.usage_id
    where f.status='active' and f.name like '[UJI STAGING]%' and u.user_id <> v_tester
  ) then raise exception 'other candidate user in fixtures'; end if;
  if exists (
    select 1 from public.form_usage_step_verifiers v
    join public.form_usage_steps s on s.id=v.usage_step_id
    join public.form_usages f on f.id=s.usage_id
    where f.status='active' and f.name like '[UJI STAGING]%' and v.user_id <> v_tester
  ) then raise exception 'other verifier in fixtures'; end if;

  -- 5. Action type and extra input preserved.
  if exists (
    select 1 from public.form_usage_steps cs
    join public.form_usages cf on cf.id=cs.usage_id
    join public.form_usages sf on sf.name=replace(cf.name,'[UJI STAGING] ','') and sf.status='active'
    join public.form_usage_steps ss on ss.usage_id=sf.id and ss.step_order=cs.step_order
    where cf.status='active' and cf.name like '[UJI STAGING]%'
      and (cs.action_type is distinct from ss.action_type
        or cs.role_name is distinct from ss.role_name
        or cs.label is distinct from ss.label
        or cs.assignee_mode is distinct from ss.assignee_mode
        or cs.input_schema is distinct from ss.input_schema
        or cs.step_order <> ss.step_order)
  ) then raise exception 'action/input parity failed'; end if;
  -- Step counts per clone match source.
  for v_usage in select * from public.form_usages
    where status='active' and name like '[UJI STAGING]%' loop
    select id into v_src_id from public.form_usages
    where name=replace(v_usage.name,'[UJI STAGING] ','') and status='active' limit 1;
    select count(*) into v_count from public.form_usage_steps where usage_id=v_usage.id;
    if v_count <> (select count(*) from public.form_usage_steps where usage_id=v_src_id) then
      raise exception 'step count differs for %', v_usage.name;
    end if;
  end loop;

  -- Visibility: same-department parity (minimal possible without per-user ACL).
  -- Schema only supports department-level visibility; same-dept users can still
  -- see fixtures (documented risk, no name-based bypass).
  if exists (
    with src as (
      select sf.name as n, d.department_id
      from public.form_usage_departments d
      join public.form_usages sf on sf.id=d.usage_id
      where sf.status='active' and sf.name not like '[UJI STAGING]%'
    ), cln as (
      select replace(cf.name,'[UJI STAGING] ','') as n, d.department_id
      from public.form_usage_departments d
      join public.form_usages cf on cf.id=d.usage_id
      where cf.status='active' and cf.name like '[UJI STAGING]%'
    )
    select 1 from (
      (select * from src except select * from cln)
      union all
      (select * from cln except select * from src)
    ) d
  ) then raise exception 'department visibility differs from canonical'; end if;
  if exists (
    select 1 from public.form_usages
    where status='active' and name like '[UJI STAGING]%'
      and (name not like '[UJI STAGING] %' or left(name, 13) <> '[UJI STAGING]')
  ) then raise exception 'fixture prefix unclear'; end if;

  -- 6. Attachments identical (remapped step).
  if exists (
    with src as (
      select sf.name as n, r.stage_order, r.requirement_key, r.label,
        r.is_required, r.allow_multiple, r.min_files, r.max_files,
        r.allowed_types, r.max_size_bytes
      from public.form_usage_attachment_requirements r
      join public.form_usages sf on sf.id=r.usage_id
      where sf.status='active' and sf.name not like '[UJI STAGING]%'
    ), cln as (
      select replace(cf.name,'[UJI STAGING] ','') as n, r.stage_order, r.requirement_key, r.label,
        r.is_required, r.allow_multiple, r.min_files, r.max_files,
        r.allowed_types, r.max_size_bytes
      from public.form_usage_attachment_requirements r
      join public.form_usages cf on cf.id=r.usage_id
      where cf.status='active' and cf.name like '[UJI STAGING]%'
    )
    select 1 from (
      (select * from src except select * from cln)
      union all
      (select * from cln except select * from src)
    ) d
  ) then raise exception 'attachment parity failed'; end if;

  -- 7. Recommendation linkage valid.
  select id into v_rec_clone from public.form_usages
  where name='[UJI STAGING] Rekomendasi Peremajaan Aset' and status='active' limit 1;
  if v_rec_clone is null then raise exception 'rec clone missing'; end if;
  select id into v_rec_canonical from public.form_usages
  where name='Rekomendasi Peremajaan Aset' and status='active' and is_system_template is true limit 1;
  for v_usage in select * from public.form_usages
    where status='active' and name like '[UJI STAGING]%'
      and request_category='asset' and name <> '[UJI STAGING] Rekomendasi Peremajaan Aset' loop
    if not ((v_usage.recommendation_config->>'enabled')::boolean is true) then
      raise exception 'asset clone % missing recommendation enabled', v_usage.name;
    end if;
    if (v_usage.recommendation_config->>'usage_id') <> v_rec_clone::text then
      raise exception 'asset clone % not linked to rec clone', v_usage.name;
    end if;
  end loop;
  -- Canonical asset linkage still points to canonical template.
  if exists (
    select 1 from public.form_usages
    where status='active' and name not like '[UJI STAGING]%' and request_category='asset'
      and (recommendation_config ? 'enabled')
      and ((recommendation_config->>'enabled')::boolean is true)
      and (recommendation_config->>'usage_id') <> v_rec_canonical::text
  ) then raise exception 'canonical recommendation linkage disturbed'; end if;
  -- Rec clone has no stage-1 attachment (auto-approval fix preserved).
  if exists (select 1 from public.form_usage_attachment_requirements
    where usage_id=v_rec_clone and stage_order=1) then
    raise exception 'rec clone stage-1 attachment breaks auto-approval';
  end if;

  -- 9. Idempotent: no duplicate names.
  if exists (select name, count(*) from public.form_usages
    where status='active' group by name having count(*) > 1) then
    raise exception 'duplicate usage names (not idempotent)';
  end if;

  -- 10. No production identifiers in fixtures.
  if exists (select 1 from public.form_usages
    where status='active' and name like '[UJI STAGING]%'
      and is_system_template is true and name <> '[UJI STAGING] Rekomendasi Peremajaan Aset') then
    raise exception 'is_system_template misused';
  end if;
  if exists (select 1 from public.form_usages
    where status='active' and name like '[UJI STAGING]%'
      and (name ilike '%production%' or coalesce(description,'') ilike '%production%')) then
    raise exception 'fixture mentions production';
  end if;

  -- 11. Archive plan only fixtures (simulate).
  update public.form_usages set status='archived'
  where name like '[UJI STAGING]%' and status='active';
  if (select count(*) from public.form_usages where status='active' and name like '[UJI STAGING]%') <> 0 then
    raise exception 'archive did not disable all fixtures';
  end if;
  if (select count(*) from public.form_usages
    where status='active' and name not like '[UJI STAGING]%'
      and name in ('SPK Unit - Kantor Pusat','Pengajuan Aset - Kantor Pusat',
        'Pengajuan Aset HRD & GA - Kantor Pusat','Pengajuan Dana - Kantor Pusat',
        'Pengajuan Dana HRD & GA - Kantor Pusat','SPK Non Unit - Kantor Cabang',
        'Pengajuan Aset - Kantor Cabang','Pengajuan Dana - Kantor Cabang',
        'Rekomendasi Peremajaan Aset')) <> 9 then
    raise exception 'archive touched canonical';
  end if;
  -- Restore for other checks (disposable DB only).
  update public.form_usages set status='active' where name like '[UJI STAGING]%';

  raise notice 'STAGING single-account fixtures: all assertions passed';
end $$;
