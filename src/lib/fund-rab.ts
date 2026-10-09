import type { AttachmentRequirement, UsageDetailRecord } from "@/components/surat/form/surat-form-types";
import { usesFundSubmissionType } from "@/features/surat/registration/usages/fund/fund-types";

export const REQUESTER_HAS_RAB_KEY = "requester_has_rab";
export const RAB_NOT_REQUIRED_KEY = "rab_not_required";
export const RAB_REQUIREMENT_KEY = "rab";

export function isFundRabReviewer(
  form: Parameters<typeof usesFundSubmissionType>[0], category: unknown, role: unknown, label: unknown,
  reviewer: "planning" | "hrd",
): boolean {
  if (role !== "memeriksa" || !usesFundSubmissionType(form, category)) return false;
  const text = typeof label === "string" ? label : "";
  return reviewer === "planning" ? /perencanaan/i.test(text) : /\bhrd\b|\bsdm\b|sumber daya manusia/i.test(text);
}

export function usesRequesterRabChoice(usage: UsageDetailRecord, category: unknown): boolean {
  return usesFundSubmissionType(usage.master_forms, category)
    && Boolean(usage.form_usage_steps?.some(step =>
      isFundRabReviewStage(usage.master_forms, category, step.role_name, step.label)));
}

export function isFundRabReviewStage(
  form: Parameters<typeof usesFundSubmissionType>[0], category: unknown, role: unknown, label: unknown,
): boolean {
  return isFundRabReviewer(form, category, role, label, "planning")
    || isFundRabReviewer(form, category, role, label, "hrd")
    || (role === "memeriksa" && usesFundSubmissionType(form, category)
      && typeof label === "string" && /^\s*(?:manager|mgr\.?)\s+terkait\s*$/i.test(label));
}

export function withRequesterRabRequirement(
  requirements: AttachmentRequirement[], usage: UsageDetailRecord | null, input: Record<string, unknown>,
): AttachmentRequirement[] {
  if (!usage || !usesFundSubmissionType(usage.master_forms, input.request_category)) return requirements;
  const otherRequirements = requirements.filter(rule => rule.requirement_key !== RAB_REQUIREMENT_KEY);
  if (!usesRequesterRabChoice(usage, input.request_category)) return otherRequirements;
  const configured = usage.form_usage_attachment_requirements?.find(rule => rule.requirement_key === RAB_REQUIREMENT_KEY);
  const rab: AttachmentRequirement = {
    id: "requester-rab", stage_order: 0, requirement_key: RAB_REQUIREMENT_KEY,
    label: "RAB (opsional)",
    is_required: false, allow_multiple: false, min_files: 0, max_files: 1,
    allowed_types: configured?.allowed_types?.length ? configured.allowed_types : ["application/pdf"],
    max_size_bytes: configured?.max_size_bytes || 10 * 1024 * 1024,
  };
  return [...otherRequirements, rab];
}

type RabAttachment = { stage?: string; requirement_key?: string; signature_id?: string | null };
type Requirement = { requirement_key: string; is_required?: boolean; min_files?: number };
export const PLANNING_RAB_REQUIREMENT = {
  requirement_key: RAB_REQUIREMENT_KEY, label: "RAB (opsional)", is_required: false,
  min_files: 0, max_files: 1, allow_multiple: false, allowed_types: ["application/pdf"],
  max_size_bytes: 10 * 1024 * 1024,
};
export function hasRequesterRab(attachments: RabAttachment[]): boolean {
  return attachments.some(attachment =>
    attachment.stage === "initial" && attachment.requirement_key === RAB_REQUIREMENT_KEY && !attachment.signature_id);
}

export function effectiveFundRabRequirements<T extends Requirement>(
  requirements: T[], planningFund: boolean, hrdFund = false,
): Array<T | typeof PLANNING_RAB_REQUIREMENT> {
  if (!planningFund && !hrdFund) return requirements;
  const rules = requirements.some(rule => rule.requirement_key === RAB_REQUIREMENT_KEY)
    ? requirements : [...requirements, PLANNING_RAB_REQUIREMENT];
  return rules.map(rule => rule.requirement_key === RAB_REQUIREMENT_KEY
    ? { ...rule, is_required: false, min_files: 0 } : rule);
}
