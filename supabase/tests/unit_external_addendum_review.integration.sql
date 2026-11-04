insert into public.surat_registrasi(id,created_by,no_surat,judul_surat,status,current_step,form_input_data)
values('79100000-0000-4000-8000-000000000010','61200000-0000-4000-8000-000000000001',
 'UJI-EXTERNAL-ADDENDUM','Preserved partial readiness','PROSES',3,
 '{"request_mode":"unit","requested_unit_count":30,"requested_project":{"id":"23","code":"TEST"}}');
insert into public.surat_signatures(id,surat_id,user_id,step_order,requires_unit_allocation,action_type,
 verification_required,verification_status,verifier_snapshot)
values('79100000-0000-4000-8000-000000000020','79100000-0000-4000-8000-000000000010',
 '61200000-0000-4000-8000-000000000001',3,true,'unit_allocation',true,'pending',
 '[{"user_id":"61200000-0000-4000-8000-000000000002"}]');
insert into public.surat_signatures(id,surat_id,user_id,step_order,action_type)
values('79100000-0000-4000-8000-000000000025','79100000-0000-4000-8000-000000000010',
 '61200000-0000-4000-8000-000000000001',5,'approval');

set role authenticated;
set "request.jwt.claim.sub"='61200000-0000-4000-8000-000000000002';
select public.verify_surat_signature_v2('79100000-0000-4000-8000-000000000020',
 'Baru 3 unit siap; 27 unit lainnya belum siap.',
 '{"allocated_project":{"id":"23","code":"TEST"},"allocated_units":[
  {"value":"B25","raw":{"id":2048},"allocation_detail":{"unit_type":"30 5.3","struktur_atas":"1703120","struktur_bawah":"","production_serial":"001","production_date":"2026-08-21"}},
  {"value":"B34","raw":{"id":2074},"allocation_detail":{"unit_type":"30 5.3","struktur_atas":"1703120","struktur_bawah":"","production_serial":"002","production_date":"2026-08-21"}},
  {"value":"C32","raw":{"id":2173},"allocation_detail":{"unit_type":"30 5.3","struktur_atas":"","struktur_bawah":"","production_serial":"006","production_date":"2026-08-21"}}]}');
reset role;
update public.surat_signatures set is_signed=true where id='79100000-0000-4000-8000-000000000020';
do $$ begin
 if not (select unit_allocation_internal.has_valid_review(id,form_input_data) from public.surat_registrasi
     where id='79100000-0000-4000-8000-000000000010') then
   raise exception 'Original exact review path regressed'; end if;
end $$;
update public.surat_registrasi set current_step=5,form_input_data=
 jsonb_set(jsonb_set(jsonb_set(jsonb_set(form_input_data,
 '{allocated_units,0,allocation_detail,struktur_bawah}','"246000"'),
 '{allocated_units,1,allocation_detail,struktur_bawah}','"434492"'),
 '{allocated_units,2,allocation_detail,struktur_atas}','"1826521"'),
 '{allocated_units,2,allocation_detail,struktur_bawah}','"1203009"')
where id='79100000-0000-4000-8000-000000000010';

create temporary table original_review_proof as select md5(to_jsonb(h)::text) fingerprint
from public.surat_unit_allocation_history h where surat_id='79100000-0000-4000-8000-000000000010';
do $$ begin
 if (select unit_allocation_internal.has_valid_review(id,form_input_data) from public.surat_registrasi
     where id='79100000-0000-4000-8000-000000000010') then
   raise exception 'Financial edit without audited external revision accepted'; end if;
end $$;

insert into public.external_submission_decision_events values(
 '79100000-0000-4000-8000-000000000040','79100000-0000-4000-8000-000000000041',
 '79100000-0000-4000-8000-000000000010','revision_required',1);
insert into public.surat_revision_events(id,surat_id,actor_id,target_type,target_user_ids,from_step,target_step,
 reason,changes,status,resolved_at,resolved_by)
values('79100000-0000-4000-8000-000000000030','79100000-0000-4000-8000-000000000010',
 '61200000-0000-4000-8000-000000000001','requester',array['61200000-0000-4000-8000-000000000001'::uuid],5,1,
 'Perbaiki nominal adendum.',
 '{"external_submission_revision":true,"revision_generation":1,"restart_step":5,
   "external_decision_event_id":"79100000-0000-4000-8000-000000000040","external_event_id":"79100000-0000-4000-8000-000000000041"}',
 'resolved',clock_timestamp(),'61200000-0000-4000-8000-000000000001');
