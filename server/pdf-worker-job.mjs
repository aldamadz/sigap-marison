import { isDeepStrictEqual } from "node:util";
import { AsyncLocalStorage } from "node:async_hooks";
import { resolveRecommendationSource } from "../recommendation-pdf.mjs";
import { enrichRevisionActors } from "./revision-actor-evidence.mjs";

const pdfLeaseContext = new AsyncLocalStorage();
const deadlineError = () => Object.assign(new Error("Batas waktu pemrosesan PDF sebelum lease berakhir telah tercapai."), { code: "PDF_LEASE_DEADLINE" });

export const createPdfWorkerFetch = (fetcher = fetch, { timeoutMs = 20000 } = {}) => async (input, init = {}) => {
  const context = pdfLeaseContext.getStore();
  if (context && Date.now() >= context.deadline) throw deadlineError();
  const signals = [AbortSignal.timeout(timeoutMs), context?.signal, init.signal,
    input instanceof Request ? input.signal : null].filter(Boolean);
  return fetcher(input, { ...init, signal: AbortSignal.any(signals) });
};

export const withPdfJobLease = async (job, work, { maxMs = 240000 } = {}) => {
  const expires = Date.parse(job.lease_expires_at);
  const deadline = Math.min(expires - 30000, Date.now() + maxMs);
  if (!Number.isFinite(deadline) || deadline <= Date.now()) throw deadlineError();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(deadlineError()), deadline - Date.now());
  timer.unref?.();
  try { return await pdfLeaseContext.run({ deadline, signal: controller.signal }, work); }
  finally { clearTimeout(timer); }
};

export const assertPdfJobCurrentSource = async (supabase, job) => {
  if (!String(job.source_file_path || "").startsWith("native://document/")) return;
  const query = job.signature_id
    ? supabase.from("surat_signatures").select("file_path_snap,is_signed").eq("surat_id", job.surat_id).eq("id", job.signature_id)
    : supabase.from("surat_registrasi").select("file_path").eq("id", job.surat_id);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  const source = job.signature_id ? data?.file_path_snap : data?.file_path;
  if (!data || source !== job.source_file_path || (job.signature_id && data.is_signed !== true)) {
    throw Object.assign(new Error("Sumber versi PDF sudah berubah. Job lama tidak boleh dipublikasikan."), { code: "PDF_SOURCE_CHANGED" });
  }
};

export const processPdfJobBatch = (jobs, processJob, onFailure) => Promise.allSettled(jobs.map(async job => {
  try { return await processJob(job); }
  catch (error) { await onFailure(job, error); return null; }
}));

export const safePdfWorkerError = error => ({
  code: /^[A-Z0-9_]{1,32}$/.test(String(error?.code || "")) ? String(error.code) : "PDF_ERROR",
  message: String(error?.message || "Gagal memproses PDF.").replace(/https?:\/\/\S+/g, "[URL]")
    .replace(/[A-Za-z0-9_/+=-]{70,}/g, "[REDACTED]").slice(0, 240),
});

export const resolveRecommendationPdfJob = async (supabase, job) => {
  if (job.render_payload?.kind === "keu10") return null;
  let payload = job.render_payload;
  const finalized = Boolean(job.recommendation_content_fingerprint);
  if (!payload) {
    if (finalized) throw new Error("Snapshot PDF rekomendasi final belum tersedia.");
    // In-progress previews use the same source-bound snapshot, without final publication.
    const { data, error } = await supabase.rpc("recommendation_pdf_render_payload", {
      p_surat_id: job.surat_id,
      p_source_file_path: job.source_file_path,
    });
    if (error) throw error;
    payload = data;
  }
  if (!payload?.child_input) return null;
  return {
    finalized,
    items: resolveRecommendationSource(
      payload.child_input, payload.parent_input, payload.child_snapshot_input,
    ),
  };
};

export const isCanonicalRecommendationPdfJob = (job, recommendation) =>
  Boolean(recommendation?.finalized && !job.signature_id);

const decisionStatus = (value) => String(value || "").trim().toUpperCase();
const hasDecision = (signature) => ["APPROVED", "REJECTED"].includes(decisionStatus(signature.status));

