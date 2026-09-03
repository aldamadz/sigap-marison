/**
 * Branch Asset Fallback — canonical predicate.
 *
 * Frontend helper that decides whether the "virtual project 000" fallback
 * applies for the current submission.  This is a single source of truth used
 * by the wizard validation, the number-generation service, and the form
 * payload builder.
 *
 * MRN-22 fix: branch offices that genuinely have no registered projects
 * can register an Aset document under the virtual scope "000" without
 * requiring a real project row. All canonical conditions must be present:
 *
 *   - request_category is "asset"
 *   - form_usage_id identifies a canonical usage
 *   - office is a branch (not Pusat)
 *   - branch has no registered projects
 *   - project_id is null/empty
 *   - project_is_default === true
 *   - project_code === "000"
 *   - project_name === "Tanpa proyek"
 *
 * The database independently re-validates the same rule on reservation and
 * registration triggers; this helper is the front-end mirror and is *not*
 * trusted by the backend.
 */

export type RequestCategory = "asset" | "unit" | "non_unit" | "non_asset";

export interface BranchAssetFallbackInput {
  officeKedudukan: "Pusat" | string | null | undefined;
  requestCategory: RequestCategory | string | null | undefined;
  formUsageId: string | null | undefined;
  branchHasRegisteredProjects: boolean;
  projectId: string | null | undefined;
  projectIsDefault?: boolean | null | undefined;
  projectCode?: string | null | undefined;
  projectName?: string | null | undefined;
}

export function isBranchAssetFallback(input: BranchAssetFallbackInput): boolean {
  if (!input.officeKedudukan || input.officeKedudukan === "Pusat") return false;
  if (input.branchHasRegisteredProjects) return false;
  if (input.requestCategory !== "asset") return false;
  if (!input.formUsageId?.trim()) return false;
  if (input.projectId != null && input.projectId !== "") return false;
  if (input.projectIsDefault !== true) return false;
  if (input.projectCode !== "000") return false;
  if (input.projectName !== "Tanpa proyek") return false;
  return true;
}
