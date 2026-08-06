// Fail-closed proof: protected routes with no session must reject via auth
// (getUser mock) and MUST NOT attempt any real fetch / Supabase table/RPC/
// storage/vendor network. The harness stubs global.fetch and the Supabase
// client to throw on any real network; a test fails if any is attempted.
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

describe("fail-closed: no real network on unauth protected routes", () => {
  const routes = [
    { method: "GET", url: "/api/integrations/marison/status" },
    { method: "GET", url: "/api/integrations/marison/dispatches" },
    { method: "GET", url: "/api/integrations/marison/dispatches/123e4567-e89b-12d3-a456-426614174000/preflight" },
    { method: "GET", url: "/api/integrations/marison/dispatches/123e4567-e89b-12d3-a456-426614174000/replacement-preflight" },
    { method: "POST", url: "/api/integrations/marison/dispatches/123e4567-e89b-12d3-a456-426614174000/reconcile" },
    { method: "POST", url: "/api/integrations/marison/dispatches/123e4567-e89b-12d3-a456-426614174000/replacement" },
    { method: "GET", url: "/api/surat/inbox" },
    { method: "GET", url: "/api/surat/inbox/123e4567-e89b-12d3-a456-426614174000/detail" },
    { method: "GET", url: "/api/attention/state" },
  ];

  for (const r of routes) {
    it(`${r.method} ${r.url} rejects 401 without fetch/network access`, async () => {
      const res = await booted!.app.inject({ method: r.method as any, url: r.url });
      expect(res.statusCode).toBe(401);
      expect(res.headers["x-request-id"]).toBeTruthy();
      // No real fetch/vendor network may be attempted on the auth path.
      expect(fetchCalls).toEqual([]);
    });
  }
});
