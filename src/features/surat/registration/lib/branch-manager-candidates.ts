import { getRelatedBranchOfficeId, type MakerCandidate, type MakerOffice } from "./first-maker-candidates";

export function isRelatedBranchManager(user: MakerCandidate, officeId: string, offices: readonly MakerOffice[]): boolean {
  if (!user.id || user.is_active !== true || user.deleted_at) return false;
  const branchId = getRelatedBranchOfficeId(offices, officeId);
  return Boolean(branchId) && user.office_id === branchId
    && /^(branch\s+manager|bm)$/i.test((user.job_title || "").trim());
}
