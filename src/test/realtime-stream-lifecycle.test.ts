import { createServer, request, IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { createBffRuntime } from "../../backend/src/modules/bff/bff-runtime";

describe("native HTTP SSE lifecycle", () => {
  it("rejects profiles before creating an upstream client", async () => {
    const createClient = vi.fn();
    const runtime = createBffRuntime({
      assertSameOrigin: () => {}, requireCookieSession: () => ({ access_token: "test", user: { id: "owner" } }),
      readJsonBody: async () => ({}), createUserSupabaseClient: createClient,
      getStorageSupabase: () => ({}), sanitizeStoragePath: s => String(s), removeStoragePathPrefix: s => s, storagePathPrefix: "",
    });
    const req = new IncomingMessage(new Socket());
    await expect(runtime.openRealtimeStream(req, new ServerResponse(req), new URL("http://localhost/api/events?tables=profiles"))).rejects.toMatchObject({ status: 400 });
    expect(createClient).not.toHaveBeenCalled();
    req.destroy();
  });
  it("keeps upstream alive after GET ends and removes it when the response closes", async () => {
    const remove = vi.fn(async () => {});
    let onChange: ((payload: unknown) => void) | undefined;
    const channel = {
      on: (_kind: string, _filter: unknown, cb: (payload: unknown) => void) => { onChange = cb; return channel; },
      subscribe: (cb: (status: string) => void) => {
        cb("SUBSCRIBED");
        setTimeout(() => { if (!remove.mock.calls.length) onChange?.({ table: "surat_registrasi", eventType: "UPDATE", new: { status: "SELESAI" } }); }, 30);
      },
    };
    const runtime = createBffRuntime({
      assertSameOrigin: () => {}, requireCookieSession: () => ({ access_token: "test", user: { id: "owner" } }),
      readJsonBody: async () => ({}), createUserSupabaseClient: () => ({ realtime: { setAuth: async () => {} }, channel: () => channel, removeChannel: remove }),
      getStorageSupabase: () => ({}), sanitizeStoragePath: s => String(s), removeStoragePathPrefix: s => s, storagePathPrefix: "",
    });
    const server = createServer((req, res) => { void runtime.openRealtimeStream(req, res, new URL("http://localhost/api/events?tables=surat_registrasi")); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing server address");
    try {
      const received = await new Promise<string>((resolve, reject) => {
        let data = "";
        const req = request(`http://127.0.0.1:${address.port}`, res => {
          res.on("data", chunk => { data += String(chunk); if (data.includes("SELESAI")) { req.destroy(); resolve(data); } });
        });
        const timer = setTimeout(() => { req.destroy(); reject(new Error("SSE event missing after request completion")); }, 1200);
        req.on("close", () => clearTimeout(timer));
        req.on("error", error => { clearTimeout(timer); reject(error); });
        req.end();
      });
      expect(received).toContain("event: ready");
      expect(received).toContain("event: postgres_change");
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
    await vi.waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
  });
});
