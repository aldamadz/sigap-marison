import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { normalizeWorkbookForPdf } from "./document-workbook-normalizer.mjs";
import { isPgdDocument, normalizePgdDocumentData, renderPgdPdf } from "./pgd-pdf-renderer.mjs";

const execFileAsync = promisify(execFile);

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const storageMode = process.env.STORAGE_MODE || "primary_supabase";
const storageSupabaseUrl = process.env.STORAGE_SUPABASE_URL;
const storageServiceRoleKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY || process.env.STORAGE_SERVICE_ROLE_KEY;
const storagePublicBaseUrl = String(
  process.env.STORAGE_PUBLIC_BASE_URL ||
  (storageSupabaseUrl ? `${storageSupabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public` : "")
).replace(/\/+$/, "");
const workerId = process.env.PDF_WORKER_ID || `pdf-worker-${randomUUID()}`;
const concurrency = Math.max(Number(process.env.PDF_WORKER_CONCURRENCY || 3), 1);
const pollIntervalMs = Math.max(Number(process.env.PDF_WORKER_POLL_INTERVAL_MS || 2000), 500);
const maxIdlePollIntervalMs = Math.max(
  Number(process.env.PDF_WORKER_MAX_IDLE_POLL_INTERVAL_MS || 30000),
  pollIntervalMs,
);
const maxAttempts = Math.max(Number(process.env.PDF_WORKER_MAX_ATTEMPTS || 3), 1);
const convertTimeoutMs = Math.max(Number(process.env.PDF_WORKER_CONVERT_TIMEOUT_MS || 120000), 10000);

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const storageSupabase = storageMode === "self_hosted_supabase" && storageSupabaseUrl && storageServiceRoleKey
  ? createClient(storageSupabaseUrl, storageServiceRoleKey, { auth: { persistSession: false } })
  : null;

