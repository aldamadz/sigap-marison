import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import worker, { probeService, runChecks, SERVICES } from './probe.mjs';

function responseFor(url) {
  const path = new URL(url).pathname;
  if (path === '/health/ready') return Response.json({ status: 'ready' });
  if (path === '/api/health') {
    return Response.json(url.includes('ai.marisoncloud.com') ? { ok: true } : {
      api: 'ok', database: 'ok', storage: 'ok', queue: 'ok', scanner: 'ok',
    });
  }
  return new Response('<!doctype html><html lang="id"></html>', { headers: { 'content-type': 'text/html' } });
}

test('all public and health endpoints produce up observations', async () => {
  const rows = [];
  const db = {
    prepare(sql) {
      return { bind(...values) { rows.push({ sql, values }); return { run: async () => {} }; } };
    },
    batch: async (statements) => assert.equal(statements.length, 8),
  };
  const checkedAt = Date.UTC(2026, 10, 3, 5, 23, 0);
  const result = await runChecks({ DB: db }, checkedAt, async (url) => responseFor(url));
  assert.deepEqual(result.map((item) => item.outcome), ['up', 'up', 'up', 'up']);
  assert.equal(rows.length, 8);
  assert.equal(result[0].slot, Math.floor(checkedAt / 60000));
});

test('unready health is down even when public root renders', async () => {
  const service = SERVICES.find((item) => item.id === 'sigap');
  const result = await probeService(service, async (url) => url.endsWith('/health/ready')
    ? Response.json({ status: 'maintenance' }) : responseFor(url));
  assert.equal(result.outcome, 'down');
  assert.equal(result.reason, 'invalid_health');
});

test('failed public root with ready health is degraded', async () => {
  const service = SERVICES.find((item) => item.id === 'sigap');
  const result = await probeService(service, async (url) => url.endsWith('/health/ready')
    ? responseFor(url) : new Response('Maintenance', { status: 503 }));
  assert.equal(result.outcome, 'degraded');
  assert.equal(result.httpStatus, 503);
});

test('probe rejects invalid health and network failure', async () => {
  const service = SERVICES.find((item) => item.id === 'ai');
  const malformed = await probeService(service, async (url) => url.endsWith('/api/health')
    ? new Response('<html>ok</html>', { headers: { 'content-type': 'text/html' } }) : responseFor(url));
  assert.equal(malformed.outcome, 'down');
  const network = await probeService(service, async () => { throw new Error('offline'); });
  assert.equal(network.outcome, 'down');
  assert.equal(network.reason, 'network');
});

test('public probe URL does not expose an on-demand checker', async () => {
  const response = await worker.fetch();
  assert.equal(response.status, 404);
});
