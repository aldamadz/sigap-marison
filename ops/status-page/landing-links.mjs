export const LANDING_LINKS_CSS = `
.mrg-policy-fallback{box-sizing:border-box;padding:24px;background:#f6f8f3;color:#365b57;font:13px/1.6 Arial,sans-serif;text-align:center;border-top:1px solid #dce5dc}
.mrg-policy-fallback nav{display:flex;flex-wrap:wrap;justify-content:center;gap:12px 24px}
.mrg-policy-fallback a{color:inherit;text-underline-offset:4px}
.mrg-policy-fallback[hidden]{display:none}
.absensi-site .absensi-header nav{display:flex;flex-wrap:wrap;gap:8px 22px}
.absensi-site .absensi-footer .mrg-policy-links{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px 18px}
.absensi-site .absensi-footer .mrg-policy-links a{font-size:12px;line-height:1.6}
@media(max-width:980px){.absensi-site .absensi-header{gap:12px;grid-template-columns:1fr auto;padding:12px 0}.absensi-site .absensi-header nav{grid-row:2;grid-column:1/-1;justify-content:center;gap:8px 22px}.absensi-site .absensi-header-action{grid-row:1;grid-column:2}}
@media(max-width:700px){.absensi-site .absensi-footer .mrg-policy-links{justify-content:flex-start}}
`;

// Enhance the existing public React landing after it mounts; never inspect sessions or forms.
export const LANDING_LINKS_JS = `(() => {
  const links = [
    ['/privacy', 'Privacy Policy'],
    ['/terms', 'Terms of Service'],
    ['https://status.marisoncloud.com/', 'Status layanan'],
  ];
  function addLink(parent, href, label) {
    const present = Array.from(parent.querySelectorAll('a')).some(a =>
      new URL(a.href, location.origin).href === new URL(href, 'https://marisoncloud.com').href);
    if (present) return;
    const link = document.createElement('a');
    link.href = new URL(href, 'https://marisoncloud.com').href; link.textContent = label;
    parent.append(link);
  }
  function enhance() {
    const header = document.querySelector('.absensi-header nav');
    const footer = document.querySelector('.absensi-footer > div:last-child');
    if (header) addLink(header, '/terms', 'Ketentuan');
    if (footer) {
      let nav = footer.querySelector('.mrg-policy-links');
      if (!nav) {
        nav = document.createElement('nav'); nav.className = 'mrg-policy-links';
        nav.setAttribute('aria-label', 'Kebijakan layanan');
        footer.prepend(nav);
        const privacy = Array.from(footer.children).find(el => el.tagName === 'A' && new URL(el.href).pathname === '/privacy');
        if (privacy) { privacy.textContent = 'Privacy Policy'; nav.append(privacy); }
      }
      links.forEach(([href, label]) => addLink(nav, href, label));
    }
    const fallback = document.getElementById('mrg-policy-fallback');
    if (fallback) fallback.hidden = !!(header && footer);
    return !!(header && footer);
  }
  if (enhance()) return;
  const observer = new MutationObserver(() => { if (enhance()) observer.disconnect(); });
  observer.observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 30000);
})();`;

export function landingFallback() {
  return '<footer id="mrg-policy-fallback" class="mrg-policy-fallback"><nav aria-label="Kebijakan layanan"><a href="https://marisoncloud.com/privacy">Privacy Policy</a><a href="https://marisoncloud.com/terms">Terms of Service</a><a href="https://status.marisoncloud.com/">Status layanan</a></nav></footer>';
}

export function enhanceLanding(response, Rewriter = globalThis.HTMLRewriter) {
  if (response.status !== 200 || !response.headers.get('content-type')?.toLowerCase().includes('text/html')) return response;
  const headers = new Headers(response.headers);
  for (const name of ['etag', 'content-length', 'content-md5', 'digest', 'last-modified']) headers.delete(name);
  headers.set('cache-control', 'no-store');
  return new Rewriter()
    .on('head', { element(el) {
      el.append('<link rel="stylesheet" href="/terms/landing.css?v=1"><script src="/terms/landing.js?v=1" defer></script>', { html: true });
    } })
    .on('body', { element(el) { el.append(landingFallback(), { html: true }); } })
    .transform(new Response(response.body, { status: response.status, statusText: response.statusText, headers }));
}

export function renderLandingPreview() {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pratinjau navigasi landing</title><link rel="stylesheet" href="/terms/landing.css?v=1"><script src="/terms/landing.js?v=1" defer></script></head><body><div id="root"><div class="absensi-site"><header class="absensi-header"><a href="https://marisoncloud.com/">Absensi Marison Regency Group</a><nav aria-label="Navigasi utama"><a href="https://marisoncloud.com/">Beranda</a><a href="https://marisoncloud.com/privacy">Privasi</a></nav></header><main><h1>Pratinjau navigasi landing</h1><p>Fixture staging untuk navigasi dan footer; bukan salinan lengkap aplikasi.</p></main><footer class="absensi-footer"><p>Marison Regency Group</p><div><a href="https://marisoncloud.com/privacy">Kebijakan Privasi</a><span>2026 Marison Regency Group</span></div></footer></div></div>${landingFallback()}</body></html>`;
}
