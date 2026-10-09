-- Actual PostgreSQL RPC execution under authenticated callers, never a client-only assertion.
reset role;
select keu10_test.assert(not exists(select 1 from keu10_test.parity_wrappers_before saved
  join pg_proc actual on actual.oid=saved.oid where md5(actual.prosrc)<>saved.body_hash),
  'Requester, checklist, KEU10 and unrelated function bodies preserved');
select keu10_test.assert(not exists(select 1 from keu10_test.parity_acl_before saved
  join pg_proc actual on actual.oid=saved.oid where actual.proacl is distinct from saved.proacl),
  'Patched function ACLs preserved');
select keu10_test.assert(not has_function_privilege('authenticated',
  'public.submit_external_submission_revision_pre_requester_edit(uuid,uuid,jsonb,text)','execute')
  and not has_function_privilege('service_role',
  'public.submit_external_submission_revision_pre_requester_edit(uuid,uuid,jsonb,text)','execute'),
  'External delegated core remains private');
select keu10_test.assert(not has_function_privilege('authenticated','public.effective_fund_rab_requirements(uuid)','execute')
  and not has_function_privilege('anon','public.fund_rab_stage(uuid)','execute'),
  'Attachment helpers are not public RPC bypasses');
select keu10_test.assert((select relrowsecurity from pg_class where oid='public.unit_revision_availability_receipts'::regclass)
  and not has_table_privilege('authenticated','public.unit_revision_availability_receipts','select')
  and not has_table_privilege('authenticated','public.unit_revision_availability_receipts','insert')
  and not has_table_privilege('anon','public.unit_revision_availability_receipts','select')
  and has_table_privilege('service_role','public.unit_revision_availability_receipts','select,insert,update')
  and not has_table_privilege('service_role','public.unit_revision_availability_receipts','delete'),
  'Receipts are RLS-protected service-write-only, not browser attestations');

create function keu10_test.rab_case(p_n integer,p_label text,p_action text default 'configured_input')
returns uuid language plpgsql as $$
declare v_surat uuid:=keu10_test.id(12000+p_n); v_sig uuid:=keu10_test.id(13000+p_n);
begin
  insert into public.surat_registrasi(id,no_surat,created_by,status,current_step,form_input_data,location_snapshot)
  values(v_surat,'RAB-PARITY-'||p_n,keu10_test.id(1),'PROSES',1,
    '{"request_category":"non_asset","requester_has_rab":false,"items":[{"name":"Item"}]}',
    '{"form":{"nomor_form":"FM-UAI.PGD-01-00"}}');
  insert into public.surat_signatures(id,surat_id,user_id,step_order,role_name,label_jabatan,
    action_type,verification_required,verification_status,verifier_snapshot,input_schema_snapshot,attachment_requirements_snapshot)
  values(v_sig,v_surat,keu10_test.id(3),1,'memeriksa',p_label,p_action,true,'pending',
    jsonb_build_array(jsonb_build_object('user_id',keu10_test.id(11))),
    '{"fields":[{"key":"memo","label":"Memo","type":"text","required":true}]}',
    '[{"requirement_key":"rab","label":"Legacy RAB","is_required":true,"min_files":1},
      {"requirement_key":"support","label":"Bukti lain","is_required":true,"min_files":1}]');
  return v_sig;
end $$;
select keu10_test.rab_case(1,'Mgr. Perencanaan');
select keu10_test.rab_case(2,'Mgr. Perencanaan','approval');
select keu10_test.rab_case(3,'Mgr. HRD & GA');
select keu10_test.rab_case(4,'Mgr. HRD & GA');
select keu10_test.rab_case(5,'Mgr. Keuangan');
select keu10_test.rab_case(6,'Mgr. Perencanaan');
select keu10_test.rab_case(7,'Mgr. Perencanaan');
update public.surat_registrasi set location_snapshot='{"form":{"nomor_form":"FM-UAI.KEU-10-00"}}'
  where id=keu10_test.id(12005);
update public.surat_registrasi set form_input_data=jsonb_set(form_input_data,'{request_category}','"asset"')
  where id=keu10_test.id(12006);
update public.surat_registrasi set form_input_data=form_input_data-'requester_has_rab' where id=keu10_test.id(12007);
update public.surat_signatures set attachment_requirements_snapshot='[]' where id in (keu10_test.id(13002),keu10_test.id(13007));
select keu10_test.assert((select bool_and(r->'is_required'='false'::jsonb and r->>'min_files'='0')
  from public.surat_signatures signature cross join lateral
    jsonb_array_elements(public.effective_fund_rab_requirements(signature.id)) r
  where signature.id in (keu10_test.id(13001),keu10_test.id(13003)) and r->>'requirement_key'='rab'),
  'Old required RAB snapshots are optional for both Planning and HRD');