insert into public.surat_external_revision_history
select '79100000-0000-4000-8000-000000000050',d.id,'79100000-0000-4000-8000-000000000040',1,
 to_jsonb(d),(select jsonb_agg(to_jsonb(s) order by step_order) from public.surat_signatures s where s.surat_id=d.id)
from public.surat_registrasi d where id='79100000-0000-4000-8000-000000000010';
update public.surat_registrasi set data_snapshot=jsonb_build_object('external_revision_current',
 jsonb_build_object('revision_event_id','79100000-0000-4000-8000-000000000030','generation',1))
where id='79100000-0000-4000-8000-000000000010';

do $$ begin
 if not (select unit_allocation_internal.has_valid_review(id,form_input_data) from public.surat_registrasi
     where id='79100000-0000-4000-8000-000000000010') then
   raise exception 'Valid preserved review rejected after audited financial correction'; end if;
 if (select unit_allocation_internal.has_valid_review_pre_external_addendum(id,form_input_data) from public.surat_registrasi
     where id='79100000-0000-4000-8000-000000000010') then
   raise exception 'Fixture did not reproduce original exact-snapshot rejection'; end if;
end $$;

create function pg_temp.assert_invalid_unit_input(p_input jsonb) returns void language plpgsql as $$
declare original_input jsonb;
begin
 select form_input_data into original_input from public.surat_registrasi where id='79100000-0000-4000-8000-000000000010';
 update public.surat_registrasi set form_input_data=p_input where id='79100000-0000-4000-8000-000000000010';
 if unit_allocation_internal.has_valid_review('79100000-0000-4000-8000-000000000010',p_input) then
   raise exception 'Altered allocation or post-archive financial edit accepted'; end if;
 update public.surat_registrasi set form_input_data=original_input where id='79100000-0000-4000-8000-000000000010';
end $$;
do $$ declare input jsonb; path text[];
begin
 select form_input_data into input from public.surat_registrasi where id='79100000-0000-4000-8000-000000000010';
 for path in select p from (values
  (array['allocated_units','0','value']),(array['allocated_units','0','raw','id']),
  (array['allocated_units','0','allocation_detail','unit_type']),
  (array['allocated_units','0','allocation_detail','production_serial']),
  (array['allocated_units','0','allocation_detail','production_date']),
  (array['allocated_units','0','allocation_detail','struktur_atas']),
  (array['allocated_units','0','allocation_detail','struktur_bawah'])
 ) paths(p) loop perform pg_temp.assert_invalid_unit_input(jsonb_set(input,path,'"forged"')); end loop;
 perform pg_temp.assert_invalid_unit_input(jsonb_set(input,'{requested_unit_count}','31'));
 perform pg_temp.assert_invalid_unit_input(jsonb_set(input,'{allocated_units}',(input->'allocated_units')-2));
 perform pg_temp.assert_invalid_unit_input(jsonb_set(input,'{requested_project,id}','"24"'));
 perform pg_temp.assert_invalid_unit_input(jsonb_set(input,'{allocated_project,id}','"24"'));
 perform pg_temp.assert_invalid_unit_input(jsonb_set(input,'{allocated_by_signature_id}','"forged"'));
 -- Even a different valid monetary value cannot be substituted after the archive.
 perform pg_temp.assert_invalid_unit_input(jsonb_set(input,'{allocated_units,0,allocation_detail,struktur_bawah}','"246001"'));
end $$;

