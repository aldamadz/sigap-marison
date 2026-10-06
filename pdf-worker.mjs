import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { isPgdDocument, normalizePgdDocumentData, renderPgdPdf, resolvePgdMasterForm } from "./pgd-pdf-renderer.mjs";
import { isKeu1Document, normalizeKeu1DocumentData, renderKeu1Pdf, resolveKeu1MasterForm } from "./keu1-pdf-renderer.mjs";
import { isKeu10Document, normalizeKeu10DocumentData, renderKeu10Pdf, resolveKeu10MasterForm } from "./keu10-pdf-renderer.mjs";
import {
  parseStorageRef,
  recommendationVersionPath,
  resolveRecommendationSource,
} from "./recommendation-pdf.mjs";
import { normalizeRecommendationDocumentData, renderRecommendationPdf } from "./recommendation-native-pdf.mjs";
import {
  applyStoragePathPrefix,
  isStoragePathWithinPrefix,
  normalizeStoragePathPrefix,
} from "./storage-path-policy.mjs";
import { createKeu1JobHandler, createKeu10JobHandler, createPgdJobHandler, createRecommendationJobHandler } from "./server/pdf-worker-job.mjs";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const storageMode = process.env.STORAGE_MODE || "primary_supabase";
const storageSupabaseUrl = process.env.STORAGE_SUPABASE_URL;
const storageServiceRoleKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY || process.env.STORAGE_SERVICE_ROLE_KEY;
const storagePublicBaseUrl = String(
  process.env.STORAGE_PUBLIC_BASE_URL ||
  (storageSupabaseUrl ? `${storageSupabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public` : "")
).replace(/\/+$/, "");
const storagePathPrefix = normalizeStoragePathPrefix(process.env.STORAGE_PATH_PREFIX || "");
const workerId = process.env.PDF_WORKER_ID || `pdf-worker-${randomUUID()}`;
const concurrency = Math.max(Number(process.env.PDF_WORKER_CONCURRENCY || 3), 1);
const pollIntervalMs = Math.max(Number(process.env.PDF_WORKER_POLL_INTERVAL_MS || 2000), 500);
const maxIdlePollIntervalMs = Math.max(
  Number(process.env.PDF_WORKER_MAX_IDLE_POLL_INTERVAL_MS || 30000),
  pollIntervalMs,
);
const maxAttempts = Math.max(Number(process.env.PDF_WORKER_MAX_ATTEMPTS || 3), 1);

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

const storageClientForOrigin = (origin) => origin === "external" && storageSupabase ? storageSupabase : supabase;

const downloadStorageFile = async (filePath, label, expectedBucket) => {
  const sourceRef = parseStorageRef(filePath, {
    defaultBucket: expectedBucket,
    defaultOrigin: useExternalStorage() ? "external" : "primary",
    externalBases: [storageSupabaseUrl, storagePublicBaseUrl],
  });
  if (!sourceRef?.bucket || !sourceRef.path) throw new Error(`${label} belum tersedia.`);
  if (sourceRef.bucket !== expectedBucket) throw new Error(`${label} wajib berada di bucket ${expectedBucket}.`);
  if (!isStoragePathWithinPrefix(sourceRef.path, storagePathPrefix)) {
    throw new Error(`${label} berada di luar namespace environment worker.`);
  }
  const { data, error } = await storageClientForOrigin(sourceRef.origin).storage
    .from(sourceRef.bucket)
    .download(sourceRef.path);
  if (error || !data) throw new Error(error?.message || `Gagal mengambil ${label.toLowerCase()}.`);
  return Buffer.from(await data.arrayBuffer());
};

const recommendationFromSnapshot = (job) => job.render_payload && job.render_payload.kind !== "keu10" ? ({
  finalized: true,
  items: resolveRecommendationSource(
    job.render_payload.child_input,
    job.render_payload.parent_input,
    job.render_payload.child_snapshot_input,
  ),
}) : null;

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
  const { data, error: transitionError } = await supabase.rpc("fail_document_pdf_job", {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
    p_error_message: error.message || "Gagal membuat PDF.",
    p_max_attempts: maxAttempts,
  });
  if (transitionError) throw transitionError;
  if (!data?.id) throw new Error(`Failure transition returned no job for ${job.id}.`);
};

