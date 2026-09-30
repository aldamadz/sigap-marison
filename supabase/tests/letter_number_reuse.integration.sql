-- Integration: letter number reuse policy (runs against live staging DB).
-- Asserts the agreed business rules on the applied schema.
do $$
declare
  v_entity uuid;
  v_type   uuid;
  v_office uuid;
  v_dept   uuid;
  v_user   uuid;
  v_year   integer := extract(year from now())::integer;
  v_res    uuid;
  v_draft  uuid;
  v_next   integer;
  v_before integer;
  v_after  integer;
  v_policy uuid;
begin
  -- Pick an existing scope to work on (use first pusat counter config).
  select config.entity_id, config.dept_id, config.office_id, config.project_id
  into v_entity, v_dept, v_office, null
  from public.letter_number_counter_configs config
  where config.scope_type = 'pusat' and config.is_active = true and config.year = v_year
  limit 1;

  if v_entity is null then
    raise notice 'SKIP: no active pusat counter config for current year';
    return;
  end if;

  select id into v_user from public.profiles
  where role in ('admin','super_admin') and coalesce(is_active,true)=true and deleted_at is null
  limit 1;
  if v_user is null then
    raise notice 'SKIP: no active admin profile';
    return;
  end if;

  select id into v_type from public.master_dept_letter_types
  where dept_id = v_dept limit 1;

  -- 1. Policy helper returns a window when a policy exists.
  if not exists (select 1 from public.letter_number_reuse_policies where is_active = true) then
    raise notice 'SKIP: no active reuse policy configured';
    return;
  end if;
  if public.get_letter_number_reuse_window() is null then
    raise exception 'Reuse policy exists but window helper returned NULL';
  end if;

  -- 2. Reserve a fresh number through the public RPC.
  set local request.jwt.claim.sub = v_user::text;
  set local request.jwt.claim.role = 'authenticated';

  select public.generate_new_letter_number(
    v_entity, v_type, (select id from public.master_offices where kedudukan='Pusat' limit 1),
    null, v_user, v_dept
  ) into v_next;

  select id into v_res from public.surat_reservations
  where entity_id=v_entity and year=v_year and no_urut=v_next and status='PENDING' limit 1;
  if v_res is null then raise exception 'Expected a PENDING reservation, got none'; end if;

  -- 3. Voiding marks VOID + reuse_until in the future + audit trail.
  insert into public.surat_registration_drafts (reservation_id, created_by, no_surat, payload, status, expires_at)
  values (v_res, v_user, 'TEST-'||v_next, '{}'::jsonb, 'DRAFT', now()+interval '1 day')
  returning id into v_draft;

  perform public.void_surat_registration_draft(v_draft);

  select voided_at, reuse_until, voided_by into v_before, v_policy, v_user
  from public.surat_reservations where id = v_res;
  if v_before is null or v_policy is null then
    raise exception 'voided_at/reuse_until must be set on VOID reservation';
  end if;
  if v_policy <= now() then
    raise exception 'reuse_until must be in the future for a valid policy';
  end if;

  -- 4. Reclaim returns the same number while still in window.
  select public.claim_reusable_letter_number(
    v_entity, v_year, 'pusat', null, null, v_dept, 1, v_type, v_user
  ) into v_next;

  if v_next is null then
    raise exception 'In-window VOID number must be reclaimable';
  end if;
  select status into v_before from public.surat_reservations where id = v_res;
  if v_before <> 'PENDING' then raise exception 'Reclaimed reservation must be PENDING again'; end if;
  select reused_count into v_after from public.surat_reservations where id = v_res;
  if v_after < 1 then raise exception 'reused_count must increment on reclaim'; end if;

  -- 5. Expired window must NOT be reclaimable.
  update public.surat_reservations
  set status='VOID', voided_at=now(), reuse_until=now() - interval '1 second'
  where id = v_res;
  select public.claim_reusable_letter_number(
    v_entity, v_year, 'pusat', null, null, v_dept, 1, v_type, v_user
  ) into v_next;
  if v_next is not null then
    raise exception 'Expired VOID number must not be reclaimable';
  end if;

  -- Cleanup test rows.
  delete from public.surat_registration_drafts where id = v_draft;
  delete from public.surat_reservations where id = v_res;

  raise notice 'Letter number reuse: all assertions passed';
end;
$$;
