import { canUseAssetRecommendation } from "@/lib/asset-recommendation-policy";

/**
 * Satu-satunya tempat canonical penentu kelayakan pilihan rekomendasi Aset.
 * Dipakai modul Aset (panel + rekonsiliasi); orchestrator tidak menghitung ulang.
 */
export const ASSET_RECOMMENDATION_TEMPLATE_NAME = "Rekomendasi Peremajaan Alat";
export const ASSET_RECOMMENDATION_NEED_NOTE =
  "Pemohon membutuhkan lampiran rekomendasi untuk permohonan aset ini.";
export const ASSET_RECOMMENDATION_SKIP_NOTE =
  "Pemohon tidak membutuhkan lampiran rekomendasi untuk permohonan aset ini.";

export function isRecommendationChoiceAllowed(
  department: { code?: string | null; name?: string | null } | null | undefined,
  linkedDocumentType: string | null,
): boolean {
  if (linkedDocumentType === "recommendation") return false;
  return canUseAssetRecommendation(department);
}
