import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf-8");
const MODULE = "backend/src/modules/marison/marison-sync-runtime.ts";
const SERVER = "backend/src/domain-runtime.ts";

describe("Marison Sync Runtime Boundary", () => {
  it("module baru ada dan factory diekspor", () => {
    const syncRuntime = read(MODULE);
    expect(syncRuntime).toContain("export function createMarisonSyncRuntime");
  });

  it("domain-runtime memakai factory dan route mendelegasikan", () => {
    const server = read(SERVER);
    expect(server).toContain("createMarisonSyncRuntime({");
    expect(server).toContain("marisonSyncRuntime.syncMarisonBranches(");
    expect(server).toContain("marisonSyncRuntime.syncMarisonProjects(");
    expect(server).toContain("marisonSyncRuntime.syncMarisonEmployees(");
    expect(server).toContain("marisonSyncRuntime.syncMarisonDirectoryFromCron(");
  });

  it("implementasi inline dan tiga boolean lama tidak kembali ke domain-runtime", () => {
    const server = read(SERVER);
    expect(server).not.toContain("let marisonEmployeeSyncInFlight");
    expect(server).not.toContain("let marisonBranchSyncInFlight");
    expect(server).not.toContain("let marisonProjectSyncInFlight");
    expect(server).not.toContain("const syncMarisonBranches = async");
    expect(server).not.toContain("const syncMarisonProjects = async");
    expect(server).not.toContain("const syncMarisonEmployees = async");
    expect(server).not.toContain("const syncMarisonDirectoryFromCron = async");
    expect(server).not.toContain("const assertMarisonEmployeeSyncWriteAvailable = () =>");
  });

  it("shared mutex tetap dimiliki satu factory di module baru", () => {
    const syncRuntime = read(MODULE);
    expect(syncRuntime).toContain("let marisonEmployeeSyncInFlight = false;");
    expect(syncRuntime).toContain("let marisonBranchSyncInFlight = false;");
    expect(syncRuntime).toContain("let marisonProjectSyncInFlight = false;");
    // State lock tidak boleh bocor ke domain-runtime atau module lain.
    const server = read(SERVER);
    expect(server).not.toContain("marisonSyncInFlight");
  });

  it("module baru bebas any/@ts-*/double cast", () => {
    const syncRuntime = read(MODULE);
    expect(syncRuntime).not.toMatch(/ as any/);
    expect(syncRuntime).not.toMatch(/: any/);
    expect(syncRuntime).not.toMatch(/@ts-ignore/);
    expect(syncRuntime).not.toMatch(/@ts-nocheck/);
    expect(syncRuntime).not.toMatch(/ as unknown as /);
    expect(syncRuntime).not.toMatch(/<any>/);
  });

  it("module tidak mengimpor domain-runtime", () => {
    const syncRuntime = read(MODULE);
    expect(syncRuntime).not.toContain("domain-runtime");
  });
});
