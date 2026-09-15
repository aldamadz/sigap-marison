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
  APP_PUBLIC_URL: "https://sigap.test",
  NODE_ENV: "test",
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

// Fail-closed global.fetch: any real fetch/vendor network must throw. The
// tracker records calls so tests can assert that protected routes never reach
// a vendor fetch.
export const fetchCalls: string[] = [];

export const stubRuntimeEnv = (vi: typeof import("vitest").vi) => {
  fetchCalls.length = 0;
  vi.stubGlobal("fetch", vi.fn((input: any, init?: any) => {
    const url = typeof input === "string" ? input : (input instanceof URL ? input.href : (input as { url: string }).url);
    fetchCalls.push(String(url));
    throw new Error(`FAIL-CLOSED: real fetch attempted: ${String(url)}`);
  }));
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
};

export const unstubRuntimeEnv = (vi: typeof import("vitest").vi) => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
  if (booted?.runtime?.resetDomainRuntimeDependenciesForTest) booted.runtime.resetDomainRuntimeDependenciesForTest();
    if (booted?.app) {
    try { await booted.app.close(); } catch { /* ignore */ }
  }
};