do $$ declare original_changes jsonb; original_snapshot jsonb; input jsonb;
begin
 select form_input_data into input from public.surat_registrasi where id='79100000-0000-4000-8000-000000000010';
 select changes into original_changes from public.surat_revision_events where id='79100000-0000-4000-8000-000000000030';
 update public.surat_revision_events set status='open' where id='79100000-0000-4000-8000-000000000030';
 if unit_allocation_internal.has_valid_review('79100000-0000-4000-8000-000000000010',input) then raise exception 'Open revision accepted'; end if;
 update public.surat_revision_events set status='resolved',changes=jsonb_set(changes,'{restart_step}','3')
   where id='79100000-0000-4000-8000-000000000030';
 if unit_allocation_internal.has_valid_review('79100000-0000-4000-8000-000000000010',input) then raise exception 'Recheck-required reviewer bypassed'; end if;
 update public.surat_revision_events set changes=jsonb_set(original_changes,'{revision_generation}','2') where id='79100000-0000-4000-8000-000000000030';
 if unit_allocation_internal.has_valid_review('79100000-0000-4000-8000-000000000010',input) then raise exception 'Mismatched generation accepted'; end if;
 update public.surat_revision_events set changes=original_changes where id='79100000-0000-4000-8000-000000000030';
 select signatures_snapshot into original_snapshot from public.surat_external_revision_history where id='79100000-0000-4000-8000-000000000050';
 update public.surat_external_revision_history set signatures_snapshot=jsonb_set(signatures_snapshot,'{0,verified_by}',
   '"61200000-0000-4000-8000-000000000003"') where id='79100000-0000-4000-8000-000000000050';
 if unit_allocation_internal.has_valid_review('79100000-0000-4000-8000-000000000010',input) then raise exception 'Different archived verifier accepted'; end if;
 update public.surat_external_revision_history set signatures_snapshot=original_snapshot where id='79100000-0000-4000-8000-000000000050';
 update public.surat_external_revision_history set signatures_snapshot=jsonb_set(signatures_snapshot,'{0,verification_note}',
   '"Forged examiner note"') where id='79100000-0000-4000-8000-000000000050';
 if unit_allocation_internal.has_valid_review('79100000-0000-4000-8000-000000000010',input) then raise exception 'Different archived note accepted'; end if;
 update public.surat_external_revision_history set signatures_snapshot=original_snapshot where id='79100000-0000-4000-8000-000000000050';
 update public.surat_revision_events set resolved_by=null where id='79100000-0000-4000-8000-000000000030';
 if unit_allocation_internal.has_valid_review('79100000-0000-4000-8000-000000000010',input) then raise exception 'Unattributed resolution accepted'; end if;
 update public.surat_revision_events set resolved_by='61200000-0000-4000-8000-000000000001' where id='79100000-0000-4000-8000-000000000030';
 insert into public.external_submission_decision_events values('79100000-0000-4000-8000-000000000060',
  '79100000-0000-4000-8000-000000000061','79100000-0000-4000-8000-000000000010','revision_required',2);
 if unit_allocation_internal.has_valid_review('79100000-0000-4000-8000-000000000010',input) then raise exception 'Stale external generation accepted'; end if;
 delete from public.external_submission_decision_events where id='79100000-0000-4000-8000-000000000060';
end $$;

-- Completion still requires the last signature; no correction auto-approves it.
do $$ begin
 begin
  update public.surat_registrasi set status='DONE' where id='79100000-0000-4000-8000-000000000010';
  raise exception 'Missing final signature accepted';
 exception when raise_exception then if sqlerrm='Missing final signature accepted' then raise; end if; end;
end $$;
update public.surat_signatures set is_signed=true where id='79100000-0000-4000-8000-000000000025';
update public.surat_registrasi set status='DONE' where id='79100000-0000-4000-8000-000000000010';
do $$ declare name text;
begin
 if not exists(select 1 from public.surat_unit_allocation_history h join original_review_proof p
   on p.fingerprint=md5(to_jsonb(h)::text) where h.surat_id='79100000-0000-4000-8000-000000000010') then
   raise exception 'Original immutable review changed'; end if;
 foreach name in array array['has_valid_review(uuid,jsonb)','has_valid_review_pre_external_addendum(uuid,jsonb)',
   'has_preserved_external_addendum_review(uuid,jsonb)','without_addendum_values(jsonb)'] loop
  if has_function_privilege('authenticated','unit_allocation_internal.'||name,'execute')
    or has_function_privilege('anon','unit_allocation_internal.'||name,'execute')
    or has_function_privilege('service_role','unit_allocation_internal.'||name,'execute') then
    raise exception 'Private review helper exposed'; end if;
 end loop;
 raise notice 'External Unit addendum review: all assertions passed';
end $$;
