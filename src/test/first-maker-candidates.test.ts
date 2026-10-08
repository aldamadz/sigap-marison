import { describe, expect, it } from "vitest";
import { getRelatedBranchOfficeId, isContextualMakerStep, isFirstMakerCandidate } from "@/features/surat/registration/lib/first-maker-candidates";

const offices = [
  { id: "hq", kedudukan: "Pusat" },
  { id: "kc", kedudukan: "KC", parent_id: "hq" },
  { id: "kcp", kedudukan: "KCP", parent_id: "kc" },
  { id: "other", kedudukan: "KC", parent_id: "hq" },
];
const context = { requesterId: "self", officeId: "kcp", departmentId: "tech", offices };
describe("contextual first maker", () => {
  it("uses explicit policy, first approval stage and canonical role only", () => {
    const usage = { first_maker_policy: "contextual" };
    const step = { step_order: 1, role_name: "membuat", action_type: "approval" };
    expect(isContextualMakerStep(usage, step)).toBe(true);
    for (const alternative of [{ ...usage, first_maker_policy: "configured" }, { ...usage, is_system_template: true }, {}]) {
      expect(isContextualMakerStep(alternative, step)).toBe(false);
    }
    expect(isContextualMakerStep(usage, { ...step, step_order: 2 })).toBe(false);
    expect(isContextualMakerStep(usage, { ...step, role_name: "memeriksa" })).toBe(false);
    expect(isContextualMakerStep(usage, { ...step, action_type: "unit_allocation" })).toBe(false);
  });
  it.each([
    ["self", "Staff", "kcp", "tech", true],
    ["staff2", "Staff", "kcp", "tech", false],
    ["marketing", "SPV Marketing", "kcp", "marketing", true],
    ["tech", "Supervisor Teknik", "kcp", "tech", true],
    ["foreign", "Supervisor Teknik", "other", "tech", false],
    ["bm", "Branch Manager", "kc", "marketing", false],
    ["foreign-bm", "BM", "other", "tech", false],
    ["assistant", "Asisten Mgr. Teknik", "hq", "tech", true],
    ["foreign-assistant", "Assistant Manager Marketing", "hq", "marketing", false],
    ["manager", "Manager Teknik", "kcp", "tech", false],
    ["abm", "Assistant Branch Manager", "kc", "tech", false],
  ])("checks candidate %s by office/department, not global role", (id, job_title, office_id, department_id, expected) => {
    expect(isFirstMakerCandidate({ id, job_title, office_id, department_id, is_active: true }, context)).toBe(expected);
  });
  it("rejects inactive, deleted, missing context and malformed role matches", () => {
    expect(isFirstMakerCandidate({ id: "self", is_active: false }, context)).toBe(false);
    expect(isFirstMakerCandidate({ id: "self", deleted_at: "today" }, context)).toBe(false);
    expect(isFirstMakerCandidate({ id: "x", job_title: "NonSupervisor", office_id: "kcp" }, context)).toBe(false);
    expect(isFirstMakerCandidate({ id: "self" }, { ...context, requesterId: "" })).toBe(false);
    expect(isFirstMakerCandidate({ id: "bm", job_title: "BM", office_id: "kc" }, { ...context, officeId: "hq" })).toBe(false);
  });
  it("stops at headquarters and fails closed on missing/cyclic hierarchy", () => {
    expect(getRelatedBranchOfficeId(offices, "kcp")).toBe("kc");
    expect(getRelatedBranchOfficeId(offices, "hq")).toBeNull();
    expect(getRelatedBranchOfficeId(offices, "missing")).toBeNull();
    expect(getRelatedBranchOfficeId([{ id: "a", parent_id: "b" }, { id: "b", parent_id: "a" }], "a")).toBeNull();
  });
});
