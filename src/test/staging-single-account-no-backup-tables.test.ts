import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const files = [
  "docs/STAGING_SINGLE_ACCOUNT_FIXTURES_RUNBOOK.md",
  "supabase/migrations/20260919000000_staging_single_account_usage_fixtures.sql",
  "supabase/tests/staging_single_account_fixtures.integration.sql",
  "supabase/tests/staging_single_account_behavioral.integration.sql",
  "supabase/tests/staging_single_account_fixtures_removal.sql",
];

const backupBanned = ["create table public._backup", "_backup_form_"];

// PowerShell cmdlets and secret-as-argument patterns have no place in the
// Ubuntu Bash runbook: libpq env only, Supabase CLI via --linked.
const shellBanned = ["get-date", "get-item", "get-filehash", "staging_db_url"];

describe("staging single-account fixtures guard", () => {
  it("contains no backup-table SQL", () => {
    for (const file of files) {
      const content = readFileSync(join(process.cwd(), file), "utf8").toLowerCase();
      for (const pattern of backupBanned) {
        expect(content.includes(pattern), `${file} contains ${pattern}`).toBe(false);
      }
    }
  });

  it("runbook uses Bash/libpq only, no secret as argument", () => {
    for (const file of files) {
      const content = readFileSync(join(process.cwd(), file), "utf8").toLowerCase();
      for (const pattern of shellBanned) {
        expect(content.includes(pattern), `${file} contains ${pattern}`).toBe(false);
      }
    }
  });
});
