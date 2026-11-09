import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

process.umask(0o077);
const mode=process.argv[2];
if(!['preflight','rehearse','apply','verify'].includes(mode))throw Error('Choose an explicit staging operator mode.');
const root='/home/marison/sigap-deploy/builds/sla03-20261109';
mkdirSync(root,{recursive:true,mode:0o700});
const version='20261109110000';
const source=readFileSync(join(root,`${version}_signer_action_sla_clock.sql`),'utf8').replaceAll('\r\n','\n');
if(!source.trimEnd().endsWith('commit;')||!source.includes('\nbegin;'))throw Error('Unexpected migration boundary.');
const inner=source.slice(source.indexOf('\nbegin;')+7).trimEnd().slice(0,-7);
const digest=createHash('sha256').update(source).digest('hex');
const inspected=JSON.parse(execFileSync('docker',['inspect','agenda-flow-staging'],{encoding:'utf8'}))[0];
const env=Object.fromEntries(inspected.Config.Env.map(value=>{const i=value.indexOf('=');return [value.slice(0,i),value.slice(i+1)];}));
if(env.SUPABASE_URL!=='https://wrufczusfopgvwvxsmjk.supabase.co'||env.MARISON_DEPLOYMENT_ENVIRONMENT!=='staging')throw Error('Staging identity mismatch.');
const token=readFileSync('/home/marison/.supabase/access-token','utf8').trim();
const read=name=>JSON.parse(readFileSync(join(root,name),'utf8'));
const save=(name,value)=>writeFileSync(join(root,name),JSON.stringify(value),{mode:0o600});
async function query(sql,readOnly=false){
 const response=await fetch('https://api.supabase.com/v1/projects/wrufczusfopgvwvxsmjk/database/query',{
  method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
  body:JSON.stringify({query:sql,read_only:readOnly}),signal:AbortSignal.timeout(120000),
 });
 const body=await response.text();
 if(!response.ok){writeFileSync(join(root,`error-${mode}.log`),body,{mode:0o600});throw Error(`Staging query HTTP ${response.status}; diagnostic retained privately.`);}
 const rows=JSON.parse(body);if(!rows[0]?.audit)throw Error('Missing database proof.');return rows[0].audit;
}
const tables=['surat_registrasi','surat_signatures','surat_revision_events','surat_attachments','profiles','notifications','marison_outbound_dispatches'];
const fingerprints=`jsonb_build_object(${tables.map(table=>`'${table}',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id),'[]')::text) from public.${table} x)`).join(',')})`;
const guards=['handle_approve_surat_v2','handle_approve_surat_v2_pre_keu10','guard_parent_approval_for_recommendation','guard_parent_signature_for_recommendation','verify_surat_signature_v2','reject_surat','create_surat_registrasi','ensure_marison_outbound_dispatch'];
const names=['calculate_business_minutes','get_department_kpi_summary','get_department_kpi_details','get_user_active_sla_breach_count','get_actionable_dashboard','remind_dashboard_request',...guards];
const snapshot=`select jsonb_build_object('versions',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations),
 'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array[${names.map(x=>`'${x}'`).join(',')}]))) audit;`;
