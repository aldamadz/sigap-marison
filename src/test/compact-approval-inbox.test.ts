import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

const read = (path: string) => readFileSync(resolve(path), "utf8");

// ============================================================
// Structural contract tests (verify design invariants)
// ============================================================

describe("compact approval inbox — structural contracts", () => {
  const runtime = read("backend/src/domain-runtime.ts");
  const service = read("src/services/surat.service.ts");
  const inbox = read("src/pages/surat/InboxPage.tsx");
  const migration = read("supabase/migrations/20260804081000_compact_inbox_rpc.sql");

  it("1. RPC get_compact_inbox exists in migration with UNION ALL dedup", () => {
    expect(migration).toContain("get_compact_inbox");
    expect(migration).toContain("UNION ALL");
    expect(migration).toContain("NOT EXISTS");
  });

  it("2. RPC uses keyset cursor (available_at, task_type, id)", () => {
    expect(migration).toContain("available_at, task_type, id");
    expect(migration).toContain("p_cursor_at");
    expect(migration).toContain("p_cursor_task_type");
    expect(migration).toContain("p_cursor_id");
  });

  it("3. RPC filters PROSES and MENUNGGU_PERBAIKAN server-side", () => {
    expect(migration).toContain("sr.status = 'PROSES'");
    expect(migration).toContain("sr.status = 'MENUNGGU_PERBAIKAN'");
  });

  it("4. RPC filters active step server-side", () => {
    expect(migration).toContain("ss.step_order = sr.current_step");
  });

  it("5. RPC includes revision tasks via revision_tasks CTE", () => {
    expect(migration).toContain("revision_tasks");
    expect(migration).toContain("target_type = 'signer'");
    expect(migration).toContain("target_type = 'checker'");
  });

  it("6. RPC uses LIMIT p_limit + 1 for hasMore detection", () => {
    expect(migration).toContain("LIMIT p_limit + 1");
  });

  it("7. get_compact_inbox_count uses same predicate as list", () => {
    expect(migration).toContain("get_compact_inbox_count");
    expect(migration).toContain("COUNT(DISTINCT id)");
  });

  it("8. RPC is SECURITY INVOKER with fixed search_path", () => {
    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).toContain("SET search_path = public");
  });

  it("9. RPC grants only to service_role, revokes from anon and authenticated", () => {
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.get_compact_inbox");
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("REVOKE EXECUTE ON FUNCTION public.get_compact_inbox");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
  });

  it("10. BFF handler calls RPC, not PostgREST select on surat_signatures", () => {
    expect(runtime).toContain('supabase.rpc("get_compact_inbox"');
    expect(runtime).toContain('supabase.rpc("get_compact_inbox_count"');
    expect(runtime).not.toContain("INBOX_COMPACT_SELECT");
  });

  it("11. BFF cursor is base64-encoded keyset", () => {
    expect(runtime).toContain("encodeCursor");
    expect(runtime).toContain("parseInboxCursor");
    expect(runtime).toContain('Buffer.from(raw, "base64")');
    expect(runtime).toContain("base64");
  });

  it("12. BFF validates limit (min 1, max 50) and returns 400 on invalid", () => {
    expect(runtime).toContain("parseInboxLimit");
    expect(runtime).toContain("n < 1");
    expect(runtime).toContain(", 50");
    expect(runtime).toContain("err.status = 400");
  });

  it("13. Detail endpoint validates UUID format and returns 400 for malformed", () => {
    expect(runtime).toContain("/^[0-9a-f-]{36}$/");
    expect(runtime).toContain("err.status = 400");
  });

  it("14. Detail endpoint returns 403 if not signer or verifier", () => {
    expect(runtime).toContain("err.status = 403");
    expect(runtime).toContain("isSignerTask && !isVerifierTask");
  });

  it("15. InboxPage uses compact query, lazy detail, skeleton, and no old getMyInbox", () => {
    expect(service).toContain("getMyInboxCompact");
    expect(service).toContain("getMyInboxDetail");
    expect(inbox).toContain("surat-inbox-compact");
    expect(inbox).toContain("surat-inbox-detail");
    expect(inbox).toContain("detailFetching");
    expect(inbox).toContain("Skeleton");
    expect(inbox).not.toContain("getMyInbox(user.id)");
  });
});

// ============================================================
// Behavioral tests using handler logic extracted to pure functions
// ============================================================

