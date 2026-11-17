begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10100000-0000-4000-8000-000000000001', true);
insert into public.master_entities(id, name, code)
values ('10100000-0000-4000-8000-000000000100', 'Admin entity', 'ADM');
update public.master_entities set name = 'Updated by admin'
where id = '10100000-0000-4000-8000-000000000100';
select public.test_assert((select name = 'Updated by admin' from public.master_entities
  where id = '10100000-0000-4000-8000-000000000100'), 'active admin can insert and update');
delete from public.master_entities where id = '10100000-0000-4000-8000-000000000100';
select public.test_assert(not exists(select 1 from public.master_entities
  where id = '10100000-0000-4000-8000-000000000100'), 'active admin can delete');

do $$
declare actor uuid; affected integer;
begin
  foreach actor in array array[
    '10100000-0000-4000-8000-000000000002'::uuid,
    '10100000-0000-4000-8000-000000000003'::uuid,
    '10100000-0000-4000-8000-000000000004'::uuid,
    '10100000-0000-4000-8000-000000000005'::uuid,
    '10100000-0000-4000-8000-000000000006'::uuid,
    '10100000-0000-4000-8000-000000000099'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub', actor::text, true);
    perform set_config('request.jwt.claims', '{"role":"authenticated","user_metadata":{"role":"admin"}}', true);
    perform public.test_assert((select count(*) = 1 from public.master_entities), 'authenticated read retained');
    begin
      insert into public.master_entities(id, name, code)
      values ('10100000-0000-4000-8000-000000000101', 'Denied', 'DEN');
      raise exception 'Unauthorized insert succeeded';
    exception when insufficient_privilege then null;
    end;
    update public.master_entities set name = 'Unauthorized change';
    get diagnostics affected = row_count;
    perform public.test_assert(affected = 0, 'unauthorized update denied');
    delete from public.master_entities;
    get diagnostics affected = row_count;
    perform public.test_assert(affected = 0, 'unauthorized delete denied');
  end loop;
end $$;

reset role;
-- Role changes take effect immediately; an old token must not retain admin access.
update public.profiles set role = 'user' where id = '10100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10100000-0000-4000-8000-000000000001', true);
do $$ begin
  begin
    insert into public.master_entities(name, code) values ('Old admin token', 'OLD');
    raise exception 'Revoked admin access survived';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set local role anon;
do $$ begin
  begin
    insert into public.master_entities(name, code) values ('Anonymous', 'ANON');
    raise exception 'Anonymous insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select public.test_assert((select count(*) = 1 and min(name) = 'Existing entity' from public.master_entities), 'existing entity preserved');
select public.test_assert((select relrowsecurity from pg_class where oid = 'public.master_entities'::regclass), 'RLS remains enabled');
rollback;
