import assert from "node:assert";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260929080000_seed_keu1_form_usage.sql",
  "utf8",
);

assert.ok(
  migration.includes("FM-UAI.KEU-01-00"),
  "KEU 1 seed should reference FM-UAI.KEU-01-00",
);
assert.ok(
  migration.includes("'Pengajuan Kas Kecil - Kantor Pusat'"),
  "KEU 1 seed should create Pusat usage",
);
assert.ok(
  migration.includes("'Pengajuan Kas Kecil - Kantor Cabang'"),
  "KEU 1 seed should create Cabang usage",
);
assert.ok(
  migration.includes("'Mgr. Keuangan'"),
  "KEU 1 workflow should include Manager Keuangan as approver",
);
assert.ok(
  migration.includes("'Mgr. HRD & GA'"),
  "KEU 1 workflow should include Manager HRD & GA as verifier",
);

console.log("KEU 1 form usage seed migration checks passed");
