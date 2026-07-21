import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = readFileSync(join(process.cwd(), "scripts/normalize-staging-emails.mjs"), "utf8");

describe("staging email normalization", () => {
  it("refuses to run outside staging", () => {
    expect(script).toContain('environment !== "staging"');
    expect(script).toContain("Script hanya boleh dijalankan dengan environment staging.");
  });

  it("only targets sanitized staging accounts and keeps Auth and profiles aligned", () => {
    expect(script).toContain("example\\.invalid|staging\\.test");
    expect(script).toContain("@staging.test");
    expect(script).toContain("auth.admin.updateUserById");
    expect(script).toContain('.from("profiles")');
    expect(script).toContain("toEmailSlug");
    expect(script).toContain("migration.${item.id}@staging.test");
  });

  it("requires an explicit apply flag", () => {
    expect(script).toContain('process.argv.includes("--apply")');
    expect(script).toContain("applyChanges && changed.length > 0");
  });
});
