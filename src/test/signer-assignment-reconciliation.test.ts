import { describe, expect, it } from "vitest";
import { reconcileSignerAssignments } from "@/lib/signer-assignment-reconciliation";

describe("registration draft signer reconciliation", () => {
  it("adds newly configured steps without losing unchanged signer selections", () => {
    const current = [
      { step_order: 1, form_usage_step_id: "step-1", label_jabatan: "Ass. Mgr. Mkt", user_id: "", eligible_user_ids: ["user-1"] },
      { step_order: 2, form_usage_step_id: "step-2", label_jabatan: "Mgr. Marketing", user_id: "", eligible_user_ids: ["user-2"] },
      { step_order: 3, form_usage_step_id: "step-3", label_jabatan: "Mgr. Perencanaan", user_id: "", eligible_user_ids: ["user-3"] },
      { step_order: 4, form_usage_step_id: "step-4", label_jabatan: "Direktur I", user_id: "", eligible_user_ids: [] },
      { step_order: 5, form_usage_step_id: "step-5", label_jabatan: "Direktur Utama", user_id: "", eligible_user_ids: [] },
    ];
    const persisted = [
      { step_order: 1, form_usage_step_id: "step-1", label_jabatan: "Label lama", user_id: "user-1" },
      { step_order: 2, form_usage_step_id: "step-2", label_jabatan: "Label lama", user_id: "user-2" },
      { step_order: 3, form_usage_step_id: "step-3", label_jabatan: "Label lama", user_id: "user-3" },
    ];

    expect(reconcileSignerAssignments(current, persisted)).toEqual([
      { ...current[0], user_id: "user-1" },
      { ...current[1], user_id: "user-2" },
      { ...current[2], user_id: "user-3" },
      { ...current[3], user_id: "" },
      { ...current[4], user_id: "" },
    ]);
  });

  it("does not attach a signer from another step to a newly inserted step", () => {
    const current = [
      { step_order: 1, form_usage_step_id: "step-1", user_id: "", eligible_user_ids: ["user-1"] },
      { step_order: 2, form_usage_step_id: "new-step", user_id: "", eligible_user_ids: [] },
      { step_order: 3, form_usage_step_id: "step-2", user_id: "", eligible_user_ids: ["user-2"] },
    ];
    const persisted = [
      { step_order: 1, form_usage_step_id: "step-1", user_id: "user-1" },
      { step_order: 2, form_usage_step_id: "step-2", user_id: "user-2" },
    ];

    expect(reconcileSignerAssignments(current, persisted).map((item) => item.user_id)).toEqual([
      "user-1",
      "",
      "user-2",
    ]);
  });

  it("supports legacy drafts without workflow step IDs", () => {
    const current = [
      { step_order: 1, form_usage_step_id: "step-1", user_id: "", eligible_user_ids: ["user-1"] },
      { step_order: 2, form_usage_step_id: "step-2", user_id: "", eligible_user_ids: ["user-2"] },
    ];
    const persisted = [
      { step_order: 1, user_id: "user-1" },
      { step_order: 2, user_id: "user-2" },
    ];

    expect(reconcileSignerAssignments(current, persisted).map((item) => item.user_id)).toEqual([
      "user-1",
      "user-2",
    ]);
  });

  it("replaces a persisted signer when admin changes the only configured candidate", () => {
    const current = [
      {
        step_order: 1,
        form_usage_step_id: "step-1",
        user_id: "",
        eligible_user_ids: ["new-signer"],
      },
    ];
    const persisted = [
      {
        step_order: 1,
        form_usage_step_id: "step-1",
        user_id: "old-signer",
      },
    ];

    expect(reconcileSignerAssignments(current, persisted)[0].user_id).toBe("new-signer");
  });

  it("clears a stale signer when the latest configuration has multiple other candidates", () => {
    const current = [
      {
        step_order: 1,
        form_usage_step_id: "step-1",
        user_id: "",
        eligible_user_ids: ["candidate-a", "candidate-b"],
      },
    ];
    const persisted = [
      {
        step_order: 1,
        form_usage_step_id: "step-1",
        user_id: "old-signer",
      },
    ];

    expect(reconcileSignerAssignments(current, persisted)[0].user_id).toBe("");
  });
});