set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(11)::text,false);
select keu10_test.expect_error('22023',format('select public.verify_surat_signature_v2(%L,null,%L)',
  keu10_test.id(13001),'{"checker_input":{"memo":"OK"},"requester_has_rab":true}'));
select public.verify_surat_signature(keu10_test.id(13002),null);
select public.verify_surat_signature_v2(keu10_test.id(13007),null,'{"checker_input":{"memo":"OK"}}');
-- Legacy checked flag without a file must not introduce an automatic RAB requirement.
update public.surat_registrasi set form_input_data=jsonb_set(form_input_data,'{requester_has_rab}','true') where id=keu10_test.id(12001);
-- Only the unrelated support requirement still blocks submission.
select keu10_test.expect_error('22023',format('select public.verify_surat_signature_v2(%L,null,%L)',
  keu10_test.id(13001),'{"checker_input":{"memo":"OK"}}'));
insert into public.surat_attachments(surat_id,signature_id,stage,requirement_key,file_url)
  values(keu10_test.id(12001),keu10_test.id(13001),'approval','support','private://checker/support.pdf');
select public.verify_surat_signature_v2(keu10_test.id(13001),null,'{"checker_input":{"memo":"OK"}}');
select keu10_test.assert((select verification_status='verified' from public.surat_signatures where id=keu10_test.id(13001)),
  'Planning accepts no RAB with legacy checked flag; unrelated requirements remain enforced');
select keu10_test.assert((select bool_and(verification_status='verified') from public.surat_signatures
  where id in (keu10_test.id(13002),keu10_test.id(13007))),
  'Planning plain-approval legacy and canonical no-flag cases accept no RAB');

-- HRD ignores only the stale mandatory RAB policy, preserving input and other attachments.
select keu10_test.expect_error('22023',format('select public.verify_surat_signature_v2(%L,null,%L)',
  keu10_test.id(13003),'{"checker_input":{"memo":"OK"}}'));
insert into public.surat_attachments(surat_id,signature_id,stage,requirement_key,file_url)
  values(keu10_test.id(12003),keu10_test.id(13003),'approval','support','private://hrd/support.pdf'),
    (keu10_test.id(12003),keu10_test.id(13003),'approval','rab','private://hrd/historical-rab.pdf'),
    (keu10_test.id(12004),keu10_test.id(13004),'approval','support','private://hrd/support2.pdf');
select public.verify_surat_signature_v2(keu10_test.id(13003),null,'{"checker_input":{"memo":"OK"}}');
update public.surat_registrasi set data_snapshot=jsonb_build_object('verification_drafts',
  jsonb_build_object(keu10_test.id(13004)::text,jsonb_build_object('input','{"checker_input":{"memo":"OK"}}'::jsonb)))
  where id=keu10_test.id(12004);
select public.verify_surat_signature(keu10_test.id(13004),null);
select keu10_test.assert((select count(*)=2 from public.surat_attachments where surat_id=keu10_test.id(12003)),
  'HRD historical RAB and unrelated attachment retained');
select keu10_test.assert((select bool_and(verification_status='verified') from public.surat_signatures
  where id in (keu10_test.id(13003),keu10_test.id(13004))),'HRD canonical and legacy succeed without required RAB');
select keu10_test.expect_error('22023',format('select public.verify_surat_signature_v2(%L,null,%L)',
  keu10_test.id(13005),'{"checker_input":{"memo":"OK"}}'));
select keu10_test.expect_error('22023',format('select public.verify_surat_signature_v2(%L,null,%L)',
  keu10_test.id(13006),'{"checker_input":{"memo":"OK"}}'));
select set_config('request.jwt.claim.sub',keu10_test.id(12)::text,false);
select keu10_test.expect_error('42501',format('select public.verify_surat_signature(%L,null)',keu10_test.id(13007)));
select set_config('request.jwt.claim.sub','',false);
select keu10_test.expect_error('42501',format('select public.verify_surat_signature_v2(%L,null,%L)',
  keu10_test.id(13007),'{"checker_input":{"memo":"OK"}}'));

