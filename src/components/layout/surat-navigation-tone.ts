export type SuratNavigationTone = "safe" | "overdue";

export const getSuratNavigationTone = (overdueSlaCount: number): SuratNavigationTone =>
  Number.isFinite(overdueSlaCount) && overdueSlaCount > 0 ? "overdue" : "safe";

