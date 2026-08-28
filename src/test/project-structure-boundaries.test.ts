import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const exists = (path: string) => existsSync(join(root, path));

describe("project structure boundaries", () => {
  it("keeps the maintainability guide discoverable", () => {
    expect(exists("docs/PROJECT_STRUCTURE_GUIDE.md")).toBe(true);
    expect(read("docs/README.md")).toContain("PROJECT_STRUCTURE_GUIDE.md");
  });

  it("keeps BFF runtime outside the domain-runtime shell", () => {
    const runtime = read("backend/src/domain-runtime.ts");
    const bffRuntime = read("backend/src/modules/bff/bff-runtime.ts");

    expect(runtime).toContain('createBffRuntime({');
    expect(runtime).toContain('from "./modules/bff/bff-runtime.js"');
    expect(runtime).not.toContain("const BFF_QUERY_METHODS = new Set");
    expect(runtime).not.toContain("const handleBffQuery = async");
    expect(bffRuntime).toContain("export const createBffRuntime");
    expect(bffRuntime).toContain("const BFF_QUERY_METHODS = new Set");
  });

  it("routes surat page dependencies through feature API facades", () => {
    const suratForm = read("src/components/surat/SuratForm.tsx");
    const inboxPage = read("src/pages/surat/InboxPage.tsx");

    expect(suratForm).toContain("@/features/surat/registration/services/surat-registration-api");
    expect(suratForm).toContain("@/features/surat/recommendation/services/surat-recommendation-api");
    expect(suratForm).not.toContain("suratService.");
    expect(inboxPage).toContain("@/features/surat/inbox/services/surat-inbox-api");
    expect(inboxPage).toContain("@/features/surat/inbox/services/surat-approval-api");
    expect(inboxPage).not.toContain("suratService.");
  });

  it("keeps pure surat helpers out of the largest page files", () => {
    const suratForm = read("src/components/surat/SuratForm.tsx");
    const inboxPage = read("src/pages/surat/InboxPage.tsx");
    const signerAssignments = read("src/features/surat/registration/lib/signer-assignments.ts");
    const inboxTaskState = read("src/features/surat/inbox/lib/inbox-task-state.ts");

    expect(suratForm).toContain("buildSignerAssignments");
    expect(suratForm).not.toContain("const normalizeRoleName =");
    expect(signerAssignments).toContain("const normalizeRoleName =");
    expect(inboxPage).toContain("getTaskAction");
    expect(inboxPage).not.toContain("const getTaskAction =");
    expect(inboxTaskState).toContain("export const getTaskAction");
  });
});
