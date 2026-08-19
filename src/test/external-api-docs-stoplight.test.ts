import { describe, expect, it, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import { registerDocsRoute, DOCS_CSP } from "../../external-api/docs-route.mjs";
import { buildExternalOpenApi } from "../../external-api/openapi.mjs";

const PUBLIC_URL = "https://external.marison-testing.biz.id";

describe("external API Zudoku docs portal", () => {
  let app: InstanceType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await registerDocsRoute(app, { publicUrl: PUBLIC_URL });
  });

  afterEach(async () => {
    await app.close();
  });

  it("redirects /docs to /docs/ for static file serving", async () => {
    const response = await app.inject({ method: "GET", url: "/docs" });

    expect(response.statusCode).toBe(301);
    expect(response.headers.location).toBe("/docs/");
  });

  it("serves the Zudoku SPA on /docs/", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    // Zudoku index.html redirects to /docs/api (SPA entry point).
    expect(response.body).toContain("/docs/api");
    // No old portal markers.
    expect(response.body).not.toContain("swagger-ui");
    expect(response.body).not.toContain("cdn.jsdelivr.net");
    expect(response.body).not.toContain("unpkg.com");
    expect(response.body).not.toContain("Scalar.createApiReference");
    expect(response.body).not.toContain("elements-api");
  });

  it("applies a same-origin CSP on /docs/", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/" });

    expect(response.headers["content-security-policy"]).toBe(DOCS_CSP);
    expect(DOCS_CSP).toContain("script-src 'self' 'unsafe-inline'");
    expect(DOCS_CSP).toContain("style-src 'self' 'unsafe-inline'");
    expect(DOCS_CSP).toContain("connect-src 'self'");
    expect(DOCS_CSP).not.toContain("https:");
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("serves the OpenAPI document with only the public decision endpoint", async () => {
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
