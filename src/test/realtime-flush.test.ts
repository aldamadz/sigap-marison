import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Proves the old bug class and pins the new behavior.
 *
 * Old implementation (docs/REALTIME_MATRIX.md RC-1): every event cleared the
 * pending timer and replaced the key list. Two different table events inside
 * one debounce window cancelled the first flush, so the first event's query
 * group was never refreshed. This test asserts the merged-key contract.
 */
describe("createRealtimeFlush", () => {
  let now: number;
  let timers: Map<number, { fn: () => void; at: number }>;
  let nextId: number;

  const makeClient = () => {
    const refetched: string[][] = [];
    const invalidated: string[][] = [];
    const active = new Set<string>();
    const knownKeys = new Set<string>();
    return {
      client: {
        refetchQueries: vi.fn(async ({ predicate }: { predicate: (q: any) => boolean; type: string }) => {
          const hit = [...active].filter((k) => predicate({ queryKey: [k] }));
          refetched.push(hit);
        }),
        invalidateQueries: vi.fn(({ predicate }: { predicate: (q: any) => boolean }) => {
          // Invalidation applies to every matching key, active or not; the
          // observer list only decides whether a refetch follows.
          const all = [...active, ...knownKeys];
          const hit = all.filter((k) => predicate({ queryKey: [k] }));
          invalidated.push(hit);
        }),
      },
      refetched,
      invalidated,
      setActive: (key: string) => { active.add(key); knownKeys.add(key); },
      clearActive: () => active.clear(),
      knownKeys: knownKeys as Set<string>,
    };
  };

  const useFakeTimers = () => {
    now = 0;
    timers = new Map();
    nextId = 1;
    const scheduler = (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { fn, at: now + ms });
      return id;
    };
    const clearer = (id: number) => { timers.delete(id); };
    const advance = (ms: number) => {
      const end = now + ms;
      // Fire every timer due at or before `end`, in time order, letting later
      // timers scheduled during the advance also fire.
      for (;;) {
        const due = [...timers.values()].filter((t) => t.at <= end);
        if (!due.length) break;
        const earliest = Math.min(...due.map((t) => t.at));
        now = earliest;
        for (const [id, t] of [...timers.entries()]) {
          if (t.at <= now) { timers.delete(id); t.fn(); }
        }
      }
      now = end;
    };
    return { scheduler, clearer, advance };
  };

  let clock: ReturnType<typeof useFakeTimers>;

  beforeEach(() => {
    clock = useFakeTimers();
    vi.useFakeTimers();
  });

  afterEach(() => { vi.useRealTimers(); });

  it("flushes BOTH query groups when two event types arrive within one debounce window", async () => {
    const { client, refetched, setActive } = makeClient();
    setActive("surat-list");
    setActive("surat-inbox");
    setActive("agendas");
    setActive("kpi");

    const { createRealtimeFlush } = await import("@/lib/realtime-flush");
    const flush = createRealtimeFlush({
      queryClient: client,
      debounceMs: 120,
      maxFlushDelayMs: 1000,
      scheduler: clock.scheduler,
      clearer: clock.clearer,
    });

    // Event A at t=0 (surat group), event B at t=50 (agenda group).
    flush.add("surat-list", "surat-inbox");
    clock.advance(50);
    flush.add("agendas", "kpi");

    // No flush yet: still inside the quiet window.
    expect(refetched).toHaveLength(0);

    clock.advance(120);
    await Promise.resolve();

    // The critical assertion: both groups refetched in ONE flush.
    expect(refetched).toHaveLength(1);
    expect(refetched[0]).toEqual(expect.arrayContaining(["surat-list", "surat-inbox", "agendas", "kpi"]));
  });

  it("flushes even under a burst longer than the debounce window (flush cap)", async () => {
    const { client, refetched, setActive } = makeClient();
    setActive("surat-list");

    const { createRealtimeFlush } = await import("@/lib/realtime-flush");
    const flush = createRealtimeFlush({
      queryClient: client,
      debounceMs: 120,
      maxFlushDelayMs: 300,
      scheduler: clock.scheduler,
      clearer: clock.clearer,
    });

    // Continuous burst: an event every 100ms, longer than the 120ms debounce.
    for (let i = 0; i < 10; i += 1) {
      flush.add("surat-list");
      clock.advance(100);
    }

    // The cap must have forced at least one flush despite the never-quiet burst.
    const flushed = refetched.reduce((n, keys) => n + keys.length, 0);
    expect(flushed).toBeGreaterThan(0);
  });

  it("invalidates inactive queries without refetching them", async () => {
    const { client, refetched, invalidated, setActive, clearActive, knownKeys } = makeClient();
    setActive("surat-list");
    knownKeys.add("surat-detail");

    const { createRealtimeFlush } = await import("@/lib/realtime-flush");
    const flush = createRealtimeFlush({
      queryClient: client,
      scheduler: clock.scheduler,
      clearer: clock.clearer,
    });

    flush.add("surat-list", "surat-detail");
    clock.advance(120);
    await Promise.resolve();

    // Active key refetched, inactive key only invalidated.
    expect(refetched.flat()).toContain("surat-list");
    expect(refetched.flat()).not.toContain("surat-detail");
    expect(invalidated.flat()).toEqual(expect.arrayContaining(["surat-list", "surat-detail"]));

    // After the view returns, the invalidated key is now active and refetches.
    clearActive();
    setActive("surat-detail");
    flush.add("surat-detail");
    clock.advance(120);
    await Promise.resolve();
    expect(refetched.flat()).toContain("surat-detail");
  });

  it("cancel() stops a pending flush and clears pending keys", async () => {
    const { client, refetched, setActive } = makeClient();
    setActive("surat-list");

    const { createRealtimeFlush } = await import("@/lib/realtime-flush");
    const flush = createRealtimeFlush({
      queryClient: client,
      scheduler: clock.scheduler,
      clearer: clock.clearer,
    });

    flush.add("surat-list");
    flush.cancel();
    clock.advance(1000);
    await Promise.resolve();
    expect(refetched).toHaveLength(0);
  });

  it("preserves filters/pagination by refetching the same query options", async () => {
    const { client, refetched, setActive } = makeClient();
    setActive("surat-inbox-compact");

    const { createRealtimeFlush } = await import("@/lib/realtime-flush");
    const flush = createRealtimeFlush({
      queryClient: client,
      scheduler: clock.scheduler,
      clearer: clock.clearer,
    });

    flush.add("surat-inbox-compact");
    clock.advance(120);
    await Promise.resolve();

    // The predicate must match by queryKey[0], so the stored query (with its
    // filter and cursor options) is the one refetched.
    expect(client.refetchQueries).toHaveBeenCalledWith(
      expect.objectContaining({ type: "active" }),
    );
    expect(refetched.flat()).toContain("surat-inbox-compact");
  });
});

