create table if not exists public.marison_outbound_record_mappings (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment = 'staging'),
  entity_type text not null check (entity_type in ('profile', 'office', 'project')),
  record_id uuid not null,
  target_record_id uuid not null,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default clock_timestamp(),
  unique (environment, entity_type, record_id)
);

create index if not exists marison_payload_mappings_target_idx
  on public.marison_outbound_record_mappings (environment, entity_type, target_record_id);

alter table public.marison_outbound_record_mappings enable row level security;
revoke all on public.marison_outbound_record_mappings from public, anon, authenticated;

create or replace function public.get_marison_payload_mappings(p_actor_id uuid, p_environment text, p_entity_type text default null)
returns table (
  id uuid,
  environment text,
  entity_type text,
  record_id uuid,
  target_record_id uuid,
  mapped_name text,
  mapped_nik text,
  mapped_code text,
  mapped_external_id bigint,
  mapped_office_name text,
  mapped_branch_id bigint,
  updated_at timestamptz,
  mapping_valid boolean
)
language plpgsql security definer set search_path = '' as $$
begin
  if p_environment <> 'staging' then
    raise exception 'Payload mappings are staging-only' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_actor_id and p.role::text = 'admin' and p.is_active and p.deleted_at is null) then
    raise exception 'Active admin is required' using errcode = '42501';
  end if;
  if p_entity_type is not null and p_entity_type not in ('profile', 'office', 'project') then
    raise exception 'Invalid mapping entity' using errcode = '22023';
  end if;
  return query
  select m.id, m.environment, m.entity_type, m.record_id, m.target_record_id,
    case when m.entity_type = 'profile' then p.full_name when m.entity_type = 'office' then o.name else pr.name end,
    case when m.entity_type = 'profile' then p.nik else null end,
    case when m.entity_type = 'office' then o.code else pr.code end,
    case when m.entity_type = 'profile' then p.marison_employee_id when m.entity_type = 'office' then o.marison_branch_id else pr.marison_project_id end,
    case when m.entity_type = 'project' then po.name else null end,
    case when m.entity_type = 'project' then po.marison_branch_id when m.entity_type = 'office' then o.marison_branch_id else null end,
    m.updated_at,
    case when m.entity_type = 'profile' then p.marison_employee_id > 0 and nullif(btrim(p.nik), '') is not null and p.marison_synced_at is not null and p.is_active and p.deleted_at is null and not coalesce(p.marison_review_required, false)
      when m.entity_type = 'office' then o.marison_branch_id > 0 and o.marison_synced_at is not null and not coalesce(o.marison_review_required, false)
      else pr.marison_project_id > 0
        and pr.marison_synced_at is not null
        and not coalesce(pr.marison_review_required, false)
        and po.marison_branch_id > 0
        and po.marison_synced_at is not null
        and not coalesce(po.marison_review_required, false)
        and po.marison_branch_id = coalesce(
          case
            when mapped_source_office.marison_branch_id > 0
              and mapped_source_office.marison_synced_at is not null
              and not coalesce(mapped_source_office.marison_review_required, false)
            then mapped_source_office.marison_branch_id
          end,
          case
            when source_office.marison_branch_id > 0
              and source_office.marison_synced_at is not null
              and not coalesce(source_office.marison_review_required, false)
            then source_office.marison_branch_id
          end
        )
      end
  from public.marison_outbound_record_mappings m
  left join public.profiles p on m.entity_type = 'profile' and p.id = m.target_record_id
  left join public.master_offices o on m.entity_type = 'office' and o.id = m.target_record_id
  left join public.master_projects pr on m.entity_type = 'project' and pr.id = m.target_record_id
  left join public.master_offices po on pr.office_id = po.id
  left join public.master_projects source_project on m.entity_type = 'project' and source_project.id = m.record_id
  left join public.master_offices source_office on source_office.id = source_project.office_id
  left join public.marison_outbound_record_mappings source_office_mapping
    on m.entity_type = 'project'
    and source_office_mapping.environment = m.environment
    and source_office_mapping.entity_type = 'office'
    and source_office_mapping.record_id = source_project.office_id
  left join public.master_offices mapped_source_office on mapped_source_office.id = source_office_mapping.target_record_id
  where m.environment = p_environment
    and (p_entity_type is null or m.entity_type = p_entity_type);
