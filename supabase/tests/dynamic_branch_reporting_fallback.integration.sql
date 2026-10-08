-- Separate IDs and rollback keep the original BM/concurrency fixtures untouched.
begin;

create temporary table fallback_failures(case_name text, employee integer, expected uuid, actual uuid);

create function pg_temp.fixture_id(p_kind integer, p_number integer)
returns uuid language sql immutable strict as $$
  select format('%s0000000-0000-4000-8000-%s', p_kind, lpad(p_number::text, 12, '0'))::uuid;
$$;

create function pg_temp.add_profile(
  p_number integer, p_title text, p_office integer,
  p_department integer default null, p_parent integer default null
) returns void language sql as $$
  insert into public.profiles(id, job_title, office_id, department_id, parent_id)
  values (pg_temp.fixture_id(3, p_number), p_title, pg_temp.fixture_id(2, p_office),
    pg_temp.fixture_id(4, p_department), pg_temp.fixture_id(3, p_parent));
$$;

create function pg_temp.assert_parent(p_employee integer, p_parent integer, p_case text)
returns void language plpgsql as $$
declare v_parent uuid;
begin
  select parent_id into strict v_parent from public.profiles
    where id = pg_temp.fixture_id(3, p_employee);
  if v_parent is distinct from pg_temp.fixture_id(3, p_parent) then
    insert into fallback_failures values (p_case, p_employee, pg_temp.fixture_id(3, p_parent), v_parent);
  end if;
end;
$$;

create function pg_temp.assert_manual(p_employee integer, p_parent integer, p_case text)
returns void language plpgsql as $$
begin
  perform pg_temp.assert_parent(p_employee, p_parent, p_case);
  if (select reporting_is_automatic from public.profiles where id = pg_temp.fixture_id(3, p_employee)) then
    insert into fallback_failures(case_name, employee) values (p_case || ': configured profile became automatic', p_employee);
  end if;
end;
$$;

insert into public.master_offices(id, kedudukan, parent_id)
select pg_temp.fixture_id(2, n), scope, pg_temp.fixture_id(2, parent)
from (values
  (80, 'Pusat', null), (81, 'Kost', 80),
  (10, 'KC', 80), (20, 'KC', 80), (30, 'KC', 80),
  (40, 'KC', 80), (41, 'KCP', 40), (43, 'KC', 80),
  (50, 'KC', 80), (60, 'KC', 80), (70, 'KC', 80), (71, 'KCP', 70)
) as fixture(n, scope, parent);

select pg_temp.add_profile(800, 'Director Utama', 80);
select pg_temp.add_profile(801, 'Supervisor Operasional', 80, 1, 800);
select pg_temp.add_profile(802, 'Staff', 80, 1, 801);
select pg_temp.add_profile(810, 'Supervisor Kost', 81, 1, 800);
select pg_temp.add_profile(811, 'Penjaga Kost', 81, 2, 810);
create temporary table configured_before as
  select id, parent_id, reporting_is_automatic from public.profiles
  where office_id in (pg_temp.fixture_id(2, 80), pg_temp.fixture_id(2, 81));

-- Rank wins across departments: BM > Assistant BM > sole SPV > no superior.
select pg_temp.add_profile(100, 'Branch Manager', 10, 3, 800);
select pg_temp.add_profile(101, 'Assistant BM', 10, 2);
select pg_temp.add_profile(102, 'Supervisor Marketing', 10, 1);
select pg_temp.add_profile(103, 'Staff', 10, 1);
select pg_temp.add_profile(104, 'Staff', 10, 2);
select pg_temp.add_profile(105, 'Staff', 10);
select pg_temp.assert_manual(100, 800, 'BM configured director preserved');
select pg_temp.assert_parent(101, 100, 'Assistant BM follows BM');
select pg_temp.assert_parent(102, 100, 'SPV follows BM');
select pg_temp.assert_parent(103, 100, 'BM outranks same-department SPV');
select pg_temp.assert_parent(104, 100, 'BM ignores department mismatch');
select pg_temp.assert_parent(105, 100, 'BM accepts null department');

update public.profiles set is_active = false where id = pg_temp.fixture_id(3, 100);
select pg_temp.assert_parent(101, null, 'Assistant BM cannot select itself');
select pg_temp.assert_parent(102, 101, 'SPV falls back to Assistant BM');
select pg_temp.assert_parent(103, 101, 'Assistant BM outranks same-department SPV');
select pg_temp.assert_parent(104, 101, 'Assistant BM supervises all departments');
select pg_temp.assert_parent(105, 101, 'Assistant BM supervises null department');

