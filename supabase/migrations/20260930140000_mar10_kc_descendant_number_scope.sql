-- KC may issue Non Unit documents for projects belonging to descendant KCPs.
-- Number reservations accept the office subtree; registration still limits
-- that wider scope to canonical Non Unit usages.
create or replace function public.enforce_surat_reservation_number_scope()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_kedudukan text;
begin
  select office.kedudukan into v_kedudukan from public.master_offices office where office.id = new.office_id;
  if not found then raise exception 'Kantor penomoran tidak ditemukan.' using errcode = '23503'; end if;

  if new.number_scope_type is null then
    if v_kedudukan = 'Pusat' and new.dept_id is not null and new.project_id is null then
      new.number_scope_type := 'pusat';
    elsif v_kedudukan <> 'Pusat' and new.project_id is not null and new.dept_id is null then
      new.number_scope_type := 'cabang';
    else
      raise exception 'Tanda lingkup nomor wajib diisi eksplisit.' using errcode = '22023';
    end if;
  end if;

  if new.number_scope_type not in ('pusat', 'cabang', 'branch_asset_000', 'branch_keu1_000') then
    raise exception 'Tanda lingkup nomor tidak valid.' using errcode = '22023';
  end if;
  if v_kedudukan = 'Pusat' then
    if new.number_scope_type <> 'pusat' or new.dept_id is null or new.project_id is not null then
      raise exception 'Penomoran kantor pusat wajib per departemen tanpa proyek.' using errcode = '22023';
    end if;
  elsif new.number_scope_type = 'branch_asset_000' then
    if new.project_id is not null or new.dept_id is not null or public.branch_has_registered_projects(new.office_id) then
      raise exception 'Fallback aset 000 tidak tersedia untuk kantor ini.' using errcode = '22023';
    end if;
  elsif new.number_scope_type = 'branch_keu1_000' then
    if new.project_id is not null or new.dept_id is not null then
      raise exception 'Nomor KEU 1 cabang wajib tanpa proyek.' using errcode = '22023';
    end if;
  elsif new.number_scope_type = 'cabang' then
    if new.project_id is null or new.dept_id is not null or not exists (
      select 1 from public.master_projects project
      where project.id = new.project_id
        and (
          project.office_id = new.office_id
          or (v_kedudukan = 'KC' and project.office_id in (
            select public.get_office_descendant_ids(new.office_id)
          ))
        )
    ) then
      raise exception 'Proyek penomoran tidak berada pada kantor cabang atau KCP turunannya.' using errcode = '22023';
    end if;
  else
    raise exception 'Scope pusat tidak boleh dipakai untuk kantor cabang.' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- The shared asset 000 fallback previously referenced a non-existent
-- master_departments.entity_id column. Departments are global; verify the
-- selected entity itself and the authorized requester department instead.
create or replace function public.assert_branch_asset_fallback_eligible(
  p_actor uuid,
  p_office_id uuid,
  p_entity_id uuid,
  p_department_id uuid,
  p_form_usage_id uuid
)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_kedudukan text;
  v_usage_validation jsonb;
  v_user_role text;
  v_user_office uuid;
  v_requester_department_id uuid;
