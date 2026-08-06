export type SuratAccessRecord = {
  created_by?: string | null;
  surat_signatures?: Array<{
    user_id?: string | null;
    verifier_snapshot?: Array<{ user_id?: string | null }> | null;
  }> | null;
};

export function hasDirectSuratAccess(surat: SuratAccessRecord | null | undefined, userId: string): boolean;
export function activeRecommendationParentIds(links: unknown): string[];