update public.profiles set is_active = false where id = pg_temp.fixture_id(3, 101);
select pg_temp.assert_parent(101, null, 'inactive automatic officer cleared');
select pg_temp.assert_parent(102, null, 'sole SPV cannot select itself');
select pg_temp.assert_parent(103, 102, 'sole SPV matching department');
select pg_temp.assert_parent(104, 102, 'sole SPV other department');
select pg_temp.assert_parent(105, 102, 'sole SPV null department');

update public.profiles set is_active = false where id = pg_temp.fixture_id(3, 103);
select pg_temp.assert_parent(103, null, 'inactive employee cleared');
update public.profiles set is_active = true where id = pg_temp.fixture_id(3, 103);
select pg_temp.assert_parent(103, 102, 'reactivated employee reassigned');
update public.profiles set deleted_at = now() where id = pg_temp.fixture_id(3, 103);
select pg_temp.assert_parent(103, null, 'soft-deleted employee cleared');
update public.profiles set deleted_at = null where id = pg_temp.fixture_id(3, 103);
select pg_temp.assert_parent(103, 102, 'restored employee reassigned');
update public.profiles set deleted_at = now() where id = pg_temp.fixture_id(3, 102);
select pg_temp.assert_parent(103, null, 'soft-deleted sole SPV unavailable');
select pg_temp.assert_parent(104, null, 'no officer for other department');
update public.profiles set deleted_at = null where id = pg_temp.fixture_id(3, 102);
select pg_temp.assert_parent(104, 102, 'restored sole SPV refreshes office');

-- Multiple SPVs need exactly one department match; peers never supervise peers.
select pg_temp.add_profile(200, 'SPV Marketing', 20, 1);
select pg_temp.add_profile(201, 'Supervisor Teknik', 20, 2);
select pg_temp.add_profile(202, 'Staff', 20, 1);
select pg_temp.add_profile(203, 'Staff', 20, 2);
select pg_temp.add_profile(204, 'Staff', 20, 3);
select pg_temp.add_profile(205, 'Staff', 20);
select pg_temp.assert_parent(200, null, 'SPV peer one has no parent');
select pg_temp.assert_parent(201, null, 'SPV peer two has no parent');
select pg_temp.assert_parent(202, 200, 'unique department one SPV');
select pg_temp.assert_parent(203, 201, 'unique department two SPV');
select pg_temp.assert_parent(204, null, 'unmatched department fails closed');
select pg_temp.assert_parent(205, null, 'null department with multiple SPVs fails closed');

select pg_temp.add_profile(206, 'Supervisor Marketing', 20, 1);
select pg_temp.assert_parent(202, null, 'duplicate department SPVs fail closed');
select pg_temp.assert_parent(203, 201, 'duplicate in other department does not interfere');
select pg_temp.assert_parent(206, null, 'same-department SPV peers have no parent');
update public.profiles set is_active = false where id = pg_temp.fixture_id(3, 206);
select pg_temp.assert_parent(202, 200, 'inactive duplicate SPV excluded');

update public.profiles set department_id = pg_temp.fixture_id(4, 3) where id = pg_temp.fixture_id(3, 200);
select pg_temp.assert_parent(202, null, 'SPV department change clears old department');
select pg_temp.assert_parent(204, 200, 'SPV department change refreshes new department');
update public.profiles set department_id = pg_temp.fixture_id(4, 3) where id = pg_temp.fixture_id(3, 202);
select pg_temp.assert_parent(202, 200, 'employee department-only update uses NEW department');
update public.profiles set department_id = null where id = pg_temp.fixture_id(3, 202);
select pg_temp.assert_parent(202, null, 'employee department cleared fails closed');

