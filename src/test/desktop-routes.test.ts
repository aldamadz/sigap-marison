import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), session: vi.fn(), origin: vi.fn() }));
vi.mock("../../backend/src/lib/supabase.js", () => ({ adminSupabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock("../../backend/src/lib/session.js", () => ({ getSession: mocks.session, assertSameOrigin: mocks.origin }));
import { registerDesktopRoutes } from "../../backend/src/routes/desktop.routes";
import { registerErrorHandler } from "../../backend/src/plugins/errors";

const uid = "99999999-9999-4999-8999-999999999999";
const token = "A".repeat(43);
const headers = { authorization: `Bearer ${token}` };
let operations: unknown[][] = [];
const query = (data: unknown) => {
  const chain: any = {};
  for (const method of ["select", "eq", "order", "limit", "or", "update", "is", "in", "delete", "lt", "insert"]) chain[method] = (...args: unknown[]) => { operations.push([method, ...args]); return chain; };
  chain.single = chain.maybeSingle = () => Promise.resolve({ data, error: null });
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve);
  return chain;
};
async function app(environment = "staging") {
  vi.stubEnv("MARISON_DEPLOYMENT_ENVIRONMENT", environment);
  const instance = Fastify();
  await instance.register(rateLimit, { global: false });
  registerErrorHandler(instance);
  await registerDesktopRoutes(instance);
  return instance;
}
beforeEach(() => {
  vi.clearAllMocks(); operations = [];
  mocks.session.mockResolvedValue({ user: { id: uid } });
  mocks.rpc.mockResolvedValue({ data: { user_id: uid, session_id: uid, device_name: "PC" }, error: null });
});

describe("scoped desktop routes", () => {
  it("does not activate in production or leak through cookie sessions", async () => {
    const server = await app("production");
    expect((await server.inject({ method: "POST", url: "/api/desktop/pairings", payload: {} })).statusCode).toBe(404);
    expect(mocks.from).not.toHaveBeenCalled(); await server.close();
  });
  it("requires a dedicated bearer token, not a web cookie or Supabase JWT", async () => {
    const server = await app();
    for (const authorization of ["", "Bearer cookie-session", "Bearer a.b.c"]) expect((await server.inject({ url: "/api/desktop/me", headers: { authorization } })).statusCode).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled(); await server.close();
  });
  it("returns only minimal own profile and hashes access credentials", async () => {
    const server = await app();
    const response = await server.inject({ url: "/api/desktop/me", headers });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).not.toContain(token);
    expect(mocks.rpc.mock.calls[0][1].p_access_hash).toMatch(/^[0-9a-f]{64}$/); await server.close();
  });
  it("scopes notifications to the authenticated identity and removes external links", async () => {
    const server = await app();
    mocks.from.mockReturnValue(query([{ id: uid, title: "Action", message: "Pending", link: "https://evil.test", created_at: "2026-10-22T00:00:00Z" }]));
    const response = await server.inject({ url: "/api/desktop/notifications", headers });
    expect(response.json().items[0].path).toBe(null);
    expect(response.json().items[0]).not.toHaveProperty("link");
    expect(operations).toContainEqual(["eq", "user_id", uid]); await server.close();
  });
  it("rejects client-supplied notification owners", async () => {
    const server = await app();
    const response = await server.inject({ url: `/api/desktop/notifications?user_id=${uid}`, headers });
    expect(response.statusCode).toBe(400); expect(mocks.from).not.toHaveBeenCalled(); await server.close();
  });
  it("cannot mark another user's notification as read", async () => {
    const server = await app(); mocks.from.mockReturnValue(query(null));
    expect((await server.inject({ method: "POST", url: `/api/desktop/notifications/${uid}/read`, headers })).statusCode).toBe(404);
    expect(operations).toContainEqual(["eq", "user_id", uid]); await server.close();
  });
  it("keeps consent and revocation behind same-origin active web authentication", async () => {
    const server = await app();
    mocks.origin.mockImplementationOnce(() => { throw Object.assign(new Error("cross-site"), { statusCode: 403 }); });
    expect((await server.inject({ method: "POST", url: `/api/desktop/pairings/${uid}/decision`, payload: { user_code: "12345678", approve: true } })).statusCode).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled(); await server.close();
  });
  it("does not grant admin privileges to an ordinary paired user", async () => {
    const server = await app(); mocks.from.mockReturnValue(query({ role: "user" }));
    expect((await server.inject({ url: "/api/desktop/admin/devices" })).statusCode).toBe(403);
    expect(mocks.from).toHaveBeenCalledTimes(1); await server.close();
  });
  it("translates pending and rate-limit responses without minting credentials", async () => {
    const server = await app();
    for (const [error, status] of [["authorization_pending", 202], ["slow_down", 429], ["expired_request", 401], ["access_denied", 401]] as const) {
      mocks.rpc.mockResolvedValueOnce({ data: { error }, error: null });
      const response = await server.inject({ method: "POST", url: "/api/desktop/token", payload: { client_id: "sigap-desktop-staging", device_code: token, code_verifier: "v".repeat(43) } });
      expect(response.statusCode).toBe(status); expect(response.body).not.toContain("access_token");
    }
    await server.close();
  });
  it("fails closed for database outages, without returning database diagnostics", async () => {
    const server = await app(); mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "secret-db-info" } });
    const response = await server.inject({ url: "/api/desktop/me", headers });
    expect(response.statusCode).toBe(503); expect(response.body).not.toContain("secret-db-info"); await server.close();
  });
});
