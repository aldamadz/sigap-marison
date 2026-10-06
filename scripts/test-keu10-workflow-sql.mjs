import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";

const read = (path) => readFileSync(path, "utf8").replaceAll("\r\n", "\n");
const migrationRoot = "supabase/migrations/";
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
  canonical("20260818170000_external_submission_decisions.sql", "submit_external_submission_revision"),
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
    .replace("public.accept_surat_process_revision(", "public.accept_surat_process_revision_pre_configurable_restart("),
  canonical("20260824100000_configurable_external_revision_and_proactive_pdf.sql", "accept_surat_process_revision"),
  canonical("20260707093000_skip_requester_acceptance_for_checker_no_item_change.sql", "resolve_surat_process_revision")
    .replace("public.resolve_surat_process_revision(", "public.resolve_surat_process_revision_pre_external_signer_routing("),
  canonical("20260824100000_configurable_external_revision_and_proactive_pdf.sql", "resolve_surat_process_revision"),
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
create trigger validate_form_usage_signature before insert or update on public.surat_signatures
for each row execute function public.validate_form_usage_signature();
create trigger enqueue_native_pdf_after_registration after insert on public.surat_registrasi
for each row execute function public.enqueue_native_document_pdf_for_registration();
create trigger enqueue_native_pdf_after_signature after update of is_signed on public.surat_signatures
for each row execute function public.enqueue_native_document_pdf_for_signature();
grant select,insert,update,delete on all tables in schema public to authenticated,service_role;
grant execute on all functions in schema public to authenticated,service_role;
`;

const run = (args, input = "") => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 240_000, maxBuffer: 8_000_000 });
  if (result.status !== 0) throw new Error(`Disposable docker command failed (${result.status}):\n${result.stderr}\n${result.stdout}`);
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
};
const id = run(["run", "-d", "-e", "POSTGRES_PASSWORD=test", "postgres:17-alpine"]).trim();
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
  run(psqlArgs, read(migrationRoot + "20261006170000_keu10_canonical_workflow.sql"));
  run(psqlArgs, read(migrationRoot + "20261006171000_seed_keu10_grouped_workflows.sql"));
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
} finally {
  spawnSync("docker", ["rm", "-f", id], { encoding: "utf8" });
}
