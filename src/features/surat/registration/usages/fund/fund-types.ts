import { isKeu1Form } from "../../lib/keu1-form";
import { isKeu10Form } from "../../lib/keu10-form";

export function usesFundSubmissionType(form: { nomor_form?: string | null } | null | undefined): boolean {
  return !isKeu1Form(form) && !isKeu10Form(form);
}

export const FUND_SUBMISSION_TYPES = [
  { value: "operational", label: "Biaya Operasional" },
  { value: "production_cost", label: "Biaya Produksi" },
  { value: "marketing_cost", label: "Biaya Marketing" },
] as const;

export type FundSubmissionType = typeof FUND_SUBMISSION_TYPES[number]["value"];

export function isFundSubmissionType(value: unknown): value is FundSubmissionType {
  return FUND_SUBMISSION_TYPES.some((type) => type.value === value);
}

export function getFundSubmissionTypeLabel(value: unknown): string {
  return FUND_SUBMISSION_TYPES.find((type) => type.value === value || type.label === value)?.label || "-";
}
