-- Close remaining security blockers from the July hardening pass.

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role::text in ('admin', 'super_admin')
      and coalesce(p.is_active, true) = true
      and p.deleted_at is null
  );
$$;

revoke all on function public.is_current_user_admin() from public, anon;
grant execute on function public.is_current_user_admin() to authenticated;

create or replace function public.prevent_profile_privilege_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
  v_allowed_fields text[] := array[
    'full_name',
    'avatar_url',
    'avatar_thumbnail_url',
    'phone',
    'theme_preference',
    'updated_at'
  ];
begin
  if v_actor is null then
    return new;
  end if;

  select public.is_current_user_admin() into v_is_admin;

  if old.id is distinct from v_actor then
    if v_is_admin then
      return new;
    end if;
    raise exception 'Tidak diizinkan mengubah profil user lain.';
  end if;

  if (to_jsonb(old) - v_allowed_fields) is distinct from (to_jsonb(new) - v_allowed_fields) then
    raise exception 'Tidak diizinkan mengubah kolom administratif profil sendiri.';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_profile_privilege_self_update() from public, anon, authenticated;

create unique index if not exists surat_reservations_cabang_no_project_unique
on public.surat_reservations(entity_id, year, office_id, no_urut)
where project_id is null and dept_id is null and office_id is not null;

create or replace function public.generate_new_letter_number(
  p_entity_id uuid,
  p_type_id uuid,
  p_office_id uuid,
  p_project_id uuid,
  p_user_id uuid,
  p_dept_id uuid default null::uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_next_val integer;
  v_now timestamptz := now();
  v_year integer := extract(year from v_now)::integer;
  v_actor uuid := auth.uid();
  v_actor_office_id uuid;
  v_actor_department_id uuid;
  v_actor_role text;
  v_is_admin boolean;
  v_is_pusat boolean;
  v_start_from integer := 1;
  v_lock_key text;
begin
  if v_actor is null then
    raise exception 'Sesi login tidak tersedia.';
  end if;

  if p_user_id is distinct from v_actor then
    raise exception 'User reservasi tidak sesuai dengan sesi login.';
  end if;

  select profile.office_id, profile.department_id, profile.role::text
  into v_actor_office_id, v_actor_department_id, v_actor_role
  from public.profiles as profile
  where profile.id = v_actor
    and coalesce(profile.is_active, true) = true
    and profile.deleted_at is null;

  if not found then
    raise exception 'Profil aktif tidak ditemukan.';
  end if;

  v_is_admin := coalesce(v_actor_role = 'admin', false);

  if not v_is_admin and p_office_id is distinct from v_actor_office_id then
    raise exception 'Kantor penerbit tidak sesuai dengan profil user.';
  end if;

  select (kedudukan = 'Pusat') into v_is_pusat
  from public.master_offices
  where id = p_office_id;

  if v_is_pusat is null then
    raise exception 'Kantor penerbit tidak ditemukan.';
  end if;

  if not v_is_admin
     and v_is_pusat
     and p_dept_id is distinct from v_actor_department_id then
    raise exception 'Departemen penerbit tidak sesuai dengan profil user.';
  end if;

  v_lock_key := concat_ws(
    ':',
    'letter-number',
    p_entity_id::text,
    v_year::text,
    case when v_is_pusat then 'pusat' else 'cabang' end,
    coalesce(case when v_is_pusat then p_dept_id::text else p_project_id::text end, p_office_id::text, 'none')
  );
  perform pg_advisory_xact_lock(hashtext(v_lock_key));

  if v_is_pusat then
    select coalesce(max(start_from), 1) into v_start_from
    from public.letter_number_counter_configs
    where scope_type = 'pusat'
      and is_active = true
      and entity_id = p_entity_id
      and dept_id is not distinct from p_dept_id
      and project_id is null
      and year = v_year;

    select greatest(coalesce(max(no_urut), 0) + 1, v_start_from) into v_next_val
    from public.surat_reservations
    where entity_id = p_entity_id
      and dept_id is not distinct from p_dept_id
      and project_id is null
      and year = v_year;
  else
    select coalesce(max(start_from), 1) into v_start_from
    from public.letter_number_counter_configs
    where scope_type = 'cabang'
      and is_active = true
      and entity_id = p_entity_id
      and project_id is not distinct from p_project_id
      and dept_id is null
      and year = v_year;

    select greatest(coalesce(max(no_urut), 0) + 1, v_start_from) into v_next_val
    from public.surat_reservations
    where entity_id = p_entity_id
      and office_id is not distinct from p_office_id
      and project_id is not distinct from p_project_id
      and dept_id is null
      and year = v_year;
  end if;

  insert into public.surat_reservations (
    entity_id,
    type_id,
    office_id,
    project_id,
    dept_id,
    year,
    no_urut,
    status,
    reserved_by,
    created_at,
    expires_at
  ) values (
    p_entity_id,
    p_type_id,
    p_office_id,
    case when v_is_pusat then null else p_project_id end,
    case when v_is_pusat then p_dept_id else null end,
    v_year,
    v_next_val,
    'PENDING',
    v_actor,
    v_now,
    v_now + interval '7 days'
  );

  return v_next_val;
end;
$function$;

revoke all on function public.generate_new_letter_number(uuid, uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.generate_new_letter_number(uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;
