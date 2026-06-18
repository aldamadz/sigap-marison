create or replace function public.save_form_usage_config(
  p_usage_id uuid,
  p_payload jsonb,
  p_department_ids uuid[],
  p_steps jsonb,
  p_attachments jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage_id uuid;
  v_department_id uuid;
  v_step jsonb;
  v_attachment jsonb;
  v_step_id uuid;
  v_step_map jsonb := '{}'::jsonb;
  v_user_id uuid;
  v_stage_order integer;
  v_usage_step_id uuid;
  v_step_orders integer[] := array[]::integer[];
begin
  if not public.is_current_user_admin() then
    raise exception 'Akses ditolak: hanya admin'
      using errcode = '42501';
  end if;

  if p_usage_id is null then
    insert into public.form_usages (
      name,
      description,
      form_id,
      route_id,
      request_category,
      scope_type,
      status,
      sort_order,
      updated_at,
      created_by
    )
    values (
      nullif(trim(p_payload->>'name'), ''),
      nullif(trim(p_payload->>'description'), ''),
      nullif(p_payload->>'form_id', '')::uuid,
      nullif(p_payload->>'route_id', '')::uuid,
      coalesce(nullif(p_payload->>'request_category', ''), 'non_unit'),
      coalesce(nullif(p_payload->>'scope_type', ''), 'all'),
      coalesce(nullif(p_payload->>'status', ''), 'draft'),
      coalesce((p_payload->>'sort_order')::integer, 0),
      now(),
      auth.uid()
    )
    returning id into v_usage_id;
  else
    update public.form_usages
    set
      name = nullif(trim(p_payload->>'name'), ''),
      description = nullif(trim(p_payload->>'description'), ''),
      form_id = nullif(p_payload->>'form_id', '')::uuid,
      route_id = nullif(p_payload->>'route_id', '')::uuid,
      request_category = coalesce(nullif(p_payload->>'request_category', ''), request_category),
      scope_type = coalesce(nullif(p_payload->>'scope_type', ''), scope_type),
      status = coalesce(nullif(p_payload->>'status', ''), status),
      sort_order = coalesce((p_payload->>'sort_order')::integer, sort_order),
      updated_at = now()
    where id = p_usage_id
    returning id into v_usage_id;

    if v_usage_id is null then
      raise exception 'Kegunaan form tidak ditemukan'
        using errcode = 'P0002';
    end if;
  end if;

  delete from public.form_usage_attachment_requirements
  where usage_id = v_usage_id;
  delete from public.form_usage_departments
  where usage_id = v_usage_id;

  if p_department_ids is not null then
    foreach v_department_id in array p_department_ids
    loop
      if v_department_id is not null then
        insert into public.form_usage_departments (usage_id, department_id)
        values (v_usage_id, v_department_id);
      end if;
    end loop;
  end if;

  for v_step in select * from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb))
  loop
    v_step_orders := array_append(v_step_orders, (v_step->>'step_order')::integer);

    select id
    into v_step_id
    from public.form_usage_steps
    where usage_id = v_usage_id
      and step_order = (v_step->>'step_order')::integer;

    if v_step_id is null then
      insert into public.form_usage_steps (
        usage_id,
        step_order,
        role_name,
        label,
        signer_department_id,
        action_type
      )
      values (
        v_usage_id,
        (v_step->>'step_order')::integer,
        coalesce(nullif(v_step->>'role_name', ''), 'memeriksa'),
        nullif(trim(v_step->>'label'), ''),
        nullif(v_step->>'signer_department_id', '')::uuid,
        coalesce(nullif(v_step->>'action_type', ''), 'approval')
      )
      returning id into v_step_id;
    else
      update public.form_usage_steps
      set
        role_name = coalesce(nullif(v_step->>'role_name', ''), role_name),
        label = coalesce(nullif(trim(v_step->>'label'), ''), label),
        signer_department_id = nullif(v_step->>'signer_department_id', '')::uuid,
        action_type = coalesce(nullif(v_step->>'action_type', ''), action_type)
      where id = v_step_id;
    end if;

    delete from public.form_usage_step_users
    where usage_step_id = v_step_id;

    v_step_map := jsonb_set(
      v_step_map,
      array[(v_step->>'step_order')],
      to_jsonb(v_step_id::text),
      true
    );

    for v_user_id in
      select value::uuid
      from jsonb_array_elements_text(coalesce(v_step->'eligible_user_ids', '[]'::jsonb)) as value
    loop
      insert into public.form_usage_step_users (usage_step_id, user_id)
      values (v_step_id, v_user_id);
    end loop;
  end loop;

  delete from public.form_usage_step_users
  where usage_step_id in (
    select step.id
    from public.form_usage_steps step
    where step.usage_id = v_usage_id
      and not (step.step_order = any(v_step_orders))
      and not exists (
        select 1
        from public.surat_signatures signature
        where signature.form_usage_step_id = step.id
      )
  );

  delete from public.form_usage_steps step
  where step.usage_id = v_usage_id
    and not (step.step_order = any(v_step_orders))
    and not exists (
      select 1
      from public.surat_signatures signature
      where signature.form_usage_step_id = step.id
    );

  for v_attachment in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb))
  loop
    v_stage_order := coalesce((v_attachment->>'stage_order')::integer, 0);
    v_usage_step_id := case
      when v_stage_order = 0 then null
      else nullif(v_step_map->>v_stage_order::text, '')::uuid
    end;

    insert into public.form_usage_attachment_requirements (
      usage_id,
      usage_step_id,
      stage_order,
      requirement_key,
      label,
      is_required,
      allow_multiple,
      min_files,
      max_files,
      allowed_types,
      max_size_bytes,
      sort_order
    )
    values (
      v_usage_id,
      v_usage_step_id,
      v_stage_order,
      nullif(trim(v_attachment->>'requirement_key'), ''),
      nullif(trim(v_attachment->>'label'), ''),
      coalesce((v_attachment->>'is_required')::boolean, true),
      coalesce((v_attachment->>'allow_multiple')::boolean, false),
      coalesce((v_attachment->>'min_files')::integer, 1),
      coalesce((v_attachment->>'max_files')::integer, 1),
      coalesce(array(select jsonb_array_elements_text(v_attachment->'allowed_types')), array[]::text[]),
      nullif(v_attachment->>'max_size_bytes', '')::bigint,
      coalesce((v_attachment->>'sort_order')::integer, 0)
    );
  end loop;

  return v_usage_id;
end;
$$;

revoke all on function public.save_form_usage_config(uuid, jsonb, uuid[], jsonb, jsonb) from public, anon;
grant execute on function public.save_form_usage_config(uuid, jsonb, uuid[], jsonb, jsonb) to authenticated, service_role;
