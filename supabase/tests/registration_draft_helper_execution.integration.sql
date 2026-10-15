set role authenticated;
set "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';
do $$
declare
  v_draft public.surat_registration_drafts;
  v_payload jsonb := '{"formData":{"office_id":"a0000000-0000-4000-8000-000000000030"},"description":"ordinary draft"}';
begin
  v_draft := public.create_surat_registration_draft(608,'608/UAI/2026',v_payload,'[]');
  if v_draft.status <> 'DRAFT' or v_draft.payload <> v_payload then
    raise exception 'Mixed-owner ordinary draft creation failed';
  end if;
  v_payload := v_payload || '{"description":"saved edit"}'::jsonb;
  v_draft := public.create_surat_registration_draft(608,'608/UAI/2026',v_payload,'[]');
  if v_draft.payload <> v_payload then raise exception 'Mixed-owner draft save failed'; end if;
  begin
    perform public.create_surat_registration_draft(608,'608/UAI/2026',
      jsonb_set(v_payload,'{formData,office_id}',to_jsonb(gen_random_uuid()::text)),'[]');
    raise exception 'Forged office accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'Kantor draft tidak sesuai reservasi nomor.' then raise; end if;
  end;
  begin
    perform registration_draft_lifecycle_internal.is_recommendation_task_draft(null,null,null,'{}');
    raise exception 'Authenticated role can execute private helper';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- A USED reservation is valid only through the existing task-bound exception.
update public.surat_reservations set status='USED' where no_urut=608;
insert into public.surat_recommendation_tasks(id,parent_surat_id,reservation_id,no_surat,status,claimed_by)
select '60800000-0000-4000-8000-000000000030','60800000-0000-4000-8000-000000000031',id,
  '608/UAI/2026','claimed',reserved_by from public.surat_reservations where no_urut=608;
set role authenticated;
do $$
declare
  v_payload jsonb := '{"formData":{"office_id":"a0000000-0000-4000-8000-000000000030"},"linkedDocumentContext":{"type":"recommendation","taskId":"60800000-0000-4000-8000-000000000030","parentSuratId":"60800000-0000-4000-8000-000000000031"}}';
begin
  update public.surat_registration_drafts set payload=v_payload where no_surat='608/UAI/2026';
  update public.surat_registration_drafts set payload=payload||'{"recommendation":"saved"}' where no_surat='608/UAI/2026';
  begin
    update public.surat_registration_drafts set payload=jsonb_set(payload,'{linkedDocumentContext,taskId}',
      to_jsonb(gen_random_uuid()::text)) where no_surat='608/UAI/2026';
    raise exception 'Forged recommendation task accepted';
  exception when object_not_in_prerequisite_state then null;
  end;
end $$;
set "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000002';
do $$ begin
  begin
    update public.surat_registration_drafts set payload=payload||'{"foreign":true}' where no_surat='608/UAI/2026';
    raise exception 'Foreign recommendation actor accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'Kantor draft tidak sesuai reservasi nomor.' then raise; end if;
  end;
end $$;
reset role;
do $$
declare v_role text;
begin
  if (select rolsuper from pg_roles where rolname='postgres') then
    raise exception 'Regression fixture must use a non-superuser postgres definer'; end if;
  if not has_function_privilege('postgres',
    'registration_draft_lifecycle_internal.is_recommendation_task_draft(uuid,uuid,text,jsonb)','execute') then
    raise exception 'Office definer still lacks helper execute'; end if;
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(v_role,
      'registration_draft_lifecycle_internal.is_recommendation_task_draft(uuid,uuid,text,jsonb)','execute') then
      raise exception 'Private helper exposed to %',v_role; end if;
  end loop;
  if (select status from public.surat_reservations where no_urut=608)<>'USED' then
    raise exception 'Recommendation save modified USED reservation'; end if;
  raise notice 'Draft helper mixed ownership: all assertions passed';
end $$;