export const loadRequesterRevisionHistory = async (supabase, job, surat, targetSignature = null) => {
  // Never append future/live revisions to an old signature/source snapshot.
  const source = targetSignature?.file_path_snap || surat.file_path;
  if (!source || source !== job.source_file_path) return [];
  // Revision history is inserted after enqueue in the same submit transaction.
  // A main job's created_at is therefore not the version's history cutoff.
  const cutoff = targetSignature ? Date.parse(targetSignature.signed_at || "") : Date.now();
  if (!Number.isFinite(cutoff)) return [];
  const history = [];
  for (let page=0;page<20;page+=1) {
    const {data,error} = await supabase.from("surat_requester_revision_history")
      .select("revision_event_id,reason,requester_note,submitted_at,requested_by,submitted_by,before_snapshot,after_snapshot")
      .eq("surat_id",job.surat_id).order("submitted_at",{ascending:true}).order("id",{ascending:true})
      .range(page*100,page*100+99);
    if (error) throw error;
    const batch = data || [];
    history.push(...batch.filter(row => Number.isFinite(Date.parse(row.submitted_at)) && Date.parse(row.submitted_at)<=cutoff));
    if (batch.length<100) return history;
  }
  throw new Error("Riwayat revisi terlalu besar untuk dimuat secara lengkap.");
};

export const loadUnitAllocationHistory = async (supabase, job, surat, targetSignature = null) => {
  const input = surat.form_input_data || surat.data_snapshot?.input || {};
  if ((input.request_mode || input.request_category) !== "unit") return [];
  const source = targetSignature?.file_path_snap || surat.file_path;
  if (!source || source !== job.source_file_path) return [];
  const cutoff = targetSignature ? Date.parse(targetSignature.signed_at || "") : Date.now();
  if (!Number.isFinite(cutoff)) return [];
  const history = [];
  for (let page = 0; page < 20; page += 1) {
    const { data, error } = await supabase.from("surat_unit_allocation_history")
      .select("id,actor_name,created_at,requested_count,allocated_count,remaining_count,note")
      .eq("surat_id", job.surat_id).order("created_at", { ascending: true }).order("id", { ascending: true })
      .range(page * 100, page * 100 + 99);
    if (error) throw error;
    const batch = data || [];
    history.push(...batch.filter(row => Number.isFinite(Date.parse(row.created_at)) && Date.parse(row.created_at) <= cutoff));
    if (batch.length < 100) return history;
  }
  throw new Error("Riwayat pemeriksaan unit terlalu besar untuk dimuat lengkap.");
};

