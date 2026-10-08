import { getRelatedBranchOfficeId, type MakerCandidate, type MakerContext } from "./first-maker-candidates";

export function branchOfficerRank(title: string | null | undefined): number {
  const value = (title || "").trim();
  if (/^(branch\s+manager|bm)$/i.test(value)) return 3;
  if (/^((assistant|asisten|assistent)\s+(branch\s+manager|bm)|abm)$/i.test(value)) return 2;
  if (/(^|[^a-z0-9])(spv|supervisor)([^a-z0-9]|$)/i.test(value)) return 1;
  return 0;
}

export function getBranchOfficerCandidates<T extends MakerCandidate>(users: readonly T[], context: MakerContext): T[] {
  const branchId = getRelatedBranchOfficeId(context.offices, context.officeId);
  const requester = users.find(user => user.id === context.requesterId);
  if (!branchId || !requester || requester.is_active !== true || requester.deleted_at) return [];
  const eligible = users.filter(user => user.id && user.id !== context.requesterId
    && user.is_active === true && !user.deleted_at
    && (user.office_id === context.officeId || user.office_id === branchId)
    && branchOfficerRank(user.job_title) > 0
    && (branchOfficerRank(user.job_title) < 3 || user.office_id === branchId));
  const rank = Math.max(0, ...eligible.map(user => branchOfficerRank(user.job_title)));
  if (rank <= branchOfficerRank(requester.job_title)) return [];
  const highest = eligible.filter(user => branchOfficerRank(user.job_title) === rank);
  const local = highest.filter(user => user.office_id === context.officeId);
  const candidates = rank < 3 && local.length ? local : highest;
  if (rank > 1) return candidates.length === 1 ? candidates : [];
  const department = candidates.filter(user => Boolean(context.departmentId) && user.department_id === context.departmentId);
  // An unmatched department can choose among supervisors, never an arbitrary reporting parent.
  return department.length ? department : candidates;
}
