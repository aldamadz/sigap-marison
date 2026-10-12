begin;

-- Delegation changes submission context, never the employee profile or role.
create table if not exists public.user_access_grants (
  user_id uuid not null references public.profiles(id),
  permission_key text not null check (permission_key = 'submission.issue_for_office'),
  office_id uuid not null references public.master_offices(id),
  granted_by uuid not null references public.profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, permission_key, office_id)
);
create table if not exists public.user_access_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id),
  permission_key text not null,
  office_id uuid not null references public.master_offices(id),
  action text not null check (action in ('grant','revoke')),
  actor_id uuid not null references public.profiles(id),
  occurred_at timestamptz not null default now()
);
alter table public.user_access_grants enable row level security;
alter table public.user_access_events enable row level security;
revoke all on public.user_access_grants, public.user_access_events from anon, authenticated;
grant select on public.user_access_grants, public.user_access_events to authenticated;
drop policy if exists access_grants_read on public.user_access_grants;
create policy access_grants_read on public.user_access_grants for select to authenticated
  using (public.is_current_user_admin() or user_id = auth.uid());
drop policy if exists access_events_read on public.user_access_events;
create policy access_events_read on public.user_access_events for select to authenticated
  using (public.is_current_user_admin());

create or replace function public.can_issue_for_office(p_office_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join public.master_offices o on o.id = p_office_id
    where p.id = auth.uid() and p.is_active is true and p.deleted_at is null
      and (p.role::text in ('admin','super_admin') or p.office_id = o.id or
        (upper(btrim(o.kedudukan)) in ('KC','KCP') and exists (
          select 1 from public.user_access_grants g where g.user_id = p.id
            and g.permission_key = 'submission.issue_for_office' and g.office_id = o.id)))
  );
$$;
create or replace function public.get_my_issuing_office_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select o.id from public.master_offices o where public.can_issue_for_office(o.id);
$$;
create or replace function public.get_user_issuing_office_grants(p_user_id uuid)
returns setof uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'Hanya admin dapat mengelola hak akses.' using errcode = '42501';
  end if;
  return query select g.office_id from public.user_access_grants g
    where g.user_id = p_user_id and g.permission_key = 'submission.issue_for_office';
end;
$$;
create or replace function public.set_user_issuing_office_grants(p_user_id uuid, p_office_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_offices uuid[] := coalesce(p_office_ids, array[]::uuid[]);
begin
  if not public.is_current_user_admin() then
    raise exception 'Hanya admin dapat mengelola hak akses.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Tidak dapat mengubah hak akses sendiri.' using errcode = '42501';
  end if;
  if cardinality(v_offices) > 100 or array_position(v_offices, null) is not null then
    raise exception 'Daftar kantor tidak valid.' using errcode = '22023';
  end if;
  perform 1 from public.profiles p where p.id = p_user_id
    and p.is_active is true and p.deleted_at is null and p.role::text not in ('admin','super_admin') for update;
  if not found then
    raise exception 'Pilih pengguna aktif non-admin.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_offices) id where not exists (
    select 1 from public.master_offices o where o.id = id and upper(btrim(o.kedudukan)) in ('KC','KCP'))) then
    raise exception 'Delegasi hanya untuk kantor KC atau KCP yang tersedia.' using errcode = '22023';
  end if;
  with removed as (
    delete from public.user_access_grants g where g.user_id = p_user_id
      and g.permission_key = 'submission.issue_for_office' and not (g.office_id = any(v_offices))
    returning g.office_id
  ) insert into public.user_access_events(user_id, permission_key, office_id, action, actor_id)
    select p_user_id, 'submission.issue_for_office', office_id, 'revoke', auth.uid() from removed;
  with added as (
    insert into public.user_access_grants(user_id, permission_key, office_id, granted_by)
      select distinct p_user_id, 'submission.issue_for_office', id, auth.uid() from unnest(v_offices) id
      on conflict do nothing returning office_id
  ) insert into public.user_access_events(user_id, permission_key, office_id, action, actor_id)
    select p_user_id, 'submission.issue_for_office', office_id, 'grant', auth.uid() from added;
end;
$$;
revoke all on function public.can_issue_for_office(uuid), public.get_my_issuing_office_ids(),
  public.get_user_issuing_office_grants(uuid), public.set_user_issuing_office_grants(uuid,uuid[]) from public, anon;
grant execute on function public.can_issue_for_office(uuid), public.get_my_issuing_office_ids(),
  public.get_user_issuing_office_grants(uuid), public.set_user_issuing_office_grants(uuid,uuid[]) to authenticated;

-- Patch the deployed canonical allocators rather than fork counters or reuse logic.
do $patch$
declare
  v_signature text;
  v_definition text;
  v_old text;
