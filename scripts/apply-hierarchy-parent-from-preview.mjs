import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const previewFile = process.argv[2] || "hierarchy-mapping-preview.csv";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const workbook = XLSX.readFile(previewFile);
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
const mappings = rows
  .map((row) => ({
    nik: String(row.NIK || "").trim(),
    parentNik: String(row["Parent NIK"] || "").trim(),
  }))
  .filter((row) => row.nik);

const niks = Array.from(new Set([
  ...mappings.map((row) => row.nik),
  ...mappings.map((row) => row.parentNik).filter(Boolean),
]));

const { data: profiles, error: profileError } = await supabase
  .from("profiles")
  .select("id, nik, full_name, parent_id")
  .in("nik", niks)
  .is("deleted_at", null);

if (profileError) {
  console.error(profileError.message);
  process.exit(1);
}

const profileByNik = new Map((profiles || []).map((profile) => [String(profile.nik).trim(), profile]));
const missingChildren = [];
const missingParents = [];
let updated = 0;
let skipped = 0;

for (const mapping of mappings) {
  const child = profileByNik.get(mapping.nik);
  if (!child) {
    missingChildren.push(mapping.nik);
    skipped++;
    continue;
  }

  const parent = mapping.parentNik ? profileByNik.get(mapping.parentNik) : null;
  if (mapping.parentNik && !parent) {
    missingParents.push(`${mapping.nik} -> ${mapping.parentNik}`);
    skipped++;
    continue;
  }

  const nextParentId = parent?.id || null;
  if ((child.parent_id || null) === nextParentId) {
    skipped++;
    continue;
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      parent_id: nextParentId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", child.id);

  if (error) {
    console.error(`${mapping.nik}: ${error.message}`);
    skipped++;
    continue;
  }

  updated++;
}

console.log(`Mappings: ${mappings.length}`);
console.log(`Updated: ${updated}`);
console.log(`Skipped/no change: ${skipped}`);
console.log(`Missing children: ${missingChildren.length}`);
console.log(`Missing parents: ${missingParents.length}`);

if (missingChildren.length > 0) {
  console.log(`Missing child NIK: ${missingChildren.slice(0, 20).join(", ")}`);
}
if (missingParents.length > 0) {
  console.log(`Missing parent NIK: ${missingParents.slice(0, 20).join(", ")}`);
}
