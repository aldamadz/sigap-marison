-- Integration: letter number reuse policy (runs inside a disposable PostgreSQL
-- via scripts/test-letter-number-reuse-sql.mjs).
--
-- Main scenario under test:
--   * A reserves number 01 (draft saved) then cancels the draft.
--   * B (another applicant) reclaims 01 in the reuse window, a new draft is
--     saved, and the submission succeeds.
--   * The original draft stays cancelled (VOID).
--   * Expired / historic / USED numbers are never reclaimed.
do $$
declare
  v_entity uuid := 'a0000000-0000-4000-8000-000000000010';
  v_office uuid := 'a0000000-0000-4000-8000-000000000030';
  v_dept   uuid := 'a0000000-0000-4000-8000-000000000020';
  v_type   uuid := 'a0000000-0000-4000-8000-000000000050';
  v_user_a uuid := '10000000-0000-4000-8000-000000000001';
  v_user_b uuid := '20000000-0000-4000-8000-000000000002';
  v_admin  uuid := '30000000-0000-4000-8000-000000000003';
  v_year   integer := extract(year from now())::integer;
  v_res_id uuid;
  v_draft_a uuid;
  v_draft_b uuid;
  v_next integer;
  v_status text;
  v_reused integer;
  v_window interval;
  v_voided_at timestamptz;
  v_reuse_until timestamptz;
begin
  -- 1. Active policy seeded by the migration; window must be non-null.
  if not exists (select 1 from public.letter_number_reuse_policies where is_active = true) then
    raise exception 'No active reuse policy';
  end if;
  select public.get_letter_number_reuse_window() into v_window;
  if v_window is null then raise exception 'Reuse window helper returned NULL'; end if;

  -- 2. A reserves number 01 (pusat scope).
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  select public.generate_new_letter_number(v_entity, v_type, v_office, null, v_user_a, v_dept)
  into v_next;
  if v_next <> 1 then raise exception 'Expected first number 01, got %', v_next; end if;

  select id into v_res_id from public.surat_reservations
  where entity_id = v_entity and year = v_year and no_urut = 1 and status = 'PENDING';
  if v_res_id is null then raise exception 'Reservation for 01 not found'; end if;

  -- 3. A saves a draft then cancels it.
  insert into public.surat_registration_drafts (reservation_id, created_by, no_surat, status, expires_at)
  values (v_res_id, v_user_a, '001/UAI/...', 'DRAFT', now() + interval '1 day')
  returning id into v_draft_a;

  perform public.void_surat_registration_draft(v_draft_a);

  select status, voided_at, reuse_until into v_status, v_voided_at, v_reuse_until
  from public.surat_reservations where id = v_res_id;
  if v_status <> 'VOID' then raise exception 'Expected VOID after cancel, got %', v_status; end if;
  if v_voided_at is null then raise exception 'voided_at must be set'; end if;
  if v_reuse_until <= now() then raise exception 'reuse_until must be in the future'; end if;
  if (select status from public.surat_registration_drafts where id = v_draft_a) <> 'VOID' then
    raise exception 'Original draft must stay VOID';
  end if;

  -- 4. B reclaims 01 within the window (another applicant gets the same number).
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  select public.claim_reusable_letter_number(
    v_entity, v_year, 'pusat', null, null, v_dept, 1, v_type, v_user_b
  ) into v_next;
  if v_next <> 1 then raise exception 'B must reclaim 01, got %', v_next; end if;

  select status, reused_count into v_status, v_reused
  from public.surat_reservations where entity_id = v_entity and year = v_year and no_urut = 1;
  if v_status <> 'PENDING' then raise exception 'Reclaimed must be PENDING, got %', v_status; end if;
  if v_reused < 1 then raise exception 'reused_count must be >= 1, got %', v_reused; end if;

  -- 5. B saves a new draft referencing the same reservation, then submits.
  insert into public.surat_registration_drafts (reservation_id, created_by, no_surat, status, expires_at)
  values ((select id from public.surat_reservations where entity_id = v_entity and year = v_year and no_urut = 1),
          v_user_b, '001/UAI/...', 'DRAFT', now() + interval '1 day')
  returning id into v_draft_b;
  if v_draft_b is null then raise exception 'New draft for B was not saved'; end if;

  insert into public.surat_registrasi (no_surat, status, created_by)
  values ('001/UAI/...', 'PROSES', v_user_b);

  update public.surat_reservations
  set status = 'USED'
  where entity_id = v_entity and year = v_year and no_urut = 1
    and reserved_by = v_user_b and status = 'PENDING';

  select status into v_status from public.surat_reservations
  where entity_id = v_entity and year = v_year and no_urut = 1;
  if v_status <> 'USED' then raise exception 'Submit must mark reservation USED, got %', v_status; end if;

  -- 6. USED number is never reclaimable.
  select public.claim_reusable_letter_number(
    v_entity, v_year, 'pusat', null, null, v_dept, 1, v_type, v_user_b
  ) into v_next;
  if v_next is not null then raise exception 'USED number must not be reclaimable'; end if;

  -- 7. Original draft stays cancelled, and a fresh generation skips to 02.
  if (select status from public.surat_registration_drafts where id = v_draft_a) <> 'VOID' then
    raise exception 'Original draft must remain VOID after reuse';
  end if;
  select public.generate_new_letter_number(v_entity, v_type, v_office, null, v_user_b, v_dept)
  into v_next;
  if v_next <> 2 then raise exception 'After USED 01, next must be 02, got %', v_next; end if;

  -- 8. Boundary: expired window must not be reclaimable.
  insert into public.surat_reservations (entity_id, type_id, office_id, dept_id, year, no_urut, status, number_scope_type, reserved_by, voided_at, reuse_until)
  values (v_entity, v_type, v_office, v_dept, v_year, 5, 'VOID', 'pusat', v_user_b, now(), now() - interval '1 second');
  select public.claim_reusable_letter_number(
    v_entity, v_year, 'pusat', null, null, v_dept, 1, v_type, v_user_b
  ) into v_next;
  if v_next = 5 then raise exception 'Expired VOID number must not be reclaimable'; end if;

  -- 9. Historic VOID (no voided_at) is never resurrected.
  insert into public.surat_reservations (entity_id, type_id, office_id, dept_id, year, no_urut, status, number_scope_type, reserved_by)
  values (v_entity, v_type, v_office, v_dept, v_year, 6, 'VOID', 'pusat', v_user_b);
  select public.claim_reusable_letter_number(
    v_entity, v_year, 'pusat', null, null, v_dept, 1, v_type, v_user_b
  ) into v_next;
  if v_next = 6 then raise exception 'Historic VOID number must never be resurrected'; end if;

  -- 10. One number cannot be granted twice: while 02 is PENDING (from step 7),
  --     a second claim for the same scope returns nothing new for that number.
  select public.claim_reusable_letter_number(
    v_entity, v_year, 'pusat', null, null, v_dept, 1, v_type, v_user_b
  ) into v_next;
  if v_next = 2 then raise exception 'PENDING number 02 must not be handed out twice'; end if;

  -- Cleanup fixture rows.
  delete from public.surat_registration_drafts where id in (v_draft_a, v_draft_b);
  delete from public.surat_registrasi;
  delete from public.surat_reservations where entity_id = v_entity and year = v_year and no_urut in (1,2,5,6);

  raise notice 'Letter number reuse: all assertions passed';
end;
$$;
