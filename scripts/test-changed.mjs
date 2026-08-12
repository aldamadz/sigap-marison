import { spawnSync } from "node:child_process";

const base = String(process.env.BASE_SHA || process.argv[2] || "").trim();

if (!base) {
  console.error("BASE_SHA atau commit base wajib diberikan.");
  process.exit(2);
}

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
const mergeBase = capture("git", ["merge-base", base, "HEAD"]).trim();
const changedFiles = capture("git", [
  "diff",
  "--name-only",
  "--diff-filter=ACMR",
  `${mergeBase}...HEAD`,
]).split(/\r?\n/u).map((file) => file.trim()).filter(Boolean);

if (changedFiles.length === 0) {
  console.log("Tidak ada file berubah; tidak ada test terdampak.");
  process.exit(0);
}

console.log(`Changed files (${changedFiles.length}):`);
changedFiles.forEach((file) => console.log(`- ${file}`));

const changesGlobalTestInfrastructure = changedFiles.some((file) => [
  "package.json",
  "package-lock.json",
  "vitest.config.ts",
  "vite.config.ts",
].includes(file) || file.startsWith("src/test/setup"));

if (changesGlobalTestInfrastructure) {
  run(npm, ["test", "--", "--hookTimeout", "30000", "--testTimeout", "30000"]);
} else {
  run(npx, [
    "vitest",
    "run",
    "--changed",
    mergeBase,
    "--passWithNoTests",
    "--hookTimeout",
    "30000",
    "--testTimeout",
    "30000",
  ]);
}

const gates = new Set();
for (const file of changedFiles) {
  if (/^(server|scripts|src)\/.*(document|docx|layout)/u.test(file)) gates.add("test:document-layout");
  if (/^(server|scripts|src)\/.*pgd.*pdf/u.test(file)) gates.add("test:pgd-pdf");
  if (/^(server|scripts|src)\/.*recommendation.*pdf/u.test(file)) gates.add("test:recommendation-pdf");
  if (/^(server|scripts|src|supabase)\/.*storage/u.test(file)) gates.add("test:storage-policy");
  if (/idempotency.*\.sql$|test-idempotency-key-sql\.mjs$/u.test(file)) gates.add("test:idempotency-key-sql");
  if (/unit-revision.*\.sql$|test-unit-revision-reallocation-sql\.mjs$/u.test(file)) gates.add("test:unit-revision-sql");
  if (/mrn16.*\.sql$|test-mrn16-sql\.mjs$/u.test(file)) gates.add("test:mrn16-sql");
  if (/mrn17.*\.sql$|test-mrn17-resolution-source-sql\.mjs$/u.test(file)) gates.add("test:mrn17-sql");
  if (/rec03.*\.sql$|test-rec03-sql\.mjs$/u.test(file)) gates.add("test:rec03-sql");
  if (/rec03.*file.*link.*\.sql$|test-rec03-file-link-sql\.mjs$/u.test(file)) gates.add("test:rec03-file-link-sql");
  if (/outbound.*replacement.*\.sql$|test-outbound-replacement-sql\.mjs$/u.test(file)) gates.add("test:outbound-replacement-sql");
}

for (const gate of gates) run(npm, ["run", gate]);
