import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExternalOpenApi } from "./openapi.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Content-Security-Policy khusus route dokumentasi Stoplight Elements.
 *
 * Stoplight Elements self-hosted memerlukan:
 * - `script-src 'self' 'unsafe-inline'`: bundle lokal (`/docs/stoplight/web-components.min.js`)
 *   dan inline `<script>` inisialisasi.
 * - `style-src 'self' 'unsafe-inline'`: stylesheet dan atribut style inline.
 * - `connect-src 'self'`: fetch OpenAPI (`/docs/openapi.json`) dan request
 *   Try It ke server yang sama.
 * - `img-src 'self' data:`: ikon dan gambar inline.
 * - `font-src 'self' data:`: font yang di-embed dalam CSS.
 *
 * Tidak ada resource dari domain pihak ketiga; semua di-serve same-origin.
 */
export const DOCS_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

/**
 * Baca bundle Stoplight Elements dari folder public/stoplight/.
 * File ini di-sync dari node_modules/@stoplight/elements oleh
 * `scripts/sync-stoplight-assets.mjs` sebelum build Docker.
 */
const stoplightDir = join(here, "public", "stoplight");
const readStoplightFile = (filename) => readFileSync(join(stoplightDir, filename));

// Baca tema dark yang di-custom. File ini kecil (~2KB) jadi di-inline di HTML.
const docsThemeCss = readFileSync(join(here, "docs-theme.css"), "utf8");

/**
 * Bangun HTML halaman dokumentasi dengan Stoplight Elements web component.
 *
 * - `router="hash"`: navigasi client-side tanpa server-side routing.
 * - `layout="sidebar"`: sidebar kiri + konten kanan (gaya Stripe/Stoplight).
 * - `hideTryIt="false"`: aktifkan Try It / API Client.
 * - Script `clearAuth` mencegah penyimpanan token di localStorage.
 */
const buildDocsHtml = (publicUrl) => `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SIGAP External API Docs</title>
  <link rel="stylesheet" href="/docs/stoplight/styles.min.css">
  <style>
    /* ── Layout full viewport ── */
    html, body, elements-api { height: 100vh; margin: 0; padding: 0; overflow: hidden; }
    body { display: flex; flex-direction: column; }
    elements-api { flex: 1; }

    /* ── Dark theme override ── */
    ${docsThemeCss}
  </style>
</head>
<body>
  <elements-api
    apiDescriptionUrl="/docs/openapi.json"
    router="hash"
    layout="sidebar"
  />
  <script src="/docs/stoplight/web-components.min.js"></script>
  <script>
    // Cegah penyimpanan token auth di localStorage/sessionStorage.
    (function() {
      var origSetItem = localStorage.setItem.bind(localStorage);
      localStorage.setItem = function(key, value) {
        if (/auth|token|bearer|secret/i.test(key)) return;
        origSetItem(key, value);
      };
      var origSSSetItem = sessionStorage.setItem.bind(sessionStorage);
      sessionStorage.setItem = function(key, value) {
        if (/auth|token|bearer|secret/i.test(key)) return;
        origSSSetItem(key, value);
      };
    })();
  </script>
</body>
</html>`;

/**
 * Daftarkan route dokumentasi Stoplight Elements pada Fastify.
 *
 * - GET `/docs` → halaman HTML Stoplight Elements (200, bukan redirect).
 * - GET `/docs/stoplight/*` → bundle JS dan CSS statis (self-hosted, tanpa CDN).
 * - GET `/docs/openapi.json` → OpenAPI spec dari buildExternalOpenApi().
 *
 * @param {import("fastify").FastifyInstance} app
 * @param {{ publicUrl: string }} options
 */
export const registerDocsRoute = async (app, { publicUrl }) => {
  // Halaman dokumentasi utama.
  app.get("/docs", { schema: { hide: true } }, async (_request, reply) =>
    reply
      .header("Content-Type", "text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("Content-Security-Policy", DOCS_CSP)
      .send(buildDocsHtml(publicUrl))
  );

  // Redirect /docs/ → /docs agar konsisten.
  app.get("/docs/", { schema: { hide: true } }, async (_request, reply) =>
    reply.redirect("/docs", 301)
  );

  // Bundle statis Stoplight Elements (self-hosted).
  app.get("/docs/stoplight/web-components.min.js", { schema: { hide: true } }, async (_request, reply) =>
    reply
      .header("Content-Type", "application/javascript; charset=utf-8")
      .header("Cache-Control", "public, max-age=86400")
      .header("Content-Security-Policy", DOCS_CSP)
      .send(readStoplightFile("web-components.min.js"))
  );

  app.get("/docs/stoplight/styles.min.css", { schema: { hide: true } }, async (_request, reply) =>
    reply
      .header("Content-Type", "text/css; charset=utf-8")
      .header("Cache-Control", "public, max-age=86400")
      .header("Content-Security-Policy", DOCS_CSP)
      .send(readStoplightFile("styles.min.css"))
  );

  // OpenAPI spec untuk Stoplight Elements (di-fetch client-side).
  app.get("/docs/openapi.json", { schema: { hide: true } }, async () =>
    buildExternalOpenApi(publicUrl)
  );
};
