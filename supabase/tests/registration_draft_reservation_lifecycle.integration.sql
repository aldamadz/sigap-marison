do $$
declare
  v_owner uuid := '10000000-0000-4000-8000-000000000001';
  v_foreign uuid := '20000000-0000-4000-8000-000000000002';
  v_admin uuid := '30000000-0000-4000-8000-000000000003';
  v_res uuid; v_draft public.surat_registration_drafts; v_before jsonb; v_failed boolean;
begin
  if (select status from public.surat_registration_drafts where id='59600000-0000-4000-8000-000000000002') <> 'EXPIRED' then
    raise exception 'Legacy cancelled number draft still active'; end if;
  if (select payload from public.surat_registration_drafts where id='59600000-0000-4000-8000-000000000002') <> '{"preserved":"legacy data"}'::jsonb then
    raise exception 'Cleanup modified saved data'; end if;
  perform set_config('request.jwt.claim.sub',v_foreign::text,true);
  begin
    perform public.void_surat_registration_draft('59600000-0000-4000-8000-000000000002');
    raise exception 'Foreign cancellation allowed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  select to_jsonb(r) into v_before from public.surat_reservations r where id='59600000-0000-4000-8000-000000000001';
  perform public.void_surat_registration_draft('59600000-0000-4000-8000-000000000002');
  perform public.void_surat_registration_draft('59600000-0000-4000-8000-000000000002');
  if (select to_jsonb(r) from public.surat_reservations r where id='59600000-0000-4000-8000-000000000001') <> v_before then
    raise exception 'Stale cleanup changed reservation or reuse window'; end if;

  insert into public.surat_reservations(entity_id,type_id,office_id,dept_id,year,no_urut,status,number_scope_type,reserved_by)
    values ('a0000000-0000-4000-8000-000000000010','a0000000-0000-4000-8000-000000000050',
      'a0000000-0000-4000-8000-000000000030','a0000000-0000-4000-8000-000000000020',2026,597,'PENDING','pusat',v_owner)
    returning id into v_res;
  v_draft := public.create_surat_registration_draft(597,'597/UAI/2026','{"text":"original"}','[]');
  if (select expires_at from public.surat_reservations where id=v_res) is distinct from v_draft.expires_at then
    raise exception 'Initial draft and reservation leases differ'; end if;
  update public.surat_reservations set expires_at=clock_timestamp()-interval '1 second' where id=v_res;
  -- The actual production cron statement must not cancel this active draft.
  update public.surat_reservations set status='CANCELLED' where status='PENDING' and expires_at<now();
  if (select status from public.surat_reservations where id=v_res) <> 'PENDING' then
    raise exception 'Cron cancelled an active persisted draft'; end if;
  update public.surat_registration_drafts set payload='{"text":"saved edit"}',expires_at=now()+interval '100 years' where id=v_draft.id;
  if (select expires_at from public.surat_reservations where id=v_res) is distinct from
     (select expires_at from public.surat_registration_drafts where id=v_draft.id) then
    raise exception 'Autosave did not renew both leases'; end if;
  if (select expires_at from public.surat_registration_drafts where id=v_draft.id) > clock_timestamp()+interval '7 days 1 second' then
    raise exception 'Client controls draft lifetime'; end if;

  -- Force time forward only inside this disposable test (never on a live DB).
  alter table public.surat_registration_drafts disable trigger registration_draft_lease_guard;
  alter table public.surat_registration_drafts disable trigger registration_draft_lease_renewal;
  update public.surat_registration_drafts set expires_at=clock_timestamp()-interval '1 day' where id=v_draft.id;
  alter table public.surat_registration_drafts enable trigger registration_draft_lease_guard;
  alter table public.surat_registration_drafts enable trigger registration_draft_lease_renewal;
  update public.surat_reservations set expires_at=clock_timestamp()-interval '1 day' where id=v_res;
  update public.surat_reservations set status='CANCELLED' where status='PENDING' and expires_at<now();
  if (select status from public.surat_registration_drafts where id=v_draft.id) <> 'EXPIRED' then
    raise exception 'Truly expired draft remains active after cron'; end if;
  if (select payload from public.surat_registration_drafts where id=v_draft.id) <> '{"text":"saved edit"}'::jsonb then
    raise exception 'Expiry deleted data'; end if;
  begin
    update public.surat_registration_drafts set status='DRAFT',expires_at=now()+interval '7 days' where id=v_draft.id;
    raise exception 'Expired draft resurrected';
  exception when object_not_in_prerequisite_state then null; end;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform public.void_surat_registration_draft(v_draft.id);
  if (select status from public.surat_reservations where id=v_res) <> 'CANCELLED' then
    raise exception 'Admin cleanup changed cancelled number'; end if;

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  insert into public.surat_reservations(entity_id,type_id,office_id,dept_id,year,no_urut,status,number_scope_type,reserved_by)
    values ('a0000000-0000-4000-8000-000000000010','a0000000-0000-4000-8000-000000000050',
      'a0000000-0000-4000-8000-000000000030','a0000000-0000-4000-8000-000000000020',2026,598,'PENDING','pusat',v_owner)
    returning id into v_res;
  v_draft := public.create_surat_registration_draft(598,'598/UAI/2026','{}','[]');
  update public.surat_reservations set status='USED' where id=v_res;
  begin perform public.void_surat_registration_draft(v_draft.id); raise exception 'USED number cancellation allowed';
    exception when object_not_in_prerequisite_state then null; end;
  if (select status from public.surat_reservations where id=v_res) <> 'USED' then raise exception 'USED changed'; end if;
  insert into public.surat_reservations(entity_id,type_id,office_id,dept_id,year,no_urut,status,number_scope_type,reserved_by)
    values ('a0000000-0000-4000-8000-000000000010','a0000000-0000-4000-8000-000000000050',
      'a0000000-0000-4000-8000-000000000030','a0000000-0000-4000-8000-000000000020',2026,600,'PENDING','pusat',v_owner)
    returning id into v_res;
  v_draft := public.create_surat_registration_draft(600,'600/UAI/2026','{}','[]');
  update public.profiles set is_active=false where id=v_owner;
  begin perform public.void_surat_registration_draft(v_draft.id); raise exception 'Inactive account cancellation allowed';
    exception when insufficient_privilege then null; end;
  update public.profiles set is_active=true where id=v_owner;
  perform public.void_surat_registration_draft(v_draft.id);
  if (select status from public.surat_reservations where id=v_res) <> 'VOID'
    or (select reuse_until from public.surat_reservations where id=v_res) <= now() then
    raise exception 'Normal cancellation broke the reuse window'; end if;
  perform set_config('request.jwt.claim.sub',v_foreign::text,true);
  if public.claim_reusable_letter_number('a0000000-0000-4000-8000-000000000010',2026,'pusat',null,null,
    'a0000000-0000-4000-8000-000000000020',1,'a0000000-0000-4000-8000-000000000050',v_foreign) <> 600 then
    raise exception 'Normal cancelled number cannot be reclaimed'; end if;
  v_draft := public.create_surat_registration_draft(600,'600/UAI/2026','{}','[]');
  perform public.create_surat_registrasi(jsonb_build_object('reservation_id',v_res,'draft_id',v_draft.id,
    'no_surat','600/UAI/2026','entity_id','a0000000-0000-4000-8000-000000000010',
    'office_id','a0000000-0000-4000-8000-000000000030','dept_id','a0000000-0000-4000-8000-000000000020',
    'letter_type_id','a0000000-0000-4000-8000-000000000050','form_usage_id','a0000000-0000-4000-8000-000000000064',
    'judul_surat','TEST lifecycle','requester_snapshot','{}'::jsonb,'location_snapshot','{}'::jsonb,
    'form_input_data',jsonb_build_object('request_category','non_asset')));
  if (select status from public.surat_reservations where id=v_res) <> 'USED' then
    raise exception 'Canonical submission after reclaim failed'; end if;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  insert into public.surat_registration_drafts(created_by,revision_event_id,no_surat,expires_at,payload)
    values (v_owner,gen_random_uuid(),'existing/revision',now()+interval '2 days','{"revision":"preserved"}') returning * into v_draft;
  update public.surat_registration_drafts set payload='{"revision":"updated"}' where id=v_draft.id;
  begin perform public.void_surat_registration_draft(v_draft.id); raise exception 'Revision draft cancelled as ordinary';
    exception when object_not_in_prerequisite_state then null; end;
  if (select expires_at from public.surat_registration_drafts where id=v_draft.id) is distinct from v_draft.expires_at then
    raise exception 'Ordinary lease logic modified revision draft'; end if;
  if has_function_privilege('authenticated','registration_draft_lifecycle_internal.guard_draft()','execute')
    or has_function_privilege('anon','public.void_surat_registration_draft(uuid)','execute') then
    raise exception 'Internal helper or cancellation anonymously accessible'; end if;
  raise notice 'Draft reservation lifecycle: all assertions passed';
end $$;
