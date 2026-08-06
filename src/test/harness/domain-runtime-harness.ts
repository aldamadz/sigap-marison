// Reusable characterization harness for backend/src/domain-runtime.ts.
// Boots a Fastify instance with only registerDomainRoutes (the legacy raw
// dispatcher is forwarded via hijack). All external services (Supabase,
// storage, SMTP, Marison vendor) are mocked to be FAIL-CLOSED: any call to a
// real network throws. A missing/invalid session makes getUser return an
// auth error, so protected endpoints answer 401/403 instead of 404.
import Fastify, { type FastifyInstance } from "fastify";

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

const noNetwork = (name: string) => () => {
  throw new Error(`FAIL-CLOSED: real ${name} network attempted`);
};

const authErrorClient = () => ({
  auth: {
    getUser: async () => ({ data: { user: null }, error: { message: "Unauthorized" } }),
    refreshSession: noNetwork("supabase.auth.refreshSession"),
    signInWithPassword: noNetwork("supabase.auth.signInWithPassword"),
  },
  from: noNetwork("supabase.from"),
  rpc: noNetwork("supabase.rpc"),
  storage: { from: noNetwork("storage.from") },
  realtime: { setAuth: noNetwork("realtime.setAuth"), channel: noNetwork("realtime.channel") },
});

export const stubRuntimeEnv = (vi: any) => {
  vi.mock("@supabase/supabase-js", () => ({
    createClient: authErrorClient,
  }));
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
};

// Track whether protected route 401 paths attempted any data/network call.
// A user-supplied tracker object is filled by the mock so tests can assert
// that auth rejects BEFORE any Supabase table/RPC/storage/vendor access.
export const createNetworkTracker = () => {
  const calls: string[] = [];
  return {
    calls,
    client: () => ({
      auth: {
        getUser: async () => {
          calls.push("auth.getUser");
          return { data: { user: null }, error: { message: "Unauthorized" } };
        },
        refreshSession: () => { calls.push("auth.refreshSession"); throw new Error("FAIL-CLOSED"); },
        signInWithPassword: () => { calls.push("auth.signInWithPassword"); throw new Error("FAIL-CLOSED"); },
      },
      from: () => { calls.push("supabase.from"); throw new Error("FAIL-CLOSED"); },
      rpc: () => { calls.push("supabase.rpc"); throw new Error("FAIL-CLOSED"); },
      storage: { from: () => { calls.push("storage.from"); throw new Error("FAIL-CLOSED"); } },
      realtime: {
        setAuth: () => { calls.push("realtime.setAuth"); throw new Error("FAIL-CLOSED"); },
        channel: () => { calls.push("realtime.channel"); throw new Error("FAIL-CLOSED"); },
      },
    }),
  };
};

export const unstubRuntimeEnv = (vi: any) => {
  vi.unstubAllEnvs();
  vi.resetModules();
};

export type BootedRuntime = {
  app: FastifyInstance;
  routes: any;
  runtime: any;
};

export const bootDomainRuntime = async (): Promise<BootedRuntime> => {
  const routes = await import("../../../backend/src/routes/domain.routes.ts");
  const runtime = await import("../../../backend/src/domain-runtime.ts");
  const app = Fastify({ logger: false });
  // Mirror the production onSend contract from backend/src/app.ts so that
  // every response (including Fastify's own 404) carries X-Request-Id.
  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("X-Request-Id", request.id);
    return payload;
  });
  app.setNotFoundHandler((request, reply) => {
    void reply.code(404).send({ error: "Not found", requestId: request.id });
  });
  await routes.registerDomainRoutes(app);
  return { app, routes, runtime };
};

// Helper to close the app safely in afterEach.
export const closeApp = async (booted: BootedRuntime | null) => {
  if (booted?.app) {
    try { await booted.app.close(); } catch { /* ignore */ }
  }
};
