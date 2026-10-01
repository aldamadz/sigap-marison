-- Integration: letter number reuse policy (runs inside a disposable PostgreSQL
-- via scripts/test-letter-number-reuse-sql.mjs).
--
-- Main scenario under test, using the REAL draft and submit RPCs:
--   * A reserves number 01, saves a draft (create_surat_registration_draft),
--     then cancels it (void_surat_registration_draft).
--   * B (another applicant) reclaims 01 within the window, saves a fresh draft
--     via the real RPC, and submits via the real RPC (create_surat_registrasi).
--   * The original draft stays cancelled (VOID) and its history is intact.
--   * The cancel audit is preserved; every cancel and reclaim is logged.
--   * USED, expired, and historic VOID numbers are never reclaimed; the
--     reclaim helper cannot be bypassed with a client timestamp.
do $$
declare
  v_entity uuid := 'a0000000-0000-4000-8000-000000000010';
  v_office uuid := 'a0000000-0000-4000-8000-000000000030';
  v_dept   uuid := 'a0000000-0000-4000-8000-000000000020';
  v_type   uuid := 'a0000000-0000-4000-8000-000000000050';
  v_usage  uuid := 'a0000000-0000-4000-8000-000000000064';
  v_user_a uuid := '10000000-0000-4000-8000-000000000001';
  v_user_b uuid := '20000000-0000-4000-8000-000000000002';
  v_admin  uuid := '30000000-0000-4000-8000-000000000003';
  v_year   integer := extract(year from now())::integer;
  v_res_id uuid;
  v_draft_a public.surat_registration_drafts;
  v_draft_b public.surat_registration_drafts;
  v_reg    public.surat_registrasi;
  v_next integer;
  v_status text;
  v_reused integer;
  v_voided_by uuid;
  v_reuse_until timestamptz;
  v_void_count integer;
  v_reclaim_count integer;
  v_caught boolean := false;
  v_submit_payload jsonb;
