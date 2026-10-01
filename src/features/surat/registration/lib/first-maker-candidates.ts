export type MakerOffice = { id: string; kedudukan?: string | null; parent_id?: string | null };
export type MakerCandidate = {
  id?: string; office_id?: string | null; department_id?: string | null;
  job_title?: string | null; is_active?: boolean; deleted_at?: string | null;
};
export type MakerContext = {
  requesterId: string; officeId: string; departmentId: string;
  offices: readonly MakerOffice[];
};

export const isContextualMakerStep = (
  usage: { first_maker_policy?: string | null; is_system_template?: boolean } | null | undefined,
  step: { step_order?: number; role_name?: string; action_type?: string | null },
): boolean => usage?.first_maker_policy === "contextual" && usage.is_system_template !== true
  && step.step_order === 1 && step.role_name?.trim().toLowerCase() === "membuat"
  && (step.action_type || "approval") === "approval";

export function getRelatedBranchOfficeId(offices: readonly MakerOffice[], officeId: string): string | null {
  const byId = new Map(offices.map(office => [office.id, office]));
  const seen = new Set<string>();
  let current = byId.get(officeId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    const scope = current.kedudukan?.trim().toLowerCase();
    if (scope === "kc") return current.id;
    if (scope === "pusat") return null;
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return null;
}

export function isFirstMakerCandidate(user: MakerCandidate, context: MakerContext): boolean {
  if (!user.id || user.is_active === false || user.deleted_at || !context.requesterId) return false;
  if (user.id === context.requesterId) return true;
  const title = user.job_title || "";
  if (/(^|[^a-z0-9])(spv|supervisor)([^a-z0-9]|$)/i.test(title)) {
    return Boolean(context.officeId) && user.office_id === context.officeId;
  }
  if (/^(branch\s+manager|bm)$/i.test(title.trim())) {
    const branchId = getRelatedBranchOfficeId(context.offices, context.officeId);
    return Boolean(branchId) && user.office_id === branchId;
  }
  if (/^(asisten|assistant)\s+(manager|mgr\.?)([^a-z0-9]|$)/i.test(title.trim())) {
    return Boolean(context.departmentId) && user.department_id === context.departmentId;
  }
  return false;
}
