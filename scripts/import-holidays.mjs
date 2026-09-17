#!/usr/bin/env node
/**
 * CAL-03 F6 — impor hari libur ke tabel `public.holidays`.
 *
 * Mekanisme impor resmi untuk tabel `holidays`. Script ini sengaja:
 * - default DRY-RUN: tanpa `--apply` tidak ada tulisan ke database;
 * - hanya boleh berjalan dengan `MARISON_DEPLOYMENT_ENVIRONMENT=staging` dan
 *   menolak bila host Supabase sama dengan production;
 * - memakai service role dari environment, tidak pernah mencetak credential;
 * - idempotent: baris dengan tanggal yang sama di-update, bukan diduplikasi.
 *
 * Format CSV (header wajib, pemisah koma):
 *
 *   holiday_date,name,is_cuti_bersama
 *   2026-01-01,Tahun Baru Masehi,false
 *   2026-03-20,Cuti Bersama Idul Fitri,true
 *
 * Pemakaian:
 *
 *   $env:MARISON_DEPLOYMENT_ENVIRONMENT = "staging"
 *   node scripts/import-holidays.mjs supabase/data/holidays-2026.csv
 *   node scripts/import-holidays.mjs supabase/data/holidays-2026.csv --apply
 *
 * Credential dibaca dari `.env.staging` (bila ada) atau environment proses.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseEnvFile(path) {
  const values = {};
  if (!existsSync(path)) return values;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim().replace(/^export\s+/, "");
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

/** Parser CSV minimal: mendukung kutip ganda dan koma di dalam kutip. */
function parseCsv(content) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (inQuotes) {
      if (char === '"') {
        if (content[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  row.push(field);
  rows.push(row);

  return rows.filter((entry) => entry.some((value) => value.trim().length > 0));
}

function normalizeBoolean(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "ya" || normalized === "yes";
}

function readHolidays(filePath) {
  const rows = parseCsv(readFileSync(filePath, "utf8"));
  if (rows.length === 0) throw new Error("Berkas CSV kosong.");

  const header = rows[0].map((column) => column.trim().toLowerCase());
  const dateIndex = header.indexOf("holiday_date");
  const nameIndex = header.indexOf("name");
  const cutiIndex = header.indexOf("is_cuti_bersama");
  if (dateIndex === -1 || nameIndex === -1) {
    throw new Error('Header CSV wajib memuat kolom "holiday_date" dan "name".');
  }

  const byDate = new Map();
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    const date = String(row[dateIndex] ?? "").trim();
    const name = String(row[nameIndex] ?? "").trim();
    if (!DATE_PATTERN.test(date)) {
      throw new Error(`Baris ${index + 1}: tanggal "${date}" bukan format YYYY-MM-DD.`);
    }
    if (name.length === 0) {
      throw new Error(`Baris ${index + 1}: nama libur wajib diisi.`);
    }
    byDate.set(date, {
      holiday_date: date,
      name,
      is_cuti_bersama: cutiIndex === -1 ? false : normalizeBoolean(row[cutiIndex]),
    });
  }

  return [...byDate.values()].sort((left, right) =>
    left.holiday_date < right.holiday_date ? -1 : 1,
  );
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const fileArg = args.find((arg) => !arg.startsWith("--"));

if (!fileArg) {
  throw new Error(
    "Pemakaian: node scripts/import-holidays.mjs <berkas-csv> [--apply]",
  );
}

const environment = String(process.env.MARISON_DEPLOYMENT_ENVIRONMENT || "")
  .trim()
  .toLowerCase();
if (environment !== "staging") {
  throw new Error(
    "Script hanya boleh dijalankan dengan MARISON_DEPLOYMENT_ENVIRONMENT=staging.",
  );
}

// Credential: `.env.staging` menang supaya impor tidak bergantung pada shell
// yang belum memuat environment staging.
const envFromFile = parseEnvFile(resolve(".env.staging"));
const stagingUrl = envFromFile.SUPABASE_URL || process.env.SUPABASE_URL;
const stagingServiceKey =
  envFromFile.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!stagingUrl || !stagingServiceKey) {
  throw new Error("Credential Supabase staging belum lengkap.");
}

const productionEnv = parseEnvFile(resolve(".env.production"));
const productionUrl = productionEnv.SUPABASE_URL || productionEnv.VITE_SUPABASE_URL;
if (productionUrl && new URL(stagingUrl).hostname === new URL(productionUrl).hostname) {
  throw new Error("Project staging dan production tidak boleh sama.");
}

const filePath = resolve(fileArg);
if (!existsSync(filePath)) throw new Error(`Berkas tidak ditemukan: ${filePath}`);

const holidays = readHolidays(filePath);
if (holidays.length === 0) throw new Error("Tidak ada baris hari libur untuk diimpor.");

// Ringkasan aman: tidak pernah memuat URL, key, atau isi credential.
console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"}`);
console.log(`Berkas: ${fileArg}`);
console.log(`Jumlah baris: ${holidays.length}`);
console.log(`Rentang: ${holidays[0].holiday_date} s/d ${holidays[holidays.length - 1].holiday_date}`);
console.log(`Cuti bersama: ${holidays.filter((row) => row.is_cuti_bersama).length}`);

if (!apply) {
  console.log("Dry-run selesai. Tambahkan --apply untuk menulis ke staging.");
  process.exit(0);
}

const client = createClient(stagingUrl, stagingServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { error } = await client
  .from("holidays")
  .upsert(holidays, { onConflict: "holiday_date" });

if (error) {
  throw new Error(`Impor hari libur gagal: ${error.message}`);
}

console.log(`Selesai: ${holidays.length} hari libur di-upsert ke staging.`);
