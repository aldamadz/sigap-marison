import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const read = (path: string) => readFileSync(resolve(path), "utf8");

// ============================================================
// Structural contract tests
// ============================================================

describe("inbox verification task_type preserved on detail merge", () => {
  const runtime = read("backend/src/domain-runtime.ts");
  const inbox = read("src/pages/surat/InboxPage.tsx");

  it("1. InboxPage merges compact + detail instead of replacing", () => {
    // The selected item must keep the compact item's fields (task_type) and
    // only overlay the detail fields. A plain `selectedDetail || selectedCompactItem`
    // replacement loses task_type once the detail loads.
    expect(inbox).toContain("{ ...selectedCompactItem, ...(selectedDetailItem || {}) }");
    expect(inbox).toContain("const selectedDetailItem = selectedDetail || detailCache");
  });

  it("2. Compact item remains the base of the selected item", () => {
    expect(inbox).toMatch(/const selectedItem = selectedCompactItem\s*\?/);
  });

  it("3. isVerificationTask still keys on canonical task_type", () => {
    expect(inbox).toContain('const isVerificationTask = (item: any) => item?.task_type === "verification"');
  });

  it("4. Verification UI still keys on isVerificationTask", () => {
    expect(inbox).toContain("isVerificationTask(selectedItem)");
    expect(inbox).toContain("Alokasi unit perencanaan");
    expect(inbox).toContain("Simpan & lanjutkan");
  });

  it("5. BFF detail derives task_type with canonical signer/verifier rule", () => {
    // signer (user_id) wins; else verifier_snapshot hit + verification pending
    expect(runtime).toContain("const isSigner = data.user_id === user.id");
    expect(runtime).toContain("data.verification_required === true");
    expect(runtime).toContain('data.verification_status === "pending"');
    expect(runtime).toContain("const taskType = isSigner");
    expect(runtime).toContain('task_type: taskType');
  });

  it("6. BFF detail never guesses task_type from label_jabatan", () => {
    const detailBlock = runtime.slice(
      runtime.indexOf("const getInboxDetail"),
      runtime.indexOf("const getAttentionStateForUser"),
    );
    expect(detailBlock).not.toMatch(/label_jabatan.*task_type/);
    expect(detailBlock).not.toContain("task_type: data.label_jabatan");
  });

  it("7. BFF detail still enforces active-task auth (403 for other users)", () => {
    expect(runtime).toContain('supabase.rpc("is_inbox_task_active"');
    expect(runtime).toContain("if (!isActive)");
    expect(runtime).toContain("err.status = 403");
  });
});

// ============================================================
// Behavioral tests (re-implementation of the canonical logic)
// ============================================================

describe("inbox verification task_type — behavioral", () => {
  // Mirrors backend/src/domain-runtime.ts getInboxDetail task_type derivation.
  const deriveTaskType = (data: any, userId: string): string | null => {
    const isSigner = data.user_id === userId;
    const verifierHit = Array.isArray(data.verifier_snapshot)
      ? data.verifier_snapshot.some((v: any) => v && v.user_id === userId)
      : false;
    return isSigner
      ? "approval"
      : verifierHit && data.verification_required === true && data.verification_status === "pending"
        ? "verification"
        : null;
  };

  // Mirrors src/pages/surat/InboxPage.tsx selectedItem merge.
  const mergeSelected = (compact: any, detail: any) =>
    compact ? { ...compact, ...(detail || {}) } : detail;

  it("compact verification + detail without task_type stays in verification mode", () => {
    // Viewer is the verifier ("u-2"); the signature's assigned signer is "u-1".
    const compact = { id: "sig-1", task_type: "verification", no_surat: "050/..." };
    const detail = { id: "sig-1", user_id: "u-1", verifier_snapshot: [{ user_id: "u-2" }], verification_required: true, verification_status: "pending" };
    const merged = mergeSelected(compact, detail);
    expect(merged.task_type).toBe("verification");
    const fromBff = deriveTaskType(detail, "u-2");
    expect(fromBff).toBe("verification");
  });

  it("the 'Alokasi unit perencanaan' panel condition stays true for verification task", () => {
    const shouldInputUnitAllocation = (item: any) =>
      item?.requires_unit_allocation &&
      (item.task_type === "verification" ||
        (item.verification_required !== true && !item.storedAllocation));
    const merged = mergeSelected(
      { task_type: "verification", requires_unit_allocation: true },
      { verification_required: true, verification_status: "pending" },
    );
    expect(shouldInputUnitAllocation(merged)).toBe(true);
  });

  it("'Simpan & lanjutkan' (isVerificationTask) stays true after merge", () => {
    const isVerificationTask = (item: any) => item?.task_type === "verification";
    const merged = mergeSelected(
      { task_type: "verification" },
      { user_id: "u-2" }, // detail has no task_type
    );
    expect(isVerificationTask(merged)).toBe(true);
  });

  it("approval task stays in approval mode after merge", () => {
    const merged = mergeSelected(
      { task_type: "approval" },
      { user_id: "u-1" },
    );
    expect(merged.task_type).toBe("approval");
    expect(merged.task_type === "verification").toBe(false);
  });

  it("detail of another user's task stays rejected (403 rule)", () => {
    // is_inbox_task_active returns false for a user who is neither signer
    // nor in verifier_snapshot → deriveTaskType yields null and BFF 403s.
    const otherUser = "u-99";
    const detail = { user_id: "u-1", verifier_snapshot: [{ user_id: "u-2" }], verification_required: true, verification_status: "pending" };
    const active = detail.user_id === otherUser ||
      (Array.isArray(detail.verifier_snapshot) && detail.verifier_snapshot.some((v: any) => v && v.user_id === otherUser));
    expect(active).toBe(false);
    expect(deriveTaskType(detail, otherUser)).toBe(null);
  });

  it("signer wins over verifier on overlap (matches RPC NOT EXISTS dedup)", () => {
    const detail = { user_id: "u-1", verifier_snapshot: [{ user_id: "u-1" }], verification_required: true, verification_status: "pending" };
    expect(deriveTaskType(detail, "u-1")).toBe("approval");
  });
});
