-- Canonical counters, draft RPC and registration core, with production enum roles.
do $$
declare
  admin uuid := '30000000-0000-4000-8000-000000000003';
  actor uuid := '10000000-0000-4000-8000-000000000001';
  foreign_actor uuid := '20000000-0000-4000-8000-000000000002';
  solo uuid := '53900000-0000-4000-8000-000000000001';
  karanganyar uuid := '53900000-0000-4000-8000-000000000002';
  other_kcp uuid := '53900000-0000-4000-8000-000000000003';
  outside uuid := '53900000-0000-4000-8000-000000000004';
  project uuid := '53900000-0000-4000-8000-000000000005';
  entity uuid := 'a0000000-0000-4000-8000-000000000010';
  dept uuid := 'a0000000-0000-4000-8000-000000000020';
  lt uuid := 'a0000000-0000-4000-8000-000000000050';
  usage uuid := 'a0000000-0000-4000-8000-000000000064';
  n integer; m integer; denied boolean; draft public.surat_registration_drafts;
  registration public.surat_registrasi; data jsonb; res uuid;
begin
  insert into public.master_offices(id,kedudukan,parent_id) values
    (solo,'KC',null),(karanganyar,'KCP',solo),(other_kcp,'KCP',solo),(outside,'KC',null);
  insert into public.master_projects(id,office_id) values(project,other_kcp);
  update public.profiles set office_id=karanganyar where id=actor;
  perform set_config('request.jwt.claim.sub', actor::text, true);
  if public.can_issue_for_office(solo) or not public.can_issue_for_office(karanganyar) then
    raise exception 'Ordinary user must have only their own office'; end if;
  denied:=false;
  begin perform public.set_user_issuing_office_grants(actor,array[solo]);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'User escalated their own access'; end if;
  denied:=false;
  begin perform public.generate_fund_branch_letter_number(entity,lt,solo,actor,dept,usage);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Ungrantable office number allocated'; end if;

  perform set_config('request.jwt.claim.sub', admin::text, true);
  perform public.set_user_issuing_office_grants(actor,array[solo,karanganyar]);
  perform public.set_user_issuing_office_grants(actor,array[solo,karanganyar]);
  if (select count(*) from public.user_access_events where user_id=actor)<>2 then
    raise exception 'Unchanged grants must not create duplicate audit events'; end if;
  perform set_config('request.jwt.claim.sub', actor::text, true);
  if not public.can_issue_for_office(solo) or public.can_issue_for_office(other_kcp)
    or public.can_issue_for_office(outside) then raise exception 'Delegation inherited unrelated issuance rights'; end if;
  n := public.generate_new_letter_number(entity,lt,solo,project,actor,dept);
  data := jsonb_build_object('entity_id',entity,'office_id',solo,'project_id',project,'dept_id',dept,
    'letter_type_id',lt,'form_usage_id',usage,'no_surat',lpad(n::text,3,'0')||'/UAI/SOLO/X/2026',
    'form_input_data',jsonb_build_object('request_category','non_asset'));
  draft := public.create_surat_registration_draft(n,data->>'no_surat',data);
  res := draft.reservation_id;
  if (select office_id from public.surat_reservations where id=res)<>solo then
    raise exception 'Draft is not bound to the selected issuing office'; end if;
  registration := public.create_surat_registrasi_core(data||jsonb_build_object('reservation_id',res),actor);
  if registration.office_id<>solo or registration.created_by<>actor
    or (select office_id from public.profiles where id=actor)<>karanganyar then
    raise exception 'Selected office changed creator profile or lost submission context'; end if;
  if (select status from public.surat_reservations where id=res)<>'USED' then
    raise exception 'Canonical reservation transition missing'; end if;

  -- KCP cannot see/allocate for a sibling, even with a separate KC grant.
  denied:=false;
  begin perform public.generate_new_letter_number(entity,lt,karanganyar,project,actor,dept);
  exception when invalid_parameter_value then denied:=true; end;
  if not denied then raise exception 'KCP allocated a sibling project'; end if;
  denied:=false;
  begin update public.surat_registrasi set office_id=karanganyar where id=registration.id;
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Document office changed after numbering'; end if;

  -- Same actor can have the same numeric counter in two project-free offices.
  n := public.generate_fund_branch_letter_number(entity,lt,solo,actor,dept,usage);
  m := public.generate_fund_branch_letter_number(entity,lt,karanganyar,actor,dept,usage);
  if n<>m then raise exception 'Fixture must exercise equal number in two offices'; end if;
  data := jsonb_build_object('office_id',solo,'entity_id',entity,'dept_id',dept,'letter_type_id',lt,
    'form_usage_id',usage,'no_surat','001/UAI/SOLO/X/2026',
    'form_input_data',jsonb_build_object('request_category','non_asset','fund_without_project',true));
  draft := public.create_surat_registration_draft(n,data->>'no_surat',data);
  if (select office_id from public.surat_reservations where id=draft.reservation_id)<>solo then
    raise exception 'Same number chose the latest other-office reservation'; end if;
  denied:=false;
  begin update public.surat_registration_drafts set payload=jsonb_set(payload,'{office_id}',to_jsonb(karanganyar)) where id=draft.id;
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Draft office swapped without reservation'; end if;

  perform set_config('request.jwt.claim.sub',admin::text,true);
  perform public.set_user_issuing_office_grants(actor,array[karanganyar]);
  if not exists(select 1 from public.user_access_events where user_id=actor and office_id=solo and action='revoke') then
    raise exception 'Revocation audit missing'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  denied:=false;
  begin perform public.create_surat_registrasi_core(data||jsonb_build_object('reservation_id',draft.reservation_id),actor);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Revoked delegation still submitted'; end if;
  update public.surat_registrasi set status='PROSES' where id=registration.id;
  if (select office_id from public.surat_registrasi where id=registration.id)<>solo then
    raise exception 'Revocation rewrote historical office'; end if;
  update public.profiles set is_active=false where id=actor;
  if public.can_issue_for_office(karanganyar) then raise exception 'Inactive user retains office rights'; end if;
  update public.profiles set is_active=true where id=actor;
  perform set_config('request.jwt.claim.sub',foreign_actor::text,true);
  if public.can_issue_for_office(solo) then raise exception 'Other user inherited a grant'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  if public.can_issue_for_office(solo) then raise exception 'Anonymous issuer accepted'; end if;
  raise notice 'Delegated issuing office: all assertions passed';
end;
$$;

-- RLS must hold under the browser role, not only under postgres test execution.
grant usage on schema auth to authenticated;
set role authenticated;
set "request.jwt.claim.sub"='20000000-0000-4000-8000-000000000002';
do $$ begin
  if exists(select 1 from public.user_access_grants) or exists(select 1 from public.user_access_events) then
    raise exception 'Foreign user read delegation/audit'; end if;
  begin
    insert into public.user_access_grants(user_id,permission_key,office_id,granted_by)
      values(auth.uid(),'submission.issue_for_office','53900000-0000-4000-8000-000000000001',auth.uid());
    raise exception 'Direct grant insert allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
