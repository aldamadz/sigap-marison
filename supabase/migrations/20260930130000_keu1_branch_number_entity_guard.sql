-- master_departments is global and has no entity_id column. Validate the
-- requested entity directly while keeping usage, department, and office guards.
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
    or not exists (select 1 from public.master_entities entity where entity.id = p_entity_id)
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