reset role;
-- Add a checklist HRD case using the real fund wrapper, not a permissive replacement.
select keu10_test.rab_case(8,'Mgr. HRD & GA');
select keu10_test.rab_case(9,'Mgr. SDM');
select keu10_test.rab_case(10,'Mgr. Sumber Daya Manusia');
select keu10_test.rab_case(11,'Mgr. Perencanaan');
select keu10_test.rab_case(12,'Mgr. HRD & GA');
update public.surat_registrasi set form_input_data=form_input_data-'requester_has_rab'||'{"rab_not_required":true}'::jsonb
  where id=keu10_test.id(12012);
insert into public.surat_attachments(surat_id,signature_id,stage,requirement_key,file_url,file_name,file_type,file_size)
  values(keu10_test.id(12011),keu10_test.id(13011),'approval','rab','private://planning/optional.pdf','rab.pdf','application/pdf',100);
update public.surat_signatures set input_schema_snapshot='{"review_mode":"fund_item_checklist","fields":[{"key":"item_checks","label":"Items","type":"text","required":true}]}'
  where id=keu10_test.id(13008);
insert into public.surat_attachments(surat_id,signature_id,stage,requirement_key,file_url)
  values(keu10_test.id(12008),keu10_test.id(13008),'approval','support','private://hrd/checklist-support.pdf'),
    (keu10_test.id(12009),keu10_test.id(13009),'approval','support','private://sdm/support.pdf'),
    (keu10_test.id(12010),keu10_test.id(13010),'approval','support','private://sdm/support2.pdf'),
    (keu10_test.id(12011),keu10_test.id(13011),'approval','support','private://planning/support.pdf'),
    (keu10_test.id(12012),keu10_test.id(13012),'approval','support','private://hrd/support3.pdf');
update public.surat_registrasi set form_input_data=jsonb_set(form_input_data,'{requester_has_rab}','true')
  where id in (keu10_test.id(12009),keu10_test.id(12010));
update public.surat_registrasi set data_snapshot=jsonb_build_object('verification_drafts',
  jsonb_build_object(keu10_test.id(13010)::text,jsonb_build_object('input','{"checker_input":{"memo":"OK"}}'::jsonb)))
  where id=keu10_test.id(12010);
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(11)::text,false);
select keu10_test.expect_error('22023',format('select public.verify_surat_signature_v2(%L,null,%L)',
  keu10_test.id(13008),'{"checker_input":{"item_checks":"[]"}}'));
select public.verify_surat_signature_v2(keu10_test.id(13008),null,
  '{"checker_input":{"item_checks":"[{\"item_index\":0,\"item\":{\"name\":\"Item\"},\"checked\":true,\"note\":\"OK\"}]"}}');
select public.verify_surat_signature_v2(keu10_test.id(13009),null,'{"checker_input":{"memo":"OK"}}');
select public.verify_surat_signature(keu10_test.id(13010),null);
select public.verify_surat_signature_v2(keu10_test.id(13011),null,'{"checker_input":{"memo":"OK"}}');
select public.verify_surat_signature_v2(keu10_test.id(13012),null,'{"checker_input":{"memo":"OK"}}');
select keu10_test.assert((select verification_status='verified' from public.surat_signatures where id=keu10_test.id(13011))
  and (select count(*)=1 from public.surat_attachments where surat_id=keu10_test.id(12011) and requirement_key='rab'),
  'Planning may upload an optional RAB when requester has none');
select keu10_test.assert((select bool_and(verification_status='verified') from public.surat_signatures
  where id in (keu10_test.id(13009),keu10_test.id(13010))),
  'SDM and Sumber Daya Manusia ignore stale RAB while preserving other requirements');

reset role;
update public.master_offices set marison_branch_id=201,marison_synced_at=now() where id=keu10_test.id(203);
update public.master_projects set code='OLD',marison_project_id=301,marison_synced_at=now() where id=keu10_test.id(301);
update public.master_projects set code='NEW',marison_project_id=302,marison_synced_at=now(),office_id=keu10_test.id(203)
  where id=keu10_test.id(302);
