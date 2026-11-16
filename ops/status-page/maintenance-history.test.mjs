import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { syncSigapMaintenance } from './probe.mjs';
import { buildStatus, loadFeed, loadStatus, renderHtml } from './page.mjs';
import { ALL_COMPONENTS } from './components.mjs';

const NOW = Date.parse('2026-11-04T04:30:00Z');
const ID = '5947c210-1819-42d5-84a2-75c7ae31df2b';
const schedule = (status = 'published') => ({ id: ID, category: 'repair', impact: 'full', status,
  message: 'Pengujian layanan terjadwal', startsAt: '2026-11-04T03:22:33.830Z', endsAt: '2026-11-04T04:22:33.830Z' });
const recent = ALL_COMPONENTS.map(({ id: service }) => ({ service, checked_at: NOW, outcome: 'up', latency_ms: 20 }));

function fixture(t, legacy = false) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of ['schema.sql', 'migrations/20261103090000_history_events.sql',
    'migrations/20261103110000_sigap_maintenance_sync.sql', 'migrations/20261104110000_sigap_components.sql']) {
    sqlite.exec(readFileSync(new URL(file, import.meta.url), 'utf8'));
  }
  const db = { prepare(sql) {
    const statement = { sql, values: [], bind(...values) { this.values = values; return this; },
      async all() { return { results: sqlite.prepare(sql).all(...this.values) }; },
      async run() { return sqlite.prepare(sql).run(...this.values); } };
    return statement;
  }, async batch(statements) {
    sqlite.exec('BEGIN');
    try { for (const stmt of statements) sqlite.prepare(stmt.sql).run(...stmt.values); sqlite.exec('COMMIT'); }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
  const migrate = () => sqlite.exec(readFileSync(new URL('migrations/20261104130000_maintenance_lifecycle_history.sql', import.meta.url), 'utf8'));
  if (!legacy) migrate();
  let state = { revision: 1, schedule: schedule() };
  const env = { DB: db, SIGAP_MAINTENANCE_HOSTNAME: 'sigap.marisoncloud.com',
    SIGAP_EDGE: { fetch: async () => Response.json(state) } };
  return { sqlite, db, env, migrate, setState: value => { state = value; }, row: () => sqlite.prepare('SELECT * FROM maintenance WHERE id=?').get(`sigap:${ID}`) };
}

test('completion remains in history, not active schedules or an unresolved incident', async t => {
  const f = fixture(t);
  await syncSigapMaintenance(f.env, NOW - 3600000);
  f.setState({ revision: 2, schedule: schedule('completed') });
  await syncSigapMaintenance(f.env, NOW);
  assert.equal(f.row().lifecycle_status, 'completed');
  assert.equal(f.row().cancelled_at, null);
  assert.equal(f.row().closed_at, NOW);
  const data = buildStatus({ maintenance: [f.row()], recent }, NOW);
  assert.equal(data.overall, 'up');
  assert.equal(data.maintenance.length, 0);
  assert.equal(data.incidents.length, 0);
  assert.equal(data.history[0].kind, 'maintenance');
  assert.equal(data.history[0].timeline.length, 3);
  assert.match(renderHtml(data), /Pemeliharaan terjadwal: Perbaikan SIGAP/);
  assert.match(renderHtml(data), /Selesai terpantau/);
  assert.match(renderHtml(data), /Pengujian layanan terjadwal/);
  assert.equal((await loadStatus(f.db, NOW)).history.length, 1);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM incidents').get().n, 0);
});

test('repeated completed sync preserves first closure time and stable RSS identity', async t => {
  const f = fixture(t);
  f.setState({ revision: 2, schedule: schedule('completed') });
  await syncSigapMaintenance(f.env, NOW);
  const first = await loadFeed(f.db, NOW);
  await syncSigapMaintenance(f.env, NOW + 60000);
  assert.equal(f.row().closed_at, NOW);
  const second = await loadFeed(f.db, NOW + 60000);
  assert.deepEqual(first.map(x => x.id), second.map(x => x.id));
  assert.match(second.find(x => x.id.startsWith('maintenance-closed:')).title, /Selesai terpantau/);
});

test('old completion mislabeled cancelled is repaired only from current authoritative state', async t => {
  const f = fixture(t, true);
  f.sqlite.prepare(`INSERT INTO maintenance (id,title,description,service_ids,starts_at,ends_at,created_at,cancelled_at,source,impact)
    VALUES (?, 'Perbaikan SIGAP', 'Pengujian layanan terjadwal', '["sigap"]', ?, ?, ?, ?, 'sigap', 'full')`)
    .run(`sigap:${ID}`, NOW - 7200000, NOW - 3600000, NOW - 7300000, NOW - 3500000);
  f.migrate();
  assert.equal(f.row().lifecycle_status, 'unknown');
  assert.equal(buildStatus({ maintenance: [f.row()] }, NOW).history[0].phaseLabel, 'Jadwal ditutup');
  f.setState({ revision: 2, schedule: schedule('completed') });
  await syncSigapMaintenance(f.env, NOW);
  assert.equal(f.row().lifecycle_status, 'completed');
  assert.equal(f.row().closed_at, NOW - 3500000);
  assert.equal(f.row().cancelled_at, null);
});

test('stale polls cannot resurrect a completed schedule; cancellation stays distinct', async t => {
  const f = fixture(t);
  f.setState({ revision: 2, schedule: schedule('completed') });
  await syncSigapMaintenance(f.env, NOW);
  f.setState({ revision: 1, schedule: schedule() });
  await syncSigapMaintenance(f.env, NOW + 60000);
  assert.equal(f.row().lifecycle_status, 'completed');
  f.setState({ revision: 3, schedule: { ...schedule('cancelled'), id: '304105fa-918a-465d-9ec8-4db185686e6a' } });
  await syncSigapMaintenance(f.env, NOW + 120000);
  const data = await loadStatus(f.db, NOW + 120000);
  assert.equal(data.history.length, 2);
  assert.ok(data.history.some(x => x.phaseLabel === 'Dibatalkan'));
  assert.ok(data.history.some(x => x.phaseLabel === 'Selesai terpantau'));
});

test('new schedules, null state and retention preserve truthful closures and old evidence', async t => {
  const f = fixture(t);
  await syncSigapMaintenance(f.env, NOW);
  f.setState({ revision: 2, schedule: { ...schedule(), id: '304105fa-918a-465d-9ec8-4db185686e6a',
    startsAt: '2026-11-05T03:00:00Z', endsAt: '2026-11-05T04:00:00Z' } });
  await syncSigapMaintenance(f.env, NOW + 60000);
  assert.equal(f.row().lifecycle_status, 'replaced');
  f.setState({ revision: 3, schedule: null });
  await syncSigapMaintenance(f.env, NOW + 120000);
  const data = await loadStatus(f.db, NOW + 120000);
  assert.equal(data.maintenance.length, 0);
  assert.equal(data.history.length, 2);
  assert.ok(data.history.some(x => x.phaseLabel === 'Jadwal ditutup'));
  assert.equal((await loadStatus(f.db, NOW + 91 * 86400000)).history.length, 0);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM maintenance').get().n, 2);
});

test('disruption periods expire into history without claiming verified completion', () => {
  const data = buildStatus({ recent, maintenance: [{ id: 'm', title: '<script>test</script>',
    description: '<img src=x onerror=alert(1)>', source: 'sigap', impact: 'disruption', lifecycle_status: 'published',
    service_ids: '["sigap"]', starts_at: NOW - 3600000, ends_at: NOW - 60000 }] }, NOW);
  assert.equal(data.maintenance.length, 0);
  assert.equal(data.history[0].phaseLabel, 'Periode berakhir');
  assert.equal(data.overall, 'up');
  assert.doesNotMatch(renderHtml(data), /<script>test|<img src=x/);
});
