import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf-8");

describe("Marison Preview Boundary", () => {
  it("module baru ada dan factory diekspor", () => {
    const preview = read("backend/src/modules/marison/marison-preview-runtime.ts");
    expect(preview).toContain("export function createMarisonPreviewRuntime");
  });

  it("domain-runtime memakai factory", () => {
    const server = read("backend/src/domain-runtime.ts");
    expect(server).toContain("createMarisonPreviewRuntime({");
    expect(server).toContain("marisonPreviewRuntime.previewMarisonBranches(");
  });

  it("sembilan inline declaration di atas tidak kembali", () => {
    const server = read("backend/src/domain-runtime.ts");
    expect(server).not.toContain("let getMarisonEmployeeSyncSource = async");
    expect(server).not.toContain("const getMarisonBranchSyncSource = async");
    expect(server).not.toContain("let getMarisonProjectSyncSource = async");
    expect(server).not.toContain("const assertMarisonBranchSyncAvailable = () =>");
    expect(server).not.toContain("const assertMarisonEmployeeSyncInfraAvailable = () =>");
    expect(server).not.toContain("const previewMarisonBranches = async (req)");
    expect(server).not.toContain("const previewMarisonProjects = async (req)");
    expect(server).not.toContain("const previewMarisonEmployees = async (req)");
  });

  it("module baru bebas any/@ts-*", () => {
    const preview = read("backend/src/modules/marison/marison-preview-runtime.ts");
    expect(preview).not.toMatch(/ as any/);
    expect(preview).not.toMatch(/: any/);
    expect(preview).not.toMatch(/@ts-ignore/);
    expect(preview).not.toMatch(/@ts-nocheck/);
  });

  it("module tidak mengimpor domain-runtime", () => {
    const preview = read("backend/src/modules/marison/marison-preview-runtime.ts");
    expect(preview).not.toContain("domain-runtime");
  });
});