do $$ declare n integer; v_surat uuid; v_event uuid;
begin
  for n in 1..18 loop
    v_surat:=keu10_test.id(14000+n); v_event:=keu10_test.id(15000+n);
    insert into public.surat_registrasi(id,no_surat,created_by,entity_id,office_id,project_id,dept_id,letter_type_id,
      judul_surat,request_place,request_date,status,current_step,form_input_data,data_snapshot)
    values(v_surat,'UNIT-PARITY-'||n,keu10_test.id(1),keu10_test.id(401),keu10_test.id(202),keu10_test.id(301),
      keu10_test.id(105),keu10_test.id(501),'Frozen title','Frozen place','2026-10-09','MENUNGGU_PERBAIKAN',1,
      '{"request_category":"unit","requested_project":{"id":301,"code":"OLD"},"requested_unit_count":1,
        "allocated_project":{"id":301,"code":"OLD"},"allocated_units":[{"id":"old-unit"}],"allocated_unit_count":1,
        "allocated_at":"2026-10-01","allocated_by_signature_id":"old","unit_config_snapshot":{"old":true},"protected_other":"keep"}',
      jsonb_build_object('revision',jsonb_build_object('event_id',v_event),
        'allocated_project','{"code":"OLD"}'::jsonb,'allocated_units','[{"id":"old-unit"}]'::jsonb,
        'verification_drafts',jsonb_build_object(keu10_test.id(16000+n)::text,
          jsonb_build_object('input','{"allocated_project":{"code":"OLD"},"allocated_units":[{"id":"old-unit"}]}'::jsonb)),
        'verification_inputs','{"latest":{"allocated_units":[{"id":"old-unit"}]}}'::jsonb));
    insert into public.surat_signatures(id,surat_id,user_id,step_order,role_name,label_jabatan,action_type,
      requires_unit_allocation,verification_required,verification_status,verifier_snapshot)
    values(keu10_test.id(16000+n),v_surat,keu10_test.id(3),1,'memeriksa','Mgr. Perencanaan','unit_allocation',true,true,'verified',
      jsonb_build_array(jsonb_build_object('user_id',keu10_test.id(11))));
    insert into public.surat_revision_events(id,surat_id,actor_id,target_type,target_user_ids,from_step,target_step,reason,changes)
    values(v_event,v_surat,keu10_test.id(3),'requester',array[keu10_test.id(1)],1,1,'External Unit revision',
      '{"external_submission_revision":true,"revision_generation":1,"restart_step":1}');
  end loop;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
select (public.create_external_submission_revision_draft(keu10_test.id(15000+n))).id from generate_series(1,18) n;

reset role;
create function keu10_test.unit_submit(p_n integer,p_project jsonb default '{"id":302,"code":"NEW"}',p_count text default '1',p_override jsonb default '{}')
returns jsonb language plpgsql as $$
declare v_draft public.surat_registration_drafts%rowtype; v_data jsonb;
begin
  select * into v_draft from public.surat_registration_drafts where revision_event_id=keu10_test.id(15000+p_n);
  v_data:=jsonb_set(jsonb_set(v_draft.payload->'formData','{form_input_data,requested_project}',p_project),
    '{form_input_data,requested_unit_count}',to_jsonb(p_count));
  return public.submit_external_submission_revision(v_draft.revision_event_id,v_draft.id,
    v_data||jsonb_build_object('unit_availability_receipt_id',keu10_test.id(17000+p_n))||p_override,'Correct project');
end $$;
set role authenticated;
select keu10_test.expect_error('22023','select keu10_test.unit_submit(1,''{"id":999,"code":"FORGED"}'')');
select keu10_test.expect_error('22023','select keu10_test.unit_submit(1,''{"id":302,"code":"OLD"}'')');
select keu10_test.expect_error('22023','select keu10_test.unit_submit(1,''{"id":302,"code":"NEW"}'',''1bad'')');
select keu10_test.expect_error('22023','select keu10_test.unit_submit(1,''null'')');
select keu10_test.expect_error('22023','select keu10_test.unit_submit(1,''{"id":0,"code":"NEW"}'')');
select keu10_test.expect_error('42501','select keu10_test.unit_submit(1)');
select keu10_test.expect_error('22023','select keu10_test.unit_submit(1,''{"id":302,"code":"NEW"}'',''1'',''{"unit_availability_receipt_id":null}'')');
select keu10_test.expect_error('22023','select keu10_test.unit_submit(1,''{"id":302,"code":"NEW"}'',''1'',''{"unit_availability_receipt_id":"forged"}'')');
select keu10_test.expect_error('42501','insert into public.unit_revision_availability_receipts(id) values(gen_random_uuid())');
select keu10_test.expect_error('22023',format('select keu10_test.unit_submit(1,''{"id":302,"code":"NEW"}'',''1'',%L)',
  jsonb_build_object('entity_id',keu10_test.id(999))));
