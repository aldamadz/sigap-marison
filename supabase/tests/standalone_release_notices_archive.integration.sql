select public.release_check(not has_function_privilege('anon','public.get_release_notice_history()','execute'),'anonymous history denied');
select public.release_check(has_function_privilege('authenticated','public.get_release_notice_history()','execute'),'authenticated history granted explicitly');
begin;
select set_config('request.jwt.claim.sub',public.release_test_id(1)::text,true);
set local role authenticated;
select public.update_release_notice('save',0,'SECRET DRAFT ONLY');
select public.release_check(public.get_release_notice_history()->'releases'='[]'::jsonb,'draft is never archived');
select public.update_release_notice('publish',1,'- Perbaikan: Publikasi pertama');
select public.update_release_notice('publish',2,'- Perbaikan: Akan ditarik');
select public.update_release_notice('withdraw',3,null,(public.get_active_release_notice()->'release'->>'id')::uuid);
select public.update_release_notice('save',4,'SECRET DRAFT NEW');
reset role;
update public.release_notice_events set after_state=jsonb_set(jsonb_set(after_state,'{active_release,publishedAt}',to_jsonb('2020-01-01T00:00:00Z'::text)),
  '{active_release,expiresAt}',to_jsonb('2020-01-02T00:00:00Z'::text)) where revision=2;
select set_config('request.jwt.claim.sub',public.release_test_id(3)::text,true);
set local role authenticated;
select public.dismiss_release_notice((public.get_release_notice_history()->'releases'->0->>'id')::uuid);
select public.release_check(jsonb_array_length(public.get_release_notice_history()->'releases')=1,'expired and dismissed publication remains, withdrawal excluded');
select public.release_check(public.get_release_notice_history()->'releases'->0->'items'->>0='- Perbaikan: Publikasi pertama','canonical publication preserved');
select public.release_check((select count(*)=4 from jsonb_object_keys(public.get_release_notice_history()->'releases'->0)),'only content identity date expiry items, no actor or drafts');
select public.release_check(public.get_release_notice_history()::text not like '%SECRET%','private saved content never exposed');
do $$begin
  begin perform * from public.release_notice_events;raise exception 'caller can read private event table';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',public.release_test_id(4)::text,true);
do $$begin begin perform public.get_release_notice_history();raise exception 'inactive account archive read';exception when insufficient_privilege then null;end;end $$;
select set_config('request.jwt.claim.sub',public.release_test_id(5)::text,true);
do $$begin begin perform public.get_release_notice_history();raise exception 'deleted account archive read';exception when insufficient_privilege then null;end;end $$;
select set_config('request.jwt.claim.sub',public.release_test_id(99)::text,true);
do $$begin begin perform public.get_release_notice_history();raise exception 'missing account archive read';exception when insufficient_privilege then null;end;end $$;
select set_config('request.jwt.claim.sub','',true);
do $$begin begin perform public.get_release_notice_history();raise exception 'empty subject archive read';exception when insufficient_privilege then null;end;end $$;
reset role;
insert into public.release_notice_events(revision,action,actor_id,actor_name,before_state,after_state)
select 1000+n,'publish',public.release_test_id(1),'PRIVATE ACTOR','{}',jsonb_build_object('draft_content','PRIVATE DRAFT',
  'active_release',jsonb_build_object('id',public.release_test_id(100+n),'publishedAt',clock_timestamp()-interval '2 days',
  'expiresAt',clock_timestamp()-interval '1 day','items',jsonb_build_array('Notice '||n))) from generate_series(1,60) n;
select set_config('request.jwt.claim.sub',public.release_test_id(3)::text,true);
set local role authenticated;
select public.release_check(jsonb_array_length(public.get_release_notice_history()->'releases')=50,'history response bounded to 50 publications');
select public.release_check(public.get_release_notice_history()->'releases'->0->'items'->>0='Notice 60','newest publication first');
select public.release_check(public.get_release_notice_history()->'releases'->49->'items'->>0='Notice 11','stable revision ordering');
rollback;
select public.release_check((select count(*)=0 from public.release_notice_events),'archive tests rolled back all publications');
do $$begin raise notice 'Release notice archive assertions passed';end $$;
