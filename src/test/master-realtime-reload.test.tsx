import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMasterRealtimeReload } from "@/hooks/use-master-realtime-reload";
import { StrictMode, type ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  callbacks: new Map<string, () => void>(), reconnect: null as null | (() => void),
  remove: vi.fn(), unsubscribe: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    channel: () => {
      const channel = { on: (_: string, filter: { table: string }, callback: () => void) => {
        mocks.callbacks.set(filter.table, callback); return channel;
      }, subscribe: vi.fn() };
      return channel;
    }, removeChannel: mocks.remove,
  },
  onRealtimeReconnect: (callback: () => void) => {
    mocks.reconnect = callback; return { unsubscribe: mocks.unsubscribe };
  },
}));

describe("local-state master realtime", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); mocks.callbacks.clear(); });
  afterEach(() => vi.useRealTimers());
  it("batches tables and reconnect, uses a bounded window and preserves visible data", async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useMasterRealtimeReload("master", ["master_offices", "marison_sync_issues"], load));
    await act(async () => {});
    expect(load).toHaveBeenCalledExactlyOnceWith(false);
    act(() => mocks.callbacks.get("master_offices")!());
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    act(() => { mocks.callbacks.get("marison_sync_issues")!(); mocks.reconnect!(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(load.mock.calls).toEqual([[false], [true]]);
  });
  it("single-flights slow loads, retains one trailing reload for missed events", async () => {
    let finish!: () => void;
    const load = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }))
      .mockResolvedValue(undefined);
    renderHook(() => useMasterRealtimeReload("master", ["master_projects"], load));
    await act(async () => {});
    act(() => { for (let n = 0; n < 20; n++) mocks.callbacks.get("master_projects")!(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("manual reload consumes pending realtime work; teardown cancels timers and subscriptions", async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    const hook = renderHook(() => useMasterRealtimeReload("master", ["master_offices"], load));
    await act(async () => {});
    act(() => mocks.callbacks.get("master_offices")!());
    await act(async () => { await hook.result.current(); await vi.advanceTimersByTimeAsync(300); });
    expect(load).toHaveBeenCalledTimes(2);
    act(() => mocks.reconnect!());
    hook.unmount();
    await vi.advanceTimersByTimeAsync(300);
    expect(load).toHaveBeenCalledTimes(2);
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });
  it("does not fetch twice during StrictMode setup/cleanup replay", async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useMasterRealtimeReload("master", ["master_offices"], load), {
      wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
    });
    await act(async () => {});
    expect(load).toHaveBeenCalledExactlyOnceWith(false);
  });
});