-- Promotions/demotions must resolve from NEW.job_title, not the persisted OLD row.
select pg_temp.add_profile(301, 'SPV', 30, 1);
select pg_temp.add_profile(302, 'Staff', 30, 1);
select pg_temp.add_profile(303, 'Staff', 30, 2);
select pg_temp.assert_parent(302, 301, 'staff before promotion');
update public.profiles set job_title = 'SPV Marketing' where id = pg_temp.fixture_id(3, 302);
select pg_temp.assert_parent(302, null, 'NEW SPV title cannot report to old SPV peer');
select pg_temp.assert_parent(301, null, 'existing SPV cannot report to promoted peer');
select pg_temp.assert_parent(303, null, 'two SPVs without department match fail closed');
update public.profiles set job_title = 'Staff' where id = pg_temp.fixture_id(3, 302);
select pg_temp.assert_parent(302, 301, 'NEW staff title demotion immediately follows SPV');
select pg_temp.assert_parent(303, 301, 'demotion restores sole-SPV office fallback');
update public.profiles set job_title = 'Asisten Branch Manager' where id = pg_temp.fixture_id(3, 302);
select pg_temp.assert_parent(302, null, 'NEW Assistant BM title cannot report to lower SPV');
select pg_temp.assert_parent(301, 302, 'promotion refreshes existing SPV');
select pg_temp.assert_parent(303, 302, 'promotion refreshes staff');
update public.profiles set job_title = 'Staff' where id = pg_temp.fixture_id(3, 302);
select pg_temp.assert_parent(302, 301, 'Assistant BM demotion uses NEW staff rank');
select pg_temp.assert_parent(303, 301, 'Assistant BM demotion removes officer candidacy');
update public.profiles set job_title = 'BM' where id = pg_temp.fixture_id(3, 302);
select pg_temp.assert_manual(302, null, 'promotion to BM clears former automatic parent');
select pg_temp.assert_parent(301, 302, 'NEW BM promotion refreshes SPV');
update public.profiles set job_title = 'Assistant Branch Manager' where id = pg_temp.fixture_id(3, 302);
select pg_temp.assert_parent(302, null, 'BM demotion cannot select lower SPV');
select pg_temp.assert_parent(303, 302, 'BM demotion remains highest active officer');
update public.profiles set job_title = 'Staff' where id = pg_temp.fixture_id(3, 302);
select pg_temp.assert_parent(302, 301, 'BM-to-staff demotion chain resolves immediately');

-- Highest rank across KC/KCP wins; at equal lower rank prefer own KCP.
select pg_temp.add_profile(400, 'SPV', 40, 1);
select pg_temp.add_profile(401, 'SPV', 41, 2);
select pg_temp.add_profile(402, 'Staff', 41, 1);
select pg_temp.add_profile(403, 'Staff', 41, 2);
select pg_temp.add_profile(404, 'Staff', 41);
select pg_temp.assert_parent(401, null, 'own SPV cannot report to KC SPV peer');
select pg_temp.assert_parent(402, 401, 'equal-rank own KCP sole SPV beats matching KC SPV');
select pg_temp.assert_parent(403, 401, 'own KCP SPV matching department');
select pg_temp.assert_parent(404, 401, 'own KCP sole SPV null department');
select pg_temp.add_profile(406, 'Assistant BM', 40, 1);
select pg_temp.assert_parent(401, 406, 'higher KC Assistant BM supervises own KCP SPV');
select pg_temp.assert_parent(402, 406, 'higher KC rank beats lower own KCP rank');
select pg_temp.add_profile(407, 'ABM', 41, 2);
select pg_temp.assert_parent(407, null, 'own ABM cannot report to equal KC ABM');
select pg_temp.assert_parent(402, 407, 'equal ABM rank prefers own KCP');
select pg_temp.add_profile(408, 'BM', 40, 3, 800);
select pg_temp.add_profile(409, 'BM', 41, 1, 800);
select pg_temp.assert_parent(402, 408, 'related KC BM beats own KCP officers including BM');
select pg_temp.assert_parent(407, 408, 'own ABM follows related KC BM');
select pg_temp.assert_manual(409, 800, 'own KCP BM retains configured director');
update public.profiles set is_active = false where id = pg_temp.fixture_id(3, 408);
select pg_temp.assert_parent(402, 407, 'own KCP BM not used as related-KC BM replacement');
select pg_temp.add_profile(410, 'Assistant BM', 41, 1);
select pg_temp.assert_parent(402, null, 'duplicate own ABMs cannot fall back to KC ABM or SPV');
select pg_temp.assert_parent(401, null, 'duplicate higher rank clears SPV parent');
update public.profiles set deleted_at = now() where id = pg_temp.fixture_id(3, 410);
select pg_temp.assert_parent(402, 407, 'soft-deleted duplicate ABM excluded');
select pg_temp.add_profile(411, 'Assistant BM', 40, 2);
select pg_temp.assert_parent(402, 407, 'unique own ABM beats ambiguous equal KC ABMs');
update public.profiles set is_active = false where id = pg_temp.fixture_id(3, 407);
select pg_temp.assert_parent(402, null, 'duplicate highest KC ABMs fail closed over own SPV');
update public.profiles set deleted_at = now() where id = pg_temp.fixture_id(3, 411);
select pg_temp.assert_parent(402, 406, 'KC fallback restored after duplicate soft delete');
update public.profiles set is_active = false where id = pg_temp.fixture_id(3, 406);
select pg_temp.assert_parent(402, 401, 'own SPV used when all higher ranks unavailable');
update public.profiles set office_id = pg_temp.fixture_id(2, 43) where id = pg_temp.fixture_id(3, 401);
select pg_temp.assert_parent(401, null, 'officer transfer clears old KC superior');
select pg_temp.assert_parent(402, 400, 'officer transfer refreshes old KCP to KC fallback');
update public.profiles set office_id = pg_temp.fixture_id(2, 43) where id = pg_temp.fixture_id(3, 402);
select pg_temp.assert_parent(402, 401, 'employee transfer follows destination sole SPV');
update public.profiles set office_id = pg_temp.fixture_id(2, 41), parent_id = pg_temp.fixture_id(3, 401)
  where id = pg_temp.fixture_id(3, 402);
