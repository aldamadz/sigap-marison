import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import worker, { buildStatus, loadStatus, renderHtml } from './page.mjs';

const NOW = Date.UTC(2026, 10, 3, 5, 30, 0);
const rows = (outcome = 'up', checkedAt = NOW - 15000) => [
  { service: 'drive', checked_at: checkedAt, outcome, latency_ms: 120 },
  { service: 'ai', checked_at: checkedAt, outcome, latency_ms: 140 },
  { service: 'sigap', checked_at: checkedAt, outcome, latency_ms: 170 },
  { service: 'marison', checked_at: checkedAt, outcome, latency_ms: 110 },
];

test('reports all four healthy services and sampled availability', () => {
  const data = buildStatus({
    recent: rows(),
    daily: ['drive', 'ai', 'sigap', 'marison'].map((service) => ({ service, day: '2026-11-03',
      up_count: 9, down_count: 1, degraded_count: 0, first_at: NOW - 600000 })),
  }, NOW);
  assert.equal(data.overall, 'up');
  assert.equal(data.services.length, 4);
  assert.equal(data.services[0].availability, '90.00%');
  assert.equal(data.services[0].history.length, 30);
  assert.equal(data.services[0].history.at(-1).status, 'down');
  assert.equal(data.services[0].history[0].status, 'unknown');
});

test('stale observations never produce a green status', () => {
  const data = buildStatus({ recent: rows('up', NOW - 4 * 60000) }, NOW);
  assert.equal(data.overall, 'unknown');
  assert.ok(data.services.every((service) => service.status === 'unknown'));
});

test('one failing observation is a warning and persistent failures are down', () => {
  const oneFailure = buildStatus({ recent: [rows('down')[0], ...rows().slice(1)] }, NOW);
  assert.equal(oneFailure.services[0].status, 'degraded');
  const persistent = buildStatus({ recent: [
    rows('down')[0],
    { ...rows('down', NOW - 75000)[0] },
    ...rows().slice(1),
  ] }, NOW);
  assert.equal(persistent.services[0].status, 'down');
  assert.equal(persistent.overall, 'down');
});

test('D1 queries load recent, daily, incident and maintenance observations', async () => {
  const queries = [];
  const db = { prepare(sql) { queries.push(sql); const statement = { all: async () => ({ results: queries.length === 1 ? rows() : [] }) }; statement.bind = () => statement; return statement; } };
  const status = await loadStatus(db, NOW);
  assert.equal(queries.length, 6);
  assert.equal(status.services.length, 4);
});

test('SIGAP full maintenance stays visible past its estimate and flags stale sync', () => {
  const data = buildStatus({ recent: rows(), maintenance: [{ id: 'sigap:one', source: 'sigap', impact: 'full',
    title: 'Perbaikan SIGAP', description: 'Pemeliharaan masih berlangsung', service_ids: '["sigap"]',
    starts_at: NOW - 3600000, ends_at: NOW - 60000 }],
  sources: [{ source: 'sigap', synced_at: NOW - 5 * 60000, revision: 2 }] }, NOW);
  assert.equal(data.maintenance.length, 1);
  assert.equal(data.maintenance[0].overdue, true);
  assert.equal(data.maintenance[0].syncStale, true);
  assert.match(renderHtml(data), /Estimasi selesai terlewati/);
  assert.match(renderHtml(data), /Pembaruan jadwal SIGAP belum dapat dipastikan/);
});

test('active incidents and maintenance have a visible timeline', () => {
  const data = buildStatus({
    recent: rows(),
    incidents: [{ id: 'incident-1', title: 'Gangguan pengiriman', summary: 'Pengiriman tertunda',
      severity: 'major', service_ids: '["sigap"]', started_at: NOW - 120000 }],
    updates: [{ id: 'update-1', incident_id: 'incident-1', phase: 'identified',
      message: 'Penyebab sedang diperbaiki', created_at: NOW - 60000 }],
    maintenance: [{ id: 'maintenance-1', title: 'Pembaruan infrastruktur',
      description: 'Pemeliharaan terjadwal', service_ids: '["drive","ai"]',
      starts_at: NOW + 3600000, ends_at: NOW + 7200000 }],
  }, NOW);
  assert.equal(data.overall, 'degraded');
  assert.equal(data.incidents[0].phase, 'identified');
  assert.equal(data.incidents[0].timeline.length, 2);
  assert.deepEqual(data.maintenance[0].serviceNames, ['Maris Drive', 'AI Workspace']);
  assert.match(renderHtml(data), /Pembaruan infrastruktur/);
  assert.match(renderHtml(data), /Penyebab sedang diperbaiki/);
});

test('missing probe data remains unknown even with an active incident', () => {
  const data = buildStatus({ incidents: [{ id: 'incident-1', title: 'Gangguan SIGAP',
    summary: 'Akses pengajuan terputus', severity: 'major', service_ids: '["sigap"]', started_at: NOW }] }, NOW);
  assert.equal(data.overall, 'unknown');
});

test('public incident text is escaped before rendering', () => {
  const data = buildStatus({ incidents: [{ id: 'incident-1', title: '<script>alert(1)</script>',
    summary: 'Testing summary', severity: 'minor', service_ids: '["sigap"]', started_at: NOW }] }, NOW);
  const html = renderHtml(data);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('status API fails closed when D1 is unavailable', async () => {
  const response = await worker.fetch(new Request('https://status.marisoncloud.com/api/status'), { DB: { prepare() { throw new Error('offline'); } } });
  assert.equal(response.status, 503);
  const data = await response.json();
  assert.equal(data.overall, 'unknown');
});

test('page uses a versioned, uncached interaction script', async () => {
  const html = renderHtml(buildStatus({ recent: rows() }, NOW));
  assert.match(html, /src="\/app\.js\?v=20261103-history"/);
  const response = await worker.fetch(new Request('https://status.marisoncloud.com/app.js'), {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(await response.text(), /\.history \.bar/);
});

test('staging preview is labeled without changing the production page', () => {
  const data = buildStatus({ recent: rows() }, NOW);
  assert.match(renderHtml(data, { preview: true }), /Pratinjau staging/);
  assert.doesNotMatch(renderHtml(data), /Pratinjau staging/);
});
