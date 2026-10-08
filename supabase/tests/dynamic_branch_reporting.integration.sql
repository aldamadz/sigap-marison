insert into public.master_offices(id,kedudukan,parent_id) values
 ('00000000-0000-4000-8000-000000000001','Pusat',null),
 ('00000000-0000-4000-8000-000000000002','KC','00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000003','KC','00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000004','KCP','00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000005','KCP','00000000-0000-4000-8000-000000000004');
insert into public.profiles(id,job_title,office_id,parent_id,role) values
 ('10000000-0000-4000-8000-000000000001','Director Utama','00000000-0000-4000-8000-000000000001',null,'admin'),
 ('10000000-0000-4000-8000-000000000002','Branch Manager','00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','user'),
 ('10000000-0000-4000-8000-000000000003','BM','00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','user'),
 ('10000000-0000-4000-8000-000000000004','Staff','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','user'),
 ('10000000-0000-4000-8000-000000000005','Supervisor Marketing','00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','user'),
 ('10000000-0000-4000-8000-000000000006','Staff','00000000-0000-4000-8000-000000000005',null,'user');
insert into public.agendas(id,created_by) values (1,'10000000-0000-4000-8000-000000000005');
insert into public.work_calendar_entries(id,owner_id) values (1,'10000000-0000-4000-8000-000000000005');
insert into public.surat_signatures(id,snapshot) values (1,'{"office":"old","signer":"old-bm"}');

do $$begin
  if exists(select 1 from public.profiles where id in ('10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000006')
    and parent_id is distinct from '10000000-0000-4000-8000-000000000002'::uuid) then
    raise exception 'staff/SPV/nested KCP must directly report to related BM'; end if;
end$$;

-- Old BM has access before transfer, not afterward (actual canonical agenda RLS).
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$begin if (select count(*) from public.agendas)<>1 then raise exception 'old BM initial access missing'; end if; end$$;
do $$begin if not exists(select 1 from public.list_work_calendar_team_members() where id='10000000-0000-4000-8000-000000000005')
  or (select count(*) from public.work_calendar_entries)<>1 then raise exception 'calendar initial access missing'; end if; end$$;
reset role;
select set_config('request.jwt.claim.sub','',false);
update public.profiles set office_id='00000000-0000-4000-8000-000000000003',parent_id='10000000-0000-4000-8000-000000000002'
  where id='10000000-0000-4000-8000-000000000005';
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$begin if (select count(*) from public.agendas)<>0 then raise exception 'old BM retained access after transfer'; end if; end$$;
do $$begin if exists(select 1 from public.list_work_calendar_team_members() where id='10000000-0000-4000-8000-000000000005')
  or (select count(*) from public.work_calendar_entries)<>0 then raise exception 'old BM retained calendar access'; end if; end$$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',false);
do $$begin if (select count(*) from public.agendas)<>1 then raise exception 'new BM access missing'; end if; end$$;
do $$begin if not exists(select 1 from public.list_work_calendar_team_members() where id='10000000-0000-4000-8000-000000000005')
  or (select count(*) from public.work_calendar_entries)<>1 then raise exception 'new BM calendar access missing'; end if; end$$;
reset role;
select set_config('request.jwt.claim.sub','',false);

-- BM availability and replacement, independent of sync ordering.
update public.profiles set is_active=false where id='10000000-0000-4000-8000-000000000003';
do $$begin if (select parent_id from public.profiles where id='10000000-0000-4000-8000-000000000005') is not null then
  raise exception 'inactive BM retained'; end if; end$$;
insert into public.profiles(id,job_title,office_id,parent_id) values
 ('10000000-0000-4000-8000-000000000007','Branch Manager','00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001');
do $$begin if (select parent_id from public.profiles where id='10000000-0000-4000-8000-000000000005')
  is distinct from '10000000-0000-4000-8000-000000000007'::uuid then raise exception 'replacement BM not assigned'; end if; end$$;
update public.profiles set is_active=true where id='10000000-0000-4000-8000-000000000003';
do $$begin if (select parent_id from public.profiles where id='10000000-0000-4000-8000-000000000005') is not null then
  raise exception 'ambiguous BM arbitrarily selected'; end if; end$$;
update public.profiles set deleted_at=now() where id='10000000-0000-4000-8000-000000000003';