const sameSet=(a,b)=>JSON.stringify([...new Set(a)].sort())===JSON.stringify([...new Set(b)].sort());
if(mode==='preflight'){
 const data=await query('begin read only;set local statement_timeout=\'30s\';'+snapshot+'rollback;',true);
 const baseline=JSON.parse(readFileSync('/home/marison/sigap-deploy/builds/external-decision-final-20261106/before.json','utf8'));
 const expected=[...baseline.versions,...baseline.pending];
 if(!sameSet(data.versions,expected))throw Error('Migration lineage drift: audit before applying; no bulk replay.');
 if(data.versions.includes(version))throw Error('Migration already applied; use verify.');
 save('before.json',{...data,digest});
 console.log(JSON.stringify({environment:'staging',mode,ledger_count:data.versions.length,lineage_verified:true,digest}));
}else if(mode==='rehearse'||mode==='apply'){
 const before=read('before.json');if(before.digest!==digest)throw Error('Migration changed since preflight.');
 if(mode==='apply'&&(read('rehearse.json').digest!==digest||process.env.ACK_SLA_APPLY!==`staging:${digest}`))throw Error('Exact rehearsal acknowledgement required.');
 let sql="begin isolation level repeatable read;set local lock_timeout='5s';set local statement_timeout='60s';";
 sql+=`create temp table sla_business_before on commit drop as select ${fingerprints} proof;`;
 sql+=`create temp table sla_guards_before on commit drop as select p.oid,pg_get_functiondef(p.oid) definition,p.proowner,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array[${guards.map(x=>`'${x}'`).join(',')}]);`;
 sql+=`create temp table sla_kpi_acl_before on commit drop as select p.proowner,array(select acl.grantee::text||':'||acl.privilege_type||':'||acl.is_grantable from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl order by acl.grantee,acl.privilege_type) grants from pg_proc p where p.oid='public.get_department_kpi_details(timestamptz,timestamptz,uuid,uuid,uuid,text)'::regprocedure;`;
 sql+=inner+inner;
 sql+=`do $check$ begin
  if (select proof from sla_business_before) is distinct from ${fingerprints} then raise exception 'Business state changed';end if;
  if exists(select 1 from sla_guards_before b join pg_proc p on p.oid=b.oid where pg_get_functiondef(p.oid)<>b.definition or p.proowner<>b.proowner or p.proacl is distinct from b.proacl) then raise exception 'Approval or verification guard changed';end if;
  if exists(select 1 from sla_kpi_acl_before b cross join pg_proc p where p.oid='public.get_department_kpi_details(timestamptz,timestamptz,uuid,uuid,uuid,text)'::regprocedure and (b.proowner<>p.proowner or b.grants is distinct from array(select acl.grantee::text||':'||acl.privilege_type||':'||acl.is_grantable from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl order by acl.grantee,acl.privilege_type))) then raise exception 'KPI authorization owner or grants changed';end if;
  if has_schema_privilege('authenticated','sla_clock_internal','usage') or has_function_privilege('service_role','sla_clock_internal.refresh(uuid,timestamptz,boolean)','execute') then raise exception 'Private clock exposed';end if;
 end $check$;`;
 if(mode==='apply')sql+=`insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','signer_action_sla_clock',array[$sla_migration$${source}$sla_migration$]);`;
 sql+=`select jsonb_build_object('preserved',true,'guarded',true,'clock_count',(select count(*) from sla_clock_internal.clocks),'paused',(select count(*) from sla_clock_internal.periods where ended_at is null and phase in ('waiting','scheduled')),'versions',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations)) audit;`;
 sql+=mode==='apply'?'commit;':'rollback;';
 const result=await query(sql);
 if(!sameSet(result.versions,[...before.versions,...(mode==='apply'?[version]:[])]))throw Error('Unexpected migration ledger result.');
 const proof={environment:'staging',mode,digest,...result};save(`${mode}.json`,proof);
 console.log(JSON.stringify({environment:'staging',mode,digest,business_preserved:result.preserved,guards_unchanged:result.guarded,clock_count:result.clock_count,paused:result.paused}));
}else{
 const result=await query("begin read only;select jsonb_build_object('recorded',exists(select 1 from supabase_migrations.schema_migrations where version='"+version+"'),'clock_count',(select count(*) from sla_clock_internal.clocks),'paused',(select count(*) from sla_clock_internal.periods where ended_at is null and phase in ('waiting','scheduled')),'private',not has_schema_privilege('authenticated','sla_clock_internal','usage')) audit;rollback;",true);
 if(!result.recorded||!result.private)throw Error('Staging verification failed.');
 console.log(JSON.stringify({environment:'staging',mode,digest,...result}));
}
