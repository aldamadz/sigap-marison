import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { FastifyInstance } from "fastify";

const SPA_MARKER = "sigap-spa-root";

const testEnv = {
  NODE_ENV: "test",
  MARISON_DEPLOYMENT_ENVIRONMENT: "staging",
  MARISON_OUTBOUND_INTERNAL_TOKEN: "a".repeat(64),
  SUBMISSION_DECISIONS_API_TOKEN: "b".repeat(64),
  DIST_DIR: "",
  // Placeholder nilai arbitrer, bukan credential environment manapun.
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
  SESSION_SECRET: "0123456789abcdef0123456789abcdef",
  STORAGE_MODE: "self_hosted_supabase",
  STORAGE_SUPABASE_URL: "http://127.0.0.1:54321",
  STORAGE_SUPABASE_SERVICE_ROLE_KEY: "test-storage-key",
  STORAGE_PUBLIC_BASE_URL: "http://127.0.0.1:54321",
};

describe("SPA fallback HTTP integration", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const distDir = mkdtempSync(join(tmpdir(), "sigap-spa-"));
    testEnv.DIST_DIR = distDir;
    writeFileSync(
      join(distDir, "index.html"),
      `<!doctype html><html><body><div id="root">${SPA_MARKER}</div></body></html>`,
    );
    Object.assign(process.env, testEnv);

    const { buildApp } = await import("../../backend/src/app.js");
    app = await buildApp();
  }, 90000);

  afterAll(async () => {
    await app.close();
  });

  it("serves index.html for a deep client route without an HTML Accept header", async () => {
    const response = await app.inject({ method: "GET", url: "/calendar" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/html/);
    expect(response.body).toContain(SPA_MARKER);
  });

  it("preserves query params for a client route (date and view)", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/calendar?date=2026-09-21&view=week",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/html/);
    expect(response.body).toContain(SPA_MARKER);
  });

  it("preserves query params for a client route (entry id)", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/calendar?date=2026-09-21&view=day&entry=11111111-1111-1111-1111-111111111111",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/html/);
    expect(response.body).toContain(SPA_MARKER);
  });

  it("serves index.html for an HTML Accept header too", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/calendar",
      headers: { accept: "text/html,application/xhtml+xml" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(SPA_MARKER);
  });

  it("fails closed with 404 JSON for an unknown API route even with an HTML Accept header", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/unknown",
      headers: { accept: "text/html,application/xhtml+xml" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.json()).toMatchObject({ error: "Not found" });
  });

  it("fails closed with 404 JSON for an unknown health route", async () => {
    const response = await app.inject({ method: "GET", url: "/health/unknown" });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
  });

  it("reports a missing static asset as 404 instead of the SPA shell", async () => {
    const response = await app.inject({ method: "GET", url: "/assets/missing.js" });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
  });

  it("fails closed with 404 JSON for a non-GET request to a client route", async () => {
    const response = await app.inject({ method: "POST", url: "/calendar" });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
  });

  it("keeps the registered health route responding 200 JSON", async () => {
    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.json()).toMatchObject({ status: "ok" });
  });
});
