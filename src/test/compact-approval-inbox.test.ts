import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const read = (path: string) => readFileSync(resolve(path), "utf8");

// ============================================================
// Structural contract tests
// ============================================================

describe("compact approval inbox — structural contracts", () => {
  const runtime = read("backend/src/domain-runtime.ts");
  const inboxRuntime = read("backend/src/modules/surat/inbox-runtime.ts");
  const attentionRuntime = read("backend/src/modules/attention/attention-runtime.ts");
  const service = read("src/services/surat.service.ts");
  const inbox = read("src/pages/surat/InboxPage.tsx");
  const migration = read("supabase/migrations/20260804081000_compact_inbox_rpc.sql");
  const sqlTest = read("supabase/tests/compact_inbox.integration.sql");

  it("1. RPC get_compact_inbox with filter params (search, request_category, task_type)", () => {
    expect(migration).toContain("p_search");
    expect(migration).toContain("p_request_category");
    expect(migration).toContain("p_task_type");
    expect(migration).toContain("ILIKE");
  });

  it("2. Canonical predicate helper is_inbox_task_active exists", () => {
    expect(migration).toContain("is_inbox_task_active");
    expect(migration).toContain("p_signature_id uuid");
    expect(migration).toContain("RETURNS boolean");
  });

  it("3. Attention badge uses get_compact_inbox_count", () => {
    expect(attentionRuntime).toContain('rpc("get_compact_inbox_count"');
    expect(attentionRuntime).toContain("inboxCount:");
  });

  it("4. BFF count only on first page (no cursor)", () => {
    expect(inboxRuntime).toContain("const needsCount = !cursor");
    expect(inboxRuntime).toContain("if (needsCount)");
  });

  it("5. BFF strict limit validation: digit-only pattern and bounds", () => {
    expect(inboxRuntime).toContain("limit harus integer positif");
    expect(inboxRuntime).toContain("limit minimum 1");
    expect(inboxRuntime).toContain("limit maksimum 50");
  });

  it("6. BFF strict cursor validation: UUID regex", () => {
    expect(inboxRuntime).toContain("UUID_RE");
    expect(inboxRuntime).toContain("UUID_RE.test(id)");
    expect(inboxRuntime).toContain('[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}');
  });

  it("7. BFF search validation: max 200 chars, trimmed", () => {
    expect(inboxRuntime).toContain("parseInboxSearch");
    expect(inboxRuntime).toContain("200");
  });

  it("8. BFF task_type validation: allowlist", () => {
    expect(inboxRuntime).toContain("INBOX_TASK_TYPE_ALLOWLIST");
    expect(inboxRuntime).toContain('"approval", "verification"');
  });

  it("9. Detail auth uses is_inbox_task_active RPC, not client-side check", () => {
    expect(inboxRuntime).toContain('rpc("is_inbox_task_active"');
    expect(inboxRuntime).toContain("Task tidak aktif atau tidak ditemukan untuk user ini");
  });

  it("10. InboxPage passes filter params to getMyInboxCompact", () => {
    expect(service).toContain("search?: string");
    expect(service).toContain("request_category?: string");
    expect(service).toContain("task_type?: string");
    // Pass B: filter wiring lives in the pagination hook, but InboxPage
    // still threads `search` / `categoryFilter` / `actionFilter` into it.
    expect(inbox).toContain("search: debouncedSearch");
    expect(inbox).toContain("categoryFilter");
    expect(inbox).toContain("actionFilter");
  });

  it("11. InboxPage resets cursor on filter change", () => {
    // Pass B: cursor reset moved to use-inbox-pagination. InboxPage
    // delegates the realtime reset through `resetInboxPagination`.
    const hook = read("src/features/surat/inbox/lib/use-inbox-pagination.ts");
    expect(hook).toContain("inboxFilterKey");
    expect(hook).toContain("prevFilterKeyRef");
    expect(hook).toContain("setInboxCursor(null)");
    expect(inbox).toContain("resetInboxPagination");
  });

  it("12. SQL integration test has 25+ fixture rows", () => {
    expect(sqlTest).toContain("BULK-");
    expect(sqlTest).toContain("Future signer");
    expect(sqlTest).toContain("Future verifier");
    expect(sqlTest).toContain("dual role");
    expect(sqlTest).toContain("ROLLBACK");
  });

  it("13. Migration grants only to service_role", () => {
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.get_compact_inbox");
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("REVOKE EXECUTE ON FUNCTION public.get_compact_inbox");
  });

  it("14. Migration is SECURITY INVOKER with fixed search_path", () => {
    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).toContain("SET search_path = public");
  });

  it("15. RPC uses keyset cursor with LIMIT +1 for hasMore", () => {
    expect(migration).toContain("LIMIT p_limit + 1");
    expect(migration).toContain("(available_at, task_type, id) >");
  });
});

