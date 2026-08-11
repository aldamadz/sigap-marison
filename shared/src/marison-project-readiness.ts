export const MARISON_PROJECT_BRANCH_UNAVAILABLE_REASON =
  "Branch proyek external belum tersedia";

const normalizeReviewReason = (value: unknown): string =>
  String(value ?? "").trim().toLocaleLowerCase("id-ID");

const readReviewReasons = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];

  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [trimmed];
  }
};

export const hasUnavailableMarisonProjectBranch = (reviewReasons: unknown): boolean => {
  const expected = normalizeReviewReason(MARISON_PROJECT_BRANCH_UNAVAILABLE_REASON);
  return readReviewReasons(reviewReasons).some((reason) =>
    normalizeReviewReason(reason) === expected
  );
};
