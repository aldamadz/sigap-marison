-- A local SIGAP project may use a different office for numbering than the
-- canonical Marison project used for a staging Non Unit payload. The payload
-- always uses the target project's own synchronized Marison branch.
create or replace function public.configure_marison_payload_mapping_strict(
  p_actor_id uuid,
  p_environment text,
  p_entity_type text,
  p_record_id uuid,
  p_target_record_id uuid,
  p_reason text,
  p_expected_updated_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  old_row public.marison_outbound_record_mappings%rowtype;
  new_id uuid;
  new_version timestamptz;
begin
  if p_environment <> 'staging' then raise exception 'Payload mappings are staging-only' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_actor_id and p.role::text = 'admin' and p.is_active and p.deleted_at is null) then
    raise exception 'Active admin is required' using errcode = '42501';
  end if;
  if p_entity_type not in ('profile','office','project') or p_record_id is null then raise exception 'Mapping record tidak valid' using errcode = '22023'; end if;
  if p_entity_type = 'profile' and not exists (select 1 from public.profiles p where p.id = p_record_id and p.deleted_at is null) then raise exception 'Source profile tidak ditemukan' using errcode = '22023'; end if;
  if p_entity_type = 'office' and not exists (select 1 from public.master_offices o where o.id = p_record_id) then raise exception 'Source office tidak ditemukan' using errcode = '22023'; end if;
  if p_entity_type = 'project' and not exists (select 1 from public.master_projects pr where pr.id = p_record_id) then raise exception 'Source project tidak ditemukan' using errcode = '22023'; end if;
  if nullif(btrim(p_reason), '') is null or length(p_reason) > 2000 then raise exception 'Reason is required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_environment || ':' || p_entity_type || ':' || p_record_id::text, 0));
  select * into old_row from public.marison_outbound_record_mappings
    where environment = p_environment and entity_type = p_entity_type and record_id = p_record_id for update;
  if old_row.id is not null and p_expected_updated_at is null then raise exception 'Expected version wajib diisi' using errcode = '40001'; end if;
  if old_row.id is null and p_expected_updated_at is not null then raise exception 'Expected version tidak boleh diisi' using errcode = '40001'; end if;
  if old_row.id is not null and p_expected_updated_at <> old_row.updated_at then
    raise exception 'Mapping sudah berubah. Muat ulang sebelum menyimpan.' using errcode = '40001';
  end if;
  if p_target_record_id is null then
    delete from public.marison_outbound_record_mappings where id = old_row.id;
    insert into public.activity_logs(user_id, action, table_name, record_id, old_values, new_values)
      values(p_actor_id, 'DELETE', 'marison_outbound_record_mappings', p_record_id,
        jsonb_build_object('target_record_id', old_row.target_record_id),
        jsonb_build_object('reason', left(btrim(p_reason), 2000)));
    return jsonb_build_object('deleted', true, 'record_id', p_record_id);
  end if;
  if p_entity_type = 'profile' and not public.marison_payload_profile_source_valid(p_target_record_id) then raise exception 'Target mapping employee bukan mirror external valid' using errcode = '22023'; end if;
  if p_entity_type = 'office' and not public.marison_payload_office_source_valid(p_target_record_id) then raise exception 'Target mapping branch bukan mirror external valid' using errcode = '22023'; end if;
  if p_entity_type = 'project' then
    if p_record_id = p_target_record_id then raise exception 'Project tidak dapat dipetakan ke dirinya sendiri' using errcode = '22023'; end if;
    if not public.marison_payload_project_source_valid(p_target_record_id) then raise exception 'Target mapping project bukan mirror external valid' using errcode = '22023'; end if;
  end if;
  insert into public.marison_outbound_record_mappings(environment, entity_type, record_id, target_record_id, updated_by, updated_at)
    values(p_environment, p_entity_type, p_record_id, p_target_record_id, p_actor_id, clock_timestamp())
    on conflict(environment, entity_type, record_id) do update
      set target_record_id=excluded.target_record_id, updated_by=excluded.updated_by, updated_at=excluded.updated_at
    returning id, updated_at into new_id, new_version;
  insert into public.activity_logs(user_id, action, table_name, record_id, old_values, new_values)
    values(p_actor_id, case when old_row.id is null then 'INSERT'::public.activity_action else 'UPDATE'::public.activity_action end,
      'marison_outbound_record_mappings', p_record_id,
      jsonb_build_object('target_record_id', old_row.target_record_id),
      jsonb_build_object('target_record_id', p_target_record_id, 'reason', left(btrim(p_reason), 2000)));
  return jsonb_build_object('id', new_id, 'record_id', p_record_id, 'target_record_id', p_target_record_id, 'updated_at', new_version);
end;
$$;

create or replace function public.get_marison_payload_mappings(p_actor_id uuid, p_environment text, p_entity_type text default null)
returns table(id uuid, environment text, entity_type text, record_id uuid, target_record_id uuid, mapped_name text, mapped_nik text, mapped_code text, mapped_external_id bigint, mapped_office_name text, mapped_branch_id bigint, updated_at timestamptz, mapping_valid boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if p_environment <> 'staging' then raise exception 'Payload mappings are staging-only' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_actor_id and p.role::text = 'admin' and p.is_active and p.deleted_at is null) then raise exception 'Active admin is required' using errcode = '42501'; end if;
  return query
  select m.id,m.environment,m.entity_type,m.record_id,m.target_record_id,
    case when m.entity_type='profile' then p.full_name when m.entity_type='office' then o.name else pr.name end,
    case when m.entity_type='profile' then p.nik else null end,
    case when m.entity_type='office' then o.code when m.entity_type='project' then pr.code else null end,
    case when m.entity_type='profile' then p.marison_employee_id when m.entity_type='office' then o.marison_branch_id else pr.marison_project_id end,
    case when m.entity_type='project' then po.name else null end,
    case when m.entity_type='office' then o.marison_branch_id when m.entity_type='project' then po.marison_branch_id else null end,
    m.updated_at,
    case when m.entity_type='profile' then public.marison_payload_profile_source_valid(m.target_record_id)
      when m.entity_type='office' then public.marison_payload_office_source_valid(m.target_record_id)
      else public.marison_payload_project_source_valid(m.target_record_id)
    end
  from public.marison_outbound_record_mappings m
  left join public.profiles p on m.entity_type='profile' and p.id=m.target_record_id
  left join public.master_offices o on m.entity_type='office' and o.id=m.target_record_id
  left join public.master_projects pr on m.entity_type='project' and pr.id=m.target_record_id
  left join public.master_offices po on po.id=pr.office_id
  where m.environment=p_environment and (p_entity_type is null or m.entity_type=p_entity_type);
end;
$$;

revoke execute on function public.configure_marison_payload_mapping_strict(uuid,text,text,uuid,uuid,text,timestamptz) from public, anon, authenticated, service_role;
revoke execute on function public.get_marison_payload_mappings(uuid,text,text) from public, anon, authenticated;
grant execute on function public.get_marison_payload_mappings(uuid,text,text) to service_role;