const renderDirectPgdJob = createPgdJobHandler({
  supabase,
  isPgdDocument,
  resolvePgdMasterForm,
  normalizePgdDocumentData,
  renderPgdPdf,
  logoPath: join(process.cwd(), "dist", "logo-marison-regency-group.png"),
});

const renderDirectKeu1Job = createKeu1JobHandler({
  supabase,
  isKeu1Document,
  resolveKeu1MasterForm,
  normalizeKeu1DocumentData,
  renderKeu1Pdf,
  logoPath: join(process.cwd(), "dist", "logo-marison-regency-group.png"),
});

const renderDirectRecommendationJob = createRecommendationJobHandler({
  supabase,
  normalizeRecommendationDocumentData,
  renderRecommendationPdf,
  downloadStorageFile,
  logoPath: join(process.cwd(), "dist", "logo-marison-regency-group.png"),
});

const renderDirectKeu10Job = createKeu10JobHandler({
  supabase,
  isKeu10Document,
  resolveKeu10MasterForm,
  normalizeKeu10DocumentData,
  renderKeu10Pdf,
  logoPath: join(process.cwd(), "dist", "logo-marison-regency-group.png"),
});

const processJob = async (job) => {
  const recommendation = recommendationFromSnapshot(job);
  let pdfBuffer = null;
  if (recommendation) {
    pdfBuffer = await renderDirectRecommendationJob(job, recommendation);
  } else {
    pdfBuffer = await renderDirectKeu10Job(job);
    if (!pdfBuffer) pdfBuffer = await renderDirectKeu1Job(job);
    if (!pdfBuffer) {
      pdfBuffer = await renderDirectPgdJob(job);
    }
  }
  if (!pdfBuffer) {
    throw new Error("Renderer PDF-native tidak tersedia untuk dokumen ini.");
  }
  const isCanonicalRecommendation = Boolean(recommendation && !job.signature_id);
  const defaultPdfPath = applyStoragePathPrefix(`pdf/${job.surat_id}_${Date.now()}.pdf`, storagePathPrefix);
  const unprefixedPdfPath = isCanonicalRecommendation
    ? recommendationVersionPath(job.surat_id, `${job.id}-${randomUUID()}`)
    : null;
  const pdfPath = unprefixedPdfPath
    ? applyStoragePathPrefix(unprefixedPdfPath, storagePathPrefix)
    : defaultPdfPath;
  const uploadOrigin = useExternalStorage() ? "external" : "primary";
  const { error: uploadError } = await uploadStorageClient().storage
    .from("dokumen_surat")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw uploadError;

  const publicUrl = makePublicUrl("dokumen_surat", pdfPath, uploadOrigin);

  const publishedUrl = publicUrl;
  if (isCanonicalRecommendation) {
    const { data: publishedJob, error: publishError } = await supabase.rpc("publish_document_pdf_job", {
      p_job_id: job.id,
      p_source_file_path: job.source_file_path,
      p_content_fingerprint: job.recommendation_content_fingerprint,
      p_pdf_url: publishedUrl,
      p_lease_token: job.lease_token,
      p_pdf_bucket: "dokumen_surat",
      p_pdf_object_path: pdfPath,
      p_pdf_storage_origin: uploadOrigin,
    });
    if (publishError) throw publishError;
    if (publishedJob?.status !== "done") throw new Error(`Publication transition failed for ${job.id}.`);
  } else {
    const { data: completedJob, error: completionError } = await supabase.rpc("complete_document_pdf_job", {
      p_job_id: job.id,
      p_pdf_url: publishedUrl,
      p_lease_token: job.lease_token,
    });
    if (completionError || !completedJob) throw completionError || new Error(`PDF completion transition failed for ${job.id}.`);
    if (completedJob.status !== "done") throw new Error(`PDF completion transition failed for ${job.id}.`);
  }

  // Uploaded objects are retained when publication outcome is ambiguous; lifecycle cleanup must reconcile unreferenced job versions later.
  console.log(`[${workerId}] done ${job.id}`);
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
        console.error(`[${workerId}] failed ${job.id}`);
        await markFailed(job, error);
      }
    }));
  } catch (error) {
    console.error(`[${workerId}] polling error:`, error);
    await sleep(idlePollIntervalMs);
    idlePollIntervalMs = Math.min(maxIdlePollIntervalMs, idlePollIntervalMs * 2);
  }
}
