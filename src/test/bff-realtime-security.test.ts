import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("user-scoped BFF realtime stream", () => {
  it("uses one browser EventSource instead of data polling", () => {
    const client = read("src/lib/supabase.ts");
    const attention = read("src/providers/AttentionProvider.tsx");

    expect(client).toContain("new EventSource(`/api/events?tables=");
    expect(client).toContain("postgres_change");
    expect(client).not.toContain("eventType: 'POLL'");
    expect(client).not.toContain("15_000");
    expect(attention).not.toContain("refetchInterval");
    expect(attention).not.toContain("/api/attention/stream");
    expect(attention).toContain('table: "surat_registrasi"');
    expect(attention).toContain('table: "surat_signatures"');
  });

  it("subscribes upstream with the user's JWT and cleans up every connection", () => {
    const server = read("backend/src/domain-runtime.ts");
    const streamStart = server.indexOf("const openBffRealtimeStream");
    const streamEnd = server.indexOf("const buildPasswordResetEmailHtml", streamStart);
    const stream = server.slice(streamStart, streamEnd);

    expect(streamStart).toBeGreaterThan(-1);
    expect(stream).toContain("requireCookieSession(req)");
    expect(stream).toContain("client.realtime.setAuth(session.access_token)");
    expect(stream).toContain('"Content-Type": "text/event-stream; charset=utf-8"');
    expect(stream).toContain('"X-Accel-Buffering": "no"');
    expect(stream).toContain("client.removeChannel(channel)");
    expect(stream).toContain("payload.new || {}");
    expect(stream).toContain("payload.old || {}");
  });
});
