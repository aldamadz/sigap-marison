import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("PostgREST egress guardrails", () => {
  it("keeps monitoring lists paginated and details on demand", () => {
    const service = read("src/services/surat-monitoring.service.ts");
    expect(service).toContain(".range(from, to)");
    expect(service).toContain("LIST_COLUMNS");
    expect(service).toContain("DETAIL_COLUMNS");
    expect(service).toContain("get_my_surat_monitoring_stats");
  });

  it("does not fetch full monitoring rows from page components", () => {
    const userPage = read("src/pages/surat/MonitoringPage.tsx");
    const adminPage = read("src/pages/admin/AdminMonitoringPage.tsx");
    expect(userPage).not.toContain(".from('surat_registrasi')");
    expect(adminPage).not.toContain(".from('surat_registrasi')");
    expect(userPage).toContain("suratMonitoringService.getPage");
    expect(adminPage).toContain("suratMonitoringService.getPage");
    expect(userPage).not.toContain("selectedSurat._status");
    expect(userPage).toContain("resolveStatus(selectedSurat, detailSignatures)");
  });

  it("aggregates attention in one database call", () => {
    const server = read("server.mjs");
    const start = server.indexOf("const getAttentionStateForUser");
    const end = server.indexOf("const getAttentionStateFromRequest", start);
    const implementation = server.slice(start, end);
    expect(implementation).toContain('rpc("get_attention_state_for_user"');
    expect(implementation).not.toContain('.from("surat_signatures")');
  });

  it("backs off PDF polling while the queue is idle", () => {
    const worker = read("pdf-worker.mjs");
    expect(worker).toContain("PDF_WORKER_MAX_IDLE_POLL_INTERVAL_MS");
    expect(worker).toContain("idlePollIntervalMs * 2");
  });
});
