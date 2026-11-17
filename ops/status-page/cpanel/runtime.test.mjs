import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { generateKeyPairSync, sign } from 'node:crypto';
import { openDatabase, auditDatabase } from './database.mjs';
import { publishSnapshot, importSql, syncMaintenanceControl } from './runtime.mjs';
import { bootstrapControl, controlCommand, HOSTS } from './maintenance-control.mjs';
import { DatabaseSync } from 'node:sqlite';
import { observationStatements, receiveTelemetry } from '../telemetry.mjs';
import { buildCommand } from '../operator.mjs';
import { loadStatus } from '../page.mjs';

export async function fixture(directory) {
  const database = resolve(directory, 'status.sqlite');
  const db = openDatabase(database, { create: true });
  db.connection.exec(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
  for (const name of (await readdir(new URL('../migrations/', import.meta.url))).sort()) {
    db.connection.exec(await readFile(new URL('../migrations/' + name, import.meta.url), 'utf8'));
  }
  return db;
}

async function using(fn) {
  const directory = await mkdtemp(resolve(tmpdir(), 'status-cpanel-'));
  const db = await fixture(directory);
  try { await fn(db, directory); }
  finally { db.close(); await rm(directory, { recursive: true, force: true }); }
}

test('local maintenance sync survives offline origin and preserves successive short schedules',()=>using(async(db,directory)=>{
  const now=Date.parse('2026-11-17T06:00:00Z'),path=resolve(directory,'control.sqlite'),config=resolve(directory,'control.json');
  bootstrapControl(path,Object.fromEntries(HOSTS.map(host=>[host,{revision:0,schedule:null}])),'Synthetic operator initialization for offline synchronization',now);
  await writeFile(config,JSON.stringify({database:path}));
  const control=new DatabaseSync(path),actorId='00000000-0000-0000-0000-000000000001';
  try {
    for(let i=0;i<2;i++) {
      const at=now+i*180000;
      assert.equal(controlCommand(control,HOSTS[0],{action:'publish',expectedRevision:i*2,actorId,schedule:{category:'repair',impact:'full',message:`Maintenance fixture ${i}`,startsAt:new Date(at+60000).toISOString(),duration:1,unit:'minutes'}},at).status,200);
      assert.equal(controlCommand(control,HOSTS[0],{action:'complete',expectedRevision:i*2+1,actorId},at+120000).status,200);
    }
    const before=control.prepare('SELECT * FROM control_events ORDER BY revision').all();
    const network=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Origin offline; network must not be used');};
    try {await syncMaintenanceControl(db,config,now+360000);await syncMaintenanceControl(db,config,now+420000);}finally{globalThis.fetch=network;}
    const rows=db.connection.prepare("SELECT lifecycle_status,closed_at FROM maintenance WHERE source='sigap' ORDER BY starts_at").all();
    assert.equal(rows.length,2);assert.deepEqual(rows.map(row=>row.lifecycle_status),['completed','completed']);
    assert.equal(rows[0].closed_at,now+120000);assert.equal(rows[1].closed_at,now+300000);
    assert.equal(db.connection.prepare("SELECT revision FROM status_sources WHERE source='sigap'").get().revision,4);
    assert.deepEqual(control.prepare('SELECT * FROM control_events ORDER BY revision').all(),before);
  }finally{control.close();}
}));

test('adapter binds parameters and rolls an entire failed batch back', () => using(async db => {
  const insert = db.prepare('INSERT INTO status_sources VALUES (?,?,?)');
  await assert.rejects(db.batch([insert.bind('sigap', 1, 1), insert.bind('sigap', 2, 2)]));
  assert.deepEqual((await db.prepare('SELECT * FROM status_sources').all()).results, []);
  await insert.bind("not a SQL command'; DROP TABLE checks;--", 1, 1).run();
  assert.equal(auditDatabase(db.connection).tables.status_sources.count, 1);
}));

test('minute retries do not add daily samples twice', () => using(async db => {
  const now = Date.now();
  const rows = [{ service: 'sigap', slot: Math.floor(now / 60000), checkedAt: now,
    outcome: 'up', latencyMs: 100, httpStatus: 200, reason: null }];
  await db.batch(observationStatements(db, rows));
  await db.batch(observationStatements(db, rows));
  assert.equal(auditDatabase(db.connection).tables.checks.count, 1);
  assert.equal((await db.prepare('SELECT up_count FROM daily_checks').all()).results[0].up_count, 1);
}));

test('signed telemetry authenticates exact bytes, host, timestamp, and report shape', () => using(async db => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const now = Date.now();
  const body = JSON.stringify({ version: 1, observedAt: now,
    components: ['sigap_storage', 'sigap_pdf', 'sigap_sync', 'sigap_outbound', 'sigap_external']
      .map(id => ({ id, status: 'up', reason: 'healthy', latencyMs: 1 })) });
  const signature = sign(null, Buffer.from(`${now}\nstatus.marisoncloud.com\n/report\n${body}`), privateKey).toString('hex');
  const env = { DB: db, COLLECTOR_AUDIENCE: 'status.marisoncloud.com',
    COLLECTOR_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'der' }).toString('base64') };
  const request = (data = body, host = 'status.marisoncloud.com') => new Request(`https://${host}/report`, {
    method: 'POST', body: data, headers: { 'content-type': 'application/json',
      'x-sigap-timestamp': String(now), 'x-sigap-signature': signature },
  });
  assert.equal((await receiveTelemetry(request(body + ' '), env, now)).status, 401);
  assert.equal((await receiveTelemetry(request(body, 'other.example'), env, now)).status, 401);
  assert.equal((await receiveTelemetry(request(), env, now + 61000)).status, 401);
  assert.equal((await receiveTelemetry(request(), env, now)).status, 204);
  assert.equal((await receiveTelemetry(request(), env, now)).status, 204);
  assert.equal(auditDatabase(db.connection).tables.component_checks.count, 6);
  assert.equal(db.connection.prepare('SELECT sum(up_count) AS count FROM component_daily_checks').get().count, 6);
}));