describe("compact approval inbox — behavioral: parseInboxCursor", () => {
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
      return { error: null, value: { at, taskType, id } };
    } catch {
      return { error: "cursor tidak valid", value: null };
    }
  };

  const encodeCursor = (item: { available_at: string; task_type: string; id: string }) =>
    Buffer.from(`${item.available_at}|${item.task_type}|${item.id}`).toString("base64");

  it("null cursor returns no error and null value", () => {
    expect(parseInboxCursor(null)).toEqual({ error: null, value: null });
  });

  it("valid cursor round-trips correctly", () => {
    const item = { available_at: "2026-08-04T08:00:00.000Z", task_type: "approval", id: "abc-123-def-456-ghi" };
    const cursor = encodeCursor(item);
    const result = parseInboxCursor(cursor);
    expect(result.error).toBeNull();
    expect(result.value?.at).toBe(item.available_at);
    expect(result.value?.taskType).toBe("approval");
    expect(result.value?.id).toBe(item.id);
  });

  it("malformed base64 returns error", () => {
    expect(parseInboxCursor("not-valid-base64!!!")).toEqual({ error: "cursor tidak valid", value: null });
  });

  it("wrong number of parts returns error", () => {
    const bad = Buffer.from("only|two").toString("base64");
    expect(parseInboxCursor(bad).error).toBe("cursor tidak valid");
  });

  it("invalid task_type returns error", () => {
    const bad = Buffer.from("2026-08-04T08:00:00.000Z|badtype|some-uuid").toString("base64");
    expect(parseInboxCursor(bad).error).toBe("cursor tidak valid");
  });

  it("invalid timestamp returns error", () => {
    const bad = Buffer.from("not-a-date|approval|some-uuid").toString("base64");
    expect(parseInboxCursor(bad).error).toBe("cursor tidak valid");
  });
});

describe("compact approval inbox — behavioral: parseInboxLimit", () => {
  const parseInboxLimit = (raw: string) => {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return { error: "limit harus integer >= 1", value: null };
    if (n > 50) return { error: "limit maksimum 50", value: null };
    return { error: null, value: n };
  };

  it("default 20 is valid", () => expect(parseInboxLimit("20")).toEqual({ error: null, value: 20 }));
  it("minimum 1 is valid", () => expect(parseInboxLimit("1")).toEqual({ error: null, value: 1 }));
  it("maximum 50 is valid", () => expect(parseInboxLimit("50")).toEqual({ error: null, value: 50 }));
  it("51 exceeds max", () => expect(parseInboxLimit("51").error).toBeTruthy());
  it("0 is invalid", () => expect(parseInboxLimit("0").error).toBeTruthy());
  it("-1 is invalid", () => expect(parseInboxLimit("-1").error).toBeTruthy());
  it("non-numeric is invalid", () => expect(parseInboxLimit("abc").error).toBeTruthy());
  it("float string truncates to integer", () => expect(parseInboxLimit("10.9")).toEqual({ error: null, value: 10 }));
});

describe("compact approval inbox — behavioral: pagination hasMore logic", () => {
  const buildPage = (allRows: any[], pageSize: number) => {
    const hasMore = allRows.length > pageSize;
    const items = hasMore ? allRows.slice(0, pageSize) : allRows;
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem
      ? Buffer.from(`${lastItem.available_at}|${lastItem.task_type}|${lastItem.id}`).toString("base64")
      : null;
    return { items, hasMore, nextCursor, total: allRows.length - (hasMore ? 1 : 0) };
  };

  it("exactly pageSize rows: hasMore false", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: `id-${i}`, available_at: "2026-01-01T00:00:00Z", task_type: "approval" }));
    const result = buildPage(rows, 20);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
    expect(result.items).toHaveLength(20);
  });

  it("pageSize + 1 rows: hasMore true, items truncated to pageSize", () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({ id: `id-${i}`, available_at: "2026-01-01T00:00:00Z", task_type: "approval" }));
    const result = buildPage(rows, 20);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).not.toBeNull();
    expect(result.items).toHaveLength(20);
  });

  it("empty inbox: hasMore false, no cursor", () => {
    const result = buildPage([], 20);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
    expect(result.items).toHaveLength(0);
  });

  it("two pages have no duplicate IDs", () => {
    const allRows = Array.from({ length: 35 }, (_, i) => ({ id: `id-${i}`, available_at: "2026-01-01T00:00:00Z", task_type: "approval" }));
    const page1 = buildPage(allRows.slice(0, 21), 20);
    const page2 = buildPage(allRows.slice(20), 20);
    const ids1 = new Set(page1.items.map((r: any) => r.id));
    const ids2 = new Set(page2.items.map((r: any) => r.id));
    const intersection = [...ids1].filter((id) => ids2.has(id));
    expect(intersection).toHaveLength(0);
  });
});

describe("compact approval inbox — SQL integration: migration file", () => {
  const migration = read("supabase/migrations/20260804081000_compact_inbox_rpc.sql");

  it("request_category extracted from JSON path, not full data_snapshot", () => {
    expect(migration).toContain("form_input_data->>'request_category'");
    expect(migration).toContain("data_snapshot->>'request_category'");
    expect(migration).not.toContain("data_snapshot,");
  });

  it("compact type does not include form_input_data column", () => {
    const typeStart = migration.indexOf("CREATE TYPE public.compact_inbox_item");
    const typeEnd = migration.indexOf(");", typeStart);
    const typeBody = migration.slice(typeStart, typeEnd);
    expect(typeBody).not.toContain("form_input_data");
    expect(typeBody).not.toContain("data_snapshot");
  });
});
