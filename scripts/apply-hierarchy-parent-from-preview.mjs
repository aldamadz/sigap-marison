import fs from "node:fs";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

const [previewFile] = process.argv.slice(2);

if (!previewFile) {
  console.error("Usage: node scripts/apply-hierarchy-parent-from-preview.mjs <preview.csv|preview.xlsx>");
  console.error("Use an explicit path, preferably under .tmp-hierarchy/.");
  process.exit(1);
}

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

const parseCsvLine = (line) => {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
};

const readRows = async (file) => {
  if (/\.csv$/i.test(file)) {
    const [headers = [], ...body] = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(parseCsvLine);
    return body.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const worksheet = workbook.worksheets[0];
  const headers = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? "");
  });
  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const item = {};
    headers.forEach((header, index) => {
      item[header] = String(row.getCell(index + 1).value ?? "");
    });
    rows.push(item);
  });
  return rows;
};

const rows = await readRows(previewFile);
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
    console.error(`Profile update failed: ${error.message}`);
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