-- Reparenting KCP immediately transfers both nested KCP employees.
update public.master_offices set parent_id='00000000-0000-4000-8000-000000000003'
  where id='00000000-0000-4000-8000-000000000004';
do $$begin if (select parent_id from public.profiles where id='10000000-0000-4000-8000-000000000006')
  is distinct from '10000000-0000-4000-8000-000000000007'::uuid then raise exception 'office reparenting stale'; end if; end$$;
update public.master_offices set kedudukan='Pusat' where id='00000000-0000-4000-8000-000000000005';
do $$begin if exists(select 1 from public.profiles where id='10000000-0000-4000-8000-000000000006'
  and (parent_id is not null or reporting_is_automatic)) then raise exception 'office type change left derived parent'; end if; end$$;
update public.master_offices set kedudukan='KCP' where id='00000000-0000-4000-8000-000000000005';
do $$begin if (select parent_id from public.profiles where id='10000000-0000-4000-8000-000000000006')
  is distinct from '10000000-0000-4000-8000-000000000007'::uuid then raise exception 'office type restoration not assigned'; end if; end$$;
update public.master_offices set parent_id='00000000-0000-4000-8000-000000000005'
  where id='00000000-0000-4000-8000-000000000004';
do $$begin if (select parent_id from public.profiles where id='10000000-0000-4000-8000-000000000006') is not null then
  raise exception 'cyclic office hierarchy granted access'; end if; end$$;
update public.master_offices set parent_id=null where id='00000000-0000-4000-8000-000000000004';
do $$begin if (select parent_id from public.profiles where id='10000000-0000-4000-8000-000000000006') is not null then
  raise exception 'missing KC fallback'; end if; end$$;

-- A configured BM ancestor reaching the employee must not generate a profile cycle.
update public.profiles set parent_id='10000000-0000-4000-8000-000000000005' where id='10000000-0000-4000-8000-000000000007';
do $$begin if (select parent_id from public.profiles where id='10000000-0000-4000-8000-000000000005') is not null then
  raise exception 'automatic relation created cycle'; end if; end$$;
update public.profiles set parent_id='10000000-0000-4000-8000-000000000001' where id='10000000-0000-4000-8000-000000000007';

-- Leaving the branch clears derived ancestry; HQ and BM configured edges remain.
update public.profiles set office_id='00000000-0000-4000-8000-000000000001' where id='10000000-0000-4000-8000-000000000005';
do $$begin
  if (select parent_id from public.profiles where id='10000000-0000-4000-8000-000000000005') is not null then raise exception 'branch BM leaked into HQ'; end if;
  if exists(select 1 from public.profiles where id in('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004')
    and parent_id is distinct from '10000000-0000-4000-8000-000000000001'::uuid) then raise exception 'configured HQ/BM relation changed'; end if;
  if (select snapshot from public.surat_signatures where id=1)<>'{"office":"old","signer":"old-bm"}'::jsonb then raise exception 'history changed'; end if;
  if not exists(select 1 from public.profile_reporting_events where profile_id='10000000-0000-4000-8000-000000000005'
    and old_parent_id='10000000-0000-4000-8000-000000000002' and new_parent_id='10000000-0000-4000-8000-000000000003') then raise exception 'transfer audit missing'; end if;
end$$;

-- Self-service privilege protection executes before automatic normalization.
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',false);
do $$begin
  begin update public.profiles set parent_id='10000000-0000-4000-8000-000000000002' where id=auth.uid();
    raise exception 'unauthorized organizational update accepted'; exception when insufficient_privilege then null; end;
  begin update public.profiles set reporting_is_automatic=false where id=auth.uid();
    raise exception 'unauthorized reporting policy update accepted'; exception when insufficient_privilege then null; end;
  begin perform organization_internal.refresh_reporting(); raise exception 'private reconciliation callable'; exception when insufficient_privilege then null; end;
  if (select count(*) from public.profile_reporting_events)<>0 then raise exception 'audit exposed to nonadmin'; end if;
end$$;
update public.profiles set full_name='Self service works' where id=auth.uid();
reset role;
select set_config('request.jwt.claim.sub','',false);
select 'DYNAMIC BRANCH REPORTING SQL PASSED' as result;
