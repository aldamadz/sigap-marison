export function usesAutomaticBranchReporting(
  officeScope: string | null | undefined,
  jobTitle: string | null | undefined,
): boolean {
  const scope = officeScope?.trim().toLowerCase();
  const title = jobTitle?.trim() || "";
  return ["kc", "kcp", "kost"].includes(scope || "")
    && !/^(branch\s+manager|bm)$/i.test(title)
    && !/(^|[^a-z0-9])(direktur|director)([^a-z0-9]|$)/i.test(title);
}
