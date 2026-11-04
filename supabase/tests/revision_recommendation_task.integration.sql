begin;
alter table public.surat_recommendation_tasks alter column status set default 'waiting';
select set_config('request.jwt.claim.sub',test_id(10)::text,true);
set local role authenticated;
insert into surat_registrasi(id,office_id,form_input_data,policy_snapshot)
values(test_id(100),test_id(2),'{"requires_recommendation":false}',test_config());
update surat_registrasi set form_input_data='{"requires_recommendation":true}' where id=test_id(100);
select test_assert((select count(*)=1 from surat_recommendation_tasks where parent_surat_id=test_id(100)),
  'revision enabling recommendation creates a task');
select test_assert((select status='waiting' and required_before_step=3 and office_id=test_id(1)
  and candidate_snapshot @> jsonb_build_array(jsonb_build_object('user_id',test_id(12)::text))
  from surat_recommendation_tasks where parent_surat_id=test_id(100)), 'task targets IT with canonical approval gate');
update surat_registrasi set form_input_data=form_input_data where id=test_id(100);
update surat_registrasi set form_input_data='{"requires_recommendation":false}' where id=test_id(100);
update surat_registrasi set form_input_data='{"requires_recommendation":true}' where id=test_id(100);
select test_assert((select count(*)=1 from surat_recommendation_tasks where parent_surat_id=test_id(100)), 'repeat update does not duplicate task');
select test_assert((select count(*)=1 from surat_reservations), 'repeat update does not reserve another number');
insert into surat_registrasi(id,office_id,form_input_data,policy_snapshot)
values(test_id(101),test_id(2),'{"requires_recommendation":false}',test_config());
update surat_registrasi set form_input_data='{"requires_recommendation":false,"note":"updated"}' where id=test_id(101);
select test_assert(not exists(select 1 from surat_recommendation_tasks where parent_surat_id=test_id(101)), 'no recommendation means no task');

-- Already affected rows have true input and no task. A background update does
-- not impersonate anyone; the next authenticated requester resubmission repairs it.
insert into surat_registrasi(id,office_id,policy_snapshot) values(test_id(102),test_id(2),test_config());
reset role;
select set_config('request.jwt.claim.sub','',true);
update surat_registrasi set form_input_data='{"requires_recommendation":true}' where id=test_id(102);
select test_assert(not exists(select 1 from surat_recommendation_tasks where parent_surat_id=test_id(102)), 'background cannot allocate as requester');
select set_config('request.jwt.claim.sub',test_id(11)::text,true);
set local role authenticated;
update surat_registrasi set form_input_data=form_input_data where id=test_id(102);
select test_assert(not exists(select 1 from surat_recommendation_tasks where parent_surat_id=test_id(102)), 'unrelated user cannot allocate');
select set_config('request.jwt.claim.sub',test_id(10)::text,true);
update surat_registrasi set form_input_data=form_input_data where id=test_id(102);
select test_assert((select count(*)=1 from surat_recommendation_tasks where parent_surat_id=test_id(102)), 'missing historical task repaired on requester update');
reset role;
update surat_recommendation_tasks set status='completed' where parent_surat_id=test_id(102);
set local role authenticated;
update surat_registrasi set form_input_data=form_input_data where id=test_id(102);
select test_assert((select count(*)=1 from surat_recommendation_tasks where parent_surat_id=test_id(102)), 'completed task and history retained');
insert into surat_registrasi(id,office_id) values(test_id(103),test_id(2));
do $$begin
  begin
    update surat_registrasi set form_input_data='{"requires_recommendation":true}' where id=test_id(103);
  exception when others then
    if sqlerrm='Konfigurasi rekomendasi aset belum lengkap.' then return; end if;
    raise;
  end;
  raise exception 'Expected missing configuration rejection';
