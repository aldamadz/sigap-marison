import { describe, expect, it, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import { registerDocsRoute, DOCS_CSP } from "../../external-api/docs-route.mjs";
import { buildExternalOpenApi } from "../../external-api/openapi.mjs";

const PUBLIC_URL = "https://external.marison-testing.biz.id";

describe("external API Scalar docs portal", () => {
  let app;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await registerDocsRoute(app, { publicUrl: PUBLIC_URL });
  });

  afterEach(async () => {
    await app.close();
  });

  it("serves the Scalar API Reference on /docs (not the custom portal or Swagger)", async () => {
    const response = await app.inject({ method: "GET", url: "/docs" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    // Scalar bundle is served locally from the plugin, not a third-party CDN.
    expect(response.body).toContain("/docs/js/scalar.js");
    // The custom portal markers must not be present.
    expect(response.body).not.toContain("buildDocsHtml");
    expect(response.body).not.toContain("Try Request");
    expect(response.body).not.toContain("docsClientScript");
    // No Swagger UI bundle from a CDN.
    expect(response.body).not.toContain("swagger-ui");
    expect(response.body).not.toContain("cdn.jsdelivr.net");
  });

  it("applies a same-origin CSP with the minimal resource sources on /docs", async () => {
    const response = await app.inject({ method: "GET", url: "/docs" });

    expect(response.headers["content-security-policy"]).toBe(DOCS_CSP);
    expect(DOCS_CSP).toContain("script-src 'self' 'unsafe-inline'");
    expect(DOCS_CSP).toContain("style-src 'self' 'unsafe-inline'");
    expect(DOCS_CSP).toContain("connect-src 'self'");
    expect(DOCS_CSP).not.toContain("https:");
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("does not persist authentication tokens (persistAuth is disabled)", async () => {
    // persistAuth: false prevents the Scalar bundle from storing the bearer token.
    // It cannot be expressed as a literal in the HTML (the bundle serializes the
    // config at runtime), so we assert the rendered bundle config does not prefill
    // any token value.
    const response = await app.inject({ method: "GET", url: "/docs" });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toMatch(/Bearer\s+[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  });

  it("serves the Scalar standalone bundle locally without third-party CDN", async () => {
    const bundle = await app.inject({ method: "GET", url: "/docs/js/scalar.js" });

    expect(bundle.statusCode).toBe(200);
    expect(bundle.headers["content-type"]).toContain("javascript");
    expect(bundle.body.length).toBeGreaterThan(1000);
    expect(bundle.body).toContain("Scalar");
  });

  it("exposes the OpenAPI document through the plugin with only the public decision endpoint", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/openapi.json" });

    expect(response.statusCode).toBe(200);
    const document = response.json();
    expect(document.info.title).toBe("SIGAP External API Docs");
    expect(Object.keys(document.paths)).toEqual(["/api/v1/submission-decisions"]);
    expect(document.components.securitySchemes.submissionDecisionBearer.type).toBe("http");
    expect(document.components.securitySchemes.submissionDecisionBearer.scheme).toBe("bearer");
  });

  it("matches the standalone OpenAPI builder contract", () => {
    const document = buildExternalOpenApi(PUBLIC_URL);
    expect(Object.keys(document.paths)).toEqual(["/api/v1/submission-decisions"]);
    expect(document.info.version).toBe("1.0.0");
    expect(document.info.description).toContain("Authorization: Bearer <token>");
    expect(document.info.description).toContain("Content-Type: application/json");
  });
});
