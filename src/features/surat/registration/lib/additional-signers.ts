import type { SignerAssignment } from "@/components/surat/form/surat-form-types";
import type { UsageDetailRecord } from "@/components/surat/form/surat-form-types";
import { buildSignerAssignments } from "./signer-assignments";
import { isKeu10Form } from "./keu10-form";

export const SIGNER_GROUPS = ["membuat", "memeriksa", "menyetujui"] as const;
export type SignerGroup = typeof SIGNER_GROUPS[number];
export const MAX_SUBMISSION_SIGNERS = 8;

export function protectedUsageSignerSteps(usage: UsageDetailRecord | null, input: Record<string, unknown>): string[] {
  if (!usage) return [];
  const recommendation = usage.recommendation_config;
  return protectedSignerSteps(buildSignerAssignments(usage), isKeu10Form(usage.master_forms),
    recommendation?.enabled === true && (input.requires_recommendation === true || recommendation.optional !== true)
      ? recommendation.required_before_step : undefined);
}

export function protectedSignerSteps(configured: SignerAssignment[], keu10 = false, recommendationBefore?: number): string[] {
  return configured.filter(signer => signer.role_name === "verifikator" || signer.requires_unit_allocation
    || (signer.action_type && signer.action_type !== "approval") || Boolean(signer.verifier_user_ids?.length)
    || signer.attachment_requirements?.some(rule => rule.is_required)
    || signer.step_order === recommendationBefore
    || (keu10 && (signer.step_order === 1 || signer.step_order === configured.length)))
    .flatMap(signer => signer.form_usage_step_id ? [signer.form_usage_step_id] : []);
}

export function excludedSignerSteps(signers: SignerAssignment[]): string[] {
  return [...new Set(signers.flatMap(signer => Array.isArray(signer.excluded_step_ids) ? signer.excluded_step_ids : []))];
}

export function clearExcludedSignerSteps(signers: SignerAssignment[]): SignerAssignment[] {
  return withExcludedSteps(signers, []);
}

function withExcludedSteps(signers: SignerAssignment[], excluded: string[]): SignerAssignment[] {
  // Drafts persist the signer array; keep plan metadata on its first row only.
  return signers.map((signer, index) => {
    const { excluded_step_ids: _excluded, ...rest } = signer;
    return { ...rest, ...(index === 0 && excluded.length ? { excluded_step_ids: excluded } : {}) };
  });
}

export function signerRemovalIssue(signers: SignerAssignment[], index: number): string | null {
  if (!signers[index]) return "Penandatangan tidak tersedia.";
  const remaining = signers.filter((_, position) => position !== index);
  if (remaining.length < 2) return "Minimal dua penandatangan.";
  if (!remaining.some(signer => signerGroup(signer) === "membuat")) return "Minimal satu pembuat.";
  if (!remaining.some(signer => signerGroup(signer) !== "membuat")) return "Minimal satu pemeriksa atau penyetuju.";
  return null;
}

export function removeSigner(signers: SignerAssignment[], index: number): SignerAssignment[] {
  if (signerRemovalIssue(signers, index)) return signers;
  const removed = signers[index];
  const excluded = excludedSignerSteps(signers);
  if (removed.is_additional !== true && removed.form_usage_step_id) excluded.push(removed.form_usage_step_id);
  return renumberSigners(withExcludedSteps(signers.filter((_, position) => position !== index), [...new Set(excluded)]));
}

export function signerPlanIssue(signers: SignerAssignment[]): string | null {
  if (signers.length < 2 || signers.length > MAX_SUBMISSION_SIGNERS) return "Penandatangan harus berjumlah 2 sampai 8 tahap.";
  const makers = signers.filter(signer => signerGroup(signer) === "membuat" && signer.user_id);
  const reviewers = signers.filter(signer => signerGroup(signer) !== "membuat" && signer.user_id);
  if (!makers.some(maker => reviewers.some(reviewer => reviewer.user_id !== maker.user_id))) {
    return "Pilih pembuat dan pemeriksa atau penyetuju dari minimal dua akun berbeda.";
  }
  return null;
}

