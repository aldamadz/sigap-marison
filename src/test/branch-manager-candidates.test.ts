import { describe, expect, it } from "vitest";
import { isRelatedBranchManager } from "@/features/surat/registration/lib/branch-manager-candidates";

const offices = [
  { id: "hq", kedudukan: "Pusat" },
  { id: "kc", kedudukan: "KC", parent_id: "hq" },
  { id: "kcp", kedudukan: "KCP", parent_id: "kc" },
  { id: "other", kedudukan: "KC", parent_id: "hq" },
];
const bm = { id: "bm", job_title: "Branch Manager", office_id: "kc", is_active: true };

describe("related Branch Manager candidates", () => {
  it.each(["kc", "kcp"])("accepts related KC BM for %s", office => {
    expect(isRelatedBranchManager(bm, office, offices)).toBe(true);
    expect(isRelatedBranchManager({ ...bm, job_title: "BM" }, office, offices)).toBe(true);
  });
  it.each(["Staff Admin", "SPV Marketing", "Supervisor Teknik", "Asisten Manager", "Manager HRD & GA"])("rejects %s even in same office", title => {
    expect(isRelatedBranchManager({ ...bm, job_title: title }, "kc", offices)).toBe(false);
  });
  it("rejects foreign, inactive, deleted and missing-office candidates", () => {
    expect(isRelatedBranchManager({ ...bm, office_id: "other" }, "kc", offices)).toBe(false);
    expect(isRelatedBranchManager({ ...bm, is_active: false }, "kc", offices)).toBe(false);
    expect(isRelatedBranchManager({ ...bm, deleted_at: "2026-10-01" }, "kc", offices)).toBe(false);
    expect(isRelatedBranchManager(bm, "missing", offices)).toBe(false);
    expect(isRelatedBranchManager(bm, "hq", offices)).toBe(false);
  });
  it("fails closed on cyclic office ancestry", () => {
    expect(isRelatedBranchManager(bm, "a", [
      { id: "a", kedudukan: "KCP", parent_id: "b" },
      { id: "b", kedudukan: "KCP", parent_id: "a" },
    ])).toBe(false);
  });
  it("uses the nearest KC through multiple KCP parents, never a sibling or headquarters BM", () => {
    const nested = [...offices, { id: "deep", kedudukan: "KCP", parent_id: "kcp" }];
    expect(isRelatedBranchManager(bm, "deep", nested)).toBe(true);
    expect(isRelatedBranchManager({ ...bm, office_id: "other" }, "deep", nested)).toBe(false);
    expect(isRelatedBranchManager({ ...bm, office_id: "hq" }, "deep", nested)).toBe(false);
    expect(isRelatedBranchManager({ ...bm, office_id: "kcp" }, "deep", nested)).toBe(false);
  });
  it("rejects unknown activity and unknown, orphaned or headquarters-crossing ancestry", () => {
    expect(isRelatedBranchManager({ ...bm, is_active: undefined }, "kcp", offices)).toBe(false);
    expect(isRelatedBranchManager(bm, "a", [...offices, { id: "a", parent_id: "kc" }])).toBe(false);
    expect(isRelatedBranchManager(bm, "a", [...offices, { id: "a", kedudukan: "KCP", parent_id: "missing" }])).toBe(false);
    expect(isRelatedBranchManager(bm, "hq", offices.map(o => o.id === "hq" ? { ...o, parent_id: "kc" } : o))).toBe(false);
  });
});