select keu10_test.expect_error('22023','select keu10_test.unit_submit(1,''{"id":302,"code":"NEW"}'',''1'',''{"no_surat":"FORGED"}'')');
select set_config('request.jwt.claim.sub',keu10_test.id(12)::text,false);
select keu10_test.expect_error('42501','select keu10_test.unit_submit(1)');
select set_config('request.jwt.claim.sub','',false);
select keu10_test.expect_error('42501','select keu10_test.unit_submit(1)');

reset role;
update public.profiles set is_active=false where id=keu10_test.id(1);
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
select keu10_test.expect_error('42501','select keu10_test.unit_submit(1)');
reset role;
update public.profiles set is_active=true where id=keu10_test.id(1);
update public.surat_registration_drafts set expires_at=now()-interval '1 minute' where revision_event_id=keu10_test.id(15002);
update public.surat_registration_drafts set status='SUBMITTED' where revision_event_id=keu10_test.id(15003);
update public.surat_registration_drafts set created_by=keu10_test.id(12) where revision_event_id=keu10_test.id(15004);
update public.surat_revision_events set status='resolved' where id=keu10_test.id(15005);
update public.surat_registrasi set status='PROSES' where id=keu10_test.id(14006);
update public.surat_registrasi set data_snapshot=jsonb_set(data_snapshot,'{revision,event_id}',to_jsonb(keu10_test.id(999)::text)) where id=keu10_test.id(14007);
update public.surat_registration_drafts set payload=jsonb_set(payload,'{externalRevision,generation}','2') where revision_event_id=keu10_test.id(15008);
update public.surat_registration_drafts set no_surat='FORGED' where revision_event_id=keu10_test.id(15009);
update public.surat_registration_drafts set expires_at=null where revision_event_id=keu10_test.id(15010);
set role authenticated;
select keu10_test.expect_error('40001','select keu10_test.unit_submit(2)');
select keu10_test.expect_error('42501','select keu10_test.unit_submit(3)');
select keu10_test.expect_error('42501','select keu10_test.unit_submit(4)');
select keu10_test.expect_error('P0002','select keu10_test.unit_submit(5)');
select keu10_test.expect_error('40001','select keu10_test.unit_submit(6)');
select keu10_test.expect_error('40001','select keu10_test.unit_submit(7)');
select keu10_test.expect_error('40001','select keu10_test.unit_submit(8)');
select keu10_test.expect_error('40001','select keu10_test.unit_submit(9)');
select keu10_test.expect_error('40001','select keu10_test.unit_submit(10)');

reset role;
update public.master_projects set marison_review_reasons=array['Branch proyek external belum tersedia'] where id=keu10_test.id(302);
set role authenticated;
select keu10_test.expect_error('22023','select keu10_test.unit_submit(1)');
reset role;
update public.master_projects set marison_review_reasons='{}',marison_synced_at=null where id=keu10_test.id(302);
set role authenticated;
select keu10_test.expect_error('22023','select keu10_test.unit_submit(1)');
reset role;
update public.master_projects set marison_synced_at=now() where id=keu10_test.id(302);
update public.master_offices set marison_synced_at=null where id=keu10_test.id(203);
set role authenticated;
select keu10_test.expect_error('22023','select keu10_test.unit_submit(1)');
reset role;
update public.master_offices set marison_synced_at=now(),marison_branch_id=0 where id=keu10_test.id(203);
set role authenticated;
select keu10_test.expect_error('22023','select keu10_test.unit_submit(1)');
reset role;
update public.master_offices set marison_branch_id=201 where id=keu10_test.id(203);
-- Fixture backend attestation uses only the same service-role table privileges.
set role service_role;
insert into public.unit_revision_availability_receipts(id,actor_id,revision_event_id,draft_id,project_id,project_code,requested_count,available_count)
select keu10_test.id(17000+n),keu10_test.id(1),keu10_test.id(15000+n),draft.id,
  case when n=11 then 301 else 302 end,case when n=11 then 'OLD' else 'NEW' end,1,5
from generate_series(1,18) n join public.surat_registration_drafts draft on draft.revision_event_id=keu10_test.id(15000+n)
where n in (1,11,12,13,14,15,16,17,18);
select keu10_test.assert((select expires_at-created_at=interval '2 minutes' and consumed_at is null
  from public.unit_revision_availability_receipts where id=keu10_test.id(17001)),
  'SQL default receipt lifetime is two minutes');
