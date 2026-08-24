import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasUnavailableMarisonProjectBranch } from "@sigap/shared";

describe("Marison project branch readiness", () => {
  it("recognizes the exact sync blocker without treating other review metadata as a blocker", () => {
    expect(hasUnavailableMarisonProjectBranch(["Branch proyek external belum tersedia"])).toBe(true);
    expect(hasUnavailableMarisonProjectBranch('["branch proyek external belum tersedia"]')).toBe(true);
    expect(hasUnavailableMarisonProjectBranch(["Entitas proyek belum dipilih"])).toBe(false);
    expect(hasUnavailableMarisonProjectBranch(null)).toBe(false);
  });

  it("applies the canonical blocker to source, mapped, and final backend project validation", () => {
    const backend = readFileSync("backend/src/domain-runtime.ts", "utf8");
    const resolver = backend.slice(
      backend.indexOf("const getMarisonOutboundMappings"),
      backend.indexOf("export const getMarisonPayloadMappings"),
    );

    expect(resolver).toContain("hasUnavailableMarisonProjectBranch(sourceProject.data.marison_review_reasons)");
    expect(resolver).toContain("hasUnavailableMarisonProjectBranch(projectTarget.data.marison_review_reasons)");
    expect(resolver).toContain("hasUnavailableMarisonProjectBranch(effectiveProject.marison_review_reasons)");
    expect(resolver).toContain("hasUnavailableMarisonProjectBranch(data.marison_review_reasons)");
  });
});
