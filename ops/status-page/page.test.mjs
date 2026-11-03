import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import worker, { buildStatus, loadStatus } from './page.mjs';

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
    totals: ['drive', 'ai', 'sigap', 'marison'].map((service) => ({ service, samples: 10, healthy: 9 })),
  }, NOW);
  assert.equal(data.overall, 'up');
  assert.equal(data.services.length, 4);
  assert.equal(data.services[0].availability, '90.0%');
  assert.equal(data.services[0].history.length, 24);
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

test('D1 queries load recent, weekly and hourly observations', async () => {
  const queries = [];
  const db = { prepare(sql) { queries.push(sql); return { bind() { return { all: async () => ({ results: queries.length === 1 ? rows() : [] }) }; } }; } };
  const status = await loadStatus(db, NOW);
  assert.equal(queries.length, 3);
  assert.equal(status.services.length, 4);
});

test('status API fails closed when D1 is unavailable', async () => {
  const response = await worker.fetch(new Request('https://status.marisoncloud.com/api/status'), { DB: { prepare() { throw new Error('offline'); } } });
  assert.equal(response.status, 503);
  const data = await response.json();
  assert.equal(data.overall, 'unknown');
});
