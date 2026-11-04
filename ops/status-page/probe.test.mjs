import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import worker, { probeService, runChecks, syncSigapMaintenance, SERVICES } from './probe.mjs';

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
    batch: async (statements) => assert.equal(statements.length, 4),
  };
  const checkedAt = Date.UTC(2026, 10, 3, 5, 23, 0);
  const result = await runChecks({ DB: db }, checkedAt, async (url) => responseFor(url));
  assert.deepEqual(result.map((item) => item.outcome), ['up', 'up']);
  assert.equal(rows.length, 4);
  assert.deepEqual(result.map(item => item.service), ['sigap', 'sigap_staging']);
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
  const service = SERVICES.find((item) => item.id === 'sigap_staging');
  const malformed = await probeService(service, async (url) => url.endsWith('/health/ready')
    ? new Response('<html>ok</html>', { headers: { 'content-type': 'text/html' } }) : responseFor(url));
  assert.equal(malformed.outcome, 'down');
  const network = await probeService(service, async () => { throw new Error('offline'); });
  assert.equal(network.outcome, 'down');
  assert.equal(network.reason, 'network');
  assert.equal(network.httpStatus, null);
});

test('public probe URL does not expose an on-demand checker', async () => {
  const response = await worker.fetch();
  assert.equal(response.status, 404);
});

test('SIGAP maintenance is read through an internal binding and written by revision', async () => {
  const statements = [];
  const db = { prepare(sql) { return { bind(...values) { return { sql, values }; } }; },
    async batch(batch) { statements.push(...batch); } };
  const state = { revision: 4, schedule: { id: '304105fa-918a-465d-9ec8-4db185686e6a',
    category: 'repair', impact: 'full', status: 'published', message: 'Perbaikan layanan',
    startsAt: '2026-11-04T06:00:00.000Z', endsAt: '2026-11-04T08:00:00.000Z' } };
  const env = { DB: db, SIGAP_MAINTENANCE_HOSTNAME: 'sigap.marison-testing.biz.id',
    SIGAP_EDGE: { fetch: async (request) => {
      assert.equal(new URL(request.url).hostname, 'sigap.marison-testing.biz.id');
      return Response.json(state);
    } } };
  assert.equal((await syncSigapMaintenance(env)).scheduleId, state.schedule.id);
  assert.equal(statements.length, 3);
  assert.match(statements[2].sql, /WHERE maintenance.source='sigap'/);
  assert.equal(statements[2].values[0], `sigap:${state.schedule.id}`);
  assert.equal(statements[2].values[3], '["sigap_staging"]');
  state.revision = 5;
  state.schedule.status = 'completed';
  await syncSigapMaintenance(env);
  assert.equal(statements.length, 6);
  assert.match(statements[5].sql, /lifecycle_status=excluded.lifecycle_status/);
  assert.equal(statements[5].values[8], 'completed');
  assert.equal(statements[5].values[10], null);
});

test('invalid or unavailable maintenance state never clears the last known schedule', async () => {
  let writes = 0;
  const env = { DB: { batch() { writes++; } }, SIGAP_MAINTENANCE_HOSTNAME: 'sigap.marisoncloud.com',
    SIGAP_EDGE: { fetch: async () => Response.json({ revision: 1, schedule: { status: 'published' } }) } };
  await assert.rejects(syncSigapMaintenance(env), /invalid/);
  env.SIGAP_EDGE.fetch = async () => new Response('offline', { status: 503 });
  await assert.rejects(syncSigapMaintenance(env), /unavailable/);
  assert.equal(writes, 0);
});
