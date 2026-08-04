import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const read = (path: string) => readFileSync(resolve(path), "utf8");

describe("compact approval inbox", () => {
  const runtime = read("backend/src/domain-runtime.ts");
  const service = read("src/services/surat.service.ts");
  const inbox = read("src/pages/surat/InboxPage.tsx");

  it("1. BFF endpoint GET /api/surat/inbox exists", () => {
    expect(runtime).toContain('"/api/surat/inbox"');
    expect(runtime).toContain("getInboxCompact");
  });

  it("2. BFF endpoint GET /api/surat/inbox/:id/detail exists", () => {
    expect(runtime).toContain('"/api/surat/inbox/"');
    expect(runtime).toContain("getInboxDetail");
  });

  it("3. Server-side filter includes only PROSES and MENUNGGU_PERBAIKAN surat", () => {
    expect(runtime).toContain('"PROSES", "MENUNGGU_PERBAIKAN"');
    expect(runtime).toContain('.in("surat_registrasi.status"');
  });

  it("4. Active signer check: step_order must equal current_step", () => {
    expect(runtime).toContain("isSignatureActiveForInbox");
    expect(runtime).toContain("Number(sig.step_order) !== Number(surat.current_step)");
  });

  it("5. Future signer does not appear: step_order check is server-enforced", () => {
    expect(runtime).toContain("Number(sig.step_order) !== Number(surat.current_step)");
    expect(runtime).toContain("return false");
  });

  it("6. Signer already done does not appear: is_signed=false filter in query", () => {
    expect(runtime).toContain('.eq("is_signed", false)');
  });

  it("7. Verifier/pemeriksa active task included via verifier_snapshot filter", () => {
    expect(runtime).toContain('filter("verifier_snapshot", "cs"');
    expect(runtime).toContain('"verification_status", "pending"');
  });

  it("8. Revision task (MENUNGGU_PERBAIKAN) is included when targeting this user", () => {
    expect(runtime).toContain('suratStatus === "MENUNGGU_PERBAIKAN"');
    expect(runtime).toContain("isRevisionCheckerTask || isRevisionSignerTask");
  });

  it("9. Task deduplication by task_type:id prevents duplicates", () => {
    expect(runtime).toContain("task_type}:${sig.id}");
    expect(runtime).toContain("seen.has(key)");
  });

  it("10. Compact response does NOT include surat_registrasi(*) wildcard", () => {
    expect(runtime).toContain("INBOX_COMPACT_SELECT");
    expect(runtime).not.toMatch(/INBOX_COMPACT_SELECT[\s\S]{0,200}\*,/);
  });

  it("11. Compact response does NOT include form_input_data or data_snapshot fields", () => {
    const selectStart = runtime.indexOf("INBOX_COMPACT_SELECT");
    const selectEnd = runtime.indexOf("`.trim()", selectStart);
    const compactSelect = runtime.slice(selectStart, selectEnd);
    expect(compactSelect).not.toContain("form_input_data");
    expect(compactSelect).not.toContain("data_snapshot,");
  });

  it("12. Pagination returns nextCursor, hasMore, total, pageSize", () => {
    expect(runtime).toContain("nextCursor");
    expect(runtime).toContain("hasMore");
    expect(runtime).toContain("pageSize");
    expect(runtime).toContain("total");
  });

  it("13. Page size is capped at 50", () => {
    expect(runtime).toContain("Math.min(Number(url.searchParams.get(\"limit\"");
    expect(runtime).toContain(", 50)");
  });

  it("14. Detail endpoint enforces authorization: user must be signer or verifier", () => {
    expect(runtime).toContain("isSignerTask && !isVerifierTask");
    expect(runtime).toContain('"Unauthorized"');
    expect(runtime).toContain("err.status = 403");
  });

  it("15. InboxPage uses compact query key and lazy detail, not old getMyInbox", () => {
    expect(service).toContain("getMyInboxCompact");
    expect(service).toContain("getMyInboxDetail");
    expect(inbox).toContain("surat-inbox-compact");
    expect(inbox).toContain("surat-inbox-detail");
    expect(inbox).toContain("inboxHasMore");
    expect(inbox).not.toContain("getMyInbox(user.id)");
  });
});
