import { describe, expect, it } from "vitest";
import { isKeu1FirstSignerCandidate, isKeu1RequesterStep } from "@/features/surat/registration/lib/keu1-first-signer";
import { canAutoApproveRequesterFirstStep } from "@/lib/surat-requester-auto-approval";

describe("KEU 1 first signer", () => {
  const form = { nomor_form: "FM-UAI.KEU-01-00" };
  const step = { step_order: 1, assignee_mode: "requester", action_type: "approval" };
  it("limits the exception to KEU 1 requester approval step one", () => {
    expect(isKeu1RequesterStep(form, step)).toBe(true);
    expect(isKeu1RequesterStep({ nomor_form: "FM-UAI.PGD-01-00" }, step)).toBe(false);
    expect(isKeu1RequesterStep(form, { ...step, step_order: 2 })).toBe(false);
    expect(isKeu1RequesterStep(form, { ...step, assignee_mode: "select" })).toBe(false);
    expect(isKeu1RequesterStep(form, { ...step, action_type: "configured_input" })).toBe(false);
  });
  it.each(["SPV Marketing", "Supervisor Teknik", "SPV. Marketing", "Supervisor Umum"])("includes same-branch %s", job_title => {
    expect(isKeu1FirstSignerCandidate({ id: "spv", office_id: "kc", job_title }, "self", "kc", true)).toBe(true);
  });
  it("includes requester and excludes foreign, inactive, deleted and non-supervisors", () => {
    expect(isKeu1FirstSignerCandidate({ id: "self", job_title: "Staff" }, "self", "kc", true)).toBe(true);
    for (const user of [
      { id: "x", office_id: "other", job_title: "SPV Teknik" },
      { id: "x", office_id: "kc", job_title: "SPV Teknik", is_active: false },
      { id: "x", office_id: "kc", job_title: "SPV Teknik", deleted_at: "2026-01-01" },
      { id: "x", office_id: "kc", job_title: "Staff" },
      { id: "x", office_id: "kc", job_title: "NonSupervisor" },
    ]) expect(isKeu1FirstSignerCandidate(user, "self", "kc", true)).toBe(false);
    expect(isKeu1FirstSignerCandidate({ id: "x", office_id: "kc", job_title: "SPV Teknik" }, "self", "kc", false)).toBe(false);
  });
  it("does not auto approve a supervisor selected by the requester", () => {
    expect(canAutoApproveRequesterFirstStep({ actorId: "self", surat: { created_by: "self", status: "PROSES", current_step: 1 }, signature: { user_id: "spv", step_order: 1 } })).toBe(false);
  });
});
