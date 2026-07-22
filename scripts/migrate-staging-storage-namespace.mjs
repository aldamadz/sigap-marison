import { createClient } from "@supabase/supabase-js";
import { applyStoragePathPrefix, isStoragePathWithinPrefix } from "../storage-path-policy.mjs";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const projectRefArg = process.argv.find((arg) => arg.startsWith("--project-ref="));
const expectedProjectRef = projectRefArg?.slice("--project-ref=".length).trim();

const databaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const databaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const storageUrl = String(process.env.STORAGE_SUPABASE_URL || "").replace(/\/+$/, "");
const storageKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY || process.env.STORAGE_SERVICE_ROLE_KEY || "";
const publicBase = String(
  process.env.STORAGE_PUBLIC_BASE_URL || `${storageUrl}/storage/v1/object/public`,
).replace(/\/+$/, "");
const prefix = String(process.env.STORAGE_PATH_PREFIX || "").replace(/^\/+|\/+$/g, "");
const environment = String(process.env.MARISON_DEPLOYMENT_ENVIRONMENT || "").toLowerCase();

if (!databaseUrl || !databaseKey || !storageUrl || !storageKey) {
  throw new Error("Credential database dan storage staging wajib tersedia.");
}
if (environment !== "staging" || prefix !== "staging") {
  throw new Error("Migrator hanya boleh berjalan dengan environment staging dan prefix staging.");
}

const databaseHost = new URL(databaseUrl).hostname;
const databaseProjectRef = databaseHost.split(".")[0];
if (apply && (!expectedProjectRef || expectedProjectRef !== databaseProjectRef)) {
  throw new Error(`Mode apply membutuhkan --project-ref=${databaseProjectRef} agar target database terverifikasi.`);
}

const database = createClient(databaseUrl, databaseKey, { auth: { persistSession: false } });
const storage = createClient(storageUrl, storageKey, { auth: { persistSession: false } });

const urlColumns = [
  { table: "surat_registrasi", fields: ["file_path", "pdf_path", "lampiran_path"] },
  { table: "surat_attachments", fields: ["file_url"] },
  { table: "surat_signatures", fields: ["file_path_snap", "pdf_path_snap"] },
  { table: "document_pdf_jobs", fields: ["pdf_url"] },
  { table: "surat_registration_draft_files", fields: ["file_url"] },
];

const readAll = async (table, columns) => {
  const rows = [];
  for (let from = 0; from < 100_000; from += 1_000) {
    const { data, error } = await database.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if ((data || []).length < 1_000) return rows;
  }
  throw new Error(`Pembacaan ${table} melewati batas aman.`);
};

const parsePublicStorageUrl = (value) => {
  const raw = String(value || "").split("?")[0];
  if (!raw.startsWith(`${publicBase}/`)) return null;
  const relative = raw.slice(publicBase.length + 1);
  const separator = relative.indexOf("/");
  if (separator <= 0) return null;
  return { bucket: relative.slice(0, separator), path: relative.slice(separator + 1) };
};

const publicUrl = (bucket, path) => `${publicBase}/${bucket}/${path}`;
const objectKey = (reference) => `${reference.bucket}/${reference.path}`;

const plans = [];
for (const config of urlColumns) {
  const rows = await readAll(config.table, ["id", ...config.fields].join(","));
  for (const row of rows) {
    for (const field of config.fields) {
      const source = parsePublicStorageUrl(row[field]);
      if (!source || isStoragePathWithinPrefix(source.path, prefix)) continue;
      const target = { ...source, path: applyStoragePathPrefix(source.path, prefix) };
      plans.push({
        table: config.table,
        keyColumn: "id",
        keyValue: row.id,
        field,
        source,
        target,
        value: publicUrl(target.bucket, target.path),
      });
    }
  }
}

const tokenRows = await readAll("file_view_tokens", "token_hash,bucket,object_path,storage_origin");
for (const row of tokenRows) {
  if (row.storage_origin !== "external" || !row.object_path || isStoragePathWithinPrefix(row.object_path, prefix)) continue;
  const source = { bucket: row.bucket, path: row.object_path };
  const target = { ...source, path: applyStoragePathPrefix(source.path, prefix) };
  plans.push({
    table: "file_view_tokens",
    keyColumn: "token_hash",
    keyValue: row.token_hash,
    field: "object_path",
    source,
    target,
    value: target.path,
  });
}

const uniqueObjects = new Map();
for (const plan of plans) uniqueObjects.set(objectKey(plan.source), { source: plan.source, target: plan.target });

const copied = new Set();
const failed = new Map();
if (apply) {
  for (const { source, target } of uniqueObjects.values()) {
    const targetResult = await storage.storage.from(target.bucket).download(target.path);
    if (!targetResult.error && targetResult.data) {
      copied.add(objectKey(source));
      continue;
    }

    const sourceResult = await storage.storage.from(source.bucket).download(source.path);
    if (sourceResult.error || !sourceResult.data) {
      failed.set(objectKey(source), sourceResult.error?.message || "Object sumber tidak ditemukan");
      continue;
    }

    const buffer = Buffer.from(await sourceResult.data.arrayBuffer());
    const upload = await storage.storage.from(target.bucket).upload(target.path, buffer, {
      contentType: sourceResult.data.type || "application/octet-stream",
      upsert: false,
    });
    if (upload.error && !/already exists/i.test(upload.error.message || "")) {
      failed.set(objectKey(source), upload.error.message);
      continue;
    }
    copied.add(objectKey(source));
  }

  const groupedUpdates = new Map();
  for (const plan of plans) {
    if (!copied.has(objectKey(plan.source))) continue;
    const key = `${plan.table}:${plan.keyColumn}:${plan.keyValue}`;
    const update = groupedUpdates.get(key) || {
      table: plan.table,
      keyColumn: plan.keyColumn,
      keyValue: plan.keyValue,
      values: {},
    };
    update.values[plan.field] = plan.value;
    groupedUpdates.set(key, update);
  }

  for (const update of groupedUpdates.values()) {
    const { error } = await database
      .from(update.table)
      .update(update.values)
      .eq(update.keyColumn, update.keyValue);
    if (error) throw new Error(`${update.table}: ${error.message}`);
  }
}

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  databaseProjectRef,
  prefix,
  references: plans.length,
  uniqueObjects: uniqueObjects.size,
  copiedOrAlreadyPresent: copied.size,
  failed: [...failed.entries()].map(([object, reason]) => ({ object, reason })),
  sourceObjectsDeleted: 0,
}, null, 2));

if (failed.size > 0) process.exitCode = 1;
