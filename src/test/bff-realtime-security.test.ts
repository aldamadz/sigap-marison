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
    const bffRuntime = read("backend/src/modules/bff/bff-runtime.ts");
    const streamStart = bffRuntime.indexOf("const openRealtimeStream");
    const streamEnd = bffRuntime.indexOf("return {", streamStart);
    const stream = bffRuntime.slice(streamStart, streamEnd);

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

describe("realtime table allowlist (PII boundary)", () => {
  const ALLOWED = [
    "activity_logs",
    "agendas",
    "marison_sync_issues",
    "master_offices",
    "master_projects",
    "notifications",
    "surat_attachments",
    "surat_linked_documents",
    "surat_recommendation_tasks",
    "surat_registrasi",
    "surat_revision_events",
    "surat_signatures",
  ];

  it("rejects tables outside REALTIME_ALLOWED_TABLES with 400", () => {
    const bffRuntime = read("backend/src/modules/bff/bff-runtime.ts");

    expect(bffRuntime).toContain("REALTIME_ALLOWED_TABLES");
    for (const table of ALLOWED) {
      expect(bffRuntime).toContain(`"${table}"`);
    }
    // profiles must never be subscribable: its SELECT policy is
    // all-authenticated and postgres_changes ships full rows (nik, email, phone).
    const allowlistStart = bffRuntime.indexOf("REALTIME_ALLOWED_TABLES: ReadonlySet<string> = new Set([");
    const allowlistBlock = bffRuntime.slice(allowlistStart, bffRuntime.indexOf("]);", allowlistStart));
    expect(allowlistStart).toBeGreaterThan(-1);
    expect(allowlistBlock).not.toContain('"profiles"');
    expect(bffRuntime).toContain("rejectedTables");
    expect(bffRuntime).toContain("Tabel realtime tidak diizinkan");
    expect(bffRuntime).toContain("err.status = 400");
  });

  it("never subscribes to profiles from any frontend surface", () => {
    const sources = [
      "src/providers/AttentionProvider.tsx",
      "src/providers/RealtimeSync.tsx",
      "src/pages/admin/OrganizationHierarchyPage.tsx",
      "src/pages/surat/InboxPage.tsx",
      "src/components/surat/SuratForm.tsx",
    ];
    for (const file of sources) {
      const content = read(file);
      expect(content).not.toContain('table: "profiles"');
      expect(content).not.toContain("table: 'profiles'");
    }
  });

  it("does not subscribe to tables outside the publication", () => {
    // Dead subscriptions stayed SUBSCRIBED but never delivered; worse, they
    // would now 400 the whole /api/events stream via the allowlist.
    const deadTables = [
      "master_forms",
      "form_usages",
      "form_usage_departments",
      "form_usage_steps",
      "form_usage_step_users",
      "form_usage_attachment_requirements",
      "master_penggunaan_detail",
      "workflow_allowed_departments",
    ];
    const suratForm = read("src/components/surat/SuratForm.tsx");
    for (const table of deadTables) {
      expect(suratForm).not.toContain(`table: "${table}"`);
    }
  });
});
