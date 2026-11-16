import assert from 'node:assert/strict';
import test from 'node:test';
import { ALL_COMPONENTS, COMPONENTS } from './components.mjs';
import { buildStatus, renderHtml } from './page.mjs';
import { receiveTelemetry, telemetryRows, observationStatements } from './telemetry.mjs';

const now = Date.UTC(2026, 10, 4, 3);
const payload = () => ({ version: 1, observedAt: now, components: ['sigap_storage', 'sigap_pdf', 'sigap_sync', 'sigap_outbound', 'sigap_external']
  .map(id => ({ id, status: 'up', reason: 'healthy', latencyMs: 10 })) });
const recent = () => ALL_COMPONENTS.map(item => ({ service: item.id, checked_at: now, outcome: 'up', latency_ms: 10 }));

test('SIGAP components and CCTV preserve original production ID and expandable worker details', () => {
  const data = buildStatus({ recent: recent() }, now);
  assert.deepEqual(data.services.map(item => item.id), ['sigap', 'sigap_staging', 'sigap_storage', 'sigap_services', 'cctv']);
  assert.equal(data.overall, 'up');
  assert.equal(data.services[3].children.length, 4);
  const html = renderHtml(data);
  assert.match(html, /<details class="service-details"><summary>/);
  assert.match(html, /Kondisi tiap service \(4\)/);
  assert.doesNotMatch(html, /data-service="(?:drive|ai|marison)"/);
  assert.equal(COMPONENTS.length, 5);
});

test('group cannot remain UP when one worker is down or stale', () => {
  for (const [outcome, checkedAt, expected] of [['down', now, 'down'], ['up', now - 181000, 'unknown']]) {
    const rows = recent();
    Object.assign(rows.find(item => item.service === 'sigap_pdf'), { outcome, checked_at: checkedAt });
    const data = buildStatus({ recent: rows }, now);
    assert.equal(data.services[3].status, expected);
    assert.equal(data.services[0].status, 'up');
    assert.equal(data.services[2].status, 'up');
  }
});

test('retired service data cannot be repurposed for new component history', () => {
  const data = buildStatus({ recent: [{ service: 'drive', checked_at: now, outcome: 'up' }],
    daily: [{ service: 'drive', day: '2026-11-04', up_count: 100, first_at: now - 6000000 }] }, now);
  assert.equal(data.services[2].status, 'unknown');
  assert.equal(data.services[2].samples, 0);
});

test('telemetry group derives from workers, not storage, and validates exact component set', () => {
  const data = payload(); data.components[0].status = 'down';
  assert.equal(telemetryRows(data, now).at(-1).outcome, 'up');
  data.components[1].status = 'unknown';
  assert.equal(telemetryRows(data, now).at(-1).outcome, 'unknown');
  data.components[2].status = 'down';
  assert.equal(telemetryRows(data, now).at(-1).outcome, 'down');
  assert.throws(() => telemetryRows({ ...data, observedAt: now - 61000 }, now));
  assert.throws(() => telemetryRows({ ...data, components: [...data.components.slice(1), data.components[1]] }, now));
  data.components[0].privateUrl = 'must not be accepted';
  assert.throws(() => telemetryRows(data, now));
});

test('telemetry inserts are immutable per slot and summaries count only inserted observations', () => {
  const queries = [];
  observationStatements({ prepare(sql) { return { bind(...params) { queries.push({ sql, params }); return {}; } }; } }, telemetryRows(payload(), now));
  assert.equal(queries.length, 12);
  assert.ok(queries.filter((_, index) => index % 2 === 0).every(item => item.sql.includes('INSERT OR IGNORE')));
  assert.ok(queries.filter((_, index) => index % 2 === 1).every(item => item.sql.includes('WHERE changes()=1')));
});

test('signed telemetry rejects missing, wrong audience, forged, stale and oversized requests before writes', async () => {
  const keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const pub = Buffer.from(await crypto.subtle.exportKey('spki', keys.publicKey)).toString('base64');
  let writes = 0;
  const env = { COLLECTOR_AUDIENCE: 'probe.test', COLLECTOR_PUBLIC_KEY: pub,
    DB: { prepare() { return { bind() { return {}; } }; }, async batch() { writes++; } } };
  const request = async (body = JSON.stringify(payload()), host = 'probe.test', stamp = now) => {
    const signature = Buffer.from(await crypto.subtle.sign('Ed25519', keys.privateKey,
      new TextEncoder().encode(`${stamp}\n${host}\n/report\n${body}`))).toString('hex');
    return new Request(`https://${host}/report`, { method: 'POST', body, headers: {
      'content-type': 'application/json', 'x-sigap-timestamp': String(stamp), 'x-sigap-signature': signature } });
  };
  assert.equal((await receiveTelemetry(new Request('https://probe.test/report', { method: 'POST' }), env, now)).status, 401);
  assert.equal((await receiveTelemetry(await request(undefined, 'wrong.test'), env, now)).status, 401);
  assert.equal((await receiveTelemetry(await request(undefined, undefined, now - 61000), env, now)).status, 401);
  const forged = await request(); forged.headers.set('x-sigap-signature', '0'.repeat(128));
  assert.equal((await receiveTelemetry(forged, env, now)).status, 401);
  assert.equal((await receiveTelemetry(await request(' '.repeat(8200)), env, now)).status, 413);
  assert.equal(writes, 0);
  assert.equal((await receiveTelemetry(await request(), env, now)).status, 204);
  assert.equal(writes, 1);
});
