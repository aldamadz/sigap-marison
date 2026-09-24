import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260924160000_allow_persistent_outbound_file_tokens.sql",
  "utf8",
);

describe("persistent outbound file token hotfix", () => {
  it("only permits the existing persistent-token contract without replacing token validation", () => {
    expect(migration).toMatch(/alter table public\.file_view_tokens\s+alter column expires_at drop not null;/i);
    expect(migration).not.toMatch(/create\s+(or\s+replace\s+)?function/i);
    expect(migration).not.toMatch(/drop\s+table/i);
  });
});
