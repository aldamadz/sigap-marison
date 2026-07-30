import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260730113000_classify_branch_construction_as_non_unit.sql",
  ),
  "utf8",
);

describe("branch construction category migration", () => {
  it("only classifies the known construction usage as non unit", () => {
    expect(migration).toContain("7106caa6-057e-4686-9420-954595c67722");
    expect(migration).toContain("Permohonan Teknik Cabang");
    expect(migration).toContain("set request_category = 'non_unit'");
    expect(migration).toContain("and request_category = 'non_asset'");
    expect(migration).toContain("if v_current_category not in ('non_asset', 'non_unit')");
  });

  it("does not broadly reclassify or recreate usage configuration", () => {
    expect(migration).not.toMatch(
      /update\s+public\.form_usages\s+set[\s\S]*where\s+request_category\s*=\s*'non_asset'/i,
    );
    expect(migration).not.toMatch(/\b(delete|insert)\s+(from|into)\s+public\.form_usage/i);
    expect(migration).not.toContain("surat_registrasi");
    expect(migration).not.toContain("surat_registration_drafts");
  });
});

