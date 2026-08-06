// Fail-closed proof: protected routes with no session must reject via auth
// (getUser mock) and MUST NOT attempt any real Supabase table/RPC/storage or
// vendor network. The tracker client throws on any data access, so a test
// fails if the handler ever calls supabase.from/rpc/storage/realtime.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";

const ENV = {
  SUPABASE_URL: "https://database.test",
  VITE_SUPABASE_URL: "https://database.test",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
  VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY: "publishable-test-key",
  SESSION_SECRET: "test-session-secret-at-least-32-characters-long",
  STORAGE_MODE: "self_hosted_supabase",
  STORAGE_SUPABASE_URL: "https://storage.test",
  STORAGE_SUPABASE_SERVICE_ROLE_KEY: "storage-service-role-key",
  STORAGE_PUBLIC_BASE_URL: "https://storage.test/storage/v1/object/public",
  MARISON_DEPLOYMENT_ENVIRONMENT: "staging",
  MARISON_OUTBOUND_INTERNAL_TOKEN: "test-outbound-internal-token-32-characters-min",
};

let trackerCalls: string[] = [];

const makeMockClient = () => {
  const record = (name: string) => () => { trackerCalls.push(name); throw new Error(`FAIL-CLOSED: ${name} attempted`); };
  return {
    auth: {
      getUser: async () => { trackerCalls.push("auth.getUser"); return { data: { user: null }, error: { message: "Unauthorized" } }; },
      refreshSession: record("auth.refreshSession"),
      signInWithPassword: record("auth.signInWithPassword"),
    },
    from: record("supabase.from"),
    rpc: record("supabase.rpc"),
    storage: { from: record("storage.from") },
    realtime: { setAuth: record("realtime.setAuth"), channel: record("realtime.channel") },
  };
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: makeMockClient,
}));

let app: any;

beforeEach(async () => {
  trackerCalls = [];
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  const routes = await import("../../backend/src/routes/domain.routes.ts");
  const runtime = await import("../../backend/src/domain-runtime.ts");
  expect(typeof runtime.handleRequest).toBe("function");
  app = Fastify({ logger: false });
  app.addHook("onSend", async (request: any, reply: any, payload: any) => {
    reply.header("X-Request-Id", request.id);
    return payload;
  });
  app.setNotFoundHandler((request: any, reply: any) => {
    void reply.code(404).send({ error: "Not found", requestId: request.id });
  });
  await routes.registerDomainRoutes(app);
});

afterEach(async () => {
  if (app) { try { await app.close(); } catch { /* ignore */ } }
  app = null;
  vi.unstubAllEnvs();
  vi.resetModules();
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
    it(`${r.method} ${r.url} rejects 401 without data/network access`, async () => {
      const res = await app.inject({ method: r.method, url: r.url });
      expect(res.statusCode).toBe(401);
      expect(res.headers["x-request-id"]).toBeTruthy();
      // Auth rejection must happen before any Supabase table/RPC/storage/vendor call.
      expect(trackerCalls).toContain("auth.getUser");
      expect(trackerCalls).not.toContain("supabase.from");
      expect(trackerCalls).not.toContain("supabase.rpc");
      expect(trackerCalls).not.toContain("storage.from");
      expect(trackerCalls).not.toContain("auth.refreshSession");
    });
  }
});
