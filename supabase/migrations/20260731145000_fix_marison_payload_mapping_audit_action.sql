create or replace function public.configure_marison_payload_mapping(
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
  v_old public.marison_outbound_record_mappings%rowtype;
  v_id uuid;
  v_updated_at timestamptz;
  v_old_json jsonb;
  v_new_json jsonb;
  v_target_valid boolean := false;
  v_source_office_id uuid;
  v_effective_branch_id bigint;
begin
  if p_environment <> 'staging' then raise exception 'Payload mappings are staging-only' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_actor_id and p.role::text = 'admin' and p.is_active and p.deleted_at is null) then
    raise exception 'Active admin is required' using errcode = '42501';
  end if;
  if p_entity_type not in ('profile', 'office', 'project') or p_record_id is null then raise exception 'Mapping record tidak valid' using errcode = '22023'; end if;
  if p_entity_type = 'profile' and not exists (select 1 from public.profiles where id = p_record_id and deleted_at is null) then raise exception 'Source profile tidak ditemukan' using errcode = '22023'; end if;
  if p_entity_type = 'office' and not exists (select 1 from public.master_offices where id = p_record_id) then raise exception 'Source office tidak ditemukan' using errcode = '22023'; end if;
  if p_entity_type = 'project' and not exists (select 1 from public.master_projects where id = p_record_id) then raise exception 'Source project tidak ditemukan' using errcode = '22023'; end if;
  if nullif(btrim(p_reason), '') is null or length(p_reason) > 2000 then raise exception 'Reason is required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_environment || ':' || p_entity_type || ':' || p_record_id::text, 0));
  select * into v_old from public.marison_outbound_record_mappings where environment = p_environment and entity_type = p_entity_type and record_id = p_record_id for update;
  if v_old.id is not null and p_expected_updated_at is null then raise exception 'Mapping sudah ada untuk %/% %. Expected version wajib diisi.', p_environment, p_entity_type, p_record_id using errcode = '40001'; end if;
  if v_old.id is null and p_expected_updated_at is not null then raise exception 'Mapping belum ada untuk %/% %. Expected version tidak boleh diisi.', p_environment, p_entity_type, p_record_id using errcode = '40001'; end if;
  if v_old.id is not null and p_expected_updated_at <> v_old.updated_at then
    raise exception 'Mapping sudah berubah. Muat ulang sebelum menyimpan.' using errcode = '40001';
  end if;
  if v_old.id is not null then
    v_old_json := jsonb_build_object('environment', v_old.environment, 'entity_type', v_old.entity_type, 'record_id', v_old.record_id, 'target_record_id', v_old.target_record_id, 'updated_at', v_old.updated_at);
  end if;
  if p_target_record_id is null then
    delete from public.marison_outbound_record_mappings where id = v_old.id;
    insert into public.activity_logs(user_id, action, table_name, record_id, old_values, new_values)
      values(p_actor_id, 'DELETE', 'marison_outbound_record_mappings', p_record_id, v_old_json, jsonb_build_object('environment', p_environment, 'entity_type', p_entity_type, 'reason', left(btrim(p_reason), 2000)));
    return jsonb_build_object('deleted', true, 'record_id', p_record_id, 'environment', p_environment);
  end if;
  if p_entity_type = 'profile' then
    select exists(select 1 from public.profiles p where p.id = p_target_record_id and p.is_active and p.deleted_at is null and p.marison_employee_id > 0 and nullif(btrim(p.nik), '') is not null and p.marison_synced_at is not null and not coalesce(p.marison_review_required, false)) into v_target_valid;
  elsif p_entity_type = 'office' then
    select exists(select 1 from public.master_offices o where o.id = p_target_record_id and o.marison_branch_id > 0 and o.marison_synced_at is not null and not coalesce(o.marison_review_required, false)) into v_target_valid;
  else
    select source_project.office_id
      into v_source_office_id
      from public.master_projects source_project
      where source_project.id = p_record_id;

    select mapped_office.marison_branch_id
      into v_effective_branch_id
      from public.marison_outbound_record_mappings office_mapping
      join public.master_offices mapped_office on mapped_office.id = office_mapping.target_record_id
      where office_mapping.environment = p_environment
        and office_mapping.entity_type = 'office'
        and office_mapping.record_id = v_source_office_id
        and mapped_office.marison_branch_id > 0
        and mapped_office.marison_synced_at is not null
        and not coalesce(mapped_office.marison_review_required, false);

    if v_effective_branch_id is null then
      select source_office.marison_branch_id
        into v_effective_branch_id
        from public.master_offices source_office
        where source_office.id = v_source_office_id
          and source_office.marison_branch_id > 0
          and source_office.marison_synced_at is not null
          and not coalesce(source_office.marison_review_required, false);
    end if;

    if v_effective_branch_id is null then
      raise exception 'Kantor sumber proyek belum memiliki mapping branch staging yang valid' using errcode = '22023';
    end if;

    select exists(
      select 1 from public.master_projects pr
      join public.master_offices target_office on target_office.id = pr.office_id
      where pr.id = p_target_record_id and pr.marison_project_id > 0 and pr.marison_synced_at is not null
        and not coalesce(pr.marison_review_required, false)
        and target_office.marison_branch_id = v_effective_branch_id
        and target_office.marison_synced_at is not null
        and not coalesce(target_office.marison_review_required, false)
    ) into v_target_valid;
  end if;
  if not v_target_valid then raise exception 'Target mapping tidak tersedia atau belum tervalidasi' using errcode = '22023'; end if;
  insert into public.marison_outbound_record_mappings(environment, entity_type, record_id, target_record_id, updated_by, updated_at)
    values(p_environment, p_entity_type, p_record_id, p_target_record_id, p_actor_id, clock_timestamp())
    on conflict(environment, entity_type, record_id) do update set target_record_id = excluded.target_record_id, updated_by = excluded.updated_by, updated_at = excluded.updated_at
    returning id, updated_at into v_id, v_updated_at;
  v_new_json := jsonb_build_object('environment', p_environment, 'entity_type', p_entity_type, 'record_id', p_record_id, 'target_record_id', p_target_record_id, 'reason', left(btrim(p_reason), 2000));
  insert into public.activity_logs(user_id, action, table_name, record_id, old_values, new_values)
    values(
      p_actor_id,
      case when v_old.id is null then 'INSERT'::public.activity_action else 'UPDATE'::public.activity_action end,
      'marison_outbound_record_mappings',
      p_record_id,
      v_old_json,
      v_new_json
    );
  return jsonb_build_object('id', v_id, 'environment', p_environment, 'entity_type', p_entity_type, 'record_id', p_record_id, 'target_record_id', p_target_record_id, 'updated_at', v_updated_at);
end;
$$;

revoke execute on function public.configure_marison_payload_mapping(uuid, text, text, uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.configure_marison_payload_mapping(uuid, text, text, uuid, uuid, text, timestamptz) to service_role;
