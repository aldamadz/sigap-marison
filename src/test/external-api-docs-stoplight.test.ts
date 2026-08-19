import { describe, expect, it, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import { registerDocsRoute, DOCS_CSP } from "../../external-api/docs-route.mjs";
import { buildExternalOpenApi } from "../../external-api/openapi.mjs";

const PUBLIC_URL = "https://external.marison-testing.biz.id";

describe("external API Stoplight docs portal", () => {
  let app: InstanceType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await registerDocsRoute(app, { publicUrl: PUBLIC_URL });
  });

  afterEach(async () => {
    await app.close();
  });

  it("serves the Stoplight Elements web component on /docs (not custom portal, Swagger, or Scalar)", async () => {
    const response = await app.inject({ method: "GET", url: "/docs" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    // Stoplight Elements web component marker.
    expect(response.body).toContain("<elements-api");
    expect(response.body).toContain("apiDescriptionUrl=\"/docs/openapi.json\"");
    expect(response.body).toContain("layout=\"sidebar\"");
    // Self-hosted bundle reference (same-origin, no CDN).
    expect(response.body).toContain("/docs/stoplight/web-components.min.js");
    expect(response.body).toContain("/docs/stoplight/styles.min.css");
    // Old portal markers must not be present.
    expect(response.body).not.toContain("swagger-ui");
    expect(response.body).not.toContain("cdn.jsdelivr.net");
    expect(response.body).not.toContain("unpkg.com");
    expect(response.body).not.toContain("Scalar.createApiReference");
    // Auth persistence prevention script.
    expect(response.body).toContain("auth|token|bearer|secret");
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

  it("serves the Stoplight web-components bundle locally without third-party CDN", async () => {
    const bundle = await app.inject({ method: "GET", url: "/docs/stoplight/web-components.min.js" });

    expect(bundle.statusCode).toBe(200);
    expect(bundle.headers["content-type"]).toContain("javascript");
    expect(bundle.body.length).toBeGreaterThan(1000);
  });

  it("serves the Stoplight styles locally without third-party CDN", async () => {
    const styles = await app.inject({ method: "GET", url: "/docs/stoplight/styles.min.css" });

    expect(styles.statusCode).toBe(200);
    expect(styles.headers["content-type"]).toContain("text/css");
    expect(styles.body.length).toBeGreaterThan(100);
  });

  it("serves the OpenAPI document through the plugin with only the public decision endpoint", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/openapi.json" });

    expect(response.statusCode).toBe(200);
    const document = response.json();
    expect(document.info.title).toBe("SIGAP External API Docs");
    expect(Object.keys(document.paths)).toEqual(["/api/v1/submission-decisions"]);
    expect(document.components.securitySchemes.submissionDecisionBearer.type).toBe("http");
    expect(document.components.securitySchemes.submissionDecisionBearer.scheme).toBe("bearer");
  });

  it("redirects /docs/ to /docs for consistent URL", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/" });

    expect(response.statusCode).toBe(301);
    expect(response.headers.location).toBe("/docs");
  });

  it("matches the standalone OpenAPI builder contract", () => {
    const document = buildExternalOpenApi(PUBLIC_URL);
    expect(Object.keys(document.paths)).toEqual(["/api/v1/submission-decisions"]);
    expect(document.info.version).toBe("1.0.0");
    expect(document.info.description).toContain("Authorization: Bearer <token>");
    expect(document.info.description).toContain("Content-Type: application/json");
  });
});
