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
  if (allChangedFiles.some((file) => file.startsWith(".github/workflows/") || file === "scripts/quality-live-base.sh")) {
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
for (const file of allChangedFiles) {
  if (/^(server|scripts|src)\/.*(document|docx|layout)/u.test(file)) gates.add("test:document-layout");
  if (/^(server|scripts|src)\/.*pgd.*pdf/u.test(file)) gates.add("test:pgd-pdf");
  if (/^(pdf-worker\.mjs|server\/pdf-worker-job\.mjs|scripts\/test-pdf-worker-job\.mjs)$/u.test(file)) gates.add("test:worker-job");
  if (/^(server|scripts|src)\/.*recommendation.*pdf/u.test(file)) gates.add("test:recommendation-pdf");
  if (/^(server|scripts|src|supabase)\/.*storage/u.test(file)) gates.add("test:storage-policy");
  if (/idempotency.*\.sql$|test-idempotency-key-sql\.mjs$/u.test(file)) gates.add("test:idempotency-key-sql");
  if (/unit-revision.*\.sql$|test-unit-revision-reallocation-sql\.mjs$/u.test(file)) gates.add("test:unit-revision-sql");
  if (/mrn16.*\.sql$|test-mrn16-sql\.mjs$/u.test(file)) gates.add("test:mrn16-sql");
  if (/mrn17.*\.sql$|test-mrn17-resolution-source-sql\.mjs$/u.test(file)) gates.add("test:mrn17-sql");
  if (/rec03.*\.sql$|test-rec03-sql\.mjs$/u.test(file)) gates.add("test:rec03-sql");
  if (/rec03.*file.*link.*\.sql$|test-rec03-file-link-sql\.mjs$/u.test(file)) gates.add("test:rec03-file-link-sql");
  if (/outbound.*replacement.*\.sql$|test-outbound-replacement-sql\.mjs$/u.test(file)) gates.add("test:outbound-replacement-sql");
  if (/external.*submission.*decision.*\.sql$|test-external-submission-decisions-sql\.mjs$/u.test(file)) gates.add("test:external-submission-decisions-sql");
  if (/branch-asset-without-project.*\.sql$|branch-asset-without-project\.integration\.sql$|test-branch-asset-without-project-sql\.mjs$/u.test(file)) gates.add("test:branch-asset-without-project-sql");
  if (/work.calendar.*\.sql$|test-work-calendar-sql\.mjs$/u.test(file)) gates.add("test:work-calendar-sql");
}

for (const gate of gates) run(npm, ["run", gate]);
