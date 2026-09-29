// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

/**
 * Behavioral regression test: token refresh must not skip post-reconnect
 * revalidation.
 *
 * The realtime stream is an EventSource. When the auth token refreshes, the
 * stream is torn down and reopened (scheduleRealtimeReconnect). Events that
 * arrive during that gap are lost, so onRealtimeReconnect listeners must fire
 * when the new stream reports 'ready' — they revalidate every surface.
 *
 * The old code reset the `realtimeHasConnected` flag on TOKEN_REFRESHED, so
 * the 'ready' handler treated the reopen as a FIRST connect and skipped
 * notifyReconnect(). Changes during the gap were silently missed.
 *
 * This test drives the real production path: a real BroadcastChannel message
 * (as sent by another tab on token refresh) → session reload → stream reopen
 * → 'ready' → reconnect listeners fire.
 */

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  private listeners = new Map<string, Array<(e: any) => void>>();
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: (e: any) => void) {
    const list = this.listeners.get(type) || [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  removeEventListener() {}
  fire(type: string, data?: any) {
    const event = { data: data !== undefined ? JSON.stringify(data) : "{}" };
    (this.listeners.get(type) || []).forEach((fn) => fn(event));
  }
  close() {
    this.closed = true;
  }
}

describe("realtime reconnect after token refresh", () => {
  beforeEach(() => {
    vi.resetModules();
    MockEventSource.instances = [];
    vi.stubGlobal("EventSource", MockEventSource as any);
    // openRealtimeSource only opens when the page is visible.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  const waitForInstances = async (n: number) => {
    for (let i = 0; i < 200; i++) {
      if (MockEventSource.instances.length >= n) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`timed out waiting for ${n} EventSource instances`);
  };

  it("fires reconnect listeners when the stream reopens after TOKEN_REFRESHED", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session: { user: { id: "u1" } } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { supabase, onRealtimeReconnect } = await import("@/lib/supabase");

    // Subscribe a channel so the stream opens.
    supabase
      .channel("test")
      .on("postgres_changes", { event: "*", table: "agendas" }, () => {})
      .subscribe();

    await waitForInstances(1);
    // First connect: 'ready' sets the has-connected flag, no reconnect yet.
    MockEventSource.instances[0].fire("ready");

    const reconnectSpy = vi.fn();
    onRealtimeReconnect(reconnectSpy);

    // Simulate a token refresh as broadcast by another tab (the real path:
    // authBroadcast.onmessage → loadSession → notifyAuth('TOKEN_REFRESHED')).
    const bc = new BroadcastChannel("sigap-auth");
    bc.postMessage({ event: "TOKEN_REFRESHED" });

    // The stream is torn down and reopened.
    await waitForInstances(2);
    expect(MockEventSource.instances[0].closed).toBe(true);

    // New stream reports ready → reconnect listeners MUST fire so the gap
    // is revalidated. (Old code skipped this.)
    MockEventSource.instances[1].fire("ready");
    expect(reconnectSpy).toHaveBeenCalledTimes(1);

    bc.close();
    await supabase.removeAllChannels();
  });

  it("does not fire reconnect listeners on the very first connect", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ session: null }),
      })
    );

    const { supabase, onRealtimeReconnect } = await import("@/lib/supabase");
    const reconnectSpy = vi.fn();
    onRealtimeReconnect(reconnectSpy);

    supabase
      .channel("test")
      .on("postgres_changes", { event: "*", table: "agendas" }, () => {})
      .subscribe();

    await waitForInstances(1);
    MockEventSource.instances[0].fire("ready");

    // First connect: no gap existed, so no revalidation.
    expect(reconnectSpy).not.toHaveBeenCalled();

    await supabase.removeAllChannels();
  });
});
