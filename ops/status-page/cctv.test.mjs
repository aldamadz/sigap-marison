import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { COMPONENTS } from './components.mjs';
import { probeService } from './probe.mjs';
import { buildStatus, renderHtml } from './page.mjs';
import { observationStatements } from './telemetry.mjs';
import { buildCommand } from './operator.mjs';

const cctv = COMPONENTS.find(item => item.id === 'cctv');
const now = Date.parse('2026-11-05T03:00:00Z');
const page = html => new Response(html, { headers: { 'content-type': 'text/html' } });

test('CCTV probes only its branded public login without camera access or credentials', async () => {
  const urls = [];
  const result = await probeService(cctv, async (url, init) => {
    urls.push(url); assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'manual');
    assert.equal(init.headers.authorization, undefined); assert.equal(init.headers.cookie, undefined);
    return page('<html><title>Masuk - CCTV Kos AUB</title></html>');
  }, now);
  assert.deepEqual(urls, ['https://cctv.marisoncloud.com/']);
  assert.equal(result.outcome, 'up'); assert.equal(result.httpStatus, 200);
});

test('CCTV never treats redirects, errors, generic HTML, oversized HTML or network failures as UP', async () => {
  for (const response of [new Response(null, { status: 302, headers: { location: '/login' } }),
    new Response('down', { status: 503 }), page('<html><title>Error</title></html>'),
    page('<html><title>CCTV</title>' + 'x'.repeat(132000))]) {
    assert.equal((await probeService(cctv, async () => response, now)).outcome, 'down');
  }
  const result = await probeService(cctv, async () => { throw Object.assign(Error('timeout'), { name: 'TimeoutError' }); }, now);
  assert.equal(result.outcome, 'down'); assert.equal(result.httpStatus, null); assert.equal(result.reason, 'timeout');
});

test('CCTV starts unknown with no fabricated uptime and exposes its actual probe scope', () => {
  const status = buildStatus({}, now), row = status.services.find(item => item.id === 'cctv');
  assert.equal(row.status, 'unknown'); assert.equal(row.availability, 'Belum cukup data');
  assert.ok(row.history.every(day => day.status === 'unknown'));
  const html = renderHtml(status); assert.match(html, /cctv.marisoncloud.com/); assert.match(html, /bukan kondisi kamera atau rekaman/);
  const command = buildCommand('incident-create', { title: 'CCTV sedang diperiksa', summary: 'Akses halaman login terganggu',
    severity: 'minor', services: ['cctv'], startedAt: new Date(now).toISOString() }, now);
  assert.ok(command.params.includes('["cctv"]'));
});

test('forward CCTV migration preserves every historical column, repeats safely and deduplicates samples', t => {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  db.exec(readFileSync(new URL('migrations/20261104110000_sigap_components.sql', import.meta.url), 'utf8'));
  db.prepare('INSERT INTO component_checks VALUES(?,?,?,?,?,?,?)').run('sigap_staging', 1, now - 60000, 'up', 123, 200, null);
  db.prepare('INSERT INTO component_daily_checks VALUES(?,?,?,?,?,?,?,?)').run('sigap_staging', '2026-11-05', 1, 0, 0, 0, now - 60000, now - 60000);
  const original = () => ['component_checks', 'component_daily_checks'].map(table => db.prepare(`SELECT * FROM ${table} WHERE service<>?`).all('cctv'));
  const before = original();
  const migration = readFileSync(new URL('migrations/20261105090000_cctv_component.sql', import.meta.url), 'utf8');
  db.exec('BEGIN'); db.exec(migration); db.exec('COMMIT'); assert.deepEqual(original(), before);
  const queries = observationStatements({ prepare(sql) { return { bind(...values) { return { sql, values }; } }; } },
    [{ service: 'cctv', slot: Math.floor(now / 60000), checkedAt: now, outcome: 'up', latencyMs: 20, httpStatus: 200, reason: null }]);
  for (let i = 0; i < 2; i++) for (const query of queries) db.prepare(query.sql).run(...query.values);
  assert.equal(db.prepare("SELECT count(*) n FROM component_checks WHERE service='cctv'").get().n, 1);
  assert.equal(db.prepare("SELECT up_count FROM component_daily_checks WHERE service='cctv'").get().up_count, 1);
  db.exec('BEGIN'); db.exec(migration); db.exec('COMMIT'); assert.deepEqual(original(), before);
  assert.equal(db.prepare("SELECT count(*) n FROM component_checks WHERE service='cctv'").get().n, 1);
  assert.throws(() => db.prepare('INSERT INTO component_checks VALUES(?,?,?,?,?,?,?)').run('arbitrary', 1, now, 'up', 1, 200, null));
});