const hydrateLegacyKeu10Payload = async (supabase, job, target) => {
  const payload = job.render_payload;
  const matchesVersion = (document) => document?.id === job.surat_id
    && Number(document.data_snapshot?.keu10_generation) === payload.generation
    && ["no_surat", "form_input_data", "policy_snapshot", "location_snapshot", "requester_snapshot", "request_place", "request_date"]
      .every((key) => isDeepStrictEqual(document[key], payload.document[key]));
  const hydrate = (document, canonical) => {
    if (!matchesVersion(document) || !Array.isArray(canonical) || canonical.length !== payload.signatures.length) return null;
    if (!target && document.file_path !== job.source_file_path) return null;
    if (target && canonical.find((row) => row.id === target.id)?.file_path_snap !== job.source_file_path) return null;
    const signatures = [];
    for (const frozen of payload.signatures) {
      const row = canonical.find((entry) => entry.id === frozen.id);
      if (!row || !["user_id", "step_order", "role_name", "label_jabatan", "signer_snapshot"]
        .every((key) => isDeepStrictEqual(row[key], frozen[key]))) return null;
      if (target && Number(frozen.step_order) > Number(target.step_order)) {
        signatures.push({ ...frozen, status: "PENDING", is_signed: false, signed_at: null });
        continue;
      }
      if (frozen.is_signed !== row.is_signed) return null;
      if (frozen.is_signed) {
        const signedAt = Date.parse(frozen.signed_at);
        if (!Number.isFinite(signedAt) || signedAt !== Date.parse(row.signed_at) || !hasDecision(row)
          || (frozen.status && decisionStatus(frozen.status) !== decisionStatus(row.status))) return null;
        signatures.push({ ...frozen, status: decisionStatus(row.status) });
      } else {
        if (decisionStatus(row.status) !== "PENDING") return null;
        signatures.push({ ...frozen, status: "PENDING" });
      }
    }
    const rejected = signatures.some((row) => row.status === "REJECTED");
    // Main-document state must agree; a later rejection cannot relabel prior signer history.
    if (!target && (!document.status || rejected !== ["REJECTED", "DITOLAK"].includes(decisionStatus(document.status)))) return null;
    return { ...payload, document: { ...payload.document, ...(target ? {} : { status: document.status }) }, signatures };
  };
  const { data: current, error } = await supabase.from("surat_registrasi")
    .select("id, no_surat, status, file_path, form_input_data, policy_snapshot, location_snapshot, requester_snapshot, request_place, request_date, data_snapshot, surat_signatures(id, user_id, step_order, role_name, label_jabatan, status, is_signed, signed_at, signer_snapshot, file_path_snap)")
    .eq("id", job.surat_id).maybeSingle();
  if (error) throw error;
  const currentPayload = hydrate(current, current?.surat_signatures);
  if (currentPayload) return currentPayload;
  const { data: history, error: historyError } = await supabase.from("surat_external_revision_history")
    .select("document_snapshot, signatures_snapshot").eq("surat_id", job.surat_id);
  if (historyError) throw historyError;
  for (const version of history || []) {
    const historicalPayload = hydrate(version.document_snapshot, version.signatures_snapshot);
    if (historicalPayload) return historicalPayload;
  }
  throw new Error("Keputusan snapshot PDF KEU 10 lama tidak dapat diverifikasi.");
};

export const createPgdJobHandler = ({
  supabase,
  isPgdDocument,
  resolvePgdMasterForm,
  normalizePgdDocumentData,
  renderPgdPdf,
  logoPath,
}) => async (job) => {
  const { data: surat, error: suratError } = await supabase
    .from("surat_registrasi")
    .select("id, no_surat, status, file_path, is_aset, request_place, request_date, form_input_data, data_snapshot, location_snapshot, form_usage_id")
    .eq("id", job.surat_id)
    .maybeSingle();
  if (suratError) throw suratError;
  if (!surat) return null;

  // Newer letters may carry an empty snapshot form while still referencing a
  // canonical form usage. Resolve form_usage_id → form_usages → master_forms
  // as a second detection source; anything unresolvable stays non-PGD
  // (fail-closed) so the job fails with a clear renderer error.
  let detectionSource = surat;
  if (!isPgdDocument(surat) && surat.form_usage_id) {
    const masterForm = await resolvePgdMasterForm(supabase, surat.form_usage_id);
    if (masterForm) detectionSource = { ...surat, resolved_master_form: masterForm };
  }
  if (!isPgdDocument(detectionSource)) return null;

  const { data: signatures, error: signatureError } = await supabase
    .from("surat_signatures")
    .select("id, user_id, step_order, role_name, label_jabatan, status, is_signed, signed_at, signer_snapshot, file_path_snap")
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
  const revisionHistory = await loadRequesterRevisionHistory(supabase,job,surat,targetSignature);
  const unitAllocationHistory = await loadUnitAllocationHistory(supabase,job,surat,targetSignature);
  detectionSource = { ...detectionSource, unit_allocation_history: unitAllocationHistory };
  const documentData = normalizePgdDocumentData(await enrichRevisionActors(supabase,detectionSource,revisionHistory), {
    signatures: enrichedSignatures,
    targetStep: targetSignature?.step_order || null,
  });
  return await renderPgdPdf(documentData, { logoPath });
};

