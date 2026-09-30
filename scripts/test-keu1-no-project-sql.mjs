import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20260930120000_keu1_branch_without_project.sql", "utf8");
const entityGuard = readFileSync("supabase/migrations/20260930130000_keu1_branch_number_entity_guard.sql", "utf8");

assert.match(sql, /number_scope_type in \('pusat', 'cabang', 'branch_asset_000', 'branch_keu1_000'\)/);
assert.match(sql, /upper\(trim\(form\.nomor_form\)\) = 'FM-UAI\.KEU-01-00'/);
assert.match(sql, /validate_form_usage_for_actor\(p_form_usage_id, p_dept_id\)/);
assert.match(sql, /v_office_id is distinct from p_office_id/);
assert.match(sql, /number_scope_type = 'branch_keu1_000'/);
assert.match(sql, /reservation\.project_id is null and reservation\.dept_id is null/);
assert.match(sql, /v_marker->>'fund_without_project' is distinct from 'true'/);
assert.match(sql, /v_category is distinct from 'asset'/);
assert.match(sql, /status = 'CANCELLED'/);
assert.match(sql, /pg_advisory_xact_lock\(hashtext\('letter-number:'/);
assert.match(sql, /with check \(number_scope_type not in \('branch_asset_000', 'branch_keu1_000'\)\)/);
assert.match(entityGuard, /master_entities entity where entity\.id = p_entity_id/);
assert.doesNotMatch(entityGuard, /dept\.entity_id/);

console.log("KEU 1 no-project SQL guard checks passed");