select pg_temp.assert_parent(402, 400, 'stale supplied parent cannot survive employee transfer');

-- Duplicate managers fail closed even with unique lower/department matches.
select pg_temp.add_profile(500, 'BM', 50, 1, 800);
select pg_temp.add_profile(502, 'Assistant BM', 50, 2);
select pg_temp.add_profile(503, 'SPV', 50, 2);
select pg_temp.add_profile(504, 'Staff', 50, 2);
select pg_temp.add_profile(501, 'Branch Manager', 50, 2, 800);
select pg_temp.assert_parent(502, null, 'duplicate BM clears Assistant BM');
select pg_temp.assert_parent(503, null, 'duplicate BM cannot delegate to Assistant BM');
select pg_temp.assert_parent(504, null, 'duplicate BM ignores unique department match');
delete from public.profiles where id = pg_temp.fixture_id(3, 501);
select pg_temp.assert_parent(504, 500, 'physical duplicate BM delete immediately restores unique BM');
select pg_temp.assert_parent(502, 500, 'physical BM delete refreshes Assistant BM');
update public.profiles set is_active = false where id = pg_temp.fixture_id(3, 500);
select pg_temp.assert_parent(504, 502, 'inactive BM falls back to Assistant BM');
select pg_temp.add_profile(505, 'Assistant Branch Manager', 50, 1);
select pg_temp.assert_parent(502, null, 'Assistant BM peer one cannot supervise peer');
select pg_temp.assert_parent(505, null, 'Assistant BM peer two cannot supervise peer');
select pg_temp.assert_parent(504, null, 'duplicate Assistant BM ignores matching department and lower SPV');
delete from public.profiles where id = pg_temp.fixture_id(3, 505);
select pg_temp.assert_parent(504, 502, 'physical duplicate ABM delete refreshes staff');
select pg_temp.assert_parent(503, 502, 'physical ABM delete refreshes SPV');

-- Direct employee cycles and pre-existing configured ancestor cycles fail closed.
select pg_temp.add_profile(600, 'BM', 60, 1, 800);
select pg_temp.add_profile(601, 'SPV', 60, 1);
select pg_temp.add_profile(602, 'SPV', 60, 2);
select pg_temp.add_profile(603, 'Staff', 60, 1);
update public.profiles set parent_id = pg_temp.fixture_id(3, 603) where id = pg_temp.fixture_id(3, 600);
select pg_temp.assert_parent(603, null, 'BM ancestor reaching employee cannot create profile cycle');
update public.profiles set parent_id = pg_temp.fixture_id(3, 800) where id = pg_temp.fixture_id(3, 600);
select pg_temp.assert_parent(603, 600, 'valid configured ancestry restores employee');
select pg_temp.add_profile(610, 'Director I', 80);
select pg_temp.add_profile(611, 'Director II', 80, null, 610);
update public.profiles set parent_id = pg_temp.fixture_id(3, 611) where id = pg_temp.fixture_id(3, 610);
update public.profiles set parent_id = pg_temp.fixture_id(3, 610) where id = pg_temp.fixture_id(3, 600);
select pg_temp.assert_parent(603, null, 'configured ancestor cycle cannot grant employee superior');
select pg_temp.assert_parent(601, null, 'configured ancestor cycle clears SPV superior');
update public.profiles set parent_id = null where id = pg_temp.fixture_id(3, 610);
select pg_temp.assert_parent(603, 600, 'repairing HQ ancestor refreshes branch');
update public.profiles set is_active = false where id = pg_temp.fixture_id(3, 600);
select pg_temp.assert_parent(601, null, 'SPV peers remain unparented after BM disappears');
select pg_temp.assert_parent(602, null, 'other-department SPV is not a peer superior');
select pg_temp.assert_parent(603, 601, 'department SPV restores after BM disappears');

