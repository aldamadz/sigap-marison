import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const statusMapping = (publicPath) => [{ type: "value", options: {
  0: { text: publicPath ? "Jalur bermasalah" : "Tidak siap", color: publicPath ? "orange" : "red" },
  1: { text: publicPath ? "Terjangkau" : "Siap", color: "green" },
} }];
const expression = (metric, environment, origin = false) =>
  `max(${metric}{job="${origin ? "blackbox_sigap_origin" : "blackbox_sigap_http"}",environment="${environment}",probe_source="${origin ? "origin_direct" : "public"}"})`;

export function updateSigapAvailabilityDashboard(source) {
  if (source.uid !== "sigap-availability" || !Array.isArray(source.panels)) {
    throw new Error("Expected the existing SIGAP availability dashboard");
  }
  const dashboard = structuredClone(source);
  const byId = new Map(dashboard.panels.map(panel => [panel.id, panel]));
  for (const id of [1, 2, 3, 4]) if (!byId.has(id)) throw new Error(`Missing panel ${id}`);
  if (dashboard.panels.some(panel => panel.id >= 17)) throw new Error("Dashboard already extended; review before updating");
  const statusTemplate = structuredClone(byId.get(1));
  const httpTemplate = structuredClone(byId.get(3));
  for (const panel of dashboard.panels) {
    if (panel.gridPos?.y >= 5) panel.gridPos.y += 5;
    for (const target of panel.targets || []) {
      if (target.expr?.includes("sigap_component_")) {
        target.expr = target.expr.replace(/instance="[^"]+"/, 'deployment_host="sigap-app-prod-01"');
      }
    }
    if (panel.description) panel.description = panel.description.replaceAll("10.10.10.241", "192.168.0.251");
    if (panel.fieldConfig?.defaults) panel.fieldConfig.defaults.noValue = "Tidak ada data";
  }
  for (const [id, environment, origin, title] of [
    [1, "production", true, "Aplikasi Production"], [2, "staging", true, "Aplikasi Staging"],
    [3, "production", false, "Akses Publik Production"], [4, "staging", false, "Akses Publik Staging"],
  ]) {
    const panel = byId.get(id);
    Object.assign(panel, structuredClone(statusTemplate), { id, title, gridPos: { x: (id - 1) * 6, y: 0, w: 6, h: 5 } });
    panel.targets = [{ refId: "A", expr: expression("probe_success", environment, origin), instant: true, range: false }];
    panel.description = origin ? "Readiness aplikasi langsung dari IT Monitoring; terpisah dari Cloudflare."
      : "Akses domain publik dari IT Monitoring melalui DNS dan TLS normal. Kegagalan jalur tetap terlihat meskipun aplikasi siap.";
    panel.fieldConfig.defaults.mappings = statusMapping(!origin);
    panel.fieldConfig.defaults.noValue = "Tidak ada data";
  }
  for (const [id, environment, origin, title, x] of [
    [17, "production", true, "HTTP Aplikasi Production", 0], [18, "staging", true, "HTTP Aplikasi Staging", 6],
    [19, "production", false, "HTTP Publik Production", 12], [20, "staging", false, "HTTP Publik Staging", 18],
  ]) {
    const panel = { ...structuredClone(httpTemplate), id, title, gridPos: { x, y: 5, w: 6, h: 5 } };
    panel.targets = [{ refId: "A", expr: expression("probe_http_status_code", environment, origin), instant: true, range: false }];
    panel.description = origin ? "Respons readiness langsung dari aplikasi." : "HTTP 0 berarti tidak menerima respons HTTP; bukan kode error aplikasi.";
    panel.fieldConfig.defaults.noValue = "Tidak ada data";
    dashboard.panels.push(panel);
  }
  const bottom = Math.max(...dashboard.panels.map(panel => panel.gridPos.y + panel.gridPos.h));
  const latency = structuredClone(byId.get(5));
  Object.assign(latency, { id: 21, title: "Latensi aplikasi langsung", gridPos: { x: 0, y: bottom, w: 12, h: 8 } });
  latency.targets = [{ refId: "A", expr: 'probe_duration_seconds{job="blackbox_sigap_origin",probe_source="origin_direct"}', legendFormat: "{{environment}}", range: true }];
  latency.description = "Tidak mencakup perjalanan Cloudflare atau internet publik.";
  const timeline = structuredClone(byId.get(12));
  Object.assign(timeline, { id: 22, title: "Readiness aplikasi", gridPos: { x: 12, y: bottom, w: 12, h: 8 } });
  timeline.targets = [{ refId: "A", expr: 'probe_success{job="blackbox_sigap_origin",probe_source="origin_direct"}', legendFormat: "{{environment}}", range: true }];
  timeline.description = "Kegagalan readiness tetap tercatat; tidak memakai fallback status terakhir atau nilai default sehat.";
  timeline.fieldConfig.defaults.mappings = statusMapping(false);
  dashboard.panels.push(latency, timeline);
  dashboard.version = Number(dashboard.version || 0) + 1;
  return dashboard;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , input, output] = process.argv;
  if (!input || !output) throw new Error("Usage: node availability-dashboard.mjs input.json output.json");
  writeFileSync(output, JSON.stringify(updateSigapAvailabilityDashboard(JSON.parse(readFileSync(input, "utf8"))), null, 2) + "\n");
}
