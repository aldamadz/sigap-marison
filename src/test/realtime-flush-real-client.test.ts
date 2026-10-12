// @vitest-environment jsdom

import { describe, it, expect, afterEach } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { createRealtimeFlush } from "@/lib/realtime-flush";

/**
 * Behavioral regression tests with a REAL QueryClient.
 *
 * The mock-based tests in realtime-flush.test.ts could not catch the
 * double-fetch bug: their invalidateQueries mock never refetched. A real
 * QueryClient's invalidateQueries() defaults to refetchType: "active", so the
 * old flush() — invalidateQueries() followed by refetchQueries() — triggered
 * TWO fetches for every active query on every flush.
 *
 * The fix passes refetchType: "none" to invalidateQueries, making the
 * explicit refetchQueries the single source of fetches for active queries.
 */
describe("createRealtimeFlush with a real QueryClient", () => {
  const clients: QueryClient[] = [];
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    cleanups.splice(0).forEach((fn) => fn());
    clients.splice(0).forEach((c) => c.clear());
  });

  const makeActiveQuery = async (key: string) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    clients.push(queryClient);
    let fetchCount = 0;
    const queryKey = [key];
    queryClient.setQueryDefaults(queryKey, {
      queryFn: async () => {
        fetchCount++;
        return [];
      },
      // Fresh forever so mounting the observer does not trigger its own fetch.
      staleTime: Infinity,
    });
    await queryClient.prefetchQuery({ queryKey });
    expect(fetchCount).toBe(1);
    // Mount an observer: the query is now "active", like a visible page.
    const observer = new QueryObserver(queryClient, { queryKey });
    const unsubscribe = observer.subscribe(() => {});
    cleanups.push(unsubscribe);
    expect(fetchCount).toBe(1);
    return { queryClient, getFetchCount: () => fetchCount };
  };

  it("flush triggers exactly ONE fetch for an active query", async () => {
    const { queryClient, getFetchCount } = await makeActiveQuery("surat-list");

    const flush = createRealtimeFlush({ queryClient });
    cleanups.push(() => flush.cancel());
    flush.add("surat-list");
    await flush.flushNow();

    // One refetch — not two. (Old code: invalidateQueries refetched via its
    // default refetchType "active", then refetchQueries fetched again.)
    expect(getFetchCount()).toBe(2);
  });

  it("flush marks inactive queries stale without fetching them", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    clients.push(queryClient);
    let fetchCount = 0;
    const queryKey = ["agendas"];
    queryClient.setQueryDefaults(queryKey, {
      queryFn: async () => {
        fetchCount++;
        return [];
      },
      staleTime: Infinity,
    });
    // Fetched once, left inactive (no observers) — like a backgrounded view.
    await queryClient.prefetchQuery({ queryKey });
    expect(fetchCount).toBe(1);

    const flush = createRealtimeFlush({ queryClient });
    cleanups.push(() => flush.cancel());
    flush.add("agendas");
    await flush.flushNow();

    expect(fetchCount).toBe(1);
    expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true);
  });

  it("a burst coalesced into one flush fetches an active query once", async () => {
    const { queryClient, getFetchCount } = await makeActiveQuery("surat-inbox");

    // Two events for the same key inside one debounce window: one flush.
    const flush = createRealtimeFlush({ queryClient });
    cleanups.push(() => flush.cancel());
    flush.add("surat-inbox");
    flush.add("surat-inbox");
    await flush.flushNow();

    expect(getFetchCount()).toBe(2);
  });
});
