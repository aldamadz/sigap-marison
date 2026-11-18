import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const staging = readFileSync(resolve(".github/workflows/deploy-staging.yml"), "utf8");
const production = readFileSync(resolve(".github/workflows/deploy-production.yml"), "utf8");
const quality = readFileSync(resolve(".github/workflows/quality.yml"), "utf8");
const deploy = readFileSync(resolve("scripts/deploy-app.sh"), "utf8");
const migrationGate = readFileSync(resolve("scripts/deploy-migration-gate.mjs"), "utf8");
const parity = readFileSync(resolve("scripts/check-staging-parity.sh"), "utf8");

describe("automatic deployment boundaries", () => {
  it("runs staging only from staging after an affected quality gate", () => {
    expect(staging).toContain("branches: [staging]");
    expect(staging).toContain("needs: quality");
    expect(staging).toContain("github.ref == 'refs/heads/staging'");
    expect(staging).toContain("quality-live-base.sh staging");
    expect(staging).toContain("npm run quality:changed");
    expect(staging).toContain("npm run audit:release");
    expect(quality).toContain("run: npm run audit:release");
    expect(staging).toContain('bash scripts/deploy-app.sh staging "$GITHUB_SHA"');
  });

  it("gates production on a successful staging rollout containing main", () => {
    expect(production).toContain("branches: [main]");
    expect(production).toContain("workflows: [Deploy Staging]");
    expect(production).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(production).toContain("needs: [preflight, quality]");
    expect(production).toContain("environment: production");
    expect(production).toContain("quality-live-base.sh production");
    expect(production).toContain("npm run quality:changed");
    expect(production).toContain("npm run audit:release");
    const manifest = JSON.parse(readFileSync("package.json", "utf8"));
    expect(manifest.scripts["audit:release"]).toBe(
      "npm audit --omit=dev --audit-level=high && node security/fail-closed/audit-dev-backport.mjs",
    );
    expect(production.match(/fetch-depth: 0/g)).toHaveLength(3);
    expect(production).toContain("check-staging-parity.sh --require-ready");
    expect(parity).toContain('git merge-base --is-ancestor "$main_sha" "$staging_sha"');
    expect(parity).toContain('git merge-base --is-ancestor "$staging_sha" origin/staging');
  });

  it("uses host-local credentials and never restarts workers or applies migrations", () => {
    expect(staging).not.toContain("secrets.");
    expect(production).not.toContain("secrets.");
    expect(deploy).toContain('env_file="/home/marison/sigap-deploy/$environment/.env.$environment"');
    expect(deploy).toContain('env_file=/opt/sigap/secrets/.env.production');
    expect(deploy).toContain('$(hostname)" == sigap-app-prod-01');
    expect(production).toContain('sigap-deploy-production]');
    expect(staging).not.toContain('sigap-deploy-production');
    expect(deploy).toContain('scripts/deploy-environment-identity.mjs');
    expect(deploy).toContain('up -d --no-deps --no-build "$service"');
    expect(deploy).toContain("scripts/deploy-migration-gate.mjs");
    expect(migrationGate).toContain("supabase/migrations");
    expect(deploy).toContain("server/marison-sync-worker.mjs");
    expect(deploy).toContain('git merge-base --is-ancestor "$previous_sha" "$target_sha"');
    expect(deploy).toContain('if [[ "$mode" == --check-only ]]');
    expect(deploy).not.toContain("db push");
    expect(deploy).not.toContain("migration repair");
  });

  it("retries transient public smoke failures on staging without skipping required checks", () => {
    expect(deploy).toMatch(/public_smoke_retry=\(\)[\s\S]*?if \[\[ "\$environment" == staging \]\]; then[\s\S]*?public_smoke_retry=\(--retry 6 --retry-delay 4 --retry-max-time 30\)\s*fi/u);
    expect(deploy).toContain("for path in /health/live /health/ready /; do");
    expect(deploy).toMatch(/"\$\{public_smoke_retry\[@\]\}" --output \/dev\/null "\$domain\$path" \|\| \{\s*echo "Public smoke check failed: \$path" >&2\s*exit 1/u);
  });

  it("bounds every public smoke probe so a stalled connection can roll back", () => {
    expect(deploy).toMatch(/for path in \/health\/live \/health\/ready \/; do\s+curl --fail --silent --show-error --connect-timeout 10 --max-time 20/u);
  });
});