begin
  if p_actor is null or p_actor is distinct from auth.uid() then
    raise exception 'Sesi login tidak sesuai aktor penomoran.' using errcode = '42501';
  end if;
  select profile.role, profile.office_id into v_user_role, v_user_office
  from public.profiles profile
  where profile.id = p_actor and coalesce(profile.is_active, true) = true and profile.deleted_at is null;
  if not found then raise exception 'Profil aktor tidak aktif.' using errcode = '42501'; end if;

  select office.kedudukan into v_kedudukan
  from public.master_offices office where office.id = p_office_id;
  if v_kedudukan is null then raise exception 'Kantor penomoran tidak ditemukan.' using errcode = '23503'; end if;
  if v_kedudukan = 'Pusat' then raise exception 'Fallback 000 hanya untuk kantor cabang.' using errcode = '22023'; end if;

  v_usage_validation := public.validate_form_usage_for_actor(p_form_usage_id, p_department_id);
  v_requester_department_id := nullif(v_usage_validation->>'requester_department_id', '')::uuid;
  if v_usage_validation->>'request_category' is distinct from 'asset'
    or v_requester_department_id is distinct from p_department_id then
    raise exception 'Fallback 000 hanya untuk pengajuan Aset yang diizinkan.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.master_entities entity where entity.id = p_entity_id) then
    raise exception 'Entitas penomoran tidak ditemukan.' using errcode = '22023';
  end if;
  if v_user_role not in ('admin', 'super_admin') and v_user_office is distinct from p_office_id then
    raise exception 'Kantor penomoran tidak sesuai profil pemohon.' using errcode = '42501';
  end if;
  if public.branch_has_registered_projects(p_office_id) then
    raise exception 'Kantor ini memiliki proyek; fallback 000 tidak tersedia.' using errcode = '22023';
  end if;
  return true;
end;
$$;

create or replace function public.enforce_surat_registration_branch_project()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_kedudukan text;
  v_marker jsonb := coalesce(new.form_input_data, '{}'::jsonb);
  v_category text;
  v_is_keu1 boolean;
begin
  select office.kedudukan into v_kedudukan from public.master_offices office where office.id = new.office_id;
  if not found then raise exception 'Kantor penerbit tidak ditemukan.' using errcode = '23503'; end if;

  select coalesce(upper(trim(form.nomor_form)) = 'FM-UAI.KEU-01-00', false)
  into v_is_keu1
  from public.form_usages usage
  join public.master_forms form on form.id = usage.form_id
  where usage.id = new.form_usage_id and usage.request_category = 'non_asset';
  v_is_keu1 := coalesce(v_is_keu1, false);
  v_category := public.resolve_form_usage_category(new.form_usage_id);

  if v_is_keu1 and new.project_id is not null then
    raise exception 'Form KEU 1 tidak menggunakan proyek.' using errcode = '22023';
  end if;

  if v_kedudukan <> 'Pusat' then
    if new.project_id is null then
      if new.form_usage_id is null then
        raise exception 'Penggunaan form wajib untuk pengajuan cabang tanpa proyek.' using errcode = '22023';
      end if;
      if v_is_keu1 then
        if v_marker->>'fund_without_project' is distinct from 'true' or not exists (
          select 1 from public.surat_reservations reservation
          where reservation.entity_id = new.entity_id
            and reservation.office_id = new.office_id
            and reservation.project_id is null
            and reservation.dept_id is null
            and reservation.year = extract(year from new.created_at)::integer
            and reservation.no_urut = new.no_urut
            and reservation.reserved_by = new.created_by
            and reservation.number_scope_type = 'branch_keu1_000'
            and reservation.status in ('PENDING', 'USED')
        ) then
          raise exception 'Reservasi KEU 1 cabang tanpa proyek tidak valid.' using errcode = '22023';
        end if;
      else
        if v_category is distinct from 'asset' then
          raise exception 'Proyek wajib dipilih untuk pengajuan non-aset di kantor cabang.' using errcode = '22023';
        end if;
        if v_marker->>'project_is_default' is distinct from 'true'
          or v_marker->>'project_code' is distinct from '000'
          or v_marker->>'project_name' is distinct from 'Tanpa proyek'
          or public.branch_has_registered_projects(new.office_id) then
          raise exception 'Proyek wajib dipilih untuk pengajuan kantor cabang.' using errcode = '22023';
        end if;
      end if;
    elsif not exists (
      select 1 from public.master_projects project
      where project.id = new.project_id
        and (
          project.office_id = new.office_id
          or (v_category = 'non_unit' and v_kedudukan = 'KC'
            and project.office_id in (select public.get_office_descendant_ids(new.office_id)))
        )
    ) then
      raise exception 'Proyek pengajuan tidak berada pada kantor cabang atau KCP turunannya.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
