import { describe, expect, it } from "vitest";
import { unitReadinessIssue } from "@/lib/unit-readiness";

describe("partial Unit readiness", () => {
  it("accepts 3 of 30 only with a clear examiner note", () => {
    expect(unitReadinessIssue(30, 3, "Baru 3 unit siap bangun; 27 unit belum siap.")).toBeNull();
    for (const note of ["", "    ", "abcd"]) expect(unitReadinessIssue(30, 3, note)).toContain("Catatan minimal 5 karakter");
  });
  it("allows a complete allocation without requiring a note", () => {
    expect(unitReadinessIssue(30, 30, "")).toBeNull();
  });
  it.each([[0, 3], [30, 0], [30, 31], [3.5, 2], [30, 1.5], [NaN, 3]])("rejects invalid counts %s/%s", (requested, allocated) => {
    expect(unitReadinessIssue(requested, allocated, "Keterangan pemeriksa")).not.toBeNull();
  });
  it("limits notes", () => {
    expect(unitReadinessIssue(30, 3, "x".repeat(2000))).toBeNull();
    expect(unitReadinessIssue(30, 3, "x".repeat(2001))).toContain("2000");
  });
});