export const createKeu1JobHandler = ({
  supabase,
  isKeu1Document,
  resolveKeu1MasterForm,
  normalizeKeu1DocumentData,
  renderKeu1Pdf,
  logoPath,
}) => async (job) => {
  const { data: surat, error: suratError } = await supabase
    .from("surat_registrasi")
    .select("id, no_surat, status, file_path, is_aset, request_place, request_date, form_input_data, data_snapshot, location_snapshot, form_usage_id")
    .eq("id", job.surat_id)
    .maybeSingle();
  if (suratError) throw suratError;
  if (!surat) return null;

  let detectionSource = surat;
  if (!isKeu1Document(surat) && surat.form_usage_id) {
    const masterForm = await resolveKeu1MasterForm(supabase, surat.form_usage_id);
    if (masterForm) detectionSource = { ...surat, resolved_master_form: masterForm };
  }
  if (!isKeu1Document(detectionSource)) return null;

  const { data: signatures, error: signatureError } = await supabase
    .from("surat_signatures")
    .select("id, user_id, step_order, role_name, label_jabatan, status, is_signed, signed_at, signer_snapshot, file_path_snap")
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
  const revisionHistory = await loadRequesterRevisionHistory(supabase,job,surat,targetSignature);
  const documentData = normalizeKeu1DocumentData(await enrichRevisionActors(supabase,detectionSource,revisionHistory), {
    signatures: enrichedSignatures,
    targetStep: targetSignature?.step_order || null,
  });
  return await renderKeu1Pdf(documentData, { logoPath });
};

export const createKeu10JobHandler = ({
  supabase,
  isKeu10Document,
  resolveKeu10MasterForm,
  normalizeKeu10DocumentData,
  renderKeu10Pdf,
  logoPath,
}) => async (job) => {
  if (job.render_payload?.kind === "keu10") {
    let payload = job.render_payload;
    if (payload.document?.id !== job.surat_id || !isKeu10Document(payload.document)
      || !Array.isArray(payload.signatures) || !Number.isSafeInteger(payload.generation) || payload.generation < 1) {
      throw new Error("Snapshot PDF KEU 10 tidak valid.");
    }
    const target = job.signature_id ? payload.signatures.find(signature => signature.id === job.signature_id) : null;
    if (job.signature_id && !target) throw new Error("Tanda tangan PDF KEU 10 tidak ditemukan dalam versi dokumen.");
    if ((!target && !payload.document.status) || payload.signatures.some((signature) => signature.is_signed && !hasDecision(signature))) {
      payload = await hydrateLegacyKeu10Payload(supabase, job, target);
    }
    return renderKeu10Pdf(normalizeKeu10DocumentData(await enrichRevisionActors(supabase,payload.document), {
      signatures: payload.signatures,
      targetStep: target?.step_order || null,
    }), { logoPath });
  }
  return createKeu1JobHandler({
  supabase,
  isKeu1Document: isKeu10Document,
  resolveKeu1MasterForm: resolveKeu10MasterForm,
  normalizeKeu1DocumentData: normalizeKeu10DocumentData,
  renderKeu1Pdf: renderKeu10Pdf,
  logoPath,
  })(job);
};

export const createRecommendationJobHandler = ({
  supabase,
  normalizeRecommendationDocumentData,
  renderRecommendationPdf,
  downloadStorageFile,
  logoPath,
}) => async (job, recommendation) => {
  const { data: surat, error: suratError } = await supabase
    .from("surat_registrasi")
    .select("id, no_surat, file_path, request_place, request_date, form_input_data, data_snapshot, location_snapshot")
    .eq("id", job.surat_id)
    .maybeSingle();
  if (suratError) throw suratError;
  if (!surat) throw new Error("Dokumen rekomendasi tidak ditemukan.");

  const { data: signatures, error: signatureError } = await supabase
    .from("surat_signatures")
    .select("id, user_id, step_order, role_name, label_jabatan, status, is_signed, signed_at, signer_snapshot, file_path_snap")
    .eq("surat_id", job.surat_id)
    .order("step_order", { ascending: true });
  if (signatureError) throw signatureError;

  const targetSignature = job.signature_id
    ? (signatures || []).find((signature) => signature.id === job.signature_id)
    : null;
  const data = normalizeRecommendationDocumentData(surat, {
    items: recommendation.items,
    signatures: signatures || [],
    targetStep: targetSignature?.step_order || 0,
  });
  return renderRecommendationPdf(data, {
    logoPath,
    downloadImage: (attachment) => downloadStorageFile(
      attachment.url,
      `Gambar ${attachment.name || attachment.id}`,
      "lampiran_surat",
    ),
  });
};
