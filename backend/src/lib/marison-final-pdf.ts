type MarisonPdfSignature = {
  step_order?: number | string | null;
  is_signed?: boolean | null;
  signed_at?: string | null;
  pdf_path_snap?: string | null;
};

type MarisonPdfSurat = {
  status?: string | null;
  pdf_path?: string | null;
  surat_signatures?: MarisonPdfSignature[] | null;
};

const FINAL_SURAT_STATUSES = new Set(["DONE", "SELESAI", "COMPLETED"]);

const nonEmptyString = (value: unknown) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
};

export const resolveFinalMarisonPdfPath = (surat: MarisonPdfSurat | null | undefined) => {
  const canonicalPath = nonEmptyString(surat?.pdf_path);
  if (canonicalPath) return canonicalPath;

  if (!FINAL_SURAT_STATUSES.has(String(surat?.status || "").toUpperCase())) return null;

  const signatures = Array.isArray(surat?.surat_signatures) ? surat.surat_signatures : [];
  if (
    signatures.length === 0 ||
    signatures.some((signature) => signature?.is_signed !== true || !signature?.signed_at)
  ) {
    return null;
  }

  const finalSignature = [...signatures].sort(
    (left, right) => Number(right?.step_order || 0) - Number(left?.step_order || 0),
  )[0];
  return nonEmptyString(finalSignature?.pdf_path_snap);
};
