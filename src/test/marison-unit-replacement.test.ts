import { describe, expect, it } from "vitest";
import { verifiedUnitReplacementReceipt } from "../../backend/src/lib/marison-unit-replacement";

describe("verified Unit replacement references", () => {
  const unit = { id: 2579, type: "30", hasSubmitted: false };
  it("builds a fresh minimal receipt without arbitrary external fields", () => {
    const receipt = verifiedUnitReplacementReceipt(24, [unit]);
    expect(receipt).toEqual({ project_id: 24, observed_at: expect.any(String),
      units: [{ unit_id: 2579, type: "30", has_submitted: false }] });
    expect(Date.now() - Date.parse(receipt.observed_at)).toBeLessThan(1000);
    expect(unit).toEqual({ id: 2579, type: "30", hasSubmitted: false });
  });
  it.each([true, undefined, null, 0, "false"])("rejects submitted or unproven status %s", (hasSubmitted) => {
    expect(() => verifiedUnitReplacementReceipt(24, [{ ...unit, hasSubmitted }])).toThrow();
  });
  it("rejects missing type, duplicate identities, empty selections and invalid project", () => {
    expect(() => verifiedUnitReplacementReceipt(24, [{ ...unit, type: "" }])).toThrow();
    expect(() => verifiedUnitReplacementReceipt(24, [unit, unit])).toThrow();
    expect(() => verifiedUnitReplacementReceipt(24, [])).toThrow();
    expect(() => verifiedUnitReplacementReceipt(0, [unit])).toThrow();
  });
  it("returns a non-retryable validation status rather than a transient server error", () => {
    for (const hasSubmitted of [true, undefined]) {
      try { verifiedUnitReplacementReceipt(24, [{ ...unit, hasSubmitted }]); }
      catch (error) { expect(error).toMatchObject({ status: 422 }); continue; }
      throw new Error("Unproven reference unexpectedly accepted");
    }
  });
});