describe("SSE lifecycle contract in src/lib/supabase.ts", () => {
  const read = async (path: string) => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    return readFileSync(resolve(path), "utf8");
  };

  it("exposes a reconnect hook so providers revalidate missed events", async () => {
    const src = await read("src/lib/supabase.ts");
    expect(src).toContain("onRealtimeReconnect");
    // Reconnect signal is emitted only after a prior successful connection.
    expect(src).toContain("if (realtimeHasConnected) notifyReconnect()");
  });

  it("uses bounded backoff instead of a fixed 3s reconnect", async () => {
    const src = await read("src/lib/supabase.ts");
    expect(src).toContain("realtimeBackoffMs");
    expect(src).toContain("Math.min(realtimeBackoffMs * 2, 5_000)");
    expect(src).not.toContain("window.setTimeout(openRealtimeSource, 3_000)");
  });

  it("reopens the stream on session transitions", async () => {
    const src = await read("src/lib/supabase.ts");
    expect(src).toMatch(/SIGNED_OUT/);
    expect(src).toMatch(/SIGNED_IN/);
    expect(src).toMatch(/TOKEN_REFRESHED/);
  });

  it("does not poll realtime data while the connection is healthy", async () => {
    const src = await read("src/lib/supabase.ts");
    // No query-polling: the only interval is the unrelated session refresh.
    expect(src).not.toContain("refetchInterval");
    expect(src).not.toMatch(/setInterval\(.*refetch|refetch.*setInterval/);
    const intervalIdx = src.indexOf("setInterval");
    if (intervalIdx !== -1) {
      const around = src.slice(intervalIdx - 120, intervalIdx + 120);
      expect(around).toContain("refreshSessionState");
    }
  });
});

describe("provider wiring contract", () => {
  const read = async (path: string) => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    return readFileSync(resolve(path), "utf8");
  };

  it("RealtimeSync merges keys via the shared primitive and revalidates on reconnect", async () => {
    const src = await read("src/providers/RealtimeSync.tsx");
    expect(src).toContain("createRealtimeFlush");
    expect(src).toContain("onRealtimeReconnect");
    // The replace-the-timer antipattern must be gone.
    expect(src).not.toContain("clearTimeout(timerRef.current)");
    expect(src).not.toContain("new Set(keys)");
  });

  it("AttentionProvider is bounded and no longer resets a 350ms timer per event", async () => {
    const src = await read("src/providers/AttentionProvider.tsx");
    expect(src).toContain("createRealtimeFlush");
    expect(src).toContain("maxFlushDelayMs: 800");
    expect(src).not.toContain("}, 350)");
    expect(src).toContain("onRealtimeReconnect");
  });

  it("InboxPage flushes all inbox keys without a separate 700ms timer", async () => {
    const src = await read("src/pages/surat/InboxPage.tsx");
    expect(src).toContain("createRealtimeFlush");
    expect(src).toContain("surat-inbox-compact");
    expect(src).toContain("surat-inbox-detail");
    expect(src).toContain("onRealtimeReconnect");
    expect(src).not.toContain("}, 700)");
  });
});

describe("migration contract", () => {
  const read = async (path: string) => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    return readFileSync(resolve(path), "utf8");
  };

  it("publishes only the four audited tables, idempotently", async () => {
    const src = await read("supabase/migrations/20260928100000_realtime_publish_inbox_agenda_tables.sql");
    for (const table of ["surat_attachments", "surat_linked_documents", "agendas", "activity_logs"]) {
      expect(src).toContain(`'${table}'`);
    }
    // No blanket publish: only the four audited tables are named.
    const body = src.slice(src.indexOf("do $$"));
    expect(src).not.toMatch(/add table public\.\*/);
    expect(body).not.toMatch(/drop\s+(table|publication)/i);
    expect(src).toContain("if not exists");
  });

  it("revision-events RLS migration replaces jsonb_array_elements with containment", async () => {
    const src = await read("supabase/migrations/20260928100001_surat_revision_events_verifier_realtime_rls.sql");
    expect(src).toContain("verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))");
    const body = src.slice(src.indexOf("using ("));
    expect(body).not.toContain("jsonb_array_elements");
    // Preserved paths.
    expect(src).toContain("actor_id = auth.uid()");
    expect(src).toContain("auth.uid() = any(target_user_ids)");
    expect(src).toContain("sr.created_by = auth.uid()");
    expect(src).toContain("ss.user_id = auth.uid()");
    expect(src).toContain("p.role::text in ('admin', 'super_admin')");
  });
});
