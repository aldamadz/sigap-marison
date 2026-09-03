-- MRN-22 follow-up: align fallback authorization with the canonical staging schema.
--
-- master_departments does not own an entity_id column. Departments authorize
-- form usage, while entity_id is an independent master-data selection used by
-- the existing numbering contract. Keep the authoritative department check and
-- validate the selected entity through its actual foreign-key source.

create or replace function public.assert_branch_asset_fallback_eligible(
  p_actor          uuid,
  p_office_id      uuid,
  p_entity_id      uuid,
  p_department_id  uuid,
  p_form_usage_id  uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_kedudukan text;
  v_usage_validation jsonb;
  v_category text;
  v_user_role text;
  v_user_office uuid;
  v_requester_department_id uuid;
begin
  if p_actor is null then
    raise exception 'Sesi login tidak tersedia.' using errcode = '42501';
  end if;

  if p_actor is distinct from auth.uid() then
    raise exception 'Aktor fallback tidak sesuai dengan sesi login.' using errcode = '42501';
  end if;

  select profile.role, profile.office_id
  into v_user_role, v_user_office
  from public.profiles profile
  where profile.id = p_actor
    and coalesce(profile.is_active, true) = true
    and profile.deleted_at is null;

  if not found then
    raise exception 'Profil aktor tidak aktif atau telah dihapus.' using errcode = '42501';
  end if;

  select office.kedudukan
  into v_kedudukan
  from public.master_offices office
  where office.id = p_office_id;

  if v_kedudukan is null then
    raise exception 'Kantor penomoran tidak ditemukan.' using errcode = '23503';
  end if;

  if v_kedudukan = 'Pusat' then
    raise exception 'Fallback proyek 000 tidak berlaku untuk kantor pusat.' using errcode = '22023';
  end if;

  v_usage_validation := public.validate_form_usage_for_actor(
    p_form_usage_id,
    p_department_id
  );
  v_category := v_usage_validation->>'request_category';
  v_requester_department_id := nullif(
    v_usage_validation->>'requester_department_id',
    ''
  )::uuid;

  if v_category is distinct from 'asset' then
    raise exception 'Fallback proyek 000 hanya berlaku untuk klasifikasi Aset.' using errcode = '22023';
  end if;

  if p_department_id is distinct from v_requester_department_id then
    raise exception 'Departemen reservasi tidak sesuai departemen pengaju.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.master_entities entity
    where entity.id = p_entity_id
  ) then
    raise exception 'Entitas reservasi tidak ditemukan.' using errcode = '23503';
  end if;

  if v_user_role is distinct from 'admin'
    and v_user_office is distinct from p_office_id
  then
    raise exception 'Anda tidak diizinkan membuat reservasi untuk kantor lain.' using errcode = '42501';
  end if;

  if public.branch_has_registered_projects(p_office_id) then
    raise exception 'Kantor cabang ini memiliki proyek terdaftar; fallback 000 tidak dapat dipakai.' using errcode = '22023';
  end if;

  return true;
end;
$$;

revoke all on function public.assert_branch_asset_fallback_eligible(uuid, uuid, uuid, uuid, uuid)
  from public, anon;
grant execute on function public.assert_branch_asset_fallback_eligible(uuid, uuid, uuid, uuid, uuid)
  to authenticated, service_role;

