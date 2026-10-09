import { spawnSync } from "node:child_process";

for (const shape of ["mainshape", "stageoverlay"]) {
  const args = ["scripts/test-keu10-workflow-sql.mjs", "--fund-rab-parity"];
  if (shape === "stageoverlay") args.push("--stageoverlay");
  const result = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 360_000, maxBuffer: 8_000_000 });
  if (result.status !== 0) throw new Error(`${shape} SQL integration failed:\n${result.stderr}\n${result.stdout}`);
  process.stdout.write(result.stdout);
}
