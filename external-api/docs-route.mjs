import fastifyStatic from "@fastify/static";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExternalOpenApi } from "./openapi.mjs";

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
 * Daftarkan route dokumentasi Zudoku pada Fastify.
 *
 * Zudoku SPA di-serve di root path `/`:
 * - GET `/` → redirect ke `/api` (Zudoku index.html)
 * - GET `/api` → Zudoku SPA (api.html)
 * - GET `/assets/*` → JS/CSS bundles
 * - GET `/openapi.json` → OpenAPI spec
 *
 * Route `/health` dan `/api/v1/submission-decisions` tetap di server.mjs.
 *
 * @param {import("fastify").FastifyInstance} app
 * @param {{ publicUrl: string }} options
 */
export const registerDocsRoute = async (app, { publicUrl }) => {
  const distDir = join(here, "docs-zudoku", "dist");

  // Serve static files dari Zudoku build output di root `/`.
  await app.register(fastifyStatic, {
    root: distDir,
    prefix: "/",
    wildcard: false,
    index: false,
    setHeaders: (reply) => {
      reply.header("Content-Security-Policy", DOCS_CSP);
    },
  });

  // Redirect / → /api (Zudoku SPA entry point).
  app.get("/", { schema: { hide: true } }, async (_request, reply) =>
    reply.redirect("/api", 302)
  );

  // Serve api.html untuk /api (Zudoku SPA).
  app.get("/api", { schema: { hide: true } }, async (_request, reply) =>
    reply
      .header("Content-Type", "text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("Content-Security-Policy", DOCS_CSP)
      .sendFile("api.html", distDir)
  );
};
