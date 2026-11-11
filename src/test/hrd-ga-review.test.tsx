import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hrdGaReviewContext, hrdGaReviewGroup, hrdGaReviewIssue, normalizeHrdGaReviewConfig } from "@/lib/hrd-ga-review";
import { normalizeCheckerInputSchema } from "@/features/surat/inbox/lib/checker-input";
import { HrdGaReviewAssignment } from "@/components/surat/HrdGaReviewAssignment";
const ga = "10000000-0000-4000-8000-000000000001", hrd = "10000000-0000-4000-8000-000000000002";
const config = { version: 1 as const, department_id: "10000000-0000-4000-8000-000000000003", reviewers: {
  ga: { user_id: ga, full_name: "Usman Huda" }, hrd: { user_id: hrd, full_name: "Tri Sulistyanto" },
} };
afterEach(cleanup);
describe("HRD GA examination routing", () => {
  it("rejects missing, invalid and mixed categories", () => {
    expect(hrdGaReviewIssue([])).toBeTruthy();
    expect(hrdGaReviewIssue([{ nama_barang: "ATK" }])).toContain("item 1");
    expect(hrdGaReviewIssue([{ hrd_ga_category: ["ga"] }])).toBeTruthy();
    expect(hrdGaReviewIssue([{ hrd_ga_category: "ga" }, { hrd_ga_category: "hrd" }])).toContain("dua pengajuan");
  });
  it.each(["ga", "hrd"])("accepts homogeneous %s requests", category => {
    const rows = [{ hrd_ga_category: category }, { hrd_ga_category: category }];
    expect(hrdGaReviewIssue(rows)).toBeUndefined(); expect(hrdGaReviewGroup(rows)).toBe(category);
  });
  it("retains the frozen group during revision and defaults new revision items to it", () => {
    expect(hrdGaReviewIssue([{}], "ga")).toBeUndefined();
    expect(hrdGaReviewIssue([{ hrd_ga_category: "hrd" }], "ga")).toContain("pengajuan semula");
    expect(hrdGaReviewContext({ form_usage_steps: [{ input_schema: { hrd_ga_review: config } }] }, {})).toBeNull();
  });
  it("rejects forged/ambiguous reviewer config and preserves routing through admin normalization", () => {
    expect(normalizeHrdGaReviewConfig({ ...config, reviewers: { ga: config.reviewers.ga, hrd: config.reviewers.ga } })).toBeNull();
    expect(normalizeCheckerInputSchema({ fields: [], hrd_ga_review: config })).toEqual({ fields: [], hrd_ga_review: config });
  });
  it("shows Usman for GA and Tri for HRD without requiring examination input", () => {
    const { rerender } = render(<HrdGaReviewAssignment config={config} items={[{ nama_barang: "Kertas", hrd_ga_category: "ga" }]} onChange={vi.fn()}/>);
    expect(screen.getByText("Usman Huda")).toBeInTheDocument();
    rerender(<HrdGaReviewAssignment config={config} items={[{ nama_barang: "BPJS", hrd_ga_category: "hrd" }]} onChange={vi.fn()}/>);
    expect(screen.getByText("Tri Sulistyanto")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("sets a per-item category without changing its amount or identity", () => {
    const change = vi.fn(); const row = { id: "original", nama_barang: "ATK", jumlah: 2, nominal: 5000 };
    render(<HrdGaReviewAssignment config={config} items={[row]} onChange={change}/>);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Kategori pemeriksaan item 1" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "ATK dan kebutuhan rumah tangga" }));
    expect(change).toHaveBeenCalledWith([{ ...row, hrd_ga_category: "ga" }]);
  });
});
