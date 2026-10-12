import { isDeepStrictEqual } from "node:util";
import { resolveRecommendationSource } from "../recommendation-pdf.mjs";

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
    .select("id, no_surat, status, is_aset, request_place, request_date, form_input_data, data_snapshot, location_snapshot, form_usage_id")
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
    .select("id, user_id, step_order, role_name, label_jabatan, status, is_signed, signed_at, signer_snapshot")
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
  const documentData = normalizePgdDocumentData(detectionSource, {
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
    .select("id, no_surat, status, is_aset, request_place, request_date, form_input_data, data_snapshot, location_snapshot, form_usage_id")
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
    .select("id, user_id, step_order, role_name, label_jabatan, status, is_signed, signed_at, signer_snapshot")
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
  const documentData = normalizeKeu1DocumentData(detectionSource, {
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
    return renderKeu10Pdf(normalizeKeu10DocumentData(payload.document, {
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
    .select("id, no_surat, request_place, request_date, form_input_data, data_snapshot, location_snapshot")
    .eq("id", job.surat_id)
    .maybeSingle();
  if (suratError) throw suratError;
  if (!surat) throw new Error("Dokumen rekomendasi tidak ditemukan.");

  const { data: signatures, error: signatureError } = await supabase
    .from("surat_signatures")
    .select("id, user_id, step_order, role_name, label_jabatan, status, is_signed, signed_at, signer_snapshot")
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
