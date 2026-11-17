import { readFile, writeFile, mkdir, rename, readdir, rm, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { backup } from 'node:sqlite';
import { openDatabase, auditDatabase } from './database.mjs';
import page, { buildStatus, loadStatus, loadFeed, renderHtml, renderRss, renderAtom } from '../page.mjs';
import { runChecks, syncSigapMaintenance } from '../probe.mjs';
import { receiveTelemetry } from '../telemetry.mjs';
import { buildCommand } from '../operator.mjs';
import { backupControl } from './maintenance-control.mjs';

const ORIGIN = 'https://status.marisoncloud.com';
const ASSETS = ['/app.js', '/theme.js', '/logo.png', '/terms', '/privacy', '/terms/theme.js', '/terms/logo.png'];

export async function publishSnapshot(db, directory, now = Date.now()) {
  let data, events;
  db.connection.exec('BEGIN');
  try {
    data = await loadStatus(db, now);
    events = await loadFeed(db, now);
    db.connection.exec('COMMIT');
  } catch (error) { db.connection.exec('ROLLBACK'); throw error; }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const name = `snapshot-${now}-${randomUUID()}`;
  const staging = resolve(directory, name);
  await mkdir(staging, { mode: 0o700 });
  const files = {
    'index.html': renderHtml(data), 'status.json': JSON.stringify(data),
    'unavailable.html': renderHtml(buildStatus({}, now)),
    'unavailable.json': JSON.stringify(buildStatus({}, now)),
    'feed.rss': renderRss(events, ORIGIN, now), 'feed.atom': renderAtom(events, ORIGIN, now),
  };
  for (const [name, body] of Object.entries(files)) await writeFile(resolve(staging, name), body, { mode: 0o600 });
  for (const path of ASSETS) {
    const response = path.endsWith('/logo.png')
      ? new Response(await readFile(new URL('../../../public/logo-marison.png', import.meta.url)))
      : await page.fetch(new Request(ORIGIN + path), {});
    if (response.status !== 200) throw Error('Asset rendering failed');
    const name = path === '/terms' ? 'terms.html' : path === '/privacy' ? 'privacy.html' : path.slice(1).replaceAll('/', '-');
    await writeFile(resolve(staging, name), Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
  }
  const manifest = { version: 1, directory: name, generatedAt: now };
  const temporary = resolve(directory, `current-${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(manifest), { mode: 0o600 });
  await rename(temporary, resolve(directory, 'current.json'));
  // Keep several complete versions. Publication never edits files readers already opened.
  const old = (await readdir(directory)).filter(item => /^snapshot-\d+-[0-9a-f-]{36}$/.test(item))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const item of old.slice(4)) {
    if (now - Number(item.split('-')[1]) > 3600000 && item !== name) {
      await rm(resolve(directory, item), { recursive: true });
    }
  }
  return manifest;
}

export async function importSql(sqlPath, dbPath) {
  if (existsSync(dbPath)) throw Error('Refusing to overwrite an existing database');
  const sql = await readFile(sqlPath, 'utf8');
  const db = openDatabase(dbPath, { create: true });
  try {
    db.connection.exec('BEGIN IMMEDIATE');
    try { db.connection.exec(sql); db.connection.exec('COMMIT'); }
    catch (error) { db.connection.exec('ROLLBACK'); throw error; }
    const manifest = auditDatabase(db.connection);
    await chmod(dbPath, 0o600);
    return { exportSha256: createHash('sha256').update(sql).digest('hex'), ...manifest };
  } finally { db.close(); }
}

async function configFrom(path) {
  const config = JSON.parse(await readFile(path, 'utf8'));
  if (!['preview', 'production'].includes(config.environment)
    || config.origin !== ORIGIN || !config.database || !config.snapshots) throw Error('Invalid private configuration');
  for (const field of ['database', 'snapshots', 'backups']) {
    if (typeof config[field] !== 'string' || !config[field].startsWith('/')) throw Error('Absolute private paths required');
  }
  return config;
}

async function main() {
  process.umask(0o077);
  const [command, configPath, inputPath, productionFlag] = process.argv.slice(2);
  const config = await configFrom(configPath);
  if (command === 'import') {
    if (config.environment === 'production' && productionFlag !== '--production') throw Error('Explicit production flag required');
    const manifest = await importSql(inputPath, config.database);
    await writeFile(config.database + '.import.json', JSON.stringify(manifest, null, 2), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify(manifest));
    return;
  }
  const db = openDatabase(config.database);
  try {
    if (command === 'audit') { console.log(JSON.stringify(auditDatabase(db.connection))); return; }
    if (command === 'report') {
      let input = Buffer.alloc(0);
      for await (const chunk of process.stdin) {
        input = Buffer.concat([input, chunk]);
        if (input.length > 16384) throw Error('Report envelope too large');
      }
      const envelope = JSON.parse(input.toString('utf8'));
      const body = Buffer.from(envelope.bodyBase64 || '', 'base64');
      if (body.length > 8192) throw Error('Report body too large');
      const response = await receiveTelemetry(new Request(ORIGIN + '/report', {
        method: 'POST', headers: { 'content-type': 'application/json',
          'x-sigap-timestamp': envelope.timestamp, 'x-sigap-signature': envelope.signature }, body,
      }), { DB: db, COLLECTOR_AUDIENCE: 'status.marisoncloud.com', COLLECTOR_PUBLIC_KEY: config.collectorPublicKey });
      console.log(response.status);
      return;
    }
    if (command === 'cycle') {
      await runChecks({ DB: db });
      try {
        await syncSigapMaintenance({ DB: db, SIGAP_MAINTENANCE_HOSTNAME: 'sigap.marisoncloud.com',
          SIGAP_EDGE: { fetch: request => fetch(request, { redirect: 'error' }) } });
      } catch { console.warn('Maintenance sync unavailable; preserving previous schedule'); }
      await publishSnapshot(db, config.snapshots);
      if(config.maintenanceControlConfig) {
        const control=JSON.parse(await readFile(config.maintenanceControlConfig,'utf8'));
        await backupControl(control.database,control.backups);
      }
      await mkdir(config.backups, { recursive: true, mode: 0o700 });
      const day = new Date().toISOString().slice(0, 10);
      const destination = resolve(config.backups, `status-${day}.sqlite`);
      if (!existsSync(destination)) {
        const temporary = destination + `.${randomUUID()}.tmp`;
        await backup(db.connection, temporary);
        const check = openDatabase(temporary, { readOnly: true });
        try { auditDatabase(check.connection); } finally { check.close(); }
        await rename(temporary, destination);
      }
      // Bounded daily backup retention; original D1 exports are never removed.
      const days = (await readdir(config.backups)).filter(name => /^status-\d{4}-\d{2}-\d{2}\.sqlite$/.test(name)).sort().reverse();
      for (const name of days.slice(35)) await rm(resolve(config.backups, name));
      console.log(JSON.stringify({ cycle: 'ok', at: Date.now() }));
      return;
    }
    if (command === 'snapshot') { console.log(JSON.stringify(await publishSnapshot(db, config.snapshots))); return; }
    if (command === 'event') {
      if (config.environment === 'production' && productionFlag !== '--production') throw Error('Explicit production flag required');
      const { command: event, input } = JSON.parse(await readFile(inputPath, 'utf8'));
      const query = buildCommand(event, input);
      const result = await db.prepare(query.sql).bind(...query.params).run();
      if (Number(result.meta.changes) !== 1) throw Error('Event was not published');
      await publishSnapshot(db, config.snapshots);
      console.log(JSON.stringify({ event, id: query.id }));
      return;
    }
    throw Error('Unsupported operation');
  } finally { db.close(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(() => { console.error('Status operation failed; inspect private configuration and database'); process.exitCode = 1; });
}
