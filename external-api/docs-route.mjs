import fastifyStatic from "@fastify/static";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Content-Security-Policy khusus route dokumentasi Zudoku.
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
 * Daftarkan route dokumentasi Zudoku pada Fastify di path `/docs`.
 *
 * Struktur build Zudoku (dengan basePath: "/docs"):
 * - dist/docs/index.html → redirect ke /docs/api
 * - dist/docs/api.html → API reference
 * - dist/docs/api/submission-decisions.html → sub-routes (prerender)
 * - dist/docs/assets/* → JS/CSS bundles
 *
 * Server:
 * - GET /docs → redirect ke /docs/
 * - GET /docs/* → static files dari dist/docs/ (dengan SPA fallback)
 * - SPA fallback: route /docs/* yang tidak match file → serve api.html
 *
 * @param {import("fastify").FastifyInstance} app
 * @param {{ distDir?: string }} [options]
 */
export const registerDocsRoute = async (app, options = {}) => {
  const distDir = options.distDir || join(here, "docs-zudoku", "dist", "docs");

  // Serve static files dari Zudoku build output.
  await app.register(fastifyStatic, {
    root: distDir,
    prefix: "/docs/",
    wildcard: false,
    index: ["api.html"],
    setHeaders: (reply) => {
      reply.header("Content-Security-Policy", DOCS_CSP);
    },
  });

  // Redirect /docs → /docs/ (trailing slash untuk static file serving).
  app.get("/docs", { schema: { hide: true } }, async (_request, reply) =>
    reply.redirect("/docs/", 302)
  );

  // Serve api.html untuk /docs/api (Zudoku SPA entry point).
  app.get("/docs/api", { schema: { hide: true } }, async (_request, reply) =>
    reply
      .header("Content-Type", "text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("Content-Security-Policy", DOCS_CSP)
      .sendFile("api.html", distDir)
  );

  // SPA fallback: route /docs/* yang tidak match file → serve api.html.
  // Ini memastikan refresh di URL client-side (mis. /docs/api/submission-decisions)
  // tidak 404 dan Zudoku SPA dapat menangani routing.
  app.setNotFoundHandler((request, reply) => {
    if (request.method === "GET" && request.url.startsWith("/docs/")) {
      return reply
        .header("Content-Type", "text/html; charset=utf-8")
        .header("Cache-Control", "no-store")
        .header("Content-Security-Policy", DOCS_CSP)
        .sendFile("api.html", distDir);
    }
    return reply.code(404).send({ message: "Not Found" });
  });
};
