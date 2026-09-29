import assert from "node:assert";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260929070000_mar10_non_unit_project_branch_validation.sql",
  "utf8",
);

assert.ok(
  migration.includes("public.get_office_descendant_ids"),
  "migration should define get_office_descendant_ids helper",
);
assert.ok(
  migration.includes("v_request_category = 'non_unit'"),
  "migration should guard non_unit request category",
);
assert.ok(
  migration.includes("v_office_kedudukan = 'KC'"),
  "migration should differentiate KC branch office",
);
assert.ok(
  migration.includes("Proyek tidak tersedia untuk kantor cabang ini atau turunannya."),
  "migration should reject cross-branch project for KC descendants",
);
assert.ok(
  migration.includes("Proyek tidak tersedia untuk kantor ini."),
  "migration should reject cross-branch project for non-KC offices",
);

console.log("MAR-10 non_unit project branch validation migration checks passed");
