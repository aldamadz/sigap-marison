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

  it("persists unit allocation once before approval and removes the redundant post-RPC write", () => {
    expect(approveBody).toContain("if (allocationPersistError) throw allocationPersistError");
    expect(approveBody).not.toContain("ensureUnitAllocationPersisted");
    expect(approveBody).toContain("await this.finalizeRecommendationRevisionIfNeeded(suratId)");
  });

  it("keeps approval database-native without Excel or PDF work on the critical path", () => {
    expect(approveBody).not.toContain("this.transformApprovalExcel(");
    expect(approveBody).not.toContain("this.applyFormInputDataToExcel(");
    expect(approveBody).not.toContain("this.stampApprovalExcel(");
    expect(approveBody).not.toContain("documentPreviewService.enqueuePdf(suratId, { refresh: true, signatureId })");
    expect(approveBody).toContain("native://document/${suratId}/approval/${signatureId}");
  });

  it("uploads attachment files concurrently while preserving input order", () => {
    const uploadBody = service.slice(
      service.indexOf("async uploadAttachmentFiles("),
      service.indexOf("async getAllSurat(", service.indexOf("async uploadAttachmentFiles(")),
    );
    expect(uploadBody).toContain("await Promise.all(files.filter(Boolean).map(async (file, index) =>");
    expect(uploadBody).not.toContain("for (const file of files)");
    expect(uploadBody).toContain("${index}_${safeName}");
  });

  it("does not hold approval completion on notification target lookup", () => {
    expect(approveBody).toContain("void this.sendNotification(");
    expect(approveBody).toContain("void this.notifyInboxStepTasks(");
    expect(approveBody).not.toContain("await this.notifyInboxStepTasks(");
  });

  it("removes completed tasks locally and refreshes counters in the background", () => {
    // Pass B: these helpers live in use-inbox-pagination; InboxPage only
    // invokes them.
    const hook = read("src/features/surat/inbox/lib/use-inbox-pagination.ts");
    expect(hook).toContain("const finishTaskLocally");
    expect(hook).toContain("previous.filter((item: any) => item.id !== taskId)");
    expect(hook).toContain("const refreshAfterAction");
    expect(hook).toContain("void Promise.allSettled([");
    expect(hook).toContain("queryClient.invalidateQueries");
    expect(inbox.match(/finishInboxTaskLocally\(item\.id\);/g)).toHaveLength(3);
  });
});
