import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import worker, { THEME_JS, renderTerms, renderPrivacy, renderHtml, buildStatus } from './page.mjs';
import { TERMS } from './terms.mjs';
import { PRIVACY } from './privacy.mjs';
import { enhanceLanding, LANDING_LINKS_JS } from './landing-links.mjs';

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
  for (const path of ['/terms','/terms/','/privacy','/privacy/','/terms/theme.js','/terms/landing.js','/terms/landing.css']) {
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
  for (const path of ['/terms-other','/privacy-other','/assets/file.js','/api/auth/login','/workspace']) {
    const response = await worker.fetch(new Request(`https://marisoncloud.com${path}`), {});
    assert.equal(await response.text(), 'existing origin');
  }
  assert.equal(fetchMock.mock.calls.length, 5);
});

test('privacy covers group systems, data purposes, sharing, retention and rights with dated history', () => {
  assert.equal(PRIVACY.history[0].version, PRIVACY.version);
  assert.equal(PRIVACY.history[0].date, PRIVACY.effectiveDate);
  const html = renderPrivacy();
  for (const text of ['SIGAP','Maris Drive','AI Workspace','Absensi','retensi','persetujuan','penghapusan','tim IT','Terms of Service','Beranda','Status layanan']) assert.ok(html.includes(text), text);
  assert.match(html, /canonical" href="https:\/\/marisoncloud.com\/privacy"/);
  assert.doesNotMatch(html, /xau|khusus aplikasi Absensi dan penjelasan/i);
  assert.match(html, /tidak menyatakan seluruh data hanya disimpan di Indonesia/);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.doesNotMatch(renderTerms(), /saat ketentuan ini diterbitkan menjelaskan aplikasi Absensi/);
  for (const policy of [TERMS, PRIVACY]) assert.equal(new Set(policy.sections.map(s => s.id)).size, policy.sections.length);
});

test('landing enhancement preserves security headers and origin scripts, removes stale body validators', async () => {
  const handlers = new Map();
  class Rewriter {
    on(selector, handler) { handlers.set(selector, handler); return this; }
    transform(response) { return response; }
  }
  const response = enhanceLanding(new Response('<html><script src="/original.js"></script></html>', { headers: {
    'content-type': 'text/html', 'content-security-policy': "script-src 'self'; style-src 'self'", 'etag': 'old', 'last-modified':'old',
  } }), Rewriter);
  assert.equal(response.headers.get('etag'), null);
  assert.equal(response.headers.get('last-modified'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('content-security-policy'), "script-src 'self'; style-src 'self'");
  assert.match(await response.text(), /original.js/);
  const additions = [];
  for (const h of handlers.values()) h.element({ append(html, options) { assert.equal(options.html, true); additions.push(html); } });
  assert.match(additions.join(''), /\/terms\/landing.js/);
  assert.match(additions.join(''), /Privacy Policy/);
  assert.match(additions.join(''), /Terms of Service/);
  assert.doesNotMatch(additions.join(''), /<script[^>]*>[^<]+<\/script>/);
});

test('landing enhancement ignores non-HTML and errors, does not hide origin availability', () => {
  for (const response of [new Response('down', {status:503}), new Response('{}', {headers:{'content-type':'application/json'}})]) assert.equal(enhanceLanding(response), response);
});

test('landing GET strips conditional headers; POST root and HEAD pass through without rewriting', async context => {
  const requests = [];
  context.mock.method(globalThis, 'fetch', async request => { requests.push(request); return new Response('origin'); });
  for (const method of ['GET','HEAD','POST']) {
    const response = await worker.fetch(new Request('https://marisoncloud.com/?utm_source=test', {method, headers:{'if-none-match':'old'}}), {});
    assert.equal(await response.text(), 'origin');
  }
  assert.equal(requests[0].headers.has('if-none-match'), false);
  assert.equal(requests[2].headers.get('if-none-match'), 'old');
});

test('landing fixture is staging-only and public legal writes are not accepted', async () => {
  const fixture = await worker.fetch(new Request('https://stage.test/_preview/landing'), {STATUS_ENVIRONMENT:'staging'});
  assert.equal(fixture.status, 200);
  assert.match(await fixture.text(), /Fixture staging/);
  assert.equal((await worker.fetch(new Request('https://status.marisoncloud.com/_preview/landing'), {})).status, 404);
  for (const path of ['/terms','/privacy']) assert.equal((await worker.fetch(new Request(`https://marisoncloud.com${path}`, {method:'POST'}), {})).status, 405);
  assert.doesNotMatch(LANDING_LINKS_JS, /localStorage|cookie|fetch\(|innerHTML|password/);
});