-- Broken/cyclic office ancestry cannot be bypassed by an own-office SPV.
select pg_temp.add_profile(700, 'SPV', 70, 1);
select pg_temp.add_profile(701, 'SPV', 71, 1);
select pg_temp.add_profile(702, 'Staff', 71, 1);
select pg_temp.assert_parent(702, 701, 'valid office ancestry uses own SPV');
update public.master_offices set parent_id = pg_temp.fixture_id(2, 71) where id = pg_temp.fixture_id(2, 71);
select pg_temp.assert_parent(702, null, 'self-cyclic office fails closed despite own SPV');
update public.master_offices set parent_id = null where id = pg_temp.fixture_id(2, 71);
select pg_temp.assert_parent(702, null, 'missing KC ancestor fails closed despite own SPV');
update public.master_offices set parent_id = pg_temp.fixture_id(2, 80) where id = pg_temp.fixture_id(2, 71);
select pg_temp.assert_parent(702, null, 'HQ is not a KC fallback');
update public.master_offices set parent_id = pg_temp.fixture_id(2, 70) where id = pg_temp.fixture_id(2, 71);
select pg_temp.assert_parent(702, 701, 'repaired office ancestry refreshes employee');

select pg_temp.assert_manual(801, 800, 'HQ supervisor configured director preserved');
select pg_temp.assert_manual(802, 801, 'HQ staff configured supervisor preserved');
select pg_temp.assert_manual(810, 800, 'Kost supervisor configured director preserved');
select pg_temp.assert_manual(811, 810, 'Kost staff configured supervisor preserved');
do $$begin
  if exists (
    select 1 from configured_before b join public.profiles p using(id)
    where (p.parent_id, p.reporting_is_automatic) is distinct from (b.parent_id, b.reporting_is_automatic)
  ) then raise exception 'HQ/Kost configured relationships changed during fallback writes'; end if;
  if exists (
    select 1 from public.profile_reporting_events e join configured_before b on b.id = e.profile_id
  ) then raise exception 'HQ/Kost unexpectedly received derived reporting audit'; end if;
  if (select parent_id from public.profiles where id = '10000000-0000-4000-8000-000000000099')
    is distinct from '10000000-0000-4000-8000-000000000098'::uuid then
    raise exception 'pre-migration configured Kost relationship changed'; end if;
  if (select snapshot from public.surat_signatures where id = 1)
    is distinct from '{"office":"old","signer":"old-bm"}'::jsonb then
    raise exception 'fallback changed historical signature'; end if;
end$$;

-- Exercise no-op sync with a non-null fallback parent and department, too.
alter function organization_internal.refresh_reporting(uuid[]) rename to refresh_reporting_fallback_test_original;
create temporary table fallback_refresh_calls(id bigint generated always as identity);
create function organization_internal.refresh_reporting(p_offices uuid[] default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into pg_temp.fallback_refresh_calls default values;
  perform organization_internal.refresh_reporting_fallback_test_original(p_offices);
end;
$$;
do $$declare v_audit_count bigint;
begin
  select count(*) into v_audit_count from public.profile_reporting_events;
  for i in 1..300 loop
    insert into public.profiles(id, job_title, office_id, department_id, parent_id)
    values (pg_temp.fixture_id(3, 104), 'Staff', pg_temp.fixture_id(2, 10),
      pg_temp.fixture_id(4, 2), pg_temp.fixture_id(3, 102))
    on conflict(id) do update set job_title = excluded.job_title, office_id = excluded.office_id,
      department_id = excluded.department_id, parent_id = excluded.parent_id;
  end loop;
  if exists(select 1 from fallback_refresh_calls) then
    raise exception '300 unchanged fallback sync upserts triggered organization reconciliation'; end if;
  if (select count(*) from public.profile_reporting_events) <> v_audit_count then
    raise exception '300 unchanged fallback sync upserts changed reporting audit'; end if;
end$$;
select pg_temp.assert_parent(104, 102, '300 unchanged department sync upserts preserve fallback parent');

do $$declare v_failures text;
begin
  select string_agg(format('%s: employee %s expected %s, got %s',
    case_name, employee, coalesce(expected::text, 'NULL'), coalesce(actual::text, 'NULL')), E'\n')
    into v_failures from fallback_failures;
  if v_failures is not null then raise exception E'Fallback SQL assertions failed:\n%', v_failures; end if;
end$$;
select 'DYNAMIC BRANCH REPORTING FALLBACK SQL PASSED' as result;
rollback;