end;
$$;

create or replace function public.get_marison_payload_mapping_catalog(p_actor_id uuid, p_environment text, p_entity_type text, p_query text default '', p_limit integer default 20, p_branch_id bigint default null)
returns table(id uuid, name text, nik text, code text, external_id bigint, office_name text, branch_id bigint, valid boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if p_environment <> 'staging' then raise exception 'Payload mappings are staging-only' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_actor_id and p.role::text = 'admin' and p.is_active and p.deleted_at is null) then raise exception 'Active admin is required' using errcode = '42501'; end if;
  if p_entity_type = 'profile' then
    return query select p.id, p.full_name, p.nik, null::text, p.marison_employee_id, null::text, null::bigint, (p.marison_synced_at is not null and p.is_active and p.deleted_at is null and not coalesce(p.marison_review_required, false)) from public.profiles p where p.marison_employee_id > 0 and nullif(btrim(p.nik), '') is not null and p.deleted_at is null and (p_query = '' or p.full_name ilike '%'||p_query||'%' or p.nik ilike '%'||p_query||'%') order by p.full_name limit least(greatest(p_limit, 1), 50);
  elsif p_entity_type = 'office' then
    return query select o.id, o.name, null::text, o.code, o.marison_branch_id, null::text, o.marison_branch_id, (o.marison_synced_at is not null and not coalesce(o.marison_review_required, false)) from public.master_offices o where o.marison_branch_id > 0 and (p_query = '' or o.name ilike '%'||p_query||'%' or o.code ilike '%'||p_query||'%') order by o.name limit least(greatest(p_limit, 1), 50);
  elsif p_entity_type = 'project' then
    return query select pr.id, pr.name, null::text, pr.code, pr.marison_project_id, o.name, o.marison_branch_id, (pr.marison_synced_at is not null and not coalesce(pr.marison_review_required, false) and o.marison_branch_id > 0 and o.marison_synced_at is not null and not coalesce(o.marison_review_required, false)) from public.master_projects pr join public.master_offices o on o.id = pr.office_id where pr.marison_project_id > 0 and (p_branch_id is null or o.marison_branch_id = p_branch_id) and (p_query = '' or pr.name ilike '%'||p_query||'%' or pr.code ilike '%'||p_query||'%') order by pr.name limit least(greatest(p_limit, 1), 50);
  else raise exception 'Invalid catalog entity' using errcode = '22023';
  end if;
end;
$$;

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
    values(p_actor_id, 'UPSERT', 'marison_outbound_record_mappings', p_record_id, v_old_json, v_new_json);
  return jsonb_build_object('id', v_id, 'environment', p_environment, 'entity_type', p_entity_type, 'record_id', p_record_id, 'target_record_id', p_target_record_id, 'updated_at', v_updated_at);
end;
$$;

revoke execute on function public.get_marison_payload_mappings(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.configure_marison_payload_mapping(uuid, text, text, uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.get_marison_payload_mapping_catalog(uuid, text, text, text, integer, bigint) from public, anon, authenticated;
grant execute on function public.get_marison_payload_mappings(uuid, text, text) to service_role;
grant execute on function public.configure_marison_payload_mapping(uuid, text, text, uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.get_marison_payload_mapping_catalog(uuid, text, text, text, integer, bigint) to service_role;

create or replace function public.remove_marison_payload_mapping_for_deleted_master()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.marison_outbound_record_mappings where record_id = old.id and entity_type = tg_argv[0];
  delete from public.marison_outbound_record_mappings where target_record_id = old.id and entity_type = tg_argv[0];
  return old;
end;
$$;

drop trigger if exists trg_remove_marison_profile_mapping on public.profiles;
create trigger trg_remove_marison_profile_mapping before delete on public.profiles for each row execute function public.remove_marison_payload_mapping_for_deleted_master('profile');
drop trigger if exists trg_remove_marison_office_mapping on public.master_offices;
create trigger trg_remove_marison_office_mapping before delete on public.master_offices for each row execute function public.remove_marison_payload_mapping_for_deleted_master('office');
drop trigger if exists trg_remove_marison_project_mapping on public.master_projects;
create trigger trg_remove_marison_project_mapping before delete on public.master_projects for each row execute function public.remove_marison_payload_mapping_for_deleted_master('project');
