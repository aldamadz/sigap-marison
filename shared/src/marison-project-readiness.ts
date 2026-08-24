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

export type StagingProjectReadinessProject = {
  /** marison_project_id (identitas external proyek). */
  projectId: number | null;
  /** marison_synced_at terisi. */
  synced: boolean;
  /** Review "Branch proyek external belum tersedia" aktif. */
  reviewBlocked: boolean;
  /** marison_branch_id kantor proyek. */
  officeBranchId: number | null;
  /** marison_synced_at kantor proyek terisi. */
  officeSynced: boolean;
};

export type StagingProjectReadinessInput = {
  /** Proyek sumber bila identitas external langsung terisi di master. */
  directProject: StagingProjectReadinessProject | null;
  /** Proyek target dari tabel mapping staging (entity_type=project). */
  mappedProject: StagingProjectReadinessProject | null;
  /**
   * Branch override dari mapping staging (entity_type=office) kantor proyek,
   * sudah divalidasi target marison_branch_id > 0 dan ter-sync; null bila tidak ada.
   */
  officeMappingBranchId: number | null;
  /**
   * Predikat atau konstanta: apakah ada kantor dengan marison_branch_id = branch
   * terpilih yang ter-sync (validasi "Effective branch ID outbound tidak
   * tervalidasi" pada dispatch).
   */
  effectiveBranchExistsSynced: ((branchId: number | null) => boolean) | boolean;
};

export type StagingProjectReadinessResult = {
  ready: boolean;
  projectId: number | null;
  branchId: number | null;
  branchSource: "external_source" | "staging_mapping" | null;
};

const isProjectUsable = (project: StagingProjectReadinessProject | null): boolean =>
  project !== null
  && project.projectId !== null
  && project.synced
  && !project.reviewBlocked
  && project.officeBranchId !== null
  && project.officeSynced;

/**
 * Menghitung kesiapan proyek untuk dispatch Marison non-asset dengan aturan
 * yang identik dengan rantai `getMarisonOutboundMappings` +
 * `resolveMarisonEffectiveProjectBranch` (+validasi effective branch/project):
 *
 * 1. Proyek terpilih = target mapping staging bila valid, else sumber langsung.
 * 2. Branch efektif = branch mapping office (staging) bila ada, else branch
 *    kantor proyek terpilih.
 * 3. Branch efektif harus cocok dengan branch kantor proyek terpilih
 *    ("Effective project dan branch outbound tidak cocok").
 * 4. Branch efektif harus terdaftar sebagai kantor yang ter-sync.
 */
export const resolveStagingProjectReadiness = (
  input: StagingProjectReadinessInput,
): StagingProjectReadinessResult => {
  const { directProject, mappedProject, officeMappingBranchId, effectiveBranchExistsSynced } = input;
  const mapped = isProjectUsable(mappedProject) ? mappedProject : null;
  const direct = mapped ? null : isProjectUsable(directProject) ? directProject : null;
  const chosen = mapped ?? direct;
  if (!chosen) return { ready: false, projectId: null, branchId: null, branchSource: null };

  const projectBranchId = Number(chosen.officeBranchId);
  const branchId = officeMappingBranchId !== null ? Number(officeMappingBranchId) : projectBranchId;
  const branchMatchesProjectOffice = branchId === projectBranchId;
  const branchExistsSynced = typeof effectiveBranchExistsSynced === "function"
    ? effectiveBranchExistsSynced(branchId)
    : effectiveBranchExistsSynced;
  if (!branchMatchesProjectOffice || !branchExistsSynced) {
    return { ready: false, projectId: null, branchId: null, branchSource: null };
  }
  return {
    ready: true,
    projectId: Number(chosen.projectId),
    branchId,
    branchSource: mapped ? "staging_mapping" : "external_source",
  };
};
