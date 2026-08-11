begin;

insert into public.profiles (id, role, is_active) values
  ('10000000-0000-4000-8000-000000000001', 'user', true),
  ('10000000-0000-4000-8000-000000000002', 'user', true),
  ('10000000-0000-4000-8000-000000000003', 'user', true),
  ('10000000-0000-4000-8000-000000000004', 'user', true),
  ('10000000-0000-4000-8000-000000000005', 'user', true);

insert into public.surat_registrasi (
  id, created_by, no_surat, judul_surat, status, current_step, form_input_data, data_snapshot
) values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'UNIT-REV-001',
  'Pengajuan 3 Unit',
  'MENUNGGU_PERBAIKAN',
  3,
  '{"request_mode":"unit","requested_unit_count":"3","allocated_unit_count":3,"allocated_units":[{"code":"A1"},{"code":"A2"},{"code":"A3"}],"items":[{"nama_barang":"Pembangunan 3 Unit","jumlah":"3"}]}'::jsonb,
  '{}'::jsonb
);

insert into public.surat_signatures (
  id, surat_id, user_id, step_order, is_signed, status, action_type,
  requires_unit_allocation, verification_required, verification_status, verifier_snapshot, available_at
) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 1, true, 'APPROVED', 'approval', false, false, 'not_required', '[]', now()),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 2, true, 'APPROVED', 'approval', false, false, 'not_required', '[]', now()),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 3, false, 'PENDING', 'unit_allocation', true, true, 'verified', '[{"user_id":"10000000-0000-4000-8000-000000000005"}]', now());

insert into public.surat_revision_events (
  id, surat_id, signature_id, actor_id, target_type, target_user_ids,
  from_step, target_step, reason, changes, status
) values (
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
  'requester',
  array['10000000-0000-4000-8000-000000000001'::uuid],
  3,
  null,
  'Jumlah disetujui dua unit',
  '{"item_revisions":[{"index":0,"action":"adjust","value_type":"unit_count","nilai_diajukan":"3","nilai_disetujui":"2"}]}'::jsonb,
  'awaiting_requester'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

do $$
declare
  v_result boolean;
  v_status text;
  v_step integer;
  v_requested text;
  v_target text;
  v_verification text;
begin
  v_result := public.accept_surat_process_revision('40000000-0000-4000-8000-000000000001', 'Setuju dua unit');
  if not v_result then raise exception 'accept returned false'; end if;

  select status, current_step, form_input_data->>'requested_unit_count'
  into v_status, v_step, v_requested
  from public.surat_registrasi where id='20000000-0000-4000-8000-000000000001';
  if v_status <> 'MENUNGGU_PERBAIKAN' or v_step <> 3 or v_requested <> '2' then
    raise exception 'accept did not route requester revision to checker: %, %, %', v_status, v_step, v_requested;
  end if;

  select target_type into v_target from public.surat_revision_events where id='40000000-0000-4000-8000-000000000001';
  select verification_status into v_verification from public.surat_signatures where id='30000000-0000-4000-8000-000000000003';
  if v_target <> 'checker' or v_verification <> 'pending' then
    raise exception 'checker task was not reopened: %, %', v_target, v_verification;
  end if;
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);

do $$
begin
  begin
    update public.surat_signatures
    set verification_status='verified', verified_at=now(), verified_by='10000000-0000-4000-8000-000000000005'
    where id='30000000-0000-4000-8000-000000000003';
    raise exception 'mismatched allocation unexpectedly verified';
  exception when others then
    if sqlerrm = 'mismatched allocation unexpectedly verified' then raise; end if;
    if sqlerrm not like 'Jumlah alokasi unit harus sama%' then raise; end if;
  end;
end $$;

update public.surat_registrasi
set form_input_data = jsonb_set(
  jsonb_set(form_input_data, '{allocated_units}', '[{"code":"A1"},{"code":"A2"}]'::jsonb, true),
  '{allocated_unit_count}', '2'::jsonb, true
)
where id='20000000-0000-4000-8000-000000000001';

update public.surat_signatures
set verification_status='verified', verified_at=now(), verified_by='10000000-0000-4000-8000-000000000005'
where id='30000000-0000-4000-8000-000000000003';

do $$
declare
  v_result boolean;
  v_status text;
  v_step integer;
  v_unsigned integer;
  v_event_status text;
begin
  v_result := public.resolve_surat_process_revision('40000000-0000-4000-8000-000000000001', 'Alokasi dua unit selesai');
  if not v_result then raise exception 'resolve returned false'; end if;
  select status,current_step into v_status,v_step from public.surat_registrasi where id='20000000-0000-4000-8000-000000000001';
  select count(*) into v_unsigned from public.surat_signatures where surat_id='20000000-0000-4000-8000-000000000001' and is_signed=false;
  select status into v_event_status from public.surat_revision_events where id='40000000-0000-4000-8000-000000000001';
  if v_status <> 'PROSES' or v_step <> 1 or v_unsigned <> 3 or v_event_status <> 'resolved' then
    raise exception 'approval did not restart safely: %, %, %, %', v_status,v_step,v_unsigned,v_event_status;
  end if;
end $$;

do $$
begin
  begin
    update public.surat_registrasi set status='DONE' where id='20000000-0000-4000-8000-000000000001';
    raise exception 'incomplete signatures unexpectedly finalized';
  exception when others then
    if sqlerrm = 'incomplete signatures unexpectedly finalized' then raise; end if;
    if sqlerrm not like 'Dokumen belum dapat diselesaikan%' then raise; end if;
  end;
end $$;

update public.surat_signatures set is_signed=true,status='APPROVED' where surat_id='20000000-0000-4000-8000-000000000001';
update public.surat_registrasi set status='DONE' where id='20000000-0000-4000-8000-000000000001';

do $$
begin
  if (select status from public.surat_registrasi where id='20000000-0000-4000-8000-000000000001') <> 'DONE' then
    raise exception 'valid complete unit request did not finalize';
  end if;
end $$;

rollback;