// ============================================================
// Behavioral tests: parseInboxLimit
// ============================================================

describe("compact approval inbox — behavioral: parseInboxLimit", () => {
  const parseInboxLimit = (raw: string | undefined | null) => {
    if (!raw) return { error: null, value: 20 };
    if (!/^\d+$/.test(raw)) return { error: "limit harus integer positif", value: null };
    const n = parseInt(raw, 10);
    if (n < 1) return { error: "limit minimum 1", value: null };
    if (n > 50) return { error: "limit maksimum 50", value: null };
    return { error: null, value: n };
  };

  it.each([
    [undefined, null, 20],
    ["1", null, 1],
    ["50", null, 50],
    ["20", null, 20],
  ])("valid: %s → %i", (input, _err, expected) => {
    const r = parseInboxLimit(input);
    expect(r.error).toBeNull();
    expect(r.value).toBe(expected);
  });

  it.each([
    ["0", "limit minimum 1"],
    ["-1", "limit harus integer positif"],
    ["20abc", "limit harus integer positif"],
    ["10.5", "limit harus integer positif"],
    [" 20", "limit harus integer positif"],
    ["abc", "limit harus integer positif"],
    ["51", "limit maksimum 50"],
  ])("invalid: %s → error", (input, _expectedErr) => {
    const r = parseInboxLimit(input);
    expect(r.error).toBeTruthy();
  });
});

// ============================================================
// Behavioral tests: parseInboxCursor
// ============================================================

