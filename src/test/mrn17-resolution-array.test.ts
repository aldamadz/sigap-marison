import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("MRN-17 resolution-source migration", () => {
  it("appends projectId without PostgreSQL array-literal ambiguity", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260803170000_fix_marison_resolution_source_array.sql"),
      "utf8",
    );

    expect(migration).toContain("array_append(v_required, 'projectId')");
    expect(migration).not.toContain("v_required := v_required || 'projectId'");
  });
});
