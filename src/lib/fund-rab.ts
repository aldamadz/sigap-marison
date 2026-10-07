import type { AttachmentRequirement, UsageDetailRecord } from "@/components/surat/form/surat-form-types";
import { usesFundSubmissionType } from "@/features/surat/registration/usages/fund/fund-types";

export const REQUESTER_HAS_RAB_KEY = "requester_has_rab";
export const RAB_REQUIREMENT_KEY = "rab";

export function usesRequesterRabChoice(usage: UsageDetailRecord, category: unknown): boolean {
  return usesFundSubmissionType(usage.master_forms, category)
    && Boolean(usage.form_usage_steps?.some(step => step.role_name === "memeriksa" && /perencanaan/i.test(step.label)));
}

export function withRequesterRabRequirement(
  requirements: AttachmentRequirement[], usage: UsageDetailRecord | null, input: Record<string, unknown>, retainStoredRab = false,
): AttachmentRequirement[] {
  if (!usage || !usesRequesterRabChoice(usage, input.request_category)) return requirements;
  const otherRequirements = requirements.filter(rule => rule.requirement_key !== RAB_REQUIREMENT_KEY);
  const provided = input[REQUESTER_HAS_RAB_KEY] === true;
  if (!provided && !retainStoredRab) return otherRequirements;
  const configured = usage.form_usage_attachment_requirements?.find(rule => rule.requirement_key === RAB_REQUIREMENT_KEY);
  const rab: AttachmentRequirement = {
    id: "requester-rab", stage_order: 0, requirement_key: RAB_REQUIREMENT_KEY,
    label: provided ? "RAB dari pemohon" : "RAB tersimpan (tim pemeriksa tetap melengkapi)",
    is_required: provided, allow_multiple: false, min_files: provided ? 1 : 0, max_files: 1,
    allowed_types: configured?.allowed_types?.length ? configured.allowed_types : ["application/pdf"],
    max_size_bytes: configured?.max_size_bytes || 10 * 1024 * 1024,
  };
  return [...otherRequirements, rab];
}

type RabAttachment = { stage?: string; requirement_key?: string; signature_id?: string | null };
type Requirement = { requirement_key: string; is_required?: boolean; min_files?: number };
export const PLANNING_RAB_REQUIREMENT = {
  requirement_key: RAB_REQUIREMENT_KEY, label: "RAB hasil pemeriksaan", is_required: true,
  min_files: 1, max_files: 1, allow_multiple: false, allowed_types: ["application/pdf"],
  max_size_bytes: 10 * 1024 * 1024,
};
export function hasRequesterRab(input: Record<string, unknown>, attachments: RabAttachment[]): boolean {
  return input[REQUESTER_HAS_RAB_KEY] === true && attachments.some(attachment =>
    attachment.stage === "initial" && attachment.requirement_key === RAB_REQUIREMENT_KEY && !attachment.signature_id);
}

export function effectiveFundRabRequirements<T extends Requirement>(
  requirements: T[], planningFund: boolean, input: Record<string, unknown>, attachments: RabAttachment[],
): Array<T | typeof PLANNING_RAB_REQUIREMENT> {
  if (!planningFund || !(REQUESTER_HAS_RAB_KEY in input)) return requirements;
  const rules = requirements.some(rule => rule.requirement_key === RAB_REQUIREMENT_KEY)
    ? requirements : [...requirements, PLANNING_RAB_REQUIREMENT];
  const provided = hasRequesterRab(input, attachments);
  return rules.map(rule => rule.requirement_key === RAB_REQUIREMENT_KEY
    ? { ...rule, is_required: !provided, min_files: provided ? 0 : Math.max(1, rule.min_files || 1) } : rule);
}
