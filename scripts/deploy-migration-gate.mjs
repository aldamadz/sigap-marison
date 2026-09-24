import { execFileSync } from "node:child_process";

export const validateMigrationAcknowledgement = (diff, acknowledgement) => {
  const versions = diff.trim().split("\n").filter(Boolean).map((line) => {
    const match = /^A\tsupabase\/migrations\/(\d{14})_[^/]+\.sql$/.exec(line.trim());
    if (!match) throw new Error("Deployment includes a modified or invalid migration file.");
    return match[1];
  });
  if (new Set(versions).size !== versions.length) throw new Error("Duplicate migration versions in deployment diff.");
  const expected = versions.sort().join(",");
  if (acknowledgement !== expected) {
    throw new Error(versions.length
      ? `Migration files changed since live runtime. Verify applied versions, then dispatch with exactly: ${expected}`
      : "No migration changed; migration acknowledgement must be empty.");
  }
  return expected;
};

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/deploy-migration-gate.mjs")) {
  try {
    const [previousSha, targetSha, acknowledgement = ""] = process.argv.slice(2);
    if (![previousSha, targetSha].every((value) => /^[0-9a-f]{40}$/.test(value))) throw new Error("Invalid deployment revision.");
    const diff = execFileSync("git", ["diff", "--name-status", previousSha, targetSha, "--", "supabase/migrations"], { encoding: "utf8" });
    const versions = validateMigrationAcknowledgement(diff, acknowledgement);
    if (versions) process.stdout.write(`Operator acknowledged applied migrations: ${versions}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Migration verification failed."}\n`);
    process.exitCode = 1;
  }
}
