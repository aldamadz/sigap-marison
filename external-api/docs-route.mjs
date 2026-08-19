import scalarApiReference from "@scalar/fastify-api-reference";
import { renderApiReference } from "@scalar/client-side-rendering";
import { buildExternalOpenApi } from "./openapi.mjs";

/**
 * Content-Security-Policy khusus route dokumentasi Scalar.
 *
 * Scalar self-hosted memerlukan:
 * - `script-src 'self' 'unsafe-inline'`: bundle lokal (`/docs/js/scalar.js`) dan
 *   inline `<script>` inisialisasi `Scalar.createApiReference(...)`.
 * - `style-src 'self' 'unsafe-inline'`: stylesheet dan atribut style inline.
 * - `connect-src 'self'`: fetch OpenAPI (`/docs/openapi.json`) dan request
 *   Try It ke server yang sama.
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

const buildDocsConfiguration = (publicUrl) => ({
  content: () => buildExternalOpenApi(publicUrl),
  pageTitle: "SIGAP External API Docs",
  layout: "modern",
  theme: "moon",
  darkMode: true,
  forceDarkModeState: "dark",
  persistAuth: false,
  withDefaultFonts: false,
  hideDarkModeToggle: true,
  hideClientButton: false,
  showSidebar: true,
});

const renderDocsHtml = (publicUrl) => renderApiReference({
  config: {
    ...buildDocsConfiguration(publicUrl),
    url: "/docs/openapi.json",
  },
  pageTitle: "SIGAP External API Docs",
  cdn: "/docs/js/scalar.js",
});

/**
 * Daftarkan Scalar API Reference pada route `/docs`.
 *
 * - Konten OpenAPI diambil dari `buildExternalOpenApi(publicUrl)` sehingga
 *   hanya memuat path publik `/api/v1/submission-decisions`.
 * - Bundle Scalar disajikan lokal oleh plugin (`/docs/js/scalar.js`), tanpa CDN
 *   pihak ketiga.
 * - `persistAuth: false` menonaktifkan penyimpanan token di localStorage.
 * - GET `/docs` (tanpa trailing slash) dirender langsung agar response 200;
 *   plugin Scalar hanya menyediakan `/docs/` dan me-redirect `/docs` ke sana.
 */
export const registerDocsRoute = async (app, { publicUrl }) => {
  await app.register(scalarApiReference, {
    routePrefix: "/docs",
    logLevel: "warn",
    configuration: buildDocsConfiguration(publicUrl),
  });

  app.addHook("onRequest", async (request, reply) => {
    if (request.method !== "GET") return;
    const pathname = new URL(request.url, "http://internal.local").pathname;
    if (pathname !== "/docs") return;
    return reply
      .header("Content-Type", "text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("Content-Security-Policy", DOCS_CSP)
      .send(renderDocsHtml(publicUrl));
  });

  app.addHook("onSend", async (request, reply, payload) => {
    const pathname = new URL(request.url, "http://internal.local").pathname;
    if (pathname === "/docs" || pathname.startsWith("/docs/")) {
      reply.header("Cache-Control", "no-store");
      reply.header("Content-Security-Policy", DOCS_CSP);
    }
    return payload;
  });
};