select keu10_test.expect_error('23514',format('update public.unit_revision_availability_receipts set available_count=0 where id=%L',keu10_test.id(17001)));
update public.unit_revision_availability_receipts set actor_id=keu10_test.id(12) where id=keu10_test.id(17013);
update public.unit_revision_availability_receipts set expires_at=now()-interval '1 second' where id=keu10_test.id(17014);
update public.unit_revision_availability_receipts set project_code='OLD' where id=keu10_test.id(17015);
update public.unit_revision_availability_receipts set requested_count=2 where id=keu10_test.id(17016);
update public.unit_revision_availability_receipts set consumed_at=now() where id=keu10_test.id(17017);
update public.unit_revision_availability_receipts set revision_event_id=keu10_test.id(15017) where id=keu10_test.id(17018);
set role authenticated;
select keu10_test.expect_error('42501','select keu10_test.unit_submit(13)');
select keu10_test.expect_error('42501','select keu10_test.unit_submit(14)');
select keu10_test.expect_error('42501','select keu10_test.unit_submit(15)');
select keu10_test.expect_error('42501','select keu10_test.unit_submit(16)');
select keu10_test.expect_error('42501','select keu10_test.unit_submit(17)');
select keu10_test.expect_error('42501','select keu10_test.unit_submit(18)');
select keu10_test.expect_error('42501',format('select keu10_test.unit_submit(1,''{"id":302,"code":"NEW"}'',''1'',%L)',
  jsonb_build_object('unit_availability_receipt_id',keu10_test.id(17011))));
select keu10_test.unit_submit(1,'{"id":302,"code":"NEW"}','1','{"judul_surat":"FORGED TITLE","request_place":"FORGED PLACE","request_date":"2026-01-01"}');
select keu10_test.assert((select form_input_data#>>'{requested_project,code}'='NEW'
  and not(form_input_data ?| array['allocated_project','allocated_units','allocated_unit_count','allocated_at','allocated_by_signature_id','unit_config_snapshot'])
  and not(data_snapshot ?| array['allocated_project','allocated_units','allocated_unit_count','verification_inputs','verification_drafts','unit_config_snapshot'])
  and no_surat='UNIT-PARITY-1' and project_id=keu10_test.id(301) and office_id=keu10_test.id(202)
  and judul_surat='Frozen title' and request_place='Frozen place' and request_date='2026-10-09'
  and form_input_data->>'protected_other'='keep' and status='MENUNGGU_PERBAIKAN'
  from public.surat_registrasi where id=keu10_test.id(14001)),
  'Changed project clears every old allocation source, keeps identity/number, routes real reallocation');
select keu10_test.assert((select status='open' and target_type='checker' from public.surat_revision_events where id=keu10_test.id(15001)),
  'Changed project reopens allocation event');
select keu10_test.expect_error('P0002','select keu10_test.unit_submit(1)');
reset role;
select keu10_test.assert((select consumed_at is not null from public.unit_revision_availability_receipts where id=keu10_test.id(17001)),
  'Successful submission consumes the matching receipt');
set role authenticated;
select keu10_test.unit_submit(11,'{"id":301,"code":"OLD"}');
select keu10_test.assert((select form_input_data->'allocated_units'='[{"id":"old-unit"}]'::jsonb
  and form_input_data#>>'{requested_project,code}'='OLD' and status='PROSES'
  from public.surat_registrasi where id=keu10_test.id(14011)),'Unchanged valid project keeps existing allocation');

-- Failure after consumption in the canonical acceptance route rolls the whole transaction back.
reset role;
update public.surat_signatures set verifier_snapshot='[]' where id=keu10_test.id(16012);
set role authenticated;
select keu10_test.expect_error('P0001','select keu10_test.unit_submit(12)');
reset role;
select keu10_test.assert((select consumed_at is null from public.unit_revision_availability_receipts where id=keu10_test.id(17012))
  and (select form_input_data#>>'{requested_project,code}'='OLD' from public.surat_registrasi where id=keu10_test.id(14012))
  and (select status='DRAFT' from public.surat_registration_drafts where revision_event_id=keu10_test.id(15012)),
  'Post-consumption RPC failure rolls back receipt, document, and draft together');

-- A service-role session without an authenticated owner does not bypass the SQL guard.
reset role;
set role service_role;
select set_config('request.jwt.claim.sub','',false);
select keu10_test.expect_error('42501','select keu10_test.unit_submit(12)');
reset role;
select keu10_test.assert((select status='DRAFT' from public.surat_registration_drafts where revision_event_id=keu10_test.id(15012)),
  'Rejected owner/auth calls do not mutate drafts');
do $$ begin raise notice 'Fund RAB and Unit revision parity: all assertions passed'; end $$;
