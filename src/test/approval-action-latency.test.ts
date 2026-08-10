import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(path), "utf8");

describe("approval action latency", () => {
  const service = read("src/services/surat.service.ts");
  const inbox = read("src/pages/surat/InboxPage.tsx");
  const approveBody = service.slice(
    service.indexOf("async approveSurat("),
    service.indexOf("async rejectSurat(", service.indexOf("async approveSurat(")),
  );

  it("loads the approval document and signature concurrently", () => {
    expect(approveBody).toContain("const [suratResult, signatureResult] = await Promise.all([");
    expect(approveBody).toContain('.from("surat_registrasi")');
    expect(approveBody).toContain('.from("surat_signatures")');
  });

  it("does not force-refresh auth for an approval without uploads", () => {
    expect(approveBody).not.toContain("getUser({ force: true })");
    expect(approveBody).toContain("const getUploaderId = async () =>");
    expect(approveBody).toContain("await supabase.auth.getUser()");
  });

  it("keeps durable post-approval persistence awaited", () => {
    expect(approveBody).toContain("this.ensureUnitAllocationPersisted(suratId, formInputData)");
    expect(approveBody).toContain("await this.finalizeRecommendationRevisionIfNeeded(suratId)");
  });

  it("does not hold approval completion on notification target lookup", () => {
    expect(approveBody).toContain("void this.notifyInboxStepTasks(");
    expect(approveBody).not.toContain("await this.notifyInboxStepTasks(");
  });

  it("removes completed tasks locally and refreshes counters in the background", () => {
    expect(inbox).toContain("const finishInboxTaskLocally = (taskId: string) =>");
    expect(inbox).toContain("previous.filter((item: any) => item.id !== taskId)");
    expect(inbox).toContain("const refreshInboxAfterAction = () =>");
    expect(inbox).toContain("void Promise.allSettled([");
    expect(inbox.match(/finishInboxTaskLocally\(item\.id\);/g)).toHaveLength(3);
  });
});
