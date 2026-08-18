import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("configured signer range", () => {
  it("accepts exactly 2-8 selected signers during registration", () => {
    const service = read("src/services/surat.service.ts");
    expect(service).toContain("activeSigners.length < 2 || activeSigners.length > 8");
    expect(service).toContain("configuredSteps.length !== activeSigners.length");
    expect(service).not.toContain("activeSigners.length < 3 || activeSigners.length > 8");
  });

  it("allows configuration down to two steps and caps it at eight", () => {
    const page = read("src/pages/admin/FormUsageManagementPage.tsx");
    expect(page).toContain("formData.steps.length < 2 || formData.steps.length > 8");
    expect(page).toContain("disabled={formData.steps.length <= 2}");
    expect(page).toContain("disabled={formData.steps.length >= 8}");
  });
});
