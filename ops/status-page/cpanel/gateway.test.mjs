import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { generateKeyPairSync, sign } from 'node:crypto';
import { openDatabase, auditDatabase } from './database.mjs';
import { publishSnapshot } from './runtime.mjs';

test('PHP gateway: snapshot reads, stale status, private paths and signed ingestion', async t => {
  if (process.env.STATUS_PHP_TEST !== '1') { t.skip('Set STATUS_PHP_TEST=1 on PHP-enabled hosting'); return; }
  execFileSync('php', ['-l', new URL('./public/index.php', import.meta.url).pathname]);
  const directory = await mkdtemp(resolve(tmpdir(), 'status-http-'));
  const publicRoot = resolve(directory, 'domain/public');
  const privateRoot = resolve(directory, 'status-private');
  await mkdir(publicRoot, { recursive: true });
  await mkdir(privateRoot);
  await copyFile(new URL('./public/index.php', import.meta.url), resolve(publicRoot, 'index.php'));
  const database = resolve(privateRoot, 'status.sqlite');
  const db = openDatabase(database, { create: true });
  const { readdir } = await import('node:fs/promises');
  db.connection.exec(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
  for (const name of (await readdir(new URL('../migrations/', import.meta.url))).sort()) {
    db.connection.exec(await readFile(new URL('../migrations/' + name, import.meta.url), 'utf8'));
  }
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const config = { environment: 'preview', origin: 'https://status.marisoncloud.com',
    database, snapshots: resolve(privateRoot, 'snapshots'), backups: resolve(privateRoot, 'backups'),
    node: process.execPath, runtime: new URL('./runtime.mjs', import.meta.url).pathname,
    collectorPublicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64') };
  await writeFile(resolve(privateRoot, 'config.json'), JSON.stringify(config));
  await publishSnapshot(db, config.snapshots);
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const server = spawn('php', ['-S', `127.0.0.1:${port}`, resolve(publicRoot, 'index.php')], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('PHP did not start')), 5000);
      server.on('error', reject);
      server.stderr.on('data', chunk => { if (chunk.toString().includes('Development Server')) { clearTimeout(timer); resolve(); } });
    });
    const request = (path, options = {}) => new Promise((resolve, reject) => {
      const request = httpRequest({ hostname: '127.0.0.1', port, path, method: options.method || 'GET',
        headers: { host: 'status.marisoncloud.com', ...options.headers }, timeout: 10000 }, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve(new Response([204, 304].includes(response.statusCode) ? null : Buffer.concat(chunks),
          { status: response.statusCode, headers: response.headers })));
      });
      request.on('error', reject);
      request.on('timeout', () => request.destroy(Error('Local PHP timeout')));
      request.end(options.body);
    });
    const before = auditDatabase(db.connection);
    for (const path of ['/', '/api/status', '/feed.rss', '/feed.atom', '/logo.png', '/app.js', '/theme.js', '/privacy', '/terms']) {
      const response = await request(path);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      await response.arrayBuffer();
    }
    assert.deepEqual(auditDatabase(db.connection), before);
    assert.equal((await request('/status.sqlite')).status, 404);
    assert.equal((await request('/config.json')).status, 404);
    assert.equal((await request('/', { method: 'POST' })).status, 405);
    assert.equal((await request('/report')).status, 405);
    assert.equal((await request('/report', { method: 'POST', body: '{}' })).status, 401);
    assert.equal((await request('/', { headers: { host: 'other.example' } })).status, 404);
    const now = Date.now();
    const body = JSON.stringify({ version: 1, observedAt: now,
      components: ['sigap_storage', 'sigap_pdf', 'sigap_sync', 'sigap_outbound', 'sigap_external']
        .map(id => ({ id, status: 'up', reason: 'healthy', latencyMs: 1 })) });
    const signature = sign(null, Buffer.from(`${now}\nstatus.marisoncloud.com\n/report\n${body}`), privateKey).toString('hex');
    const headers = { 'content-type': 'application/json', 'x-sigap-timestamp': String(now), 'x-sigap-signature': signature };
    assert.equal((await request('/report', { method: 'POST', body: body + ' ', headers })).status, 401);
    assert.equal((await request('/report', { method: 'POST', body, headers })).status, 204);
    assert.equal((await request('/report', { method: 'POST', body, headers })).status, 204);
    assert.equal(auditDatabase(db.connection).tables.component_checks.count, 6);
    await publishSnapshot(db, config.snapshots, now - 181000);
    const stale = await request('/api/status');
    assert.equal(stale.status, 503);
    assert.equal((await stale.json()).overall, 'unknown');
    assert.equal((await request('/')).status, 503);
    assert.equal((await request('/feed.rss')).status, 503);
    await publishSnapshot(db, config.snapshots);
    // HTTP readers do not even need the database to be present.
    db.close();
    await rename(database, database + '.offline');
    assert.equal((await request('/api/status')).status, 200);
  } finally {
    server.kill();
    await once(server, 'exit');
    try { db.close(); } catch { /* Already closed for the no-database read test. */ }
    await rm(directory, { recursive: true, force: true });
  }
});
