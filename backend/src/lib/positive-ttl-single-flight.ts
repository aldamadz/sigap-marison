export type PositiveTtlSingleFlightOptions = {
  ttlMs: number;
  maxEntries: number;
  now?: () => number;
};

/**
 * Coalesces concurrent reads for the same key and briefly caches only successful
 * results. Rejected loads are never cached, which keeps authorization checks
 * fail-closed when the upstream is unavailable or rejects a session.
 */
export const createPositiveTtlSingleFlight = <T>({
  ttlMs,
  maxEntries,
  now = Date.now,
}: PositiveTtlSingleFlightOptions) => {
  const values = new Map<string, { expiresAt: number; value: T }>();
  const inFlight = new Map<string, Promise<T>>();

  const prune = (at: number) => {
    for (const [key, entry] of values) {
      if (entry.expiresAt <= at) values.delete(key);
    }
    while (values.size >= maxEntries) {
      const oldestKey = values.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      values.delete(oldestKey);
    }
  };

  const get = (key: string, load: () => Promise<T>): Promise<T> => {
    const at = now();
    const cached = values.get(key);
    if (cached && cached.expiresAt > at) return Promise.resolve(cached.value);
    if (cached) values.delete(key);

    const pending = inFlight.get(key);
    if (pending) return pending;

    const request = load()
      .then((value) => {
        const loadedAt = now();
        prune(loadedAt);
        values.set(key, { expiresAt: loadedAt + ttlMs, value });
        return value;
      })
      .finally(() => {
        inFlight.delete(key);
      });
    inFlight.set(key, request);
    return request;
  };

  return { get };
};
