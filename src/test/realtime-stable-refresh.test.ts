import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRealtimeFlush } from "@/lib/realtime-flush";

afterEach(() => vi.useRealTimers());

describe("Bounded realtime refresh", () => {
  it("unions events and refetches each active query once without dropping cached data", async () => {
    vi.useFakeTimers();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const first = vi.fn(async () => "updated status");
    const second = vi.fn(async () => "updated badge");
    client.setQueryData(["status"], "approved");
    client.setQueryData(["badge"], "1");
    client.setQueryData(["inactive"], "old");
    const status = new QueryObserver(client, { queryKey: ["status"], queryFn: first });
    const badge = new QueryObserver(client, { queryKey: ["badge"], queryFn: second });
    const offStatus = status.subscribe(() => {});
    const offBadge = badge.subscribe(() => {});
    const flush = createRealtimeFlush({ queryClient: client });
    flush.add("status", "inactive");
    flush.add("badge", "status");
    expect(client.getQueryData(["status"])).toBe("approved");
    await vi.advanceTimersByTimeAsync(120);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(["status"])).toBe("updated status");
    expect(client.getQueryState(["inactive"])?.isInvalidated).toBe(true);
    flush.cancel(); offStatus(); offBadge(); client.clear();
  });

  it("flushes during a sustained burst and cancels pending work on teardown", async () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const refetch = vi.spyOn(client, "refetchQueries").mockResolvedValue();
    const flush = createRealtimeFlush({ queryClient: client, debounceMs: 120, maxFlushDelayMs: 500 });
    for (let index = 0; index < 5; index++) {
      flush.add("status");
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(refetch).toHaveBeenCalledTimes(1);
    flush.add("status"); flush.cancel();
    await vi.advanceTimersByTimeAsync(1000);
    expect(refetch).toHaveBeenCalledTimes(1);
    client.clear();
  });
});
