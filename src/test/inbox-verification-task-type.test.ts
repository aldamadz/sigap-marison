import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const read = (path: string) => readFileSync(resolve(path), "utf8");

// ============================================================
// Structural contract tests
// ============================================================

describe("inbox verification task_type preserved on detail merge", () => {
  const runtime = read("backend/src/domain-runtime.ts");
  const inboxRuntime = read("backend/src/modules/surat/inbox-runtime.ts");
  const inbox = read("src/pages/surat/InboxPage.tsx");
  const inboxTaskState = read("src/features/surat/inbox/lib/inbox-task-state.ts");

  it("1. InboxPage merges compact + detail instead of replacing", () => {
    // The selected item must keep the compact item's fields (task_type) and
    // only overlay the detail fields. A plain `selectedDetail || selectedCompactItem`
    // replacement loses task_type once the detail loads.
    expect(inbox).toContain("const selectedDetailItem = selectedDetail || detailCache");
    expect(inbox).toContain("...selectedCompactItem");
    expect(inbox).toContain("...(selectedDetailItem || {})");
  });

  it("1b. task_type always comes from the compact queue task", () => {
    // Detail is keyed only by signature. When a user owns both responsibilities
    // on one signature, detail cannot choose which inbox task is selected.
    expect(inbox).toContain("task_type: selectedCompactItem.task_type ?? selectedDetailItem?.task_type");
  });

  it("2. Compact item remains the base of the selected item", () => {
    expect(inbox).toMatch(/const selectedItem = selectedCompactItem\s*\?/);
  });

  it("3. isVerificationTask still keys on canonical task_type", () => {
    expect(inbox).toContain("isVerificationTask");
    expect(inboxTaskState).toContain('export const isVerificationTask = (item: any) => item?.task_type === "verification"');
  });

  it("4. Verification UI still keys on isVerificationTask", () => {
    expect(inbox).toContain("isVerificationTask(selectedItem)");
    expect(inbox).toContain("Alokasi unit perencanaan");
    expect(inbox).toContain("Simpan & lanjutkan");
  });

  it("4b. Verification dead-end exposes canonical Kembalikan ke Pemohon, not permanent reject", () => {
    expect(inbox).toContain("Minta perbaikan");
    expect(inbox).toContain("handleReturnToRequester");
    expect(inbox).toContain("canReturnToRequester(selectedItem)");
    expect(inbox).toContain("targetType: \"requester\"");
    expect(inbox).toContain("requester_edit_required: true");
    expect(inbox).not.toContain("external_submission_revision: true");
  });

  it("5. BFF detail derives task_type with canonical signer/verifier rule", () => {
    // signer (user_id) wins; else verifier_snapshot hit + verification pending
    expect(inboxRuntime).toContain("const isSigner = data.user_id === user.id");
    expect(inboxRuntime).toContain("data.verification_required === true");
    expect(inboxRuntime).toContain('data.verification_status === "pending"');
    expect(inboxRuntime).toContain("const taskType = isSigner");
    expect(inboxRuntime).toContain('task_type: taskType');
  });

  it("6. BFF detail never guesses task_type from label_jabatan", () => {
    const detailBlock = inboxRuntime;
    expect(detailBlock).not.toMatch(/label_jabatan.*task_type/);
    expect(detailBlock).not.toContain("task_type: data.label_jabatan");
  });

  it("7. BFF detail still enforces active-task auth (403 for other users)", () => {
    expect(inboxRuntime).toContain('rpc("is_inbox_task_active"');
    expect(inboxRuntime).toContain("if (!isActive)");
    expect(inboxRuntime).toContain("Task tidak aktif atau tidak ditemukan untuk user ini");
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
    compact
      ? {
          ...compact,
          ...(detail || {}),
          task_type: compact.task_type ?? detail?.task_type,
        }
      : detail;

  it("edge case: compact task_type=verification + detail task_type=null stays verification", () => {
    // A stale/runtime-old detail payload may carry task_type: null (the BFF
    // historically omitted it). Null must NOT overwrite the compact value.
    const compact = { id: "sig-1", task_type: "verification", no_surat: "050/..." };
    const detail = { id: "sig-1", task_type: null, user_id: "u-1", verifier_snapshot: [{ user_id: "u-2" }], verification_required: true, verification_status: "pending" };
    const merged = mergeSelected(compact, detail);
    expect(merged.task_type).toBe("verification");
  });

  it("edge case: 'Alokasi unit perencanaan' panel stays visible with detail task_type=null", () => {
    const shouldInputUnitAllocation = (item: any) =>
      item?.requires_unit_allocation &&
      (item.task_type === "verification" ||
        (item.verification_required !== true && !item.storedAllocation));
    const merged = mergeSelected(
      { task_type: "verification", requires_unit_allocation: true },
      { task_type: null, verification_required: true, verification_status: "pending" },
    );
    expect(shouldInputUnitAllocation(merged)).toBe(true);
  });

  it("edge case: 'Simpan & lanjutkan' button stays visible with detail task_type=null", () => {
    const isVerificationTask = (item: any) => item?.task_type === "verification";
    const merged = mergeSelected(
      { task_type: "verification" },
      { task_type: null, user_id: "u-1" },
    );
    expect(isVerificationTask(merged)).toBe(true);
  });

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

  it("detail may derive approval for a dual-role user, while the compact verification task remains verification", () => {
    const detail = { user_id: "u-1", verifier_snapshot: [{ user_id: "u-1" }], verification_required: true, verification_status: "pending" };
    expect(deriveTaskType(detail, "u-1")).toBe("approval");
    expect(mergeSelected({ task_type: "verification" }, detail).task_type).toBe("verification");
  });
});

describe("verification dead-end recovery — behavioral", () => {
  type VerificationItem = {
    task_type: string | null;
    requires_unit_allocation: boolean;
    project?: { code?: string };
  };
  type UnitLookup = {
    loading: boolean;
    units: string[];
    error: string | null;
  };

  // Mirrors src/pages/surat/InboxPage.tsx canReturnToRequester.
  const canReturnToRequester = (item: VerificationItem, lookup: UnitLookup) =>
    item.task_type === "verification" &&
    item.requires_unit_allocation &&
    (
      !item.project?.code ||
      Boolean(lookup.error) ||
      (!lookup.loading && lookup.units.length === 0)
    );

  const item = (overrides: Partial<VerificationItem> = {}): VerificationItem => ({
    task_type: "verification",
    requires_unit_allocation: true,
    project: { code: "TEST-02" },
    ...overrides,
  });

  it("lookup kosong/gagal/proyek hilang membuat Kembalikan ke Pemohon tersedia", () => {
    expect(canReturnToRequester(item(), { loading: false, units: [], error: null })).toBe(true);
    expect(canReturnToRequester(item(), { loading: false, units: [], error: "Vendor Marison tidak terjangkau" })).toBe(true);
    expect(canReturnToRequester(item({ project: undefined }), { loading: false, units: ["u1"], error: null })).toBe(true);
  });

  it("lookup valid menyembunyikan jalur pengembalian", () => {
    expect(canReturnToRequester(item(), { loading: false, units: ["u1"], error: null })).toBe(false);
    expect(canReturnToRequester(item(), { loading: true, units: [], error: null })).toBe(false);
  });

  it("alasan pengembalian wajib minimal 5 karakter (aturan RPC kanonikal)", () => {
    const reasonValid = (reason: string) => reason.trim().length >= 5;
    expect(reasonValid("")).toBe(false);
    expect(reasonValid("unit")).toBe(false);
    expect(reasonValid("Lookup unit kosong untuk proyek ini")).toBe(true);
  });
});
