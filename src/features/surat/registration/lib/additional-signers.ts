import type { SignerAssignment } from "@/components/surat/form/surat-form-types";

export const SIGNER_GROUPS = ["membuat", "memeriksa", "menyetujui"] as const;
export type SignerGroup = typeof SIGNER_GROUPS[number];
export const MAX_SUBMISSION_SIGNERS = 8;

export function signerGroup(signer: Pick<SignerAssignment, "role_name">): SignerGroup {
  return signer.role_name === "verifikator" ? "memeriksa" : signer.role_name as SignerGroup;
}

export function renumberSigners(signers: SignerAssignment[]): SignerAssignment[] {
  return signers.map((signer, index) => ({ ...signer, step_order: index + 1 }));
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
    ? renumberSigners(signers.filter((_, position) => position !== index)) : signers;
}

// Reconcile mandatory metadata first, then retain additions next to their saved
// mandatory anchor. Configuration changes never turn an old mandatory row into an addition.
export function mergeAdditionalSigners(configured: SignerAssignment[], persisted: SignerAssignment[]): SignerAssignment[] {
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
  return renumberSigners(result);
}