export function signerGroup(signer: Pick<SignerAssignment, "role_name">): SignerGroup {
  return signer.role_name === "verifikator" ? "memeriksa" : signer.role_name as SignerGroup;
}

export function renumberSigners(signers: SignerAssignment[]): SignerAssignment[] {
  return withExcludedSteps(signers.map((signer, index) => ({ ...signer, step_order: index + 1 })), excludedSignerSteps(signers));
}

export function canMoveSigner(signers: SignerAssignment[], index: number, direction: -1 | 1): boolean {
  const current = signers[index];
  const adjacent = signers[index + direction];
  return Boolean(current && adjacent && signerGroup(current) === signerGroup(adjacent)
    && (current.is_additional === true || adjacent.is_additional === true));
}

export function moveSigner(signers: SignerAssignment[], index: number, direction: -1 | 1): SignerAssignment[] {
  if (!canMoveSigner(signers, index, direction)) return signers;
  const next = [...signers];
  [next[index], next[index + direction]] = [next[index + direction], next[index]];
  return renumberSigners(next);
}

export function addSigner(signers: SignerAssignment[], group: SignerGroup, clientId: string): SignerAssignment[] {
  if (signers.length >= MAX_SUBMISSION_SIGNERS) return signers;
  const groupIndex = SIGNER_GROUPS.indexOf(group);
  const before = signers.findIndex(signer => SIGNER_GROUPS.indexOf(signerGroup(signer)) > groupIndex);
  const next = [...signers];
  next.splice(before < 0 ? next.length : before, 0, {
    is_additional: true, client_id: clientId, step_order: 0, role_name: group,
    label_jabatan: "Penandatangan tambahan", user_id: "", action_type: "approval", assignee_mode: "select",
  });
  return renumberSigners(next);
}

export function removeAdditionalSigner(signers: SignerAssignment[], index: number): SignerAssignment[] {
  return signers[index]?.is_additional === true
    ? renumberSigners(withExcludedSteps(signers.filter((_, position) => position !== index), excludedSignerSteps(signers))) : signers;
}

// Reconcile mandatory metadata first, then retain additions next to their saved
// mandatory anchor. Configuration changes never turn an old mandatory row into an addition.
export function mergeAdditionalSigners(configured: SignerAssignment[], persisted: SignerAssignment[]): SignerAssignment[] {
  const excluded = excludedSignerSteps(persisted).filter(id => configured.some(signer => signer.form_usage_step_id === id));
  configured = configured.filter(signer => !excluded.includes(signer.form_usage_step_id || ""));
  const seen = new Set<string>();
  const result: SignerAssignment[] = [];
  for (const group of SIGNER_GROUPS) {
    const mandatory = configured.filter(signer => signerGroup(signer) === group);
    const saved = persisted.filter(signer => signerGroup(signer) === group);
    const before = new Map<string, SignerAssignment[]>();
    const trailing: SignerAssignment[] = [];
    saved.forEach((signer, index) => {
      if (signer.is_additional !== true || signer.form_usage_step_id || !signer.client_id
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(signer.client_id)
        || seen.has(signer.client_id)) return;
      seen.add(signer.client_id);
      const clean: SignerAssignment = {
        is_additional: true, client_id: signer.client_id, role_name: group, step_order: 0,
        user_id: signer.user_id || "", label_jabatan: signer.label_jabatan || "Penandatangan tambahan",
        action_type: "approval", assignee_mode: "select",
      };
      const anchor = saved.slice(index + 1).find(candidate => candidate.is_additional !== true
        && mandatory.some(step => step.form_usage_step_id === candidate.form_usage_step_id));
      if (!anchor?.form_usage_step_id) trailing.push(clean);
      else before.set(anchor.form_usage_step_id, [...(before.get(anchor.form_usage_step_id) || []), clean]);
    });
    for (const signer of mandatory) result.push(...(before.get(signer.form_usage_step_id || "") || []), signer);
    result.push(...trailing);
  }
  return renumberSigners(withExcludedSteps(result, excluded));
}
