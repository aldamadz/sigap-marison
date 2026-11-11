export const HRD_GA_CATEGORY_KEY = "hrd_ga_category";
export const HRD_GA_GROUPS = ["ga", "hrd"] as const;
export type HrdGaGroup = typeof HRD_GA_GROUPS[number];
export const HRD_GA_LABELS: Record<HrdGaGroup, string> = {
  ga: "ATK dan kebutuhan rumah tangga",
  hrd: "BPJS, tenaga harian, dan dinas",
};
export type HrdGaReviewConfig = {
  version: 1;
  department_id: string;
  reviewers: Record<HrdGaGroup, { user_id: string; full_name: string }>;
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const uuid = (value: unknown): value is string => typeof value === "string" && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
export const isHrdGaGroup = (value: unknown): value is HrdGaGroup => value === "ga" || value === "hrd";
export function normalizeHrdGaReviewConfig(value: unknown): HrdGaReviewConfig | null {
  const config = record(value), reviewers = record(config.reviewers);
  if (config.version !== 1 || !uuid(config.department_id)) return null;
  const ga = record(reviewers.ga), hrd = record(reviewers.hrd);
  if (!uuid(ga.user_id) || !uuid(hrd.user_id) || ga.user_id === hrd.user_id) return null;
  return { version: 1, department_id: config.department_id, reviewers: {
    ga: { user_id: ga.user_id, full_name: String(ga.full_name || "Tim GA").slice(0, 160) },
    hrd: { user_id: hrd.user_id, full_name: String(hrd.full_name || "Tim HRD").slice(0, 160) },
  } };
}
export function hrdGaReviewContext(usage: unknown, revisionPolicy?: unknown) {
  if (revisionPolicy !== undefined) {
    const frozen = record(record(revisionPolicy).hrd_ga_review);
    const config = normalizeHrdGaReviewConfig(frozen.config);
    return config && isHrdGaGroup(frozen.group) ? { config, frozenGroup: frozen.group } : null;
  }
  const steps = record(usage).form_usage_steps;
  if (!Array.isArray(steps)) return null;
  for (const step of steps) {
    const config = normalizeHrdGaReviewConfig(record(record(step).input_schema).hrd_ga_review);
    if (config) return { config, frozenGroup: undefined };
  }
  return null;
}
export function hrdGaReviewGroup(items: unknown, fallback?: HrdGaGroup): HrdGaGroup | null {
  if (!Array.isArray(items) || !items.length) return null;
  const categories = items.map(item => record(item)[HRD_GA_CATEGORY_KEY] ?? fallback);
  return categories.every(value => isHrdGaGroup(value) && value === categories[0]) ? categories[0] as HrdGaGroup : null;
}
export function hrdGaReviewIssue(items: unknown, frozenGroup?: HrdGaGroup): string | undefined {
  if (!Array.isArray(items) || !items.length) return "Tambahkan rincian sebelum memilih kategori pemeriksaan HRD & GA.";
  for (const [index, item] of items.entries()) {
    if (!isHrdGaGroup(record(item)[HRD_GA_CATEGORY_KEY] ?? frozenGroup)) return `Pilih kategori pemeriksaan HRD & GA untuk item ${index + 1}.`;
  }
  const group = hrdGaReviewGroup(items, frozenGroup);
  if (!group) return "Pisahkan ATK/rumah tangga dan BPJS/tenaga harian/dinas menjadi dua pengajuan.";
  if (frozenGroup && group !== frozenGroup) return "Kategori pemeriksaan mengikuti pengajuan semula. Buat pengajuan terpisah untuk kategori lain.";
}
export function hrdGaReviewerSummary(usage: unknown, items: unknown, revisionPolicy?: unknown) {
  const context = hrdGaReviewContext(usage, revisionPolicy);
  const group = context && hrdGaReviewGroup(items, context.frozenGroup);
  return group && context ? `${HRD_GA_LABELS[group]} · ${context.config.reviewers[group].full_name}` : null;
}
