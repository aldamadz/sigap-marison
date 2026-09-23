/**
 * SPA fallback untuk client route (React Router).
 *
 * Masalah: handler 404 sebelumnya hanya mengirim `index.html` saat header
 * `Accept` memuat `text/html`. Akibatnya:
 * - request non-browser (curl, `fetch` JS, service worker, sebagian crawler)
 *   ke route client seperti `/calendar` tetap mendapat 404 JSON, padahal
 *   React Router harus memulihkan `?date`, `?view`, dan `?entry`;
 * - route server tak dikenal (`/api/unknown`) justru salah mendapat
 *   `index.html` 200 saat `Accept` adalah HTML, sehingga client gagal
 *   mendapat error JSON yang jelas.
 *
 * Aturan sekarang berbasis path, bukan header:
 * - hanya GET route tanpa prefix server dan tanpa ekstensi file yang
 *   dianggap client route → `index.html`;
 * - `/api/*`, `/health/*`, dan path ber-ekstensi (asset statis) tetap
 *   fail-closed 404 JSON.
 */

const SERVER_ROUTE_PREFIXES = ["/api/", "/health/"] as const;
const ASSET_EXTENSION = /\.[0-9a-z]+$/i;

export function isServerRoutePath(pathname: string): boolean {
  return SERVER_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function looksLikeAssetPath(pathname: string): boolean {
  return ASSET_EXTENSION.test(pathname);
}

export function shouldServeSpaIndex(request: {
  method: string;
  pathname: string;
}): boolean {
  if (request.method !== "GET") return false;
  if (isServerRoutePath(request.pathname)) return false;
  if (looksLikeAssetPath(request.pathname)) return false;
  return true;
}

/** `request.url` di Fastify masih memuat query string; ambil path murni. */
export function pathnameFromUrl(url: string): string {
  const queryIndex = url.indexOf("?");
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}
