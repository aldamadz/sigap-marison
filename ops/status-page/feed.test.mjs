import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import worker, { loadFeed, renderRss, renderAtom, renderHtml, buildStatus } from './page.mjs';

const NOW = Date.UTC(2026, 10, 3, 8);
function database(groups) {
  let index = 0;
  return { prepare() { const results = groups[index++] || []; const statement = {
    all: async () => ({ results }), bind: () => statement,
  }; return statement; } };
}

test('RSS combines stable probe, incident, handling, and maintenance events', async () => {
  const groups = [
    [{ id: 'i', title: 'Gangguan SIGAP', summary: 'Sedang diperiksa', started_at: NOW - 1000 }],
    [{ id: 'u', title: 'Gangguan SIGAP', phase: 'monitoring', message: 'Layanan pulih', created_at: NOW - 500 }],
    [{ id: 'm', title: 'Pembaruan SIGAP', description: 'Perbaikan layanan', starts_at: NOW + 1000,
      ends_at: NOW + 2000, created_at: NOW - 2000, cancelled_at: null }],
    [{ service: 'drive', slot: 10, condition: 'DOWN', checked_at: NOW - 1500 }],
  ];
  const first = await loadFeed(database(groups), NOW);
  const second = await loadFeed(database(groups), NOW + 100);
  assert.deepEqual(first.map(x => x.id), second.map(x => x.id));
  assert.equal(first[0].id, 'update:u');
  assert.equal(first.length, 4);
  assert.match(renderRss(first, undefined, NOW), /<guid isPermaLink="false">probe:drive:10<\/guid>/);
});

test('RSS encodes XML and HTML safely, strips invalid control characters', () => {
  const rss = renderRss([{ id: 'x&1', title: '<script>test</script>',
    description: '<img src=x onerror=alert(1)>\u0001', at: NOW, section: 'incidents-title' }], undefined, NOW);
  assert.match(rss, /&lt;script&gt;/);
  assert.match(rss, /&amp;lt;img/);
  assert.doesNotMatch(rss, /\u0001|<img|<script/);
});

test('RSS endpoint supports HEAD and returns 503 instead of an empty feed on DB failure', async () => {
  const ok = await worker.fetch(new Request('https://status.marisoncloud.com/rss.xml'), { DB: database([]) });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-type'), /application\/rss\+xml/);
  const head = await worker.fetch(new Request('https://status.marisoncloud.com/rss.xml', { method: 'HEAD' }), { DB: database([]) });
  assert.equal(await head.text(), '');
  const bad = await worker.fetch(new Request('https://status.marisoncloud.com/rss.xml'), { DB: { prepare() { throw Error('offline'); } } });
  assert.equal(bad.status, 503);
});

test('RSS is discoverable and linked on the public page', () => {
  const html = renderHtml(buildStatus({}, NOW));
  assert.match(html, /rel="alternate" type="application\/rss\+xml"/);
  assert.match(html, /id="subscribe" type="button" aria-haspopup="dialog"/);
  assert.match(html, /<dialog id="subscribe-dialog"/);
  assert.match(html, /value="https:\/\/status.marisoncloud.com\/feed.rss"/);
  assert.match(html, /aria-label="Salin tautan Atom"/);
  assert.match(renderHtml(buildStatus({}, NOW), { preview: true }), /value="https:\/\/marison-status-page-staging.aldamaaa-id.workers.dev\/feed.atom"/);
});

test('Atom has required metadata and stable escaped entries', () => {
  const events = [{ id: 'x&1', title: '<script>test</script>', description: '<img src=x>\u0001',
    at: NOW, section: 'incidents-title' }];
  const atom = renderAtom(events, undefined, NOW);
  assert.match(atom, /xmlns="http:\/\/www.w3.org\/2005\/Atom"/);
  assert.match(atom, /<author><name>Tim IT Marison<\/name><\/author>/);
  assert.match(atom, /<updated>2026-11-03T08:00:00.000Z<\/updated>/);
  assert.match(atom, /<summary type="text">&lt;img src=x&gt;<\/summary>/);
  assert.match(atom, /<id>https:\/\/status.marisoncloud.com\/events\/x%261<\/id>/);
  assert.doesNotMatch(atom, /<script>|\u0001/);
});

test('feed aliases and Atom HEAD are available with correct media types', async () => {
  for (const path of ['/feed.rss', '/feed.atom', '/atom.xml']) {
    const response = await worker.fetch(new Request(`https://status.marisoncloud.com${path}`), { DB: database([]) });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), path === '/feed.rss' ? /application\/rss\+xml/ : /application\/atom\+xml/);
  }
  const response = await worker.fetch(new Request('https://status.marisoncloud.com/feed.atom', { method: 'HEAD' }), { DB: database([]) });
  assert.equal(await response.text(), '');
});
