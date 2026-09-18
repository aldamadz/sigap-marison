import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getInboxTaskKey, getInboxTaskSignatureId } from "@/features/surat/inbox/lib/inbox-task-state";

const read = (path: string) => readFileSync(resolve(path), "utf8");

describe("inbox dual-role task queue", () => {
  const inbox = read("src/pages/surat/InboxPage.tsx");
  const hook = read("src/features/surat/inbox/lib/use-inbox-pagination.ts");

  it("keeps approval and verification tasks distinct for one signature", () => {
    const signatureId = "12d22d3b-a790-4a1f-bf34-48911a2188d3";
    const approvalKey = getInboxTaskKey({ id: signatureId, task_type: "approval" });
    const verificationKey = getInboxTaskKey({ id: signatureId, task_type: "verification" });

    expect(approvalKey).toBe(`approval:${signatureId}`);
    expect(verificationKey).toBe(`verification:${signatureId}`);
    expect(new Set([approvalKey, verificationKey])).toHaveLength(2);
    expect(getInboxTaskSignatureId(verificationKey!)).toBe(signatureId);
  });

  it("uses the composite task key for pagination, selection, and local completion", () => {
    expect(hook).toContain("prev.map(getInboxTaskKey)");
    expect(hook).toContain("getInboxTaskKey(item) !== taskKey");
    expect(inbox).toContain("getInboxTaskKey(item) === requestedTaskKey");
    expect(inbox).toContain("const active = selectedTaskKey === taskKey");
  });

  it("keeps a legacy signature-only link scoped to that signature", () => {
    expect(inbox).toContain("filteredInbox.find((item: any) => item.id === requestedTaskKey)");
  });

  it("rejects malformed task identities rather than conflating them", () => {
    expect(getInboxTaskKey({ id: "signature", task_type: "other" })).toBeNull();
    expect(getInboxTaskKey({ task_type: "approval" })).toBeNull();
    expect(getInboxTaskSignatureId("malformed")).toBeNull();
  });
});
