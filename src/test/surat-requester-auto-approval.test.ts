import { describe, expect, it } from "vitest";
import { canAutoApproveRequesterFirstStep } from "@/lib/surat-requester-auto-approval";

const ordinary = {
  actorId: "requester",
  surat: { created_by: "requester", current_step: 1, status: "PROSES" },
  signature: {
    user_id: "requester",
    step_order: 1,
    is_signed: false,
    action_type: "approval",
    verification_required: false,
    requires_unit_allocation: false,
  },
};

describe("requester first-step auto approval", () => {
  it("accepts an ordinary first approval owned by the requester", () => {
    expect(canAutoApproveRequesterFirstStep(ordinary)).toBe(true);
  });

  it.each([
    ["different signer", { signature: { ...ordinary.signature, user_id: "manager" } }],
    ["verification", { signature: { ...ordinary.signature, verification_required: true } }],
    ["unit allocation", { signature: { ...ordinary.signature, requires_unit_allocation: true } }],
    ["non-approval action", { signature: { ...ordinary.signature, action_type: "unit_allocation" } }],
    ["later step", { surat: { ...ordinary.surat, current_step: 2 } }],
    ["completed document", { surat: { ...ordinary.surat, status: "DONE" } }],
    ["already signed", { signature: { ...ordinary.signature, is_signed: true } }],
  ])("keeps %s manual", (_label, override) => {
    expect(canAutoApproveRequesterFirstStep({ ...ordinary, ...override })).toBe(false);
  });
});
