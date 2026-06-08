import { createClient } from "@supabase/supabase-js";

const primaryUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const primaryKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const storageUrl = process.env.STORAGE_SUPABASE_URL;
const storageKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY;

const retainedBuckets = ["dokumen_surat", "lampiran_surat"];
const removedBuckets = [
  "chat_attachments",
  "payment_files",
  "spk_files",
  "surat_attachments",
];
const transactionBuckets = [...retainedBuckets, ...removedBuckets];
const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function createAdminClient(url, key, label) {
  if (!url || !key) {
    throw new Error(`Konfigurasi ${label} belum lengkap.`);
  }

  return createClient(url.trim(), key.trim(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function resetStorage(label, client, ensureRetained) {
  const { data: buckets, error: listError } = await client.storage.listBuckets();
  if (listError) {
    throw new Error(`${label}: gagal membaca bucket: ${listError.message}`);
  }

  const existing = new Set((buckets || []).map((bucket) => bucket.id));

  for (const bucket of transactionBuckets) {
    if (!existing.has(bucket)) {
      continue;
    }

    const { error } = await client.storage.emptyBucket(bucket);
    if (error) {
      throw new Error(`${label}: gagal mengosongkan ${bucket}: ${error.message}`);
    }
    console.log(`${label}: bucket ${bucket} dikosongkan.`);
  }

  for (const bucket of removedBuckets) {
    if (!existing.has(bucket)) {
      continue;
    }

    let lastError;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const { error } = await client.storage.deleteBucket(bucket);
      if (!error) {
        lastError = undefined;
        break;
      }

      lastError = error;
      if (!error.message.toLowerCase().includes("not empty")) {
        break;
      }

      await client.storage.emptyBucket(bucket);
      await wait(attempt * 1000);
    }

    if (lastError) {
      throw new Error(`${label}: gagal menghapus ${bucket}: ${lastError.message}`);
    }
    console.log(`${label}: bucket ${bucket} dihapus.`);
  }

  if (!ensureRetained) {
    return;
  }

  for (const bucket of retainedBuckets) {
    if (existing.has(bucket)) {
      continue;
    }

    const { error } = await client.storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: 50 * 1024 * 1024,
    });
    if (error) {
      throw new Error(`${label}: gagal membuat ${bucket}: ${error.message}`);
    }
    console.log(`${label}: bucket ${bucket} dibuat.`);
  }
}

const primary = createAdminClient(primaryUrl, primaryKey, "Supabase cloud");
const selfHosted = createAdminClient(storageUrl, storageKey, "Supabase self-hosted");

await resetStorage("Supabase cloud", primary, false);
await resetStorage("Supabase self-hosted", selfHosted, true);

console.log("Reset storage transaksi surat selesai.");
