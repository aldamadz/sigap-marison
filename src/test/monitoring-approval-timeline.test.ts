import { describe, expect, it } from "vitest";
import { getSortedApprovalSignatures } from "@/components/surat/approval-signatures";

describe("monitoring approval timeline", () => {
  it("reads and sorts signatures returned by the detail query", () => {
    const surat = {
      surat_signatures: [
        { id: "third", step_order: 3 },
        { id: "first", step_order: 1 },
        { id: "second", step_order: 2 },
      ],
    };

    expect(getSortedApprovalSignatures(surat).map((signature) => signature.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("does not require the list-only _sigs property", () => {
    const surat = {
      surat_signatures: [{ id: "approval", step_order: 1 }],
    };

    expect(getSortedApprovalSignatures(surat)).toHaveLength(1);
    expect(surat).not.toHaveProperty("_sigs");
  });
});
