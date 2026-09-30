-- KEU 1 has no project field. Branch numbering uses the shared office 000
-- counter, but a distinct immutable marker keeps the asset exception narrow.
alter table public.surat_reservations
  drop constraint if exists surat_reservations_number_scope_type_check;
alter table public.surat_reservations
  add constraint surat_reservations_number_scope_type_check
  check (number_scope_type in ('pusat', 'cabang', 'branch_asset_000', 'branch_keu1_000'));

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
      where project.id = new.project_id and project.office_id = new.office_id
    ) then
      raise exception 'Proyek penomoran tidak berada pada kantor cabang.' using errcode = '22023';
    end if;
  else
    raise exception 'Scope pusat tidak boleh dipakai untuk kantor cabang.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop policy if exists "Prevent direct branch_asset_000 insert" on public.surat_reservations;
create policy "Prevent direct branch_asset_000 insert" on public.surat_reservations
  as restrictive for insert to authenticated
  with check (number_scope_type not in ('branch_asset_000', 'branch_keu1_000'));

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
        v_category := public.resolve_form_usage_category(new.form_usage_id);
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
      where project.id = new.project_id and project.office_id = new.office_id
    ) then
      raise exception 'Proyek pengajuan tidak berada pada kantor cabang.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.generate_keu1_branch_letter_number(
  p_entity_id uuid,
  p_type_id uuid,
  p_office_id uuid,
  p_user_id uuid,
  p_dept_id uuid,
  p_form_usage_id uuid
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_office_id uuid;
  v_validation jsonb;
  v_department_id uuid;
  v_year integer := extract(year from now())::integer;
  v_start integer;
  v_next integer;
begin
  if v_actor is null or p_user_id is distinct from v_actor then
    raise exception 'Sesi penomoran tidak valid.' using errcode = '42501';
  end if;
  select profile.role, profile.office_id into v_role, v_office_id
  from public.profiles profile
  where profile.id = v_actor and coalesce(profile.is_active, true) = true and profile.deleted_at is null;
  if not found then raise exception 'Profil pemohon tidak aktif.' using errcode = '42501'; end if;
  if v_role not in ('admin', 'super_admin') and v_office_id is distinct from p_office_id then
    raise exception 'Kantor pemohon tidak sesuai profil.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.master_offices office where office.id = p_office_id and office.kedudukan <> 'Pusat') then
    raise exception 'Nomor KEU 1 cabang memerlukan kantor cabang.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.form_usages usage
    join public.master_forms form on form.id = usage.form_id
    where usage.id = p_form_usage_id and usage.request_category = 'non_asset'
      and usage.scope_type = 'cabang' and upper(trim(form.nomor_form)) = 'FM-UAI.KEU-01-00'
  ) then
    raise exception 'Kegunaan KEU 1 cabang tidak valid.' using errcode = '22023';
  end if;
  v_validation := public.validate_form_usage_for_actor(p_form_usage_id, p_dept_id);
  v_department_id := nullif(v_validation->>'requester_department_id', '')::uuid;
  if v_validation->>'request_category' is distinct from 'non_asset'
    or v_department_id is distinct from p_dept_id
    or not exists (select 1 from public.master_departments dept where dept.id = p_dept_id and dept.entity_id = p_entity_id)
    or not exists (select 1 from public.master_dept_letter_types map where map.dept_id = p_dept_id and map.letter_type_id = p_type_id) then
    raise exception 'Konteks penomoran KEU 1 tidak valid.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('letter-number:' || p_entity_id::text || ':' || v_year::text || ':cabang_000:' || p_office_id::text));
  select coalesce(max(config.start_from), 1) into v_start
  from public.letter_number_counter_configs config
  where config.scope_type = 'cabang_000' and config.is_active = true
    and config.entity_id = p_entity_id and config.office_id = p_office_id and config.year = v_year;

  select reservation.no_urut into v_next
  from public.surat_reservations reservation
  where reservation.entity_id = p_entity_id and reservation.office_id = p_office_id
    and reservation.year = v_year and reservation.project_id is null and reservation.dept_id is null
    and reservation.number_scope_type = 'branch_keu1_000'
    and reservation.status = 'CANCELLED' and reservation.no_urut >= v_start
  order by reservation.no_urut limit 1 for update;

  if v_next is not null then
    update public.surat_reservations
    set status = 'PENDING', type_id = p_type_id, reserved_by = v_actor,
      created_at = now(), expires_at = now() + interval '30 minutes'
    where entity_id = p_entity_id and office_id = p_office_id and year = v_year
      and no_urut = v_next and number_scope_type = 'branch_keu1_000' and status = 'CANCELLED';
  else
    select greatest(coalesce(max(reservation.no_urut), 0) + 1, v_start) into v_next
    from public.surat_reservations reservation
    where reservation.entity_id = p_entity_id and reservation.office_id = p_office_id
      and reservation.year = v_year and reservation.project_id is null and reservation.dept_id is null;
    insert into public.surat_reservations (
      entity_id, type_id, office_id, project_id, dept_id, year, no_urut,
      status, reserved_by, number_scope_type
    ) values (
      p_entity_id, p_type_id, p_office_id, null, null, v_year, v_next,
      'PENDING', v_actor, 'branch_keu1_000'
    );
  end if;
  return v_next;
end;
$$;

