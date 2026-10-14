import assert from "node:assert/strict";
import { test } from "node:test";
import { updateSigapAvailabilityDashboard } from "./availability-dashboard.mjs";

const fixture = () => ({ uid: "sigap-availability", version: 3, title: "SIGAP Availability", panels: Array.from({ length: 16 }, (_, index) => ({
  id: index + 1, type: "stat", title: `Panel ${index + 1}`, gridPos: { x: 0, y: index < 4 ? 0 : 5 + index * 5, w: 6, h: 5 },
  fieldConfig: { defaults: { mappings: [] } }, targets: [{ refId: "A", expr: index > 5 ? 'sigap_component_up{job="sigap_components",instance="10.10.10.241:9105"}' : 'probe_success{job="blackbox_sigap_http",probe_source="public"}' }],
})) });

test("application readiness and real public-path failures remain separate", () => {
  const source = fixture(), before = structuredClone(source);
  const result = updateSigapAvailabilityDashboard(source);
  assert.deepEqual(source, before);
  assert.equal(result.uid, source.uid);
  assert.equal(result.version, 4);
  for (const id of [1, 2]) assert.match(result.panels.find(panel => panel.id === id).targets[0].expr, /blackbox_sigap_origin/);
  for (const id of [3, 4]) {
    const panel = result.panels.find(panel => panel.id === id);
    assert.match(panel.targets[0].expr, /blackbox_sigap_http/);
    assert.equal(panel.fieldConfig.defaults.mappings[0].options[0].text, "Jalur bermasalah");
    assert.doesNotMatch(panel.targets[0].expr, /or vector|last_over_time|max_over_time/);
  }
});
test("component selectors survive IP changes without treating no data as healthy", () => {
  const result = updateSigapAvailabilityDashboard(fixture());
  for (const panel of result.panels.filter(panel => panel.targets.some(target => target.expr.includes("sigap_component_")))) {
    assert.match(panel.targets[0].expr, /deployment_host="sigap-app-prod-01"/);
    assert.doesNotMatch(panel.targets[0].expr, /10\.10\.10\.241/);
    assert.equal(panel.fieldConfig.defaults.noValue, "Tidak ada data");
  }
});
test("added panel identities are unique and original rows leave space for HTTP status", () => {
  const result = updateSigapAvailabilityDashboard(fixture());
  assert.equal(new Set(result.panels.map(panel => panel.id)).size, 22);
  for (const id of [17, 18, 19, 20]) assert.equal(result.panels.find(panel => panel.id === id).gridPos.y, 5);
  assert.equal(result.panels.find(panel => panel.id === 7).gridPos.y, fixture().panels.find(panel => panel.id === 7).gridPos.y + 5);
});
test("rejects a different or already transformed dashboard", () => {
  assert.throws(() => updateSigapAvailabilityDashboard({ uid: "other", panels: [] }));
  assert.throws(() => updateSigapAvailabilityDashboard(updateSigapAvailabilityDashboard(fixture())));
});
