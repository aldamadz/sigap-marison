import fastifyStatic from "@fastify/static";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExternalOpenApi } from "./openapi.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Content-Security-Policy khusus route dokumentasi Zudoku.
 *
 * Zudoku SPA memerlukan:
 * - `script-src 'self' 'unsafe-inline'`: React hydration dan inline scripts.
 * - `style-src 'self' 'unsafe-inline'`: CSS-in-JS dan inline styles.
 * - `connect-src 'self'`: fetch OpenAPI spec dan API calls dari playground.
 * - `img-src 'self' data:`: ikon dan gambar inline.
 * - `font-src 'self' data:`: font yang di-embed dalam CSS.
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
 * Daftarkan route dokumentasi Zudoku pada Fastify.
 *
 * - GET `/docs/*` → Zudoku SPA (static files dari docs-zudoku/dist/).
 * - GET `/docs/openapi.json` → OpenAPI spec dari buildExternalOpenApi().
 * - SPA fallback: semua route /docs/* yang bukan file statis → index.html.
 *
 * @param {import("fastify").FastifyInstance} app
 * @param {{ publicUrl: string }} options
 */
export const registerDocsRoute = async (app, { publicUrl }) => {
  const distDir = join(here, "docs-zudoku", "dist");
  const assetsDir = join(distDir, "assets");

  // Serve static files dari Zudoku build output di /docs/.
  await app.register(fastifyStatic, {
    root: distDir,
    prefix: "/docs/",
    wildcard: true,
    index: ["index.html"],
    setHeaders: (reply) => {
      reply.header("Cache-Control", "no-store");
      reply.header("Content-Security-Policy", DOCS_CSP);
    },
  });

  // Serve assets di /assets/ (Zudoku generate path absolut /assets/... di HTML).
  await app.register(fastifyStatic, {
    root: assetsDir,
    prefix: "/assets/",
    decorateReply: false,
    setHeaders: (reply) => {
      reply.header("Cache-Control", "public, max-age=31536000, immutable");
    },
  });

  // OpenAPI spec untuk Zudoku playground (fetch dari browser).
  app.get("/docs/openapi.json", { schema: { hide: true } }, async () =>
    buildExternalOpenApi(publicUrl)
  );

  // Redirect /docs → /docs/ (trailing slash diperlukan untuk static file serving).
  app.get("/docs", { schema: { hide: true } }, async (_request, reply) =>
    reply.redirect("/docs/", 301)
  );

  // Serve api.html untuk /docs/api (Zudoku prerender generates api.html for /api route).
  app.get("/docs/api", { schema: { hide: true } }, async (_request, reply) =>
    reply
      .header("Content-Type", "text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("Content-Security-Policy", DOCS_CSP)
      .sendFile("api.html", distDir)
  );
};