begin
  -- 1. Active policy seeded by the migration; window must be non-null.
  if not exists (select 1 from public.letter_number_reuse_policies where is_active = true) then
    raise exception 'No active reuse policy';
  end if;
  if public.get_letter_number_reuse_window() is null then
    raise exception 'Reuse window helper returned NULL';
  end if;

  -- 2. A reserves number 01 and saves a draft through the real RPC.
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  select public.generate_new_letter_number(v_entity, v_type, v_office, null, v_user_a, v_dept)
  into v_next;
  if v_next <> 1 then raise exception 'Expected first number 01, got %', v_next; end if;

  select id into v_res_id from public.surat_reservations
  where entity_id = v_entity and year = v_year and no_urut = 1 and status = 'PENDING';
  if v_res_id is null then raise exception 'Reservation for 01 not found'; end if;

  v_draft_a := public.create_surat_registration_draft(1, '001/UAI/2026', '{}'::jsonb, '[]'::jsonb);
  if v_draft_a.created_by is distinct from v_user_a then
    raise exception 'Draft A must belong to A';
  end if;

  -- 3. A cancels the draft.
  perform public.void_surat_registration_draft(v_draft_a.id);

  select status into v_status from public.surat_reservations where id = v_res_id;
  if v_status <> 'VOID' then raise exception 'Expected VOID after cancel, got %', v_status; end if;
  select voided_by, reuse_until into v_voided_by, v_reuse_until
  from public.surat_reservations where id = v_res_id;
  if v_voided_by is distinct from v_user_a then raise exception 'voided_by must be A'; end if;
  if v_reuse_until <= now() then raise exception 'reuse_until must be in the future'; end if;
  if (select status from public.surat_registration_drafts where id = v_draft_a.id) <> 'VOID' then
    raise exception 'Original draft must stay VOID';
  end if;

  -- 4. B reclaims 01 within the window.
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  select public.claim_reusable_letter_number(
    v_entity, v_year, 'pusat', null, null, v_dept, 1, v_type, v_user_b
  ) into v_next;
  if v_next <> 1 then raise exception 'B must reclaim 01, got %', v_next; end if;

  select status, reused_count into v_status, v_reused
  from public.surat_reservations where id = v_res_id;
  if v_status <> 'PENDING' then raise exception 'Reclaimed must be PENDING, got %', v_status; end if;
  if v_reused < 1 then raise exception 'reused_count must be >= 1, got %', v_reused; end if;
  -- The original cancel audit is preserved on the reservation row.
  select voided_by into v_voided_by from public.surat_reservations where id = v_res_id;
  if v_voided_by is distinct from v_user_a then
    raise exception 'Cancel audit (voided_by) must survive reclaim';
  end if;

  -- 5. B saves a fresh draft through the real RPC (must not resurrect A's).
  v_draft_b := public.create_surat_registration_draft(1, '001/UAI/2026', '{}'::jsonb, '[]'::jsonb);
  if v_draft_b.id is null then raise exception 'B draft was not saved'; end if;
  if v_draft_b.created_by is distinct from v_user_b then
    raise exception 'B draft must belong to B, got %', v_draft_b.created_by;
  end if;
  if (select count(*) from public.surat_registration_drafts where reservation_id = v_res_id) <> 1 then
    raise exception 'Exactly one draft must reference the reservation';
  end if;
  if (select status from public.surat_registration_drafts where id = v_draft_a.id) <> 'VOID' then
    raise exception 'A draft must remain VOID after B saves';
  end if;

  -- 6. B submits through the real RPC; reservation becomes USED.
  v_submit_payload := jsonb_build_object(
    'reservation_id', v_res_id,
    'no_surat', '001/UAI/2026',
    'entity_id', v_entity,
    'office_id', v_office,
    'dept_id', v_dept,
    'letter_type_id', v_type,
    'form_usage_id', v_usage,
    'judul_surat', 'Pengajuan Kas Kecil',
    'request_place', 'Magelang',
    'request_date', '2026-09-30',
    'requester_nik', 'NIK-B',
    'form_input_data', jsonb_build_object('request_category', 'non_asset'),
    'requester_snapshot', jsonb_build_object('full_name', 'Pemohon B'),
    'location_snapshot', jsonb_build_object('office', jsonb_build_object('name', 'Kantor Pusat')),
    'data_snapshot', '{}'::jsonb,
    'policy_snapshot', '{}'::jsonb
  );
  v_reg := public.create_surat_registrasi(v_submit_payload);
  if v_reg.no_surat is distinct from '001/UAI/2026' then
    raise exception 'Submission must return the registered surat';
  end if;
  select status into v_status from public.surat_reservations where id = v_res_id;
  if v_status <> 'USED' then raise exception 'Submit must mark reservation USED, got %', v_status; end if;

  -- 7. USED number is never reclaimable; next generation skips to 02.
  select public.claim_reusable_letter_number(
    v_entity, v_year, 'pusat', null, null, v_dept, 1, v_type, v_user_b
  ) into v_next;
  if v_next is not null then raise exception 'USED number must not be reclaimable'; end if;
  select public.generate_new_letter_number(v_entity, v_type, v_office, null, v_user_b, v_dept)
  into v_next;
  if v_next <> 2 then raise exception 'After USED 01, next must be 02, got %', v_next; end if;

  -- 8. Audit events recorded for the cancel and the reclaim.
  select count(*) into v_void_count from public.letter_number_reservation_events
  where reservation_id = v_res_id and kind = 'void';
  select count(*) into v_reclaim_count from public.letter_number_reservation_events
  where reservation_id = v_res_id and kind = 'reclaimed';
  if v_void_count <> 1 then raise exception 'Expected 1 void event, got %', v_void_count; end if;
  if v_reclaim_count <> 1 then raise exception 'Expected 1 reclaim event, got %', v_reclaim_count; end if;

  -- 9. Boundary: expired window must not be reclaimable.
  insert into public.surat_reservations (entity_id, type_id, office_id, dept_id, year, no_urut, status, number_scope_type, reserved_by, voided_at, reuse_until)
  values (v_entity, v_type, v_office, v_dept, v_year, 5, 'VOID', 'pusat', v_user_b, now(), now() - interval '1 second');
  select public.claim_reusable_letter_number(
    v_entity, v_year, 'pusat', null, null, v_dept, 1, v_type, v_user_b
  ) into v_next;
  if v_next = 5 then raise exception 'Expired VOID number must not be reclaimable'; end if;

  -- 10. Historic VOID (no voided_at) is never resurrected.
  insert into public.surat_reservations (entity_id, type_id, office_id, dept_id, year, no_urut, status, number_scope_type, reserved_by)
  values (v_entity, v_type, v_office, v_dept, v_year, 6, 'VOID', 'pusat', v_user_b);
  select public.claim_reusable_letter_number(
    v_entity, v_year, 'pusat', null, null, v_dept, 1, v_type, v_user_b
  ) into v_next;
  if v_next = 6 then raise exception 'Historic VOID number must never be resurrected'; end if;

  -- 11. The reclaim helper cannot be impersonated: a mismatched actor is
  --     rejected, and there is no client-supplied timestamp parameter.
  begin
    select public.claim_reusable_letter_number(
      v_entity, v_year, 'pusat', null, null, v_dept, 1, v_type, v_admin
    ) into v_next;
  exception
    when others then v_caught := true;
  end;
  if not v_caught then raise exception 'Claim with mismatched actor must be rejected'; end if;

  -- Cleanup fixture rows.
  delete from public.surat_registration_drafts where id in (v_draft_a.id, v_draft_b.id);
  delete from public.surat_registrasi;
  delete from public.letter_number_reservation_events;
  delete from public.surat_reservations where entity_id = v_entity and year = v_year and no_urut in (1,2,5,6);

  raise notice 'Letter number reuse: all assertions passed';
end;
$$;
