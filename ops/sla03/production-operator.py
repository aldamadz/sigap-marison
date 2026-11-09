import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from uuid import UUID

os.umask(0o077)
mode = sys.argv[1]
assert mode in ('preflight', 'rehearse', 'apply', 'verify', 'acceptance')
root = Path('/root/sigap-sla03-20261109')
root.mkdir(mode=0o700, parents=True, exist_ok=True)
version = '20261109110000'
source = (root / (version + '_signer_action_sla_clock.sql')).read_text().replace('\r\n', '\n')
digest = hashlib.sha256(source.encode()).hexdigest()
assert digest == 'd80a88bb1fed79745c0f0a4b8df456bf82263c7f592ea5bf920bc0511cb373af', 'Not the verified staging migration'
assert '\nbegin;' in source and source.rstrip().endswith('commit;')
inner = source[source.index('\nbegin;') + 7:].rstrip()[:-7]
compat_version = '20261109105900'
compat_source = (root / (compat_version + '_signer_action_sla_clock_compat.sql')).read_text().replace('\r\n', '\n')
compat_digest = hashlib.sha256(compat_source.encode()).hexdigest()
assert compat_digest == 'c3df930f563d612d9094b45ed79c5e054ca248bb2ff0d403a994f9ae58c43732'
assert '\nbegin;' in compat_source and compat_source.rstrip().endswith('commit;')
compat_inner = compat_source[compat_source.index('\nbegin;') + 7:].rstrip()[:-7]
guest = subprocess.run(['pct', 'exec', '110', '--', 'hostname'], check=True, capture_output=True, timeout=20).stdout.decode().strip()
assert guest == 'sigap-db-auth-prod-01', 'Production database guest identity mismatch'


def save(name, value):
    (root / name).write_text(json.dumps(value))