begin
  foreach v_signature in array array[
    'public.generate_new_letter_number(uuid,uuid,uuid,uuid,uuid,uuid)',
    'public.generate_new_letter_number(uuid,uuid,uuid,uuid,uuid,uuid,uuid)',
    'public.generate_keu1_branch_letter_number(uuid,uuid,uuid,uuid,uuid,uuid)',
    'public.generate_fund_branch_letter_number(uuid,uuid,uuid,uuid,uuid,uuid)',
    'public.assert_branch_asset_fallback_eligible(uuid,uuid,uuid,uuid,uuid)'
  ] loop
    v_definition := replace(pg_get_functiondef(v_signature::regprocedure), E'\r\n', E'\n');
    if position('public.can_issue_for_office(p_office_id)' in v_definition) > 0 then continue; end if;
    if v_signature like '%generate_new_letter_number%' then
      v_old := '  select (office.kedudukan = ''Pusat'') into v_is_pusat';
      if position(v_old in v_definition) = 0 then raise exception 'Unknown allocator: %', v_signature; end if;
      v_definition := replace(v_definition, v_old,
        '  if not public.can_issue_for_office(p_office_id) then raise exception ''Kantor penerbit tidak diizinkan.'' using errcode=''42501''; end if;' || E'\n' || v_old);
    elsif v_signature like '%assert_branch_asset%' then
      v_old := 'v_user_role not in (''admin'', ''super_admin'') and v_user_office is distinct from p_office_id';
      if position(v_old in v_definition) = 0 then raise exception 'Unknown asset office guard'; end if;
      v_definition := replace(v_definition, v_old, 'not public.can_issue_for_office(p_office_id)');
    else
      v_old := 'v_role not in (''admin'', ''super_admin'') and v_office_id is distinct from p_office_id';
      if position(v_old in v_definition) = 0 then raise exception 'Unknown branch office guard: %', v_signature; end if;
      v_definition := replace(v_definition, v_old, 'not public.can_issue_for_office(p_office_id)');
    end if;
    execute v_definition;
  end loop;
  v_definition := replace(pg_get_functiondef('public.create_surat_registrasi_core(jsonb,uuid)'::regprocedure), E'\r\n', E'\n');
  v_old := 'v_actor_role is distinct from ''admin'' and v_office_id is distinct from v_actor_office_id';
  if position('public.can_issue_for_office(v_office_id)' in v_definition) = 0 then
    if position(v_old in v_definition) = 0 then raise exception 'Unknown registration office guard'; end if;
    execute replace(v_definition, v_old, 'not public.can_issue_for_office(v_office_id)');
  end if;
  -- KC/KCP project scope is based on the selected issuing office for every form.
  v_definition := replace(pg_get_functiondef('public.enforce_surat_registration_branch_project()'::regprocedure), E'\r\n', E'\n');
  v_old := 'v_category = ''non_unit'' and v_kedudukan = ''KC''';
  if position(v_old in v_definition) > 0 then
    execute replace(v_definition, v_old, 'v_kedudukan = ''KC''');
  elsif position('v_kedudukan = ''KC''' in v_definition) = 0 then
    raise exception 'Unknown registration project scope';
  end if;
  v_definition := replace(pg_get_functiondef('public.create_surat_registration_draft(integer,text,jsonb,jsonb)'::regprocedure), E'\r\n', E'\n');
  if position('r.office_id = nullif(p_payload->>''office_id''' in v_definition) = 0 then
    v_old := '    and r.status = ''PENDING''';
    if position(v_old in v_definition) = 0 then raise exception 'Unknown draft reservation lookup'; end if;
    v_definition := replace(v_definition, v_old, v_old || E'\n' || $body$
    and r.office_id = nullif(p_payload->>'office_id','')::uuid
    and (nullif(p_payload->>'entity_id','') is null or r.entity_id = (p_payload->>'entity_id')::uuid)
    and (nullif(p_payload->>'letter_type_id','') is null or r.type_id = (p_payload->>'letter_type_id')::uuid)
    and r.project_id is not distinct from nullif(p_payload->>'project_id','')::uuid$body$);
    execute v_definition;
  end if;
end $patch$;

create or replace function public.guard_delegated_issuing_office()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Existing signatures and background jobs keep their historical context.
  if tg_op = 'UPDATE' and new.office_id is not distinct from old.office_id then return new; end if;
  if tg_op = 'UPDATE' then
    raise exception 'Kantor penerbit sudah dikunci oleh nomor dokumen.' using errcode = '42501';
  end if;
  if auth.uid() is null or not public.can_issue_for_office(new.office_id) then
    raise exception 'Kantor penerbit tidak diizinkan.' using errcode = '42501';
  end if;
  if tg_table_name = 'surat_reservations' then
    if new.reserved_by is distinct from auth.uid() and not public.is_current_user_admin() then
      raise exception 'Pemilik nomor tidak sesuai sesi.' using errcode = '42501';
    end if;
  elsif new.created_by is distinct from auth.uid() and not public.is_current_user_admin() then
    raise exception 'Pemohon tidak sesuai sesi.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_delegated_issuing_office on public.surat_reservations;
create trigger guard_delegated_issuing_office before insert or update of office_id on public.surat_reservations
  for each row execute function public.guard_delegated_issuing_office();
drop trigger if exists guard_delegated_issuing_office on public.surat_registrasi;
create trigger guard_delegated_issuing_office before insert or update of office_id on public.surat_registrasi
  for each row execute function public.guard_delegated_issuing_office();

create or replace function public.guard_draft_issuing_office()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_office uuid;
begin
  if new.status <> 'DRAFT' or new.reservation_id is null then return new; end if;
  select r.office_id into v_office from public.surat_reservations r
    where r.id = new.reservation_id and r.reserved_by = new.created_by and r.status = 'PENDING';
  if v_office is null or nullif(new.payload->>'office_id','')::uuid is distinct from v_office then
    raise exception 'Kantor draft tidak sesuai reservasi nomor.' using errcode = '42501';
  end if;
  if not public.can_issue_for_office(v_office) then
    raise exception 'Akses kantor penerbit telah dicabut.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_draft_issuing_office on public.surat_registration_drafts;
create trigger guard_draft_issuing_office before insert or update of payload on public.surat_registration_drafts
  for each row execute function public.guard_draft_issuing_office();
revoke all on function public.guard_delegated_issuing_office(), public.guard_draft_issuing_office() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
