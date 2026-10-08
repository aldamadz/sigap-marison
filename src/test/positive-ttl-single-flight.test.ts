import { describe, expect, it, vi } from "vitest";
import { createPositiveTtlSingleFlight } from "../../backend/src/lib/positive-ttl-single-flight";

describe("positive TTL single-flight", () => {
  it("coalesces concurrent loads and reuses a successful value within the TTL", async () => {
    let resolveLoad!: (value: string) => void;
    const load = vi.fn(() => new Promise<string>((resolve) => { resolveLoad = resolve; }));
    const cache = createPositiveTtlSingleFlight<string>({ ttlMs: 5_000, maxEntries: 10, now: () => 1_000 });

    const first = cache.get("user:token", load);
    const second = cache.get("user:token", load);
    expect(load).toHaveBeenCalledTimes(1);

    resolveLoad("active");
    await expect(Promise.all([first, second])).resolves.toEqual(["active", "active"]);
    await expect(cache.get("user:token", load)).resolves.toBe("active");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("never caches a rejected authorization check", async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("upstream unavailable"), { statusCode: 503 }))
      .mockResolvedValueOnce(true);
    const cache = createPositiveTtlSingleFlight<boolean>({ ttlMs: 5_000, maxEntries: 10 });

    await expect(cache.get("user:token", load)).rejects.toMatchObject({ statusCode: 503 });
    await expect(cache.get("user:token", load)).resolves.toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("reloads after the TTL and bounds retained successful entries", async () => {
    let now = 0;
    const cache = createPositiveTtlSingleFlight<number>({ ttlMs: 10, maxEntries: 2, now: () => now });
    const load = vi.fn(async () => now);

    await cache.get("a", load);
    now = 5;
    await cache.get("a", load);
    await cache.get("b", load);
    await cache.get("c", load);
    now = 11;
    await cache.get("a", load);

    expect(load).toHaveBeenCalledTimes(4);
  });
});
