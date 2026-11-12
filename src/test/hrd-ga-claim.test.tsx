import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HrdGaReviewAssignment } from "@/components/surat/HrdGaReviewAssignment";
import { hrdGaReviewContext, hrdGaReviewerSummary, normalizeHrdGaReviewConfig } from "@/lib/hrd-ga-review";
import { canEditExamination, examinationClaimantName, isSharedExamination } from "@/features/surat/inbox/lib/inbox-task-state";
const config = { version: 1 as const, department_id: "10000000-0000-4000-8000-000000000003", reviewers: {
  ga: { user_id: "10000000-0000-4000-8000-000000000001", full_name: "Usman Huda" },
  hrd: { user_id: "10000000-0000-4000-8000-000000000002", full_name: "Tri Sulistyanto" },
}, mode: "claim" as const };
afterEach(cleanup);
it("preserves pooled configuration and revision snapshot without item categories", () => {
  expect(normalizeHrdGaReviewConfig(config)).toEqual(config);
  expect(hrdGaReviewContext(null, { hrd_ga_review: { config } })?.config.mode).toBe("claim");
  expect(hrdGaReviewerSummary({ form_usage_steps: [{ input_schema: { hrd_ga_review: config } }] }, [{}])).toContain("Usman Huda / Tri Sulistyanto");
  expect(normalizeHrdGaReviewConfig({ ...config, mode: "automatic" })).toBeNull();
});
it("shows both candidates without per-item category selectors", () => {
  render(<HrdGaReviewAssignment config={config} items={[{ nama_barang: "Kas" }]} onChange={vi.fn()} />);
  expect(screen.getByText("Usman Huda / Tri Sulistyanto")).toBeInTheDocument();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});
it("enables actions only for claimant; legacy tasks retain their existing behavior", () => {
  const task = { input_schema_snapshot: { hrd_ga_review: config }, verifier_snapshot: Object.values(config.reviewers), verification_claimed_by: config.reviewers.ga.user_id };
  expect(isSharedExamination(task)).toBe(true);
  expect(canEditExamination(task, config.reviewers.ga.user_id)).toBe(true);
  expect(canEditExamination(task, config.reviewers.hrd.user_id)).toBe(false);
  expect(canEditExamination(task)).toBe(false);
  expect(examinationClaimantName(task)).toBe("Usman Huda");
  expect(canEditExamination({})).toBe(true);
});
