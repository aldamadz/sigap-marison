import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";

const read = (path) => readFileSync(path, "utf8").replaceAll("\r\n", "\n");
const fundRabParity = process.argv.includes("--fund-rab-parity");
const stageOverlay = process.argv.includes("--stageoverlay");
const stageRead = (file) => {
  const result = spawnSync("git", ["show", `origin/staging:supabase/migrations/${file}`], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Cannot read staging overlay ${file}: ${result.stderr}`);
  return result.stdout.replaceAll("\r\n", "\n");
};
const migrationRoot = "supabase/migrations/";
const integrationSql = read("supabase/tests/keu10_workflow.integration.sql");
const helpersEnd = integrationSql.indexOf("\nset role authenticated;");
if (helpersEnd < 0) throw new Error("Missing integration helper boundary");
const integrationHelpers = integrationSql.slice(0, helpersEnd);
// Load canonical RPC bodies verbatim from tracked migrations, not mock functions
// and not local credentials/preflight files. Only the schema fixture is minimal.
function canonical(file, name) {
  const source = read(migrationRoot + file);
  const start = new RegExp(`create(?: or replace)? function public\\.${name}\\s*\\(`, "i").exec(source);
  if (!start) throw new Error(`Missing canonical ${name} in ${file}`);
  const tail = source.slice(start.index);
  const delimiter = /\bas\s+(\$[a-zA-Z_0-9]*\$)/i.exec(tail);
  if (!delimiter) throw new Error(`Missing body delimiter: ${name}`);
  const closing = tail.indexOf(delimiter[1], delimiter.index + delimiter[0].length);
  const end = tail.indexOf(";", closing + delimiter[1].length);
  if (closing < 0 || end < 0) throw new Error(`Unterminated canonical ${name}`);
  return tail.slice(0, end + 1);
}
const patches = (file) => read(migrationRoot + file).match(/do \$patch\$[\s\S]*?\$patch\$;/gi) ?? [];
const functions = [
  canonical("20260818170000_external_submission_decisions.sql", "apply_external_submission_decision")
    .replace("public.apply_external_submission_decision(", "public.apply_external_submission_decision_pre_configurable_routing("),
  canonical("20260824100000_configurable_external_revision_and_proactive_pdf.sql", "apply_external_submission_decision"),
  fundRabParity && stageOverlay
    ? stageRead("20260924180000_allow_validated_unit_project_revision.sql")
    : canonical("20260818170000_external_submission_decisions.sql", "submit_external_submission_revision"),
  canonical("20260818170000_external_submission_decisions.sql", "create_external_submission_revision_draft"),
  canonical("20260728110000_auth_07_privilege_escalation_hardening.sql", "is_current_user_admin"),
  canonical("20260609170000_form_usages_and_dynamic_signatures.sql", "validate_form_usage_for_actor"),
  canonical("20260929070000_mar10_non_unit_project_branch_validation.sql", "get_office_descendant_ids"),
  canonical("20260929070000_mar10_non_unit_project_branch_validation.sql", "create_surat_registrasi_core"),
  canonical("20261001090000_restore_recommendation_partial_submission_recovery.sql", "create_surat_registrasi"),
  canonical("20260917132000_optional_branch_signer_fallback.sql", "validate_form_usage_signature"),
  canonical("20261001060000_keu1_submit_and_first_signer.sql", "is_keu1_first_signer_candidate"),
  patches("20261001060000_keu1_submit_and_first_signer.sql")[1],
  canonical("20261001120000_contextual_first_maker_candidates.sql", "is_contextual_first_maker_candidate"),
  patches("20261001120000_contextual_first_maker_candidates.sql")[0],
  canonical("20261001130000_keu1_related_branch_manager.sql", "is_related_branch_manager"),
  patches("20261001130000_keu1_related_branch_manager.sql")[0],
  canonical("20260818120000_native_document_pdf_cache_invalidation.sql", "handle_approve_surat_v2"),
  canonical("20260618120000_form_usage_step_verification.sql", "handle_reject_surat_v2"),
  canonical("20260706194000_preserve_checker_input_on_revision.sql", "request_surat_process_revision"),
  canonical("20260708103000_typed_revision_followup.sql", "accept_surat_process_revision")
    .replace("public.accept_surat_process_revision(", "public.accept_surat_process_revision_pre_unit_reallocation("),
  canonical("20260811170000_unit_revision_reallocation_guard.sql", "accept_surat_process_revision")
    .replace("public.accept_surat_process_revision(", "public.accept_surat_process_revision_pre_configurable_restart("),
  canonical("20260824100000_configurable_external_revision_and_proactive_pdf.sql", "accept_surat_process_revision"),
  canonical("20260707093000_skip_requester_acceptance_for_checker_no_item_change.sql", "resolve_surat_process_revision")
    .replace("public.resolve_surat_process_revision(", "public.resolve_surat_process_revision_pre_unit_reallocation("),
  canonical("20260811170000_unit_revision_reallocation_guard.sql", "resolve_surat_process_revision")
    .replace("public.resolve_surat_process_revision(", "public.resolve_surat_process_revision_pre_external_signer_routing("),
  canonical("20260824100000_configurable_external_revision_and_proactive_pdf.sql", "resolve_surat_process_revision"),
  canonical("20260917131000_atomic_configured_checker_input.sql", "verify_surat_signature_v2"),
  canonical("20260811170000_unit_revision_reallocation_guard.sql", "reopen_unit_revision_checker_task"),
  canonical("20260706120000_revision_item_changes_and_acceptance.sql", "cancel_surat_after_revision"),
  canonical("20260810143000_rec03_recommendation_multi_detail_foundation.sql", "complete_document_pdf_job"),
  canonical("20260824100000_configurable_external_revision_and_proactive_pdf.sql", "is_valid_external_revision_policy"),
  canonical("20260923130000_production_runtime_contract_recovery.sql", "is_valid_checker_input_schema"),
  canonical("20260625120000_form_usage_candidate_scope_and_pgd_branch_usages.sql", "save_form_usage_config")
    .replace("public.save_form_usage_config(", "public.save_form_usage_config_pre_external_revision_policy("),
  canonical("20260923130000_production_runtime_contract_recovery.sql", "save_form_usage_config"),
  patches("20261001130000_keu1_related_branch_manager.sql")[1],
  canonical("20260824100000_configurable_external_revision_and_proactive_pdf.sql", "enqueue_native_document_pdf_for_registration"),
  canonical("20260824100000_configurable_external_revision_and_proactive_pdf.sql", "enqueue_native_document_pdf_for_signature"),
];
if (functions.some((source) => !source)) throw new Error("A canonical patch was not loaded");
const schema = read("supabase/tests/keu10_workflow.fixture.sql");
const setup = `${schema}\n${functions.join("\n")}\n
create trigger reopen_unit_revision_checker_task_trg after insert or update on public.surat_revision_events
for each row execute function public.reopen_unit_revision_checker_task();
create trigger validate_form_usage_signature before insert or update on public.surat_signatures
for each row execute function public.validate_form_usage_signature();
create trigger enqueue_native_pdf_after_registration after insert on public.surat_registrasi
for each row execute function public.enqueue_native_document_pdf_for_registration();
create trigger enqueue_native_pdf_after_signature after update of is_signed on public.surat_signatures
for each row execute function public.enqueue_native_document_pdf_for_signature();
grant select,insert,update,delete on all tables in schema public to authenticated,service_role;
grant execute on all functions in schema public to authenticated,service_role;
`;

const run = (args, input = "", stdoutOnly = false) => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 240_000, maxBuffer: 8_000_000 });
  if (result.status !== 0) throw new Error(`Disposable docker command failed (${result.status}):\n${result.stderr}\n${result.stdout}`);
  return stdoutOnly ? result.stdout : `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
};
// A cold CI runner emits image-download progress to stderr, not the container ID.
const id = run(["run", "-d", "-e", "POSTGRES_PASSWORD=test", "postgres:17-alpine"], "", true).trim();
if (!/^[a-f0-9]{64}$/u.test(id)) throw new Error("Docker returned an invalid disposable container ID");
const psqlArgs = ["exec", "-i", id, "psql", "-h", "127.0.0.1", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
try {
  let ready = false;
  for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
    const probe = spawnSync("docker", ["exec", id, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], { encoding: "utf8" });
    ready = probe.status === 0;
    if (!ready) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready");
  run(psqlArgs, setup);
  run(psqlArgs, read(migrationRoot + "20261006164500_keu10_vendor_routing_prerequisite.sql"));
  run(psqlArgs, read(migrationRoot + "20261006170000_keu10_canonical_workflow.sql"));
  run(psqlArgs, read(migrationRoot + "20261006171000_seed_keu10_grouped_workflows.sql"));
  run(psqlArgs, integrationHelpers);
  run(psqlArgs, read("supabase/tests/keu10_fund_type_upgrade.before.sql"));
  run(psqlArgs, read(migrationRoot + "20261006183000_keu10_automatic_fund_type.sql"));
  run(psqlArgs, read(migrationRoot + "20261006183000_keu10_automatic_fund_type.sql"));
  if (process.argv.includes("--branch-officers")) {
    const source = read(migrationRoot + "20261008160000_dynamic_branch_reporting_officer_fallback.sql");
    const helpers = source.slice(source.indexOf("create or replace function organization_internal.officer_rank"),
      source.indexOf("create or replace function organization_internal.resolve_office_superior"));
    run(psqlArgs, `create schema organization_internal; ${helpers}
      create table keu10_test.config_wrapper_before as select md5(prosrc) body_hash from pg_proc
        where oid='public.save_form_usage_config(uuid,jsonb,uuid[],jsonb,jsonb,jsonb)'::regprocedure;`);
    const migration = read(migrationRoot + "20261008170000_related_branch_review_signer_candidates.sql");
    run(psqlArgs, migration);
    run(psqlArgs, migration);
    run(psqlArgs, `select keu10_test.assert((select body_hash=md5(prosrc)
      from keu10_test.config_wrapper_before cross join pg_proc
      where oid='public.save_form_usage_config(uuid,jsonb,uuid[],jsonb,jsonb,jsonb)'::regprocedure),
      'Public KEU10 configuration wrapper preserved');
      select keu10_test.assert(position('related_branch_officer' in pg_get_functiondef(
        'public.save_form_usage_config_pre_keu10(uuid,jsonb,uuid[],jsonb,jsonb,jsonb)'::regprocedure))>0,
        'New candidate mode supported by original private RPC');
      select keu10_test.assert(not has_function_privilege('authenticated',
        'public.save_form_usage_config_pre_keu10(uuid,jsonb,uuid[],jsonb,jsonb,jsonb)','execute'),
        'Original config RPC remains private');`);
    process.stdout.write("Related branch officers: canonical KEU10 wrapper preserved; private configuration guard updated.\n");
  }
  if (process.argv.includes("--requester-edit") || process.argv.includes("--recommendation-revision") || fundRabParity) {
    if (fundRabParity) {
      run(psqlArgs, `create publication supabase_realtime;
        create table public.activity_logs(id uuid primary key);
        alter table public.surat_attachments enable row level security;
        alter table public.surat_revision_events enable row level security;
        alter table public.surat_linked_documents enable row level security;
        alter table public.surat_recommendation_tasks enable row level security;
        alter table public.activity_logs enable row level security;
        create policy parity_fixture_attachments on public.surat_attachments for all to authenticated using(true) with check(true);
        create policy parity_fixture_events on public.surat_revision_events for all to authenticated using(true) with check(true);
        alter table public.surat_recommendation_tasks add column status text default 'pending';
        alter table public.surat_registration_drafts alter column expires_at set default (now()+interval '7 days');
        alter table public.master_projects add column code text, add column marison_project_id bigint,
          add column marison_synced_at timestamptz, add column marison_review_reasons text[] default '{}';
        alter table public.master_offices add column marison_branch_id bigint, add column marison_synced_at timestamptz;`);
      run(psqlArgs, canonical("20260618120000_form_usage_step_verification.sql", "verify_surat_signature"));
      run(psqlArgs, read(migrationRoot + "20261007090000_fund_item_verification_and_realtime.sql"));
      if (stageOverlay) run(psqlArgs, stageRead("20261007110000_fund_requester_rab_choice.sql"));
    }
    run(psqlArgs, canonical("20260805083000_inbox_verifier_realtime_rls.sql", "can_read_surat"));
    run(psqlArgs, read(migrationRoot + "20261008110000_pdf_approval_decision_status.sql"));
    run(psqlArgs, read(migrationRoot + "20261008110000_pdf_approval_decision_status.sql"));
    const kpiSchema = read(migrationRoot + "20260604090000_department_kpi_sla.sql");
    run(psqlArgs, kpiSchema.slice(0, kpiSchema.indexOf("create or replace function public.calculate_business_minutes")));
    run(psqlArgs, canonical("20260604090000_department_kpi_sla.sql", "calculate_business_minutes"));
    run(psqlArgs, read(migrationRoot + "20261008120000_requester_follow_up_sla.sql"));
    run(psqlArgs, read(migrationRoot + "20261008120000_requester_follow_up_sla.sql"));
    const slaOutput = run(psqlArgs, read("supabase/tests/requester_follow_up_sla.integration.sql"));
    if (!slaOutput.includes("Requester follow-up SLA: all assertions passed")) throw new Error("Missing requester SLA marker");
    process.stdout.write(slaOutput);
    run(psqlArgs, read(migrationRoot + "20261008100000_requester_data_attachment_revision.sql"));
    run(psqlArgs, read(migrationRoot + "20261008100000_requester_data_attachment_revision.sql"));
    if (fundRabParity) {
      run(psqlArgs, `create table keu10_test.parity_wrappers_before as select oid,md5(prosrc) body_hash
        from pg_proc where pronamespace in ('public'::regnamespace,'requester_revision_internal'::regnamespace,'keu10_internal'::regnamespace)
          and oid not in ('public.verify_surat_signature_pre_fund_items(uuid,text,jsonb)'::regprocedure,
            'public.verify_surat_signature(uuid,text)'::regprocedure,
            'public.submit_external_submission_revision_pre_keu10(uuid,uuid,jsonb,text)'::regprocedure)
          and proname not in ('is_fund_planning_signature','effective_fund_rab_requirements');
        create table keu10_test.parity_acl_before as select oid,proacl from pg_proc
        where oid in ('public.verify_surat_signature_pre_fund_items(uuid,text,jsonb)'::regprocedure,
          'public.verify_surat_signature(uuid,text)'::regprocedure,
          'public.submit_external_submission_revision_pre_keu10(uuid,uuid,jsonb,text)'::regprocedure);`);
      const parityMigration = read(migrationRoot + "20261009090000_fund_rab_and_unit_revision_parity.sql");
      run(psqlArgs, parityMigration);
      run(psqlArgs, parityMigration);
      const parityPatches = patches("20261009090000_fund_rab_and_unit_revision_parity.sql");
      if (parityPatches.length !== 2) throw new Error("Fund/Unit drift-guard test boundaries changed");
      const sqlLiteral = (value) => `'${value.replaceAll("'", "''")}'`;
      run(psqlArgs, `begin;
        do $drift$ declare v_source text; begin
          select pg_get_functiondef('public.verify_surat_signature_pre_fund_items(uuid,text,jsonb)'::regprocedure) into v_source;
          execute replace(v_source,'v_signature.verification_required is not true','v_signature.verification_required is distinct from true');
          perform keu10_test.expect_error('P0001',${sqlLiteral(parityPatches[0])});
          execute v_source;
          select pg_get_functiondef('public.submit_external_submission_revision_pre_keu10(uuid,uuid,jsonb,text)'::regprocedure) into v_source;
          execute replace(v_source,'SIGAP Unit external project parity v1','Unknown Unit revision shape');
          perform keu10_test.expect_error('P0001',${sqlLiteral(parityPatches[1])});
          execute v_source;
          execute replace(v_source,'Jumlah unit perbaikan wajib minimal 1.','Drifted installed guard.');
          perform keu10_test.expect_error('P0001',${sqlLiteral(parityPatches[1])});
        end $drift$;
        rollback;`);
      process.stdout.write("Fund/Unit drift guards: unknown core and modified installed block rejected; transaction rolled back.\n");
      const genericRabMigration = read(migrationRoot + "20261009113000_fund_rab_generic_manager.sql");
      run(psqlArgs, genericRabMigration);
      run(psqlArgs, genericRabMigration);
      const parityOutput = run(psqlArgs, read("supabase/tests/fund_rab_and_unit_revision_parity.integration.sql"));
      if (!parityOutput.includes("Fund RAB and Unit revision parity: all assertions passed")) throw new Error("Missing Fund/Unit parity marker");
      process.stdout.write(`${stageOverlay ? "stageoverlay" : "mainshape"}: ${parityOutput}`);
    }
    const revisionOutput = run(psqlArgs, read("supabase/tests/requester_data_attachment_revision.integration.sql"));
    if (!revisionOutput.includes("Requester corrections: all assertions passed")) throw new Error("Missing requester correction marker");
    process.stdout.write(revisionOutput);
    if (process.argv.includes("--recommendation-revision")) {
      run(psqlArgs, canonical("20260810143000_rec03_recommendation_multi_detail_foundation.sql", "validate_recommendation_items"));
      run(psqlArgs, `alter table public.surat_attachments add column if not exists created_by uuid;
        alter table public.surat_recommendation_tasks add column if not exists submitted_surat_id uuid,
        add column if not exists form_id uuid,add column if not exists usage_id uuid,
        add column if not exists department_id uuid,add column if not exists letter_type_id uuid;
        alter table public.surat_linked_documents add column if not exists required_before_step integer;`);
      const photosMigration = read(migrationRoot + "20261012160000_recommendation_requester_revision_photos.sql");
      run(psqlArgs, photosMigration);
      run(psqlArgs, photosMigration);
      const photoOutput = run(psqlArgs, read("supabase/tests/recommendation_requester_revision_photos.integration.sql"));
      if (!photoOutput.includes("Recommendation revision photos: all assertions passed")) throw new Error("Missing recommendation photo marker");
      process.stdout.write(photoOutput);
    }
    const submit = () => new Promise((resolve,reject) => {
      const child=spawn("docker",psqlArgs);
      let stderr="";
      child.stderr.on("data",data=>{ stderr+=data; });
      child.stdout.on("data",()=>{});
      child.on("error",reject);
      child.on("close",code=>resolve({code,stderr}));
      child.stdin.end(`set role authenticated; select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
        select public.submit_external_submission_revision(result.event_id,draft.id,draft.payload->'formData',null)
        from keu10_test.results result join public.surat_registration_drafts draft on draft.revision_event_id=result.event_id
        where result.key='requester-concurrency';`);
    });
    const outcomes=await Promise.all([submit(),submit()]);
    if (outcomes.filter(result=>result.code===0).length!==1 || outcomes.filter(result=>/tidak lagi aktif/.test(result.stderr)).length!==1) {
      throw new Error(`Requester revision concurrency failed: ${JSON.stringify(outcomes)}`);
    }
    process.stdout.write("Requester revision concurrency: two connections, exactly one submission winner.\n");
    process.exitCode = 0;
  } else {
  process.stdout.write(run(psqlArgs, read("supabase/tests/keu10_fund_type_upgrade.after.sql")));
  // Seed is repeatable but refuses identity/configuration drift.
  run(psqlArgs, read(migrationRoot + "20261006171000_seed_keu10_grouped_workflows.sql"));
  const output = run(psqlArgs, read("supabase/tests/keu10_workflow.integration.sql"));
  if (!output.includes("KEU10 workflow: all assertions passed")) throw new Error(`Missing success marker:\n${output}`);
  process.stdout.write(output);

  const concurrent = (sql) => new Promise((resolve, reject) => {
    const child = spawn("docker", psqlArgs);
    let stdout = "", stderr = "";
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(sql);
  });
  const sql = `set role authenticated; select set_config('request.jwt.claim.sub',keu10_test.id(2)::text,false);
select public.handle_approve_surat_v2(signature.id,signature.surat_id,'Concurrency acceptance',null)
from public.surat_signatures signature join keu10_test.results result on result.surat_id=signature.surat_id
where result.key='concurrency' and signature.step_order=1;`;
  const outcomes = await Promise.all([concurrent(sql), concurrent(sql)]);
  if (outcomes.filter((result) => result.code === 0).length !== 1 ||
      outcomes.filter((result) => /KEU10 signature is not active/.test(result.stderr)).length !== 1) {
    throw new Error(`Concurrent approval must have exactly one winner: ${JSON.stringify(outcomes)}`);
  }
  process.stdout.write("KEU10 concurrency: two connections, exactly one approval winner.\n");
  // Production selective release has the original vendor RPC, not its alias.
  run(psqlArgs, "create database keu10_legacy;");
  const legacyArgs = [...psqlArgs, "--dbname=keu10_legacy"];
  const legacySetup = setup
    .replace(/create role (?:anon|authenticated|service_role)(?: bypassrls)?;/gu, "")
    .replace(functions[0], () => canonical("20260818170000_external_submission_decisions.sql", "apply_external_submission_decision"))
    .replace(functions[1], "");
  run(legacyArgs, legacySetup);
  run(legacyArgs, `create table keu10_test.vendor_core_before as
    select md5(prosrc) body_hash from pg_proc where oid='public.apply_external_submission_decision(uuid,text,text,text,timestamptz,text,text)'::regprocedure;`);
  const prerequisite = read(migrationRoot + "20261006164500_keu10_vendor_routing_prerequisite.sql");
  run(legacyArgs, prerequisite);
  run(legacyArgs, prerequisite);
  run(legacyArgs, `select keu10_test.assert((select body_hash=md5(prosrc) from keu10_test.vendor_core_before cross join pg_proc
    where oid='public.apply_external_submission_decision_pre_configurable_routing(uuid,text,text,text,timestamptz,text,text)'::regprocedure),'Original vendor body preserved');
    select keu10_test.assert(not has_function_privilege('authenticated','public.apply_external_submission_decision(uuid,text,text,text,timestamptz,text,text)','execute')
      and not has_function_privilege('anon','public.apply_external_submission_decision(uuid,text,text,text,timestamptz,text,text)','execute')
      and has_function_privilege('service_role','public.apply_external_submission_decision(uuid,text,text,text,timestamptz,text,text)','execute')
      and not has_function_privilege('service_role','public.apply_external_submission_decision_pre_configurable_routing(uuid,text,text,text,timestamptz,text,text)','execute'),'Standalone prerequisite ACL');`);
  run(legacyArgs, read(migrationRoot + "20261006170000_keu10_canonical_workflow.sql"));
  run(legacyArgs, read(migrationRoot + "20261006171000_seed_keu10_grouped_workflows.sql"));
  run(legacyArgs, integrationHelpers);
  run(legacyArgs, read("supabase/tests/keu10_fund_type_upgrade.before.sql"));
  run(legacyArgs, read(migrationRoot + "20261006183000_keu10_automatic_fund_type.sql"));
  process.stdout.write(run(legacyArgs, read("supabase/tests/keu10_fund_type_upgrade.after.sql")));
  const legacyOutput = run(legacyArgs, read("supabase/tests/keu10_workflow.integration.sql"));
  if (!legacyOutput.includes("KEU10 workflow: all assertions passed")) throw new Error(`Legacy vendor compatibility failed:\n${legacyOutput}`);
  process.stdout.write("KEU10 original vendor RPC compatibility: all assertions passed.\n");
  }
} finally {
  spawnSync("docker", ["rm", "-f", id], { encoding: "utf8" });
}
