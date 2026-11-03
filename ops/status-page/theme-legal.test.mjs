import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import worker, { THEME_JS, renderTerms, renderHtml, buildStatus } from './page.mjs';
import { TERMS } from './terms.mjs';

function theme(saved, dark = false, denied = false) {
  const events = {}, root = { dataset: {} }, buttons = ['light','dark','system'].map(value => ({
    dataset: { setTheme: value }, setAttribute(key, value) { this[key] = value; },
  }));
  const storage = new Map(saved ? [['marison-status-theme', saved]] : []);
  const media = { matches: dark, addEventListener(type, callback) { events.media = callback; } };
  runInNewContext(THEME_JS, {
    document: { documentElement: root, querySelectorAll: () => buttons, querySelector: () => null,
      addEventListener(type, callback) { events[type] = callback; } },
    window: { addEventListener(type, callback) { events[type] = callback; } },
    localStorage: { getItem(key) { if (denied) throw Error(); return storage.get(key); },
      setItem(key, value) { if (denied) throw Error(); storage.set(key, value); } },
    matchMedia: () => media,
  });
  return { root, events, buttons, storage, media, click(value) {
    events.click({ target: { closest: () => buttons.find(button => button.dataset.setTheme === value) } });
  } };
}

test('theme follows system, persists explicit choice and responds to system changes', () => {
  const app = theme(null, true);
  assert.equal(app.root.dataset.theme, 'dark');
  app.click('light');
  assert.equal(app.root.dataset.theme, 'light');
  assert.equal(app.buttons[0]['aria-pressed'], 'true');
  assert.equal(app.storage.get('marison-status-theme'), 'light');
  app.media.matches = true; app.events.media();
  assert.equal(app.root.dataset.theme, 'light');
  app.click('system'); app.media.matches = false; app.events.media();
  assert.equal(app.root.dataset.theme, 'light');
  app.events.storage({ key: 'marison-status-theme', newValue: 'dark' });
  assert.equal(app.root.dataset.theme, 'dark');
  assert.equal(theme('light', true).root.dataset.theme, 'light');
});

test('theme works with denied storage and ignores invalid saved values', () => {
  const app = theme(null, false, true); app.click('dark');
  assert.equal(app.root.dataset.theme, 'dark');
  assert.equal(theme('untrusted', true).root.dataset.themeChoice, 'system');
});

test('terms cover only official services without naming unaffiliated applications', () => {
  assert.equal(TERMS.history[0].version, TERMS.version);
  assert.equal(TERMS.history[0].date, TERMS.effectiveDate);
  const html = renderTerms();
  assert.match(html, /hanya mengatur penggunaan layanan digital yang dimiliki atau secara resmi dioperasikan oleh Marison Regency Group/);
  assert.doesNotMatch(html, /xau/i);
  for (const name of ['SIGAP','Maris Drive','AI Workspace','Absensi']) assert.ok(html.includes(name));
  assert.match(html, /canonical" href="https:\/\/marisoncloud.com\/terms"/);
  assert.doesNotMatch(html, /src="\/app.js/);
  assert.match(html, /Privacy Policy/);
});

test('terms and theme assets work without status database; HEAD has no body', async () => {
  const env = { DB: { prepare() { throw Error('must not access DB'); } } };
  for (const path of ['/terms','/terms/','/terms/theme.js']) {
    const response = await worker.fetch(new Request(`https://marisoncloud.com${path}`), env);
    assert.equal(response.status, 200);
  }
  const head = await worker.fetch(new Request('https://marisoncloud.com/terms', { method: 'HEAD' }), env);
  assert.equal(await head.text(), '');
  const response = await worker.fetch(new Request('https://status.marisoncloud.com/theme.js'), env);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('status includes prepaint theme bootstrap, controls and policy links', () => {
  const html = renderHtml(buildStatus({}));
  assert.ok(html.indexOf('src="/theme.js') < html.indexOf('<style>'));
  assert.match(html, /aria-label="Tema gelap"/);
  assert.match(html, /href="https:\/\/marisoncloud.com\/privacy"/);
  assert.match(html, /href="https:\/\/marisoncloud.com\/terms"/);
});

test('legal path prefix does not replace unrelated main website routes', async (context) => {
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => new Response('existing origin'));
  const response = await worker.fetch(new Request('https://marisoncloud.com/terms-other'), {});
  assert.equal(await response.text(), 'existing origin');
  assert.equal(fetchMock.mock.calls.length, 1);
});