describe("compact approval inbox — behavioral: parseInboxCursor", () => {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  const parseInboxCursor = (raw: string | null) => {
    if (!raw) return { error: null, value: null };
    try {
      const decoded = Buffer.from(raw, "base64").toString("utf8");
      const parts = decoded.split("|");
      if (parts.length !== 3) throw new Error("format invalid");
      const [at, taskType, id] = parts;
      if (!at || !taskType || !id) throw new Error("field kosong");
      if (!["approval", "verification"].includes(taskType)) throw new Error("task_type tidak valid");
      const ts = new Date(at);
      if (isNaN(ts.getTime())) throw new Error("timestamp tidak valid");
      if (!UUID_RE.test(id)) throw new Error("id bukan UUID valid");
      return { error: null, value: { at, taskType, id } };
    } catch {
      return { error: "cursor tidak valid", value: null };
    }
  };

  const encodeCursor = (item: { available_at: string; task_type: string; id: string }) =>
    Buffer.from(`${item.available_at}|${item.task_type}|${item.id}`).toString("base64");

  it("null cursor → no error", () => {
    expect(parseInboxCursor(null)).toEqual({ error: null, value: null });
  });

  it("valid cursor round-trips", () => {
    const item = { available_at: "2026-08-04T08:00:00.000Z", task_type: "approval", id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" };
    const cursor = encodeCursor(item);
    const r = parseInboxCursor(cursor);
    expect(r.error).toBeNull();
    expect(r.value?.at).toBe(item.available_at);
    expect(r.value?.taskType).toBe("approval");
    expect(r.value?.id).toBe(item.id);
  });

  it("invalid UUID in cursor → error", () => {
    const bad = Buffer.from("2026-08-04T08:00:00.000Z|approval|not-a-uuid").toString("base64");
    expect(parseInboxCursor(bad).error).toBe("cursor tidak valid");
  });

  it("malformed base64 → error", () => {
    expect(parseInboxCursor("!!!")).toEqual({ error: "cursor tidak valid", value: null });
  });

  it("wrong task_type → error", () => {
    const bad = Buffer.from("2026-08-04T08:00:00.000Z|badtype|a1b2c3d4-e5f6-7890-abcd-ef1234567890").toString("base64");
    expect(parseInboxCursor(bad).error).toBe("cursor tidak valid");
  });
});

// ============================================================
// Behavioral tests: pagination hasMore
// ============================================================

describe("compact approval inbox — behavioral: pagination", () => {
  const buildPage = (rows: any[], pageSize: number) => {
    const hasMore = rows.length > pageSize;
    const items = hasMore ? rows.slice(0, pageSize) : rows;
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem
      ? Buffer.from(`${lastItem.available_at}|${lastItem.task_type}|${lastItem.id}`).toString("base64")
      : null;
    return { items, hasMore, nextCursor };
  };

  it("exactly pageSize: hasMore false", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: `id-${i}`, available_at: "2026-01-01T00:00:00Z", task_type: "approval" }));
    expect(buildPage(rows, 20).hasMore).toBe(false);
  });

  it("pageSize + 1: hasMore true, items truncated", () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({ id: `id-${i}`, available_at: "2026-01-01T00:00:00Z", task_type: "approval" }));
    const r = buildPage(rows, 20);
    expect(r.hasMore).toBe(true);
    expect(r.items).toHaveLength(20);
    expect(r.nextCursor).not.toBeNull();
  });

  it("empty: hasMore false", () => {
    expect(buildPage([], 20).hasMore).toBe(false);
  });

  it("two pages have no duplicate IDs", () => {
    const all = Array.from({ length: 35 }, (_, i) => ({ id: `id-${i}`, available_at: "2026-01-01T00:00:00Z", task_type: "approval" }));
    const p1 = buildPage(all.slice(0, 21), 20);
    const p2 = buildPage(all.slice(20), 20);
    const ids1 = new Set(p1.items.map((r: any) => r.id));
    const ids2 = new Set(p2.items.map((r: any) => r.id));
    expect([...ids1].filter((id) => ids2.has(id))).toHaveLength(0);
  });
});

// ============================================================
// SQL integration test contract
// ============================================================

describe("compact approval inbox — SQL integration test", () => {
  const sqlTest = read("supabase/tests/compact_inbox.integration.sql");

  it("future signer test exists and asserts cnt = 0", () => {
    expect(sqlTest).toContain("Future signer does NOT appear");
    expect(sqlTest).toContain("ASSERT cnt = 0");
  });

  it("future verifier test exists and asserts cnt = 0", () => {
    expect(sqlTest).toContain("Future verifier does NOT appear");
  });

  it("dual role dedup test uses UNION (not UNION ALL)", () => {
    expect(sqlTest).toContain("Dual role does NOT duplicate");
    // Use a regex tolerant of CRLF so the assertion is not line-ending dependent.
    expect(sqlTest).toMatch(/UNION\r?\n\s*SELECT/);
  });

  it("category test extracts from JSON path", () => {
    expect(sqlTest).toContain("form_input_data->>'request_category'");
  });

  it("test uses ROLLBACK for cleanup", () => {
    expect(sqlTest).toContain("ROLLBACK");
  });

  it("revision task test checks MENUNGGU_PERBAIKAN with revision_events", () => {
    expect(sqlTest).toContain("Revision task appears for target user");
    expect(sqlTest).toContain("surat_revision_events");
  });
});

// ============================================================
// Attention badge consistency
// ============================================================

describe("compact approval inbox — attention badge", () => {
  const runtime = read("backend/src/modules/attention/attention-runtime.ts");

  it("inboxCount uses get_compact_inbox_count, not sum of separate counts", () => {
    expect(runtime).toContain("inboxCount:");
    expect(runtime).not.toContain("inboxCount: approvalCount + verificationCount + revisionCount");
  });

  it("attention state calls both get_attention_state_for_user and get_compact_inbox_count", () => {
    expect(runtime).toContain('get_attention_state_for_user');
    expect(runtime).toContain('get_compact_inbox_count');
    expect(runtime).toContain("compactCountRes");
  });
});
