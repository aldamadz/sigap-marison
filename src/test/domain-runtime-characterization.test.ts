import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  stubRuntimeEnv,
  unstubRuntimeEnv,
  bootDomainRuntime,
  closeApp,
  fetchCalls,
  type BootedRuntime,
} from "./harness/domain-runtime-harness";

let booted: BootedRuntime | null = null;

beforeEach(async () => {
  stubRuntimeEnv(vi);
  booted = await bootDomainRuntime();
});

afterEach(async () => {
  await closeApp(booted);
  booted = null;
  unstubRuntimeEnv(vi);
});

describe("domain-runtime protected route registration (no session)", () => {
  const protectedRoutes: Array<{ name: string; method: "GET" | "POST"; url: string; expected: 401 | 403 }> = [
    { name: "marison status", method: "GET", url: "/api/integrations/marison/status", expected: 401 },
    { name: "marison dispatches", method: "GET", url: "/api/integrations/marison/dispatches", expected: 401 },
    { name: "marison preflight", method: "GET", url: "/api/integrations/marison/dispatches/123e4567-e89b-12d3-a456-426614174000/preflight", expected: 401 },
    { name: "marison replacement-preflight", method: "GET", url: "/api/integrations/marison/dispatches/123e4567-e89b-12d3-a456-426614174000/replacement-preflight", expected: 401 },
    { name: "marison reconcile", method: "POST", url: "/api/integrations/marison/dispatches/123e4567-e89b-12d3-a456-426614174000/reconcile", expected: 401 },
    { name: "marison replacement", method: "POST", url: "/api/integrations/marison/dispatches/123e4567-e89b-12d3-a456-426614174000/replacement", expected: 401 },
    { name: "surat inbox", method: "GET", url: "/api/surat/inbox", expected: 401 },
    { name: "surat inbox detail", method: "GET", url: "/api/surat/inbox/123e4567-e89b-12d3-a456-426614174000/detail", expected: 401 },
    { name: "surat rejection by document number", method: "POST", url: "/api/surat/rejections", expected: 401 },
    { name: "attention state", method: "GET", url: "/api/attention/state", expected: 401 },
  ];

  for (const r of protectedRoutes) {
    it(`${r.method} ${r.name} is registered and returns ${r.expected} (not 404)`, async () => {
      const res = await booted!.app.inject({ method: r.method, url: r.url });
      expect(res.statusCode).toBe(r.expected);
      expect(res.statusCode).not.toBe(404);
      expect(res.headers["x-request-id"]).toBeTruthy();
      const body = res.json();
      expect(typeof body.requestId).toBe("string");
      // Fail-closed: auth rejects before any real fetch/vendor network.
      expect(fetchCalls).toEqual([]);
    });
  }
});

describe("domain-runtime wrong method rejection", () => {
  // Fastify only registers the exact methods in the route table; a wrong
  // method on a known path falls through to the notFound handler -> 404.
  const wrongMethodRoutes = [
    { method: "DELETE", url: "/api/surat/inbox", expected: 404 },
    { method: "PATCH", url: "/api/integrations/marison/status", expected: 404 },
    { method: "PUT", url: "/api/attention/state", expected: 404 },
  ];

  for (const r of wrongMethodRoutes) {
    it(`${r.method} ${r.url} -> ${r.expected} (does not reach business handler)`, async () => {
      const res = await booted!.app.inject({ method: r.method as any, url: r.url });
      expect(res.statusCode).toBe(r.expected);
      expect(res.headers["x-request-id"]).toBeTruthy();
      expect(fetchCalls).toEqual([]);
    });
  }
});

describe("domain-runtime random route stays 404", () => {
  const randomRoutes = [
    "/api/surat/inbox/does-not-exist",
    "/api/integrations/marison/statusx",
    "/api/nonexistent/route",
    "/api/attention/statezz",
  ];

  for (const url of randomRoutes) {
    it(`GET ${url} -> 404`, async () => {
      const res = await booted!.app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(404);
      expect(res.headers["x-request-id"]).toBeTruthy();
      expect(fetchCalls).toEqual([]);
    });
  }
});

describe("domain-runtime module import integrity", () => {
  it("boots without ReferenceError (module-level env throws are controlled)", async () => {
    expect(booted!.runtime).toBeTruthy();
    expect(typeof booted!.runtime.handleRequest).toBe("function");
    expect(typeof booted!.routes.registerDomainRoutes).toBe("function");
  });
});
