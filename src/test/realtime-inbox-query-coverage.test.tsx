import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { RealtimeSync } from "@/providers/RealtimeSync";

const state = vi.hoisted(() => ({ handlers: new Map<string, () => void>(), reconnect: () => {}, remove: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  onRealtimeReconnect: (callback: () => void) => { state.reconnect = callback; return { unsubscribe: vi.fn() }; },
  supabase: { removeChannel: state.remove, channel: () => {
    const channel = { on: (_event: string, filter: { table: string }, callback: () => void) => {
      state.handlers.set(filter.table, callback); return channel;
    }, subscribe: () => channel };
    return channel;
  } },
}));
afterEach(() => { vi.useRealTimers(); state.handlers.clear(); state.remove.mockClear(); });

it.each(["surat_revision_events", "surat_recommendation_tasks", "surat_signatures"])(
  "%s alone updates compact, KPI, detail and monitoring once without blanking cached data", async table => {
    vi.useFakeTimers();
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    const keys = ["surat-inbox-compact", "surat-inbox-kpi", "surat-inbox-detail", "admin-monitoring-list", "surat-linked-documents", "surat-revision-history"];
    const fetches = keys.map(() => vi.fn(async () => "updated"));
    const subscriptions = keys.map((key, index) => {
      client.setQueryData([key, "selected-filter"], "existing");
      return new QueryObserver(client, { queryKey: [key, "selected-filter"], queryFn: fetches[index] }).subscribe(() => {});
    });
    const view = render(<QueryClientProvider client={client}><RealtimeSync /></QueryClientProvider>);
    act(() => { state.handlers.get(table)?.(); state.handlers.get(table)?.(); });
    keys.forEach(key => expect(client.getQueryData([key, "selected-filter"])).toBe("existing"));
    await act(async () => { await vi.advanceTimersByTimeAsync(120); });
    fetches.forEach(fetch => expect(fetch).toHaveBeenCalledTimes(1));
    act(() => state.reconnect());
    await act(async () => { await vi.advanceTimersByTimeAsync(120); });
    fetches.forEach(fetch => expect(fetch).toHaveBeenCalledTimes(2));
    act(() => state.handlers.get(table)?.());
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    fetches.forEach(fetch => expect(fetch).toHaveBeenCalledTimes(2));
    expect(state.remove).toHaveBeenCalledOnce();
    subscriptions.forEach(unsubscribe => unsubscribe()); client.clear();
  },
);
