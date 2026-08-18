import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const compose = readFileSync(resolve("docker-compose.staging.yml"), "utf8");
const appService = compose.slice(
  compose.indexOf("  agenda-flow-staging:"),
  compose.indexOf("  agenda-pdf-worker-staging:"),
);

describe("staging app Compose runtime environment", () => {
  it.each([
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SESSION_SECRET",
    "STORAGE_SUPABASE_SERVICE_ROLE_KEY",
  ])("passes required %s through explicitly and fails closed when absent", (key) => {
    expect(appService).toContain(`${key}: "\${${key}:?`);
  });

  it.each([
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
    "WEB_PUSH_PUBLIC_KEY",
    "WEB_PUSH_PRIVATE_KEY",
    "WEB_PUSH_SUBJECT",
  ])("preserves optional %s across clean-worktree deploys", (key) => {
    expect(appService).toContain(`${key}: "\${${key}:-`);
  });

  it("does not expose database or staging test-user credentials to the app", () => {
    expect(appService).not.toContain("STAGING_SUPABASE_DB_PASSWORD");
    expect(appService).not.toContain("STAGING_DEFAULT_USER_PASSWORD");
  });
});