if (storageMode !== "self_hosted_supabase" || !storageSupabase || !storagePublicBaseUrl) {
  throw new Error("Self-hosted storage is required. Configure STORAGE_MODE, STORAGE_SUPABASE_URL, STORAGE_SUPABASE_SERVICE_ROLE_KEY, and STORAGE_PUBLIC_BASE_URL.");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const useExternalStorage = () => true;
const uploadStorageClient = () => storageSupabase;
const publicBaseUrl = (origin) => {
  if (origin === "external" && storagePublicBaseUrl) return storagePublicBaseUrl;
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public`;
};
const makePublicUrl = (bucket, path, origin = useExternalStorage() ? "external" : "primary") =>
  `${publicBaseUrl(origin)}/${bucket}/${path}`;

const extractStorageRef = (filePath) => {
  if (!filePath) return null;
  const marker = "/storage/v1/object/public/dokumen_surat/";
  const markerIndex = filePath.indexOf(marker);
  if (markerIndex >= 0) {
    return {
      path: decodeURIComponent(filePath.slice(markerIndex + marker.length).split("?")[0]),
      origin: storagePublicBaseUrl && filePath.startsWith(storagePublicBaseUrl) ? "external" : "primary",
    };
  }
  return {
    path: decodeURIComponent(filePath.replace(/^dokumen_surat\//, "").split("?")[0]),
    origin: "primary",
  };
};

const storageClientForOrigin = (origin) => origin === "external" && storageSupabase ? storageSupabase : supabase;

const claimJobs = async () => {
  const { data, error } = await supabase.rpc("claim_document_pdf_jobs", {
    p_worker_id: workerId,
    p_limit: concurrency,
    p_max_attempts: maxAttempts,
  });
  if (error) throw error;
  return data || [];
};

const markFailed = async (job, error) => {
  const isRetryable = Number(job.attempt_count || 0) < maxAttempts;
  await supabase
    .from("document_pdf_jobs")
    .update({
      status: isRetryable ? "queued" : "failed",
      error_message: error.message || "Gagal membuat PDF.",
      locked_by: null,
      locked_at: null,
      updated_at: new Date().toISOString(),
      finished_at: isRetryable ? null : new Date().toISOString(),
    })
    .eq("id", job.id);
};

const renderDirectPgdJob = async (job) => {
  const { data: surat, error: suratError } = await supabase
    .from("surat_registrasi")
    .select("id, no_surat, is_aset, request_place, request_date, form_input_data, data_snapshot, location_snapshot")
    .eq("id", job.surat_id)
    .maybeSingle();
  if (suratError) throw suratError;
  if (!surat || !isPgdDocument(surat)) return null;

  const { data: signatures, error: signatureError } = await supabase
    .from("surat_signatures")
    .select("id, user_id, step_order, role_name, label_jabatan, is_signed, signed_at, signer_snapshot")
    .eq("surat_id", job.surat_id)
    .order("step_order", { ascending: true });
  if (signatureError) throw signatureError;

  const userIds = [...new Set((signatures || []).map((item) => item.user_id).filter(Boolean))];
  let profileMap = new Map();
  if (userIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, job_title")
      .in("id", userIds);
    if (profileError) throw profileError;
    profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
  }
  const enrichedSignatures = (signatures || []).map((signature) => ({
    ...signature,
    profile: profileMap.get(signature.user_id) || null,
  }));
  const targetSignature = job.signature_id
    ? enrichedSignatures.find((signature) => signature.id === job.signature_id)
    : null;
  const documentData = normalizePgdDocumentData(surat, {
    signatures: enrichedSignatures,
    targetStep: targetSignature?.step_order || null,
  });
  return await renderPgdPdf(documentData, {
    logoPath: join(process.cwd(), "dist", "logo-marison-regency-group.png"),
  });
};

const processJob = async (job) => {
  const workDir = await mkdtemp(join(tmpdir(), "agenda-doc-"));
  try {
    let pdfBuffer = await renderDirectPgdJob(job);
    if (!pdfBuffer) {
      const sourceRef = extractStorageRef(job.source_file_path);
      if (!sourceRef?.path) throw new Error("File Excel dokumen belum tersedia.");
      const { data: fileData, error: downloadError } = await storageClientForOrigin(sourceRef.origin).storage
        .from("dokumen_surat")
        .download(sourceRef.path);
      if (downloadError || !fileData) throw new Error(downloadError?.message || "Gagal mengambil file Excel.");

      const sourcePath = join(workDir, "source.xlsx");
      await writeFile(sourcePath, Buffer.from(await fileData.arrayBuffer()));
      await normalizeWorkbookForPdf(sourcePath);
      await execFileAsync("soffice", [
        "--headless",
        "--nologo",
        "--nofirststartwizard",
        "--convert-to",
        "pdf",
        "--outdir",
        workDir,
        sourcePath,
      ], { timeout: convertTimeoutMs });
      pdfBuffer = await readFile(join(workDir, "source.pdf"));
    }
    const pdfPath = `pdf/${job.surat_id}_${Date.now()}.pdf`;
    const uploadOrigin = useExternalStorage() ? "external" : "primary";
    const { error: uploadError } = await uploadStorageClient().storage
      .from("dokumen_surat")
      .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw uploadError;

    const publicUrl = makePublicUrl("dokumen_surat", pdfPath, uploadOrigin);

    await supabase
      .from("surat_registrasi")
      .update({ pdf_path: publicUrl })
      .eq("id", job.surat_id);

    if (job.signature_id) {
      await supabase
        .from("surat_signatures")
        .update({ pdf_path_snap: publicUrl, file_path_snap: null })
        .eq("id", job.signature_id);
    }

    await supabase
      .from("document_pdf_jobs")
      .update({
        status: "done",
        pdf_url: publicUrl,
        error_message: null,
        locked_by: null,
        locked_at: null,
        updated_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    console.log(`[${workerId}] done ${job.id} -> ${publicUrl}`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
};

console.log(`[${workerId}] PDF worker started. concurrency=${concurrency}`);

let idlePollIntervalMs = pollIntervalMs;
while (true) {
  try {
    const jobs = await claimJobs();
    if (jobs.length === 0) {
      await sleep(idlePollIntervalMs);
      idlePollIntervalMs = Math.min(maxIdlePollIntervalMs, idlePollIntervalMs * 2);
      continue;
    }

    idlePollIntervalMs = pollIntervalMs;

    await Promise.all(jobs.map(async (job) => {
      try {
        console.log(`[${workerId}] processing ${job.id}`);
        await processJob(job);
      } catch (error) {
        console.error(`[${workerId}] failed ${job.id}:`, error);
        await markFailed(job, error);
      }
    }));
  } catch (error) {
    console.error(`[${workerId}] polling error:`, error);
    await sleep(idlePollIntervalMs);
    idlePollIntervalMs = Math.min(maxIdlePollIntervalMs, idlePollIntervalMs * 2);
  }
}
