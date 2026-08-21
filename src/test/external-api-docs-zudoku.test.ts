import { describe, expect, it, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { registerDocsRoute, DOCS_CSP } from "../../external-api/docs-route.mjs";
import { buildExternalOpenApi } from "../../external-api/openapi.mjs";

const PUBLIC_URL = "https://external.marison-testing.biz.id";
const TEST_INDEX = `<!doctype html><html lang="id"><head><title>SIGAP External API Docs</title><link rel="icon" href="/docs/favicon.png"></head><body><img src="/docs/favicon.png"><main>Zudoku</main></body></html>`;

describe("external API Zudoku docs portal", () => {
  let app: FastifyInstance;
  let testDocsDir: string;

  beforeAll(() => {
    testDocsDir = mkdtempSync(join(tmpdir(), "sigap-zudoku-docs-"));
    writeFileSync(join(testDocsDir, "api.html"), TEST_INDEX);
    writeFileSync(join(testDocsDir, "favicon.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  afterAll(() => {
    rmSync(testDocsDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    app = Fastify({ logger: false });
    // Register /health and /openapi.json like server.mjs does.
    app.get("/health", async () => ({ status: "ok" }));
    app.get("/openapi.json", async () => buildExternalOpenApi(PUBLIC_URL));
    await registerDocsRoute(app, { distDir: testDocsDir });
  });

  afterEach(async () => {
    await app.close();
  });

  it("redirects /docs to /docs/", async () => {
    const response = await app.inject({ method: "GET", url: "/docs" });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("/docs/");
  });

  it("serves the Zudoku SPA on /docs/api", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/api" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    // Zudoku SPA markers.
    expect(response.body).toContain("SIGAP External API Docs");
    // Local favicon + logo (no CDN, no double logo).
    expect(response.body).toContain(`rel="icon" href="/docs/favicon.png"`);
    expect(response.body).not.toContain("cdn.zudoku.dev/logos/favicon.svg");
    expect(response.body).toContain(`src="/docs/favicon.png"`);
    expect(response.body).not.toContain("/docs/logo.png");
    // Tab title without the default " - Zudoku" suffix.
    expect(response.body).toContain("<title>SIGAP External API Docs</title>");
    // No old portal markers.
    expect(response.body).not.toContain("swagger-ui");
    expect(response.body).not.toContain("cdn.jsdelivr.net");
    expect(response.body).not.toContain("Scalar.createApiReference");
    expect(response.body).not.toContain("elements-api");
  });

  it("serves the local favicon asset on /docs/favicon.png", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/favicon.png" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("image/png");
  });

  it("serves the Zudoku SPA on /docs/ (index fallback)", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
  });

  it("serves the SPA on /docs/api/submission-decisions (refresh fallback)", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/api/submission-decisions" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.headers["content-security-policy"]).toBe(DOCS_CSP);
    expect(response.body).toContain("SIGAP External API Docs");
  });

  it("applies a same-origin CSP on /docs/api", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/api" });

    expect(response.headers["content-security-policy"]).toBe(DOCS_CSP);
    expect(DOCS_CSP).toContain("script-src 'self' 'unsafe-inline'");
    expect(DOCS_CSP).toContain("style-src 'self' 'unsafe-inline'");
    expect(DOCS_CSP).toContain("connect-src 'self'");
    expect(DOCS_CSP).not.toContain("https:");
  });

  it("serves the OpenAPI document with only the public endpoints", async () => {
    const response = await app.inject({ method: "GET", url: "/openapi.json" });

    expect(response.statusCode).toBe(200);
    const document = response.json();
    expect(document.info.title).toBe("SIGAP External API Docs");
    expect(Object.keys(document.paths).sort()).toEqual(["/api/access-token", "/api/v1/submission-decisions"].sort());
    expect(document.components.securitySchemes.bearerAuth.type).toBe("http");
    expect(document.components.securitySchemes.bearerAuth.scheme).toBe("bearer");
    expect(document.components.securitySchemes.timestamp.name).toBe("X-Timestamp");
    expect(document.components.securitySchemes.signature.name).toBe("X-Signature");
  });

  it("matches the standalone OpenAPI builder contract", () => {
    const document = buildExternalOpenApi(PUBLIC_URL);
    expect(Object.keys(document.paths).sort()).toEqual(["/api/access-token", "/api/v1/submission-decisions"].sort());
    expect(document.info.version).toBe("2.0.0");
    expect(document.info.description).toBeUndefined();
    expect(document.tags).toEqual([{ name: "Authentication" }, { name: "Submission Decisions" }]);
    expect(document.paths["/api/v1/submission-decisions"].post.description).toContain("X-Signature");
  });

  it("bundles the same OpenAPI contract served by the runtime", () => {
    const bundledDocument = JSON.parse(
      readFileSync(
        join(process.cwd(), "external-api", "docs-zudoku", "apis", "openapi.json"),
        "utf8",
      ),
    );

    expect(bundledDocument).toEqual(buildExternalOpenApi(PUBLIC_URL));
  });

  it("keeps the Zudoku brand and base path in its build configuration", () => {
    const config = readFileSync(
      join(process.cwd(), "external-api", "docs-zudoku", "zudoku.config.ts"),
      "utf8",
    );

    expect(config).toContain('basePath: "/docs"');
    expect(config).toContain('title: "SIGAP External API Docs"');
    expect(config).toContain('src: { light: "/favicon.png", dark: "/favicon.png" }');
    expect(config).toContain('favicon: "/favicon.png"');
    expect(config).toContain('href: "/api"');
    expect(config).toContain("reloadDocument: true");
    expect(config).toContain('"#root > .grid > .lg\\\\:hidden.sticky.border-b"');
    expect(config).toContain('"header button[aria-label=\'Open navigation menu\']"');
    expect(config).toContain('inset: "1rem 1rem auto auto !important"');
    expect(config).toContain("linear-gradient(currentColor, currentColor)");
  });
});
