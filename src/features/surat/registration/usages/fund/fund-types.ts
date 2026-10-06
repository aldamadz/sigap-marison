export function usesFundSubmissionType(form: { nomor_form?: string | null } | null | undefined, category: unknown): boolean {
  return category === "non_asset" && /(?:^|[.-])PGD(?:[.-]|$)/.test(String(form?.nomor_form ?? "").trim().toUpperCase());
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