revoke all on function public.generate_keu1_branch_letter_number(uuid, uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.generate_keu1_branch_letter_number(uuid, uuid, uuid, uuid, uuid, uuid) to authenticated, service_role;

-- The existing asset fallback shares the 000 number printed on branch letters.
-- Its next value must account for KEU 1 reservations as well.
create or replace function public.generate_new_letter_number(
  p_entity_id uuid,
  p_type_id uuid,
  p_office_id uuid,
  p_project_id uuid,
  p_user_id uuid,
  p_dept_id uuid,
  p_form_usage_id uuid
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_next_val integer;
  v_year integer := extract(year from now());
  v_is_pusat boolean;
  v_is_branch_fallback boolean;
  v_start_from integer := 1;
begin
  if v_actor is null then raise exception 'Sesi login tidak tersedia.' using errcode = '42501'; end if;
  if p_user_id is distinct from v_actor then raise exception 'p_user_id tidak sesuai dengan sesi login.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles profile where profile.id = v_actor and coalesce(profile.is_active, true) = true and profile.deleted_at is null) then
    raise exception 'Profil aktor tidak aktif atau telah dihapus.' using errcode = '42501';
  end if;
  if p_form_usage_id is null then raise exception 'Form usage wajib diisi untuk pemesanan nomor cabang.' using errcode = '22023'; end if;

  select (office.kedudukan = 'Pusat') into v_is_pusat from public.master_offices office where office.id = p_office_id;
  if not found then raise exception 'Kantor penomoran tidak ditemukan.' using errcode = '23503'; end if;

  v_is_branch_fallback := (not v_is_pusat) and p_project_id is null;
  if v_is_branch_fallback then
    perform public.assert_branch_asset_fallback_eligible(v_actor, p_office_id, p_entity_id, p_dept_id, p_form_usage_id);
  elsif not v_is_pusat and p_project_id is null then
    raise exception 'Proyek wajib dipilih untuk pengajuan kantor cabang.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('letter-number:' || p_entity_id::text || ':' || v_year::text || ':' || case when v_is_pusat then 'pusat:' || p_dept_id::text when v_is_branch_fallback then 'cabang_000:' || p_office_id::text else 'cabang:' || p_project_id::text end));

  if v_is_pusat then
    select coalesce(max(start_from), 1) into v_start_from from public.letter_number_counter_configs config
    where config.scope_type = 'pusat' and config.is_active = true and config.entity_id = p_entity_id and config.dept_id = p_dept_id and config.project_id is null and config.office_id is null and config.year = v_year;

    select no_urut into v_next_val from public.surat_reservations
    where entity_id = p_entity_id and dept_id = p_dept_id and project_id is null and year = v_year and no_urut >= v_start_from and status = 'CANCELLED' order by no_urut asc limit 1;
  elsif v_is_branch_fallback then
    select coalesce(max(start_from), 1) into v_start_from from public.letter_number_counter_configs config
    where config.scope_type = 'cabang_000' and config.is_active = true and config.entity_id = p_entity_id and config.office_id = p_office_id and config.project_id is null and config.dept_id is null and config.year = v_year;

    select no_urut into v_next_val from public.surat_reservations
    where entity_id = p_entity_id and office_id = p_office_id and project_id is null and dept_id is null and number_scope_type = 'branch_asset_000' and year = v_year and no_urut >= v_start_from and status = 'CANCELLED' order by no_urut asc limit 1;
  else
    select coalesce(max(start_from), 1) into v_start_from from public.letter_number_counter_configs config
    where config.scope_type = 'cabang' and config.is_active = true and config.entity_id = p_entity_id and config.project_id = p_project_id and config.dept_id is null and config.office_id is null and config.year = v_year;

    select no_urut into v_next_val from public.surat_reservations
    where entity_id = p_entity_id and project_id = p_project_id and dept_id is null and year = v_year and no_urut >= v_start_from and status = 'CANCELLED' order by no_urut asc limit 1;
  end if;

  if v_next_val is not null then
    update public.surat_reservations
       set status = 'PENDING', type_id = p_type_id, office_id = p_office_id, project_id = p_project_id,
           dept_id = case when v_is_pusat then p_dept_id else null end,
           number_scope_type = case when v_is_pusat then 'pusat' when v_is_branch_fallback then 'branch_asset_000' else 'cabang' end,
           reserved_by = p_user_id, created_at = now(), expires_at = (now() + interval '30 minutes')
     where entity_id = p_entity_id and year = v_year and no_urut = v_next_val
       and ((v_is_pusat and dept_id = p_dept_id and project_id is null) or (v_is_branch_fallback and office_id = p_office_id and project_id is null and dept_id is null and number_scope_type = 'branch_asset_000') or (not v_is_pusat and not v_is_branch_fallback and project_id = p_project_id and dept_id is null));
  else
    select greatest(coalesce(max(no_urut), 0) + 1, v_start_from) into v_next_val from public.surat_reservations
    where entity_id = p_entity_id and year = v_year
      and ((v_is_pusat and dept_id = p_dept_id and project_id is null) or (v_is_branch_fallback and office_id = p_office_id and project_id is null and dept_id is null) or (not v_is_pusat and not v_is_branch_fallback and project_id = p_project_id and dept_id is null));

    insert into public.surat_reservations (entity_id, type_id, office_id, project_id, dept_id, year, no_urut, status, reserved_by, number_scope_type)
    values (p_entity_id, p_type_id, p_office_id, p_project_id, case when v_is_pusat then p_dept_id else null end, v_year, v_next_val, 'PENDING', p_user_id, case when v_is_pusat then 'pusat' when v_is_branch_fallback then 'branch_asset_000' else 'cabang' end);
  end if;
  return v_next_val;
end;
$$;

revoke all on function public.generate_new_letter_number(uuid, uuid, uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.generate_new_letter_number(uuid, uuid, uuid, uuid, uuid, uuid, uuid) to authenticated, service_role;