def query(sql):
    result = subprocess.run(['pct', 'exec', '110', '--', 'docker', 'exec', '-i', 'sigap-supabase-db',
        'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
        input=sql.encode(), capture_output=True, timeout=120)
    if result.returncode:
        (root / ('error-' + mode + '.log')).write_bytes(result.stdout + result.stderr)
        raise RuntimeError('Database operation failed; diagnostic retained privately')
    return json.loads(result.stdout.decode().strip().splitlines()[-1])


tables = ['surat_registrasi', 'surat_signatures', 'surat_revision_events', 'surat_attachments', 'profiles', 'notifications', 'marison_outbound_dispatches']
fingerprints = 'jsonb_build_object(' + ','.join("'" + table + "',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id),'[]')::text) from public." + table + ' x)' for table in tables) + ')'
guards = ['handle_approve_surat_v2', 'handle_approve_surat_v2_pre_keu10', 'guard_parent_approval_for_recommendation', 'guard_parent_signature_for_recommendation', 'verify_surat_signature_v2', 'reject_surat', 'create_surat_registrasi', 'ensure_marison_outbound_dispatch']
names = ['calculate_business_minutes', 'get_department_kpi_summary', 'get_department_kpi_details', 'get_user_active_sla_breach_count', 'get_actionable_dashboard', 'remind_dashboard_request'] + guards
quote_names = lambda values: ','.join("'" + item + "'" for item in values)
snapshot = "select jsonb_build_object('versions',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations),'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array[" + quote_names(names) + ']))) audit;'

if mode == 'preflight':
    data = query("begin read only;set local statement_timeout='30s';" + snapshot + 'rollback;')
    baseline = json.loads(Path('/root/sigap-external-decision-final-20261106/before.json').read_text())
    expected = set(baseline['versions']) | set(baseline['pending'])
    assert set(data['versions']) == expected, 'Migration lineage drift; audit before applying'
    assert version not in data['versions'], 'Migration already applied; verify instead'
    assert not (root / 'before.json').exists(), 'Retain the original preflight proof'
    data['digest'] = digest
    save('before.json', data)
    print(json.dumps({'environment': 'production', 'mode': mode, 'digest': digest, 'ledger_count': len(data['versions']), 'lineage_verified': True}))
elif mode in ('rehearse', 'apply'):
    before = json.loads((root / 'before.json').read_text())
    assert before['digest'] == digest
    if mode == 'apply':
        rehearsal = json.loads((root / 'rehearse.json').read_text())
        assert rehearsal['digest'] == digest and rehearsal['compat_digest'] == compat_digest
        assert os.environ.get('ACK_SLA_APPLY') == 'production:' + digest
    sql = "begin isolation level repeatable read;set local lock_timeout='5s';set local statement_timeout='60s';"
    sql += "do $lineage$ begin if (select array_agg(version order by version) from supabase_migrations.schema_migrations) is distinct from array[" + quote_names(sorted(before['versions'])) + "]::text[] then raise exception 'Migration ledger changed since preflight';end if;end $lineage$;"
    sql += 'create temp table sla_business_before on commit drop as select ' + fingerprints + ' proof;'
    sql += "create temp table sla_guards_before on commit drop as select p.oid,pg_get_functiondef(p.oid) definition,p.proowner,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array[" + quote_names(guards) + ']);'
    sql += "create temp table sla_kpi_acl_before on commit drop as select p.proowner,array(select acl.grantee::text||':'||acl.privilege_type||':'||acl.is_grantable from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl order by acl.grantee,acl.privilege_type) grants from pg_proc p where p.oid='public.get_department_kpi_details(timestamptz,timestamptz,uuid,uuid,uuid,text)'::regprocedure;"
    sql += compat_inner + inner + compat_inner + inner
    sql += """do $check$ begin
      if (select proof from sla_business_before) is distinct from """ + fingerprints + """ then raise exception 'Business state changed';end if;
      if exists(select 1 from sla_guards_before b join pg_proc p on p.oid=b.oid where pg_get_functiondef(p.oid)<>b.definition or p.proowner<>b.proowner or p.proacl is distinct from b.proacl) then raise exception 'Approval or verification guard changed';end if;
      if exists(select 1 from sla_kpi_acl_before b cross join pg_proc p where p.oid='public.get_department_kpi_details(timestamptz,timestamptz,uuid,uuid,uuid,text)'::regprocedure and (b.proowner<>p.proowner or b.grants is distinct from array(select acl.grantee::text||':'||acl.privilege_type||':'||acl.is_grantable from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl order by acl.grantee,acl.privilege_type))) then raise exception 'KPI authorization changed';end if;
      if has_schema_privilege('authenticated','sla_clock_internal','usage') or has_function_privilege('service_role','sla_clock_internal.refresh(uuid,timestamptz,boolean)','execute') then raise exception 'Private clock exposed';end if;
    end $check$;"""
    if mode == 'apply':
        sql += "insert into supabase_migrations.schema_migrations(version,name,statements) values('" + compat_version + "','signer_action_sla_clock_compat',array[$sla_compat$" + compat_source + '$sla_compat$]);'
        sql += "insert into supabase_migrations.schema_migrations(version,name,statements) values('" + version + "','signer_action_sla_clock',array[$sla_migration$" + source + '$sla_migration$]);'
    sql += "select jsonb_build_object('preserved',true,'guarded',true,'clock_count',(select count(*) from sla_clock_internal.clocks),'paused',(select count(*) from sla_clock_internal.periods where ended_at is null and phase in ('waiting','scheduled')),'versions',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations)) audit;"
    sql += 'commit;' if mode == 'apply' else 'rollback;'
    result = query(sql)
    assert set(result['versions']) == set(before['versions']) | ({compat_version, version} if mode == 'apply' else set())
    save(mode + '.json', dict(result, digest=digest, compat_digest=compat_digest))
    print(json.dumps({'environment': 'production', 'mode': mode, 'digest': digest, 'business_preserved': result['preserved'], 'guards_unchanged': result['guarded'], 'clock_count': result['clock_count'], 'paused': result['paused']}))
elif mode == 'verify':
    result = query("begin read only;select jsonb_build_object('recorded',(select count(*)=2 from supabase_migrations.schema_migrations where version in ('" + compat_version + "','" + version + "')),'clock_count',(select count(*) from sla_clock_internal.clocks),'paused',(select count(*) from sla_clock_internal.periods where ended_at is null and phase in ('waiting','scheduled')),'private',not has_schema_privilege('authenticated','sla_clock_internal','usage')) audit;rollback;")
    assert result['recorded'] and result['private']
    print(json.dumps(dict(result, environment='production', mode=mode, digest=digest)))
else:
    candidate = query("""begin read only;select jsonb_build_object('signature',s.id,'actor',s.user_id,'surat',s.surat_id) audit
      from sla_clock_internal.periods p join public.surat_signatures s on s.id=p.signature_id
      join public.surat_registrasi d on d.id=s.surat_id join public.profiles u on u.id=s.user_id
      where p.ended_at is null and p.phase='waiting' and d.status='PROSES' and d.current_step=s.step_order
        and coalesce(u.is_active,true) and u.deleted_at is null and not coalesce(s.is_signed,false)
      order by s.id limit 1;rollback;""")
    signature, actor, surat = (str(UUID(candidate[key])) for key in ('signature', 'actor', 'surat'))
    sql = "begin read only;set local statement_timeout='30s';"
    sql += "select set_config('request.jwt.claim.sub','" + actor + "',true);set local role authenticated;"
    sql += """select jsonb_build_object(
      'rpc_paused',exists(select 1 from public.get_department_kpi_details() where signature_id='""" + signature + """' and sla_paused and not is_late),
      'pause_reason_present',exists(select 1 from public.get_department_kpi_details() where signature_id='""" + signature + """' and cardinality(sla_pause_reasons)>0),
      'late_filter_excludes',not exists(select 1 from public.get_department_kpi_details(null,null,null,null,null,'late') where signature_id='""" + signature + """'),
      'dashboard_paused',exists(select 1 from jsonb_array_elements(public.get_actionable_dashboard('signer','active',null,null,null,50,0)->'rows') r where r->>'id'='""" + surat + """' and (r->>'sla_paused')::boolean),
      'private_clock_inaccessible',not has_schema_privilege('authenticated','sla_clock_internal','usage')) audit;rollback;"""
    result = query(sql)
    assert all(result.values()), result
    frozen = query("""begin read only;select jsonb_build_object('elapsed_frozen_one_hour',
      sla_clock_internal.elapsed(s.id,coalesce(s.available_at,d.created_at),now(),coalesce(c.work_days,array[1,2,3,4,5]),
        coalesce(c.work_start,time '08:00'),coalesce(c.work_end,time '17:00'),coalesce(c.break_start,time '12:00'),coalesce(c.break_end,time '13:00'),coalesce(c.timezone,'Asia/Jakarta'))
      = sla_clock_internal.elapsed(s.id,coalesce(s.available_at,d.created_at),now()+interval '1 hour',coalesce(c.work_days,array[1,2,3,4,5]),
        coalesce(c.work_start,time '08:00'),coalesce(c.work_end,time '17:00'),coalesce(c.break_start,time '12:00'),coalesce(c.break_end,time '13:00'),coalesce(c.timezone,'Asia/Jakarta'))) audit
      from public.surat_signatures s join public.surat_registrasi d on d.id=s.surat_id
      left join lateral public.signature_sla_config(s.id,d.dept_id) c on true where s.id='""" + signature + "';rollback;")
    assert frozen['elapsed_frozen_one_hour'], frozen
    result.update(frozen)
    save('read-only-acceptance.json', result)
    print(json.dumps(dict(result, environment='production', mode=mode)))
