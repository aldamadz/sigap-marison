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
    .select("id, no_surat, is_aset, request_place, request_date, form_input_data, data_snapshot, location_snapshot, form_usage_id")
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
  return await renderPgdPdf(documentData, { logoPath });
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
    .select("id, user_id, step_order, role_name, label_jabatan, is_signed, signed_at, signer_snapshot")
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