test('snapshot preserves events/feed IDs, writes all assets and switches a single manifest', () => using(async (db, directory) => {
  const now = Date.now();
  const incident = buildCommand('incident-create', { title: 'Test incident', summary: 'Synthetic example only',
    severity: 'minor', services: ['sigap'] }, now);
  await db.prepare(incident.sql).bind(...incident.params).run();
  const before = auditDatabase(db.connection);
  const snapshots = resolve(directory, 'snapshots');
  const first = await publishSnapshot(db, snapshots, now);
  const second = await publishSnapshot(db, snapshots, now + 1);
  assert.notEqual(first.directory, second.directory);
  assert.deepEqual(JSON.parse(await readFile(resolve(snapshots, 'current.json'), 'utf8')), second);
  assert.deepEqual(auditDatabase(db.connection), before);
  const files = await readdir(resolve(snapshots, second.directory));
  for (const name of ['index.html', 'status.json', 'unavailable.html', 'unavailable.json', 'feed.rss', 'feed.atom',
    'logo.png', 'app.js', 'theme.js', 'terms.html', 'privacy.html']) assert.ok(files.includes(name), name);
  const feed = await readFile(resolve(snapshots, second.directory, 'feed.rss'), 'utf8');
  assert.ok(feed.includes(incident.id));
  assert.equal(JSON.parse(await readFile(resolve(snapshots, second.directory, 'unavailable.json'))).overall, 'unknown');
  const status = await loadStatus(db, now);
  assert.equal(status.incidents[0].id, incident.id);
}));

test('import never overwrites an existing database and refuses unexpected objects', () => using(async (db, directory) => {
  const sql = resolve(directory, 'source.sql');
  await writeFile(sql, 'CREATE TABLE unrelated (secret TEXT);');
  await assert.rejects(importSql(sql, resolve(directory, 'status.sqlite')), /overwrite/);
  await assert.rejects(importSql(sql, resolve(directory, 'invalid.sqlite')), /schema/);
  assert.equal(auditDatabase(db.connection).tables.checks.count, 0);
}));