end$$;
select test_assert((select not(form_input_data ? 'requires_recommendation') from surat_registrasi where id=test_id(103)), 'invalid configuration rolls back entire update');
reset role;
alter table surat_recommendation_tasks add constraint rec06_late_failure check(parent_surat_id<>test_id(104));
select set_config('request.jwt.claim.sub',test_id(10)::text,true);
set local role authenticated;
insert into surat_registrasi(id,office_id,policy_snapshot) values(test_id(104),test_id(2),test_config());
do $$begin
  begin update surat_registrasi set form_input_data='{"requires_recommendation":true}' where id=test_id(104);
  exception when check_violation then return; end;
  raise exception 'Expected late task failure';
end$$;
select test_assert((select not(form_input_data ? 'requires_recommendation') from surat_registrasi where id=test_id(104)), 'late failure rolls back revision input');
select test_assert((select count(*)=2 from surat_reservations), 'late failure does not leak reserved number');
reset role;
alter table surat_recommendation_tasks drop constraint rec06_late_failure;
select set_config('request.jwt.claim.sub',test_id(10)::text,true);
set local role authenticated;
insert into surat_registrasi(id,office_id,policy_snapshot,status) values
  (test_id(108),test_id(2),test_config(),'DONE'),
  (test_id(109),test_id(2),test_config(),'VOID'),
  (test_id(110),test_id(2),test_config(),'REJECTED');
update surat_registrasi set form_input_data='{"requires_recommendation":true}' where id in(test_id(108),test_id(109),test_id(110));
select test_assert(not exists(select 1 from surat_recommendation_tasks where parent_surat_id in(test_id(108),test_id(109),test_id(110))), 'archive updates never create new tasks');
reset role;
select test_assert(not has_function_privilege('authenticated','public.create_missing_revision_recommendation_task()','execute')
  and not has_function_privilege('anon','public.create_missing_revision_recommendation_task()','execute'), 'trigger is not a public endpoint');
select test_assert(has_function_privilege('authenticated','public.create_recommendation_task_for_parent(uuid)','execute'), 'canonical factory grant retained');
select test_assert(pg_get_userbyid((select proowner from pg_proc where oid='public.create_recommendation_task_for_parent(uuid)'::regprocedure))='postgres', 'factory owner retained');
select test_assert(not exists(select 1 from recommendation_numbering_internal.reservation_authorizations), 'no internal capability leak');

-- Entering a resumed step is not an approval. Only the private submit permit
-- and exact resolved event may restore it; signature/final-status guards remain.
insert into surat_revision_events values(test_id(300),test_id(100),'resolved','requester',
  '{"requester_edit_required":true,"resume_step":3}');
update surat_registrasi set data_snapshot=jsonb_build_object('applied_revision',jsonb_build_object('event_id',test_id(300))) where id=test_id(100);
insert into surat_signatures(surat_id,step_order) values(test_id(100),3);
select set_config('request.jwt.claim.sub',test_id(10)::text,true);
set local role authenticated;
do $$begin
  begin update surat_registrasi set current_step=3 where id=test_id(100);
  exception when sqlstate '55000' then return; end;
  raise exception 'Expected gate without private permit';
end$$;
reset role;
insert into requester_revision_internal.permits values(txid_current(),test_id(100),'submit');
set local role authenticated;
update surat_registrasi set current_step=3 where id=test_id(100);
select test_assert((select current_step=3 from surat_registrasi where id=test_id(100)), 'canonical correction returns to requesting step');
do $$begin
  begin update surat_signatures set is_signed=true where surat_id=test_id(100);
  exception when sqlstate '55000' then return; end;
  raise exception 'Expected signature denial while recommendation pending';
end$$;
do $$begin
  begin update surat_registrasi set status='DONE' where id=test_id(100);
  exception when sqlstate '55000' then return; end;
  raise exception 'Expected completion denial while recommendation pending';
end$$;
do $$begin
  begin update surat_registrasi set current_step=4 where id=test_id(100);
  exception when sqlstate '55000' then return; end;
  raise exception 'Expected denial beyond the exact requesting step';
end$$;
reset role;
delete from requester_revision_internal.permits;
select set_config('request.jwt.claim.sub',test_id(10)::text,true);
set local role authenticated;
insert into surat_registrasi(id,office_id,policy_snapshot) values(test_id(200),test_id(2),test_config());
commit;
