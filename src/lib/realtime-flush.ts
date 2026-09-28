/**
 * Batched realtime flush: union of query keys + bounded debounce.
 *
 * Why this exists (root cause proven in docs/REALTIME_MATRIX.md RC-1..RC-3):
 * the previous implementation cleared the pending timer and replaced the key
 * list on every event. Two different table events arriving inside one debounce
 * window cancelled the first flush, so the first event's query group was never
 * refreshed. Under a sustained burst the timer could also be re-armed forever.
 *
 * This primitive instead accumulates keys (union, never replace), flushes after
 * a short quiet window, and guarantees a flush once `maxFlushDelay` elapses no
 * matter how long the burst continues.
 *
 * Contract:
 *  - flush() refetches active queries and invalidates inactive ones, so mounted
 *    views update and stale caches are marked dirty without extra requests.
 *  - filters/pagination are preserved: refetch re-uses the stored query options.
 *  - the primitive cannot start a fetch loop: a flush is triggered only by an
 *    incoming event or the visibility/auth transition hooks.
 */
export type QueryClientLike = {
  refetchQueries: (options: { predicate: (query: any) => boolean; type: "active" }) => Promise<unknown>;
  invalidateQueries: (options: { predicate: (query: any) => boolean; refetchType?: "none" }) => void;
};

export type QueryKeyExtractor = (query: any) => string | undefined;

export type FlushController = {
  /** Register query keys to refresh on the next flush. Idempotent per key. */
  add: (...keys: string[]) => void;
  /** Flush now and reset the pending window. */
  flushNow: () => Promise<void>;
  /** Cancel the pending flush (component teardown). */
  cancel: () => void;
};

const defaultExtractKey: QueryKeyExtractor = (query) =>
  typeof query?.queryKey?.[0] === "string" ? query.queryKey[0] as string : undefined;

export const createRealtimeFlush = (options: {
  queryClient: QueryClientLike;
  extractKey?: QueryKeyExtractor;
  /** Quiet window before a flush. Default 120 ms — short, because events are bursty. */
  debounceMs?: number;
  /** Hard cap so a long burst cannot postpone the flush forever. Default 1000 ms. */
  maxFlushDelayMs?: number;
  /** Test seam; defaults to window.setTimeout when available. */
  scheduler?: (fn: () => void, ms: number) => number;
  clearer?: (id: number) => void;
}): FlushController => {
  const {
    queryClient,
    extractKey = defaultExtractKey,
    debounceMs = 120,
    maxFlushDelayMs = 1000,
    scheduler = (fn, ms) => (typeof window !== "undefined" ? window.setTimeout(fn, ms) : 0),
    clearer = (id) => { if (typeof window !== "undefined") window.clearTimeout(id); },
  } = options;

  const pending = new Set<string>();
  let debounceTimer: number | null = null;
  let capTimer: number | null = null;

  const clearTimers = () => {
    if (debounceTimer !== null) { clearer(debounceTimer); debounceTimer = null; }
    if (capTimer !== null) { clearer(capTimer); capTimer = null; }
  };

  const run = async () => {
    clearTimers();
    if (!pending.size) return;
    // Copy before clearing: `pending` is the same Set reference.
    const keys = new Set(pending);
    pending.clear();

    const matches = (query: any) => {
      const key = extractKey(query);
      return key !== undefined && keys.has(key);
    };
    // Inactive queries are marked stale so a returning view refetches; active
    // ones refetch in place, keeping filters/pagination.
    //
    // invalidateQueries defaults to refetchType: "active", which would refetch
    // active queries here AND again in refetchQueries below (two fetches per
    // flush). Suppress its implicit refetch; the explicit refetchQueries is
    // the single source of fetches for active queries.
    queryClient.invalidateQueries({ predicate: matches, refetchType: "none" });
    await queryClient.refetchQueries({ predicate: matches, type: "active" });
  };

  return {
    add: (...keys: string[]) => {
      if (!keys.length) return;
      for (const key of keys) pending.add(key);

      // Quiet-window timer: coalesce a burst into one flush.
      if (debounceTimer !== null) clearer(debounceTimer);
      debounceTimer = scheduler(run, debounceMs);

      // Cap: once the burst has lasted maxFlushDelayMs, flush regardless.
      if (capTimer === null) {
        capTimer = scheduler(() => { void run(); }, maxFlushDelayMs);
      }
    },
    flushNow: run,
    cancel: () => { clearTimers(); pending.clear(); },
  };
};
