import { createClient } from "@supabase/supabase-js";
import { normalizeStoragePathPrefix } from "../storage-path-policy.mjs";

const storageUrl = process.env.STORAGE_SUPABASE_URL;
const storageKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY;
const storagePathPrefix = normalizeStoragePathPrefix(process.env.STORAGE_PATH_PREFIX || "");
const allowFullReset = String(process.env.ALLOW_FULL_STORAGE_RESET || "").toLowerCase() === "true";

const retainedBuckets = ["dokumen_surat", "lampiran_surat", "avatars"];
const legacyBuckets = ["chat_attachments", "payment_files", "spk_files", "surat_attachments"];
const transactionBuckets = [...retainedBuckets, ...legacyBuckets];

if (!storageUrl || !storageKey) {
  throw new Error("Konfigurasi storage self-hosted belum lengkap.");
}
if (!storagePathPrefix && !allowFullReset) {
  throw new Error(
    "Reset storage tanpa namespace ditolak. Isi STORAGE_PATH_PREFIX atau set ALLOW_FULL_STORAGE_RESET=true secara eksplisit.",
  );
}

const storage = createClient(storageUrl.trim(), storageKey.trim(), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const listObjectPaths = async (bucket, prefix = "") => {
  const paths = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await storage.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`${bucket}: gagal membaca objek: ${error.message}`);

    for (const item of data || []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id || item.metadata) paths.push(path);
      else paths.push(...await listObjectPaths(bucket, path));
    }
    if ((data || []).length < limit) break;
    offset += limit;
  }

  return paths;
};

const removePaths = async (bucket, paths) => {
  for (let index = 0; index < paths.length; index += 100) {
    const batch = paths.slice(index, index + 100);
    const { error } = await storage.storage.from(bucket).remove(batch);
    if (error) throw new Error(`${bucket}: gagal menghapus objek: ${error.message}`);
  }
};

const { data: buckets, error: bucketError } = await storage.storage.listBuckets();
if (bucketError) throw new Error(`Gagal membaca bucket: ${bucketError.message}`);
const existing = new Set((buckets || []).map((bucket) => bucket.id));

for (const bucket of transactionBuckets) {
  if (!existing.has(bucket)) continue;

  if (!storagePathPrefix) {
    const { error } = await storage.storage.emptyBucket(bucket);
    if (error) throw new Error(`${bucket}: gagal mengosongkan bucket: ${error.message}`);
    console.log(`${bucket}: seluruh objek dihapus melalui izin reset penuh.`);
    continue;
  }

  const paths = await listObjectPaths(bucket, storagePathPrefix);
  await removePaths(bucket, paths);
  console.log(`${bucket}: ${paths.length} objek pada namespace ${storagePathPrefix}/ dihapus.`);
}

for (const bucket of retainedBuckets) {
  if (existing.has(bucket)) continue;
  const { error } = await storage.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024,
  });
  if (error) throw new Error(`${bucket}: gagal membuat bucket: ${error.message}`);
}

console.log(`Reset storage selesai untuk namespace ${storagePathPrefix || "SELURUH STORAGE"}.`);
