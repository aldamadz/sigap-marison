import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const requestedBase = String(process.env.BASE_SHA || process.argv[2] || "").trim();

const run = (command, args) => {
  console.log(`> ${command} ${args.join(" ")}`);
  const isWindows = process.platform === "win32";
  const executable = isWindows ? (process.env.ComSpec || "cmd.exe") : command;
  const executableArgs = isWindows
    ? ["/d", "/s", "/c", `${command} ${args.join(" ")}`]
    : args;
  const result = spawnSync(executable, executableArgs, { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const capture = (command, args) => {
  const result = spawnSync(command, args, { encoding: "utf8", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr || "");
    process.exit(result.status ?? 1);
  }
  return result.stdout;
};

const npm = "npm";
const npx = "npx";
const base = requestedBase || (capture("git", ["rev-parse", "--verify", "origin/staging^{commit}"]).trim());
if (!/^[0-9a-f]{40}$/iu.test(base)) {
  console.error("BASE_SHA harus commit SHA penuh.");
  process.exit(2);
}
const mergeBase = capture("git", ["merge-base", base, "HEAD"]).trim();
const changedFiles = capture("git", [
  "diff",
  "--name-only",
  "--diff-filter=ACMR",
  mergeBase,
]).split(/\r?\n/u).map((file) => file.trim()).filter(Boolean);
const deletedCodeFiles = capture("git", ["diff", "--name-only", "--diff-filter=D", mergeBase])
  .split(/\r?\n/u).map((file) => file.trim())
  .filter((file) => /^(src|backend|server|shared)\//u.test(file));
const untrackedFiles = capture("git", ["ls-files", "--others", "--exclude-standard"])
  .split(/\r?\n/u).map((file) => file.trim()).filter(Boolean);
const allChangedFiles = [...new Set([...changedFiles, ...untrackedFiles])];

const onlyQualityCommandsChanged = () => {
  const previous = JSON.parse(capture("git", ["show", `${mergeBase}:package.json`]));
  const current = JSON.parse(readFileSync("package.json", "utf8"));
  for (const manifest of [previous, current]) {
    delete manifest.scripts.quality;
    delete manifest.scripts["quality:changed"];
    // These additional gates are selected below; they do not alter global test setup.
    delete manifest.scripts["test:requester-revision-sql"];
    delete manifest.scripts["test:requester-revision-pdf"];
    delete manifest.scripts["test:pdf-rejection"];
  }
  return JSON.stringify(previous) === JSON.stringify(current);
};

if (allChangedFiles.length === 0) {
  console.log("Tidak ada file berubah; tidak ada test terdampak.");
  process.exit(0);
}

console.log(`Changed files (${allChangedFiles.length}):`);
allChangedFiles.forEach((file) => console.log(`- ${file}`));

const changesGlobalTestInfrastructure = deletedCodeFiles.length > 0 || allChangedFiles.some((file) => [
  "package-lock.json",
  "vitest.config.ts",
  "vite.config.ts",
].includes(file) || file.startsWith("src/test/setup")) ||
  (allChangedFiles.includes("package.json") && !onlyQualityCommandsChanged());

if (changesGlobalTestInfrastructure) {
  run(npm, ["test", "--", "--hookTimeout", "30000", "--testTimeout", "30000"]);
} else {
  const relatedFiles = allChangedFiles.filter((file) =>
    /^(src|backend|shared|server)\//u.test(file) && /\.[cm]?[jt]sx?$/u.test(file)
  );
  if (allChangedFiles.some((file) => file.startsWith(".github/workflows/") || file === "scripts/quality-live-base.sh" || file === "scripts/deploy-app.sh")) {
    relatedFiles.push("src/test/automatic-deployment.test.ts");
  }
  if (relatedFiles.some((file) => !/^[A-Za-z0-9_./-]+$/u.test(file))) {
    console.error("Nama file test terdampak tidak aman untuk runner Windows.");
    process.exit(2);
  }
  if (relatedFiles.length > 0) {
    run(npx, [
      "vitest", "related", ...new Set(relatedFiles),
      "--passWithNoTests", "--hookTimeout", "30000", "--testTimeout", "30000",
    ]);
  }
}

const gates = new Set();
if (allChangedFiles.some(file => /standalone_release_notices.*\.sql$|test-standalone-release-notices-sql\.mjs$/u.test(file))) gates.add('standalone-release-notices-sql');
if (allChangedFiles.some(file => /monitoring_readable_details.*\.sql$/u.test(file))) gates.add('monitoring-readable-details-sql');
if (allChangedFiles.some(file => /configured_signer_removal.*\.sql$/u.test(file))) gates.add('configured-signer-removal-sql');
if (allChangedFiles.some(file => /hrd_ga_review.*\.sql$/u.test(file))) gates.add('hrd-ga-review-sql');
if (allChangedFiles.some(file => /hrd_ga_shared_claim.*\.sql$|internal_non_asset_goods.*\.sql$/u.test(file))) gates.add('hrd-ga-claim-sql');
if (allChangedFiles.some(file => /docker.*retention|production-deploy-lock/.test(file))) gates.add('docker-image-retention');
for (const file of allChangedFiles) {
  if (/requester_revision_recovery.*\.sql$/u.test(file)) gates.add('requester-revision-recovery-sql');
  if (/signer_(?:action_sla|clock_authority).*\.sql$/u.test(file)) gates.add('signer-action-sla-clock-sql');
  if (/notification_delivery.*\.sql$/u.test(file)) gates.add('notification-delivery-sql');
  if (/personal_item_reminders.*\.sql$/u.test(file)) gates.add('personal-reminders-sql');
  if (/department_receiving_periods.*\.sql$/u.test(file)) gates.add('department-receiving-sql');
  if (/department_receiving_authority.*\.sql$/u.test(file)) gates.add('department-receiving-authority-sql');
  if (/weekly_department_sla.*\.sql$/u.test(file)) gates.add('department-weekly-sql');
  if (/signer_organization_monitoring.*\.sql$/u.test(file)) gates.add('signer-organization-monitoring-sql');
  if (/verified_fund_outbound_replacement.*\.sql$|verified_fund_replacement.*\.sql$/u.test(file)) gates.add('fund-outbound-replacement-sql');
  if (/release_notice_preferences\.sql$|release-notice-sql\.test\.mjs$/u.test(file)) gates.add('release-notice-sql');
  if (/actionable_role_dashboard.*\.sql$|test-actionable-dashboard-sql\.mjs$/u.test(file)) gates.add('actionable-dashboard-sql');
  if (/^(ops\/maintenance\/|scripts\/build-maintenance-edge\.mjs)/u.test(file)) gates.add('maintenance-edge');
  if (/recommendation_internal_(office_reservation|active_actor).*\.sql$|test-recommendation-office-reservation-sql\.mjs$/u.test(file)) gates.add('recommendation-office-reservation-sql');
  if (/revision_recommendation_task.*\.sql$/u.test(file)) gates.add('revision-recommendation-sql');
  if (/unit_partial_readiness.*\.sql$|test-unit-revision-reallocation-sql\.mjs$/u.test(file)) gates.add('unit-partial-readiness-sql');
  if (/preserve_external_unit_addendum_review.*\.sql$|unit_external_addendum_review.*\.sql$/u.test(file)) gates.add('unit-external-addendum-sql');
  if (/unit_allocation_authority.*\.sql$/u.test(file)) gates.add('unit-allocation-authority-sql');
  if (/verified_unit_presentation.*\.sql$/u.test(file)) gates.add('unit-verified-presentation-sql');
    if (/registration_draft_(reservation_lifecycle|recommendation_scope|recommendation_office_guard|helper_execution).*\.sql$/u.test(file)) gates.add('draft-reservation-lifecycle-sql');
  if (/delegated_issuing_office.*\.sql$/u.test(file)) gates.add('delegated-office-sql');
  if (/external_only.*projects.*\.sql$/u.test(file)) gates.add("external-project-source-sql");
  if (/branch_fund.*\.sql$|test-letter-number-reuse-sql\.mjs$/u.test(file)) gates.add("branch-fund-numbering-sql");
  if (/fund_rab_and_unit_revision_parity.*\.sql$|test-fund-rab-and-unit-revision-parity-sql\.mjs$/u.test(file)) gates.add("fund-rab-unit-revision-parity-sql");
  if (/dynamic_branch_reporting.*\.sql$|test-dynamic-branch-reporting-sql\.mjs$/u.test(file)) gates.add("dynamic-branch-reporting-sql");
  if (/related_branch_review_signer_candidates.*\.sql$|test-canonical-submission-workflows-sql\.mjs$/u.test(file)) gates.add("canonical-submission-workflows-sql");
  if (/related_branch_review_signer_candidates.*\.sql$|test-keu10-workflow-sql\.mjs$/u.test(file)) gates.add("branch-officers-keu10-sql");
  if (/requester.*(revision|correction|follow_up_sla).*\.sql$|test-requester-revision|pdf_approval_decision_status.*\.sql$/u.test(file)) gates.add("test:requester-revision-sql");
  if (/document-revision-notes\.mjs$|test-requester-revision-pdf\.mjs$|signer-revision-preview/u.test(file)) gates.add("test:requester-revision-pdf");
  if (/document-revision-notes\.mjs$|test-revision-appendix\.mjs$/u.test(file)) gates.add("revision-appendix-pdf");
  if (/test-pdf-rejection\.mjs$|pdf_approval_decision_status\.sql$/.test(file)) gates.add("test:pdf-rejection");
  if (/keu10.*pdf.*\.mjs$/u.test(file)) gates.add("test:keu10-pdf");
  if (/keu10.*\.sql$|test-keu10-workflow-sql\.mjs$/u.test(file)) gates.add("test:keu10-workflow-sql");
  if (/^(server|scripts|src)\/.*(document|docx|layout)/u.test(file)) gates.add("test:document-layout");
  if (/^pgd-pdf-renderer\.mjs$|^scripts\/test-unit-examination-pdf\.mjs$|^(server|scripts|src)\/.*pgd.*pdf/u.test(file)) gates.add("test:pgd-pdf");
  if (/^(pdf-worker\.mjs|server\/pdf-worker-job\.mjs|server\/revision-actor-evidence(?:\.test)?\.mjs|scripts\/test-pdf-worker-job\.mjs)$/u.test(file)) gates.add("test:worker-job");
  if (/^(server|scripts|src)\/.*recommendation.*pdf/u.test(file)) gates.add("test:recommendation-pdf");
  if (/^(server|scripts|src|supabase)\/.*storage/u.test(file)) gates.add("test:storage-policy");
  if (/idempotency.*\.sql$|test-idempotency-key-sql\.mjs$/u.test(file)) gates.add("test:idempotency-key-sql");
  if (/unit-revision.*\.sql$|test-unit-revision-reallocation-sql\.mjs$/u.test(file)) gates.add("test:unit-revision-sql");
  if (/mrn16.*\.sql$|test-mrn16-sql\.mjs$/u.test(file)) gates.add("test:mrn16-sql");
  if (/mrn17.*\.sql$|test-mrn17-resolution-source-sql\.mjs$/u.test(file)) gates.add("test:mrn17-sql");
  if (/rec03.*\.sql$|test-rec03-sql\.mjs$/u.test(file)) gates.add("test:rec03-sql");
  if (/recommendation_parent_transport.*\.sql$/u.test(file)) gates.add("recommendation-transport-sql");
  if (/rec03.*file.*link.*\.sql$|test-rec03-file-link-sql\.mjs$/u.test(file)) gates.add("test:rec03-file-link-sql");
  if (/outbound.*replacement.*\.sql$|test-outbound-replacement-sql\.mjs$/u.test(file)) gates.add("test:outbound-replacement-sql");
  if (/external.*submission.*decision.*\.sql$|validated_unit_project_revision\.sql$|test-external-submission-decisions-sql\.mjs$/u.test(file)) gates.add("test:external-submission-decisions-sql");
  if (/branch-asset-without-project.*\.sql$|branch-asset-without-project\.integration\.sql$|test-branch-asset-without-project-sql\.mjs$/u.test(file)) gates.add("test:branch-asset-without-project-sql");
  if (/work.calendar.*\.sql$|test-work-calendar-sql\.mjs$/u.test(file)) gates.add("test:work-calendar-sql");
  if (/work.calendar.bootstrap.*\.sql$|test-work-calendar-bootstrap-sql\.mjs$/u.test(file)) gates.add("test:work-calendar-bootstrap-sql");
}

if (allChangedFiles.some(file => /full_signer_revision.*\.sql$/u.test(file))) gates.add('full-signer-revision-sql');

for (const gate of gates) {
  if (gate === 'standalone-release-notices-sql') {
    run('node', ['scripts/test-standalone-release-notices-sql.mjs']);
    continue;
  }
  if (gate === 'monitoring-readable-details-sql') {
    run('node', ['scripts/test-actionable-dashboard-sql.mjs', '--monitoring-details']);
    continue;
  }
  if (gate === 'hrd-ga-review-sql') {
    run('node', ['scripts/test-keu10-workflow-sql.mjs', '--hrd-ga-review']);
    continue;
  }
  if (gate === 'hrd-ga-claim-sql') {
    run('node', ['scripts/test-keu10-workflow-sql.mjs', '--hrd-ga-review', '--hrd-ga-claim']);
    run('node', ['scripts/test-keu10-workflow-sql.mjs', '--full-signer-revision', '--claim-full-revision']);
    continue;
  }
  if (gate === 'actionable-dashboard-sql') {
    run('node', ['scripts/test-actionable-dashboard-sql.mjs']);
    continue;
  }
  if (gate === 'signer-action-sla-clock-sql') {
    run('node', ['scripts/test-actionable-dashboard-sql.mjs', '--action-clock']);
    continue;
  }
  if (gate === 'release-notice-sql') {
    run('node', ['--test', 'ops/maintenance/release-notice-sql.test.mjs']);
    continue;
  }
  if (gate === 'notification-delivery-sql') {
    run('node', ['scripts/test-actionable-dashboard-sql.mjs', '--notifications']);
    continue;
  }
  if (gate === 'personal-reminders-sql') {
    run('node', ['scripts/test-actionable-dashboard-sql.mjs', '--personal-reminders']);
    continue;
  }
  if (gate === 'department-receiving-authority-sql') {
    run('node', ['scripts/test-actionable-dashboard-sql.mjs', '--receiving-authority']);
    run('node', ['scripts/test-actionable-dashboard-sql.mjs', '--receiving-authority', '--live-shape']);
    continue;
  }
  if (gate === 'department-receiving-sql') {
    run('node', ['scripts/test-actionable-dashboard-sql.mjs', '--receiving']);
    run('node', ['scripts/test-actionable-dashboard-sql.mjs', '--receiving', '--live-shape']);
    continue;
  }
  if (gate === 'department-weekly-sql') {
    run('node', ['scripts/test-actionable-dashboard-sql.mjs', '--weekly', '--live-shape']);
    continue;
  }
  if (gate === 'requester-revision-recovery-sql') {
    run('node', ['scripts/test-keu10-workflow-sql.mjs', '--revision-recovery']);
    continue;
  }
  if (gate === 'full-signer-revision-sql') {
    run('node', ['scripts/test-keu10-workflow-sql.mjs', '--full-signer-revision']);
    continue;
  }
  if (gate === 'docker-image-retention') {
    run('node', ['--test', 'scripts/test-docker-image-retention.mjs']);
    continue;
  }
  if (gate === 'signer-organization-monitoring-sql') {
    run('node', ['scripts/test-actionable-dashboard-sql.mjs', '--signer-scope']);
    continue;
  }
  if (gate === 'revision-recommendation-sql') {
    run('node', ['scripts/test-recommendation-office-reservation-sql.mjs', '--revision-update']);
    run('node', ['scripts/test-recommendation-office-reservation-sql.mjs', '--revision-update', '--production-shape']);
    run('node', ['scripts/test-keu10-workflow-sql.mjs', '--requester-edit', '--recommendation-enable']);
    continue;
  }
  if (gate === 'fund-outbound-replacement-sql') {
    run('node', ['scripts/test-outbound-replacement-sql.mjs', '--fund']);
    continue;
  }
  if (gate === 'maintenance-edge') {
    run('node', ['--test', 'ops/maintenance/edge-worker.test.mjs', 'ops/maintenance/server.test.mjs']);
    run('node', ['scripts/build-maintenance-edge.mjs']);
    continue;
  }
  if (gate === 'recommendation-office-reservation-sql') {
    run('node', ['scripts/test-recommendation-office-reservation-sql.mjs']);
    run('node', ['scripts/test-recommendation-office-reservation-sql.mjs', '--production-shape']);
    continue;
  }
  if (gate === 'unit-allocation-authority-sql') {
    run('node', ['scripts/test-unit-revision-reallocation-sql.mjs', '--authority']);
    run('node', ['scripts/test-unit-revision-reallocation-sql.mjs', '--authority', '--production-shape']);
    continue;
  }
  if (gate === 'unit-verified-presentation-sql') {
    run('node', ['scripts/test-unit-revision-reallocation-sql.mjs', '--verified-presentation']);
    run('node', ['scripts/test-unit-revision-reallocation-sql.mjs', '--verified-presentation', '--production-shape']);
    continue;
  }
  if (gate === 'configured-signer-removal-sql') {
    run('node', ['scripts/test-keu10-workflow-sql.mjs', '--configured-signer-removal']);
    continue;
  }
  if (gate === 'draft-reservation-lifecycle-sql') run('node', ['scripts/test-letter-number-reuse-sql.mjs', '--draft-lifecycle']);
  if (gate === 'unit-partial-readiness-sql') {
    run('node', ['scripts/test-unit-revision-reallocation-sql.mjs', '--partial']);
    run('node', ['scripts/test-unit-revision-reallocation-sql.mjs', '--partial', '--production-shape']);
  }
  else if (gate === 'unit-external-addendum-sql') {
    run('node', ['scripts/test-unit-revision-reallocation-sql.mjs', '--external-addendum']);
    run('node', ['scripts/test-unit-revision-reallocation-sql.mjs', '--external-addendum', '--production-shape']);
  }
  else if (gate === 'delegated-office-sql') run('node', ['scripts/test-letter-number-reuse-sql.mjs', '--delegated-offices']);
  else if (gate === 'revision-appendix-pdf') run('node', ['--test','scripts/test-revision-appendix.mjs']);
  else if (gate === 'recommendation-transport-sql') run('node', ['scripts/test-rec03-sql.mjs', '--transport']);
  else if (gate === "external-project-source-sql") run("node", ["scripts/test-letter-number-reuse-sql.mjs", "--external-projects"]);
  else if (gate === "branch-fund-numbering-sql") run("node", ["scripts/test-letter-number-reuse-sql.mjs", "--branch-fund"]);
  else if (gate === "fund-rab-unit-revision-parity-sql") run("node", ["scripts/test-fund-rab-and-unit-revision-parity-sql.mjs"]);
  else if (gate === "dynamic-branch-reporting-sql") run("node", ["scripts/test-dynamic-branch-reporting-sql.mjs"]);
  else if (gate === "canonical-submission-workflows-sql") run("node", ["scripts/test-canonical-submission-workflows-sql.mjs"]);
  else if (gate === "branch-officers-keu10-sql") run("node", ["scripts/test-keu10-workflow-sql.mjs", "--branch-officers"]);
  else run(npm, ["run", gate]);
}
