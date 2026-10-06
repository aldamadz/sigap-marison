import { getKeu10SubmissionAmount, validateKeu10SubmissionItems } from "./keu10-form";
import { normalizeKeu10Config } from "./keu10-config";

type Candidate = { is_active?: boolean; deleted_at?: string | null; job_title?: string | null };

export function isKeu10FinalCandidate(candidate: Candidate, config: unknown, items: unknown): boolean {
  const policy = normalizeKeu10Config(config);
  if (!policy || candidate.is_active === false || candidate.deleted_at) return false;
  const title = String(candidate.job_title || "").trim().toLowerCase().replace(/\s+/g, " ");
  const utama = title === "direktur utama";
  const directorOne = title === "direktur i";
  if (policy.disposition !== "tactical_land") return utama;
  if (validateKeu10SubmissionItems(items).length > 0) return false;
  const total = getKeu10SubmissionAmount(items);
  return total !== null && (total > 2_000_000 ? utama : directorOne);
}
