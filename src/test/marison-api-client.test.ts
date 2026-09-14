import { createHash, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createMarisonApiClient } from "../../backend/src/modules/marison/marison-api-client";

const env = (values: Record<string, string> = {}) => (name: string) => values[name];
const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const token = (access_token = "token", expires_in: unknown = 900) => ({ data: { access_token, expires_in } });
const makeClient = (values: Record<string, string> = {}, fetchImpl = vi.fn()) => createMarisonApiClient({
  deploymentEnvironment: "staging",
  readEnv: env(values), fetchImpl, nowMs: () => 1_000, nowIso: () => "2026-09-08T00:00:00.000Z", timeoutSignal: vi.fn(() => AbortSignal.abort()),
});
const staging: Record<string, string> = { MARISON_STAGING_CLIENT_ID: "client", MARISON_STAGING_CLIENT_SECRET: "secret" };

function assertHttpError(e: unknown): asserts e is Error & { status: number } {
  if (!(e instanceof Error) || !("status" in e)) throw new Error("Expected HTTP error");
}

describe("Marison API client", () => {
  it("normalizes allowed environments and rejects invalid before env lookup", () => {
    const readEnv = vi.fn(env());
    const client = createMarisonApiClient({ deploymentEnvironment: "staging", readEnv, fetchImpl: vi.fn(), nowMs: Date.now, nowIso: () => "", timeoutSignal: AbortSignal.timeout });
    expect(client.normalizeMarisonEnvironment(" StAgInG ")).toBe("staging");
    expect(client.normalizeMarisonEnvironment("PRODUCTION")).toBe("production");
    expect(() => client.getMarisonApiConfig("test")).toThrow("Environment Marison tidak valid.");
    expect(readEnv).not.toHaveBeenCalled();
  });

  it("uses default and normalized override base URLs with late environment reads", async () => {
    const values = { ...staging, MARISON_DEPLOYMENT_ENVIRONMENT: "staging", MARISON_STAGING_BASE_URL: "https://override/api///" };
    const client = makeClient(values);
    expect(client.getMarisonApiConfig("production").baseUrl).toBe("https://external.marisonregency.id/api");
    expect(client.getMarisonApiConfig("staging").baseUrl).toBe("https://override/api");
  });

  it("fails missing credentials before fetch", async () => {
    const fetchImpl = vi.fn();
    try {
      await makeClient({}, fetchImpl).getMarisonAccessToken({ source_key: "source" }, "staging");
      expect.unreachable("Should throw");
    } catch (e: unknown) {
      assertHttpError(e);
      expect(e.message).toBe("Credential API Marison staging belum dikonfigurasi di server.");
      expect(e.status).toBe(500);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses token contract, vendor errors, invalid token and expiry fallback", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json(token("abc", "invalid")));
    const client = makeClient(staging, fetchImpl);
    expect(await client.getMarisonAccessToken({ source_key: "source" }, "staging")).toBe("abc");
    expect(fetchImpl).toHaveBeenCalledWith("https://marison-external.digivasi.com/api/access-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: "client", client_secret: "secret" }) });
    fetchImpl.mockResolvedValueOnce(json(token("fallback")));
    const fallback = await client.getMarisonAccessToken({ source_key: "new" }, "staging");
    expect(fallback).toBe("fallback");
    try {
      await makeClient(staging, vi.fn().mockResolvedValue(json({ message: "vendor" }, 401))).getMarisonAccessToken({ source_key: "x" }, "staging");
      expect.unreachable("Should throw");
    } catch (e: unknown) {
      assertHttpError(e);
      expect(e.message).toBe("vendor");
      expect(e.status).toBe(401);
    }
    try {
      await makeClient(staging, vi.fn().mockResolvedValue(json({ data: {} }))).getMarisonAccessToken({ source_key: "x" }, "staging");
      expect.unreachable("Should throw");
    } catch (e: unknown) {
      assertHttpError(e);
      expect(e.message).toBe("Response access token API eksternal Marison tidak valid.");
      expect(e.status).toBe(502);
    }
  });

  it("caches token explicitly partitioning by baseUrl, source_key, and clientId", async () => {
    const now = 1_000;
    const fetchImpl = vi.fn().mockResolvedValue(json(token("one", 31)));
    const envValues = { ...staging };
    const client = createMarisonApiClient({ 
      deploymentEnvironment: "staging", 
      readEnv: (name) => envValues[name], 
      fetchImpl, 
      nowMs: () => now, 
      nowIso: () => "", 
      timeoutSignal: AbortSignal.timeout 
    });
    
    await client.getMarisonAccessToken({ source_key: "x" }, "staging");
    await client.getMarisonAccessToken({ source_key: "x" }, "staging");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await client.getMarisonAccessToken({ source_key: "y" }, "staging");
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    envValues.MARISON_STAGING_BASE_URL = "https://new-base/api";
    await client.getMarisonAccessToken({ source_key: "x" }, "staging");
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    envValues.MARISON_STAGING_BASE_URL = "https://marison-external.digivasi.com/api";
    envValues.MARISON_STAGING_CLIENT_ID = "new-client";
    await client.getMarisonAccessToken({ source_key: "x" }, "staging");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("signs protected GET pathname only and preserves upstream error", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json(token("key"))).mockResolvedValueOnce(json({ data: [] }));
    const client = makeClient(staging, fetchImpl);
    await client.getMarisonProtectedJson("staging", "/employees?search=one");
    const request = fetchImpl.mock.calls[1][1] as RequestInit;
    const canonical = `GET:/api/employees:key:${createHash("sha256").update(Buffer.alloc(0)).digest("hex")}:2026-09-08T00:00:00.000Z`;
    expect(request.headers).toEqual({ Authorization: "Bearer key", "X-Timestamp": "2026-09-08T00:00:00.000Z", "X-Signature": createHmac("sha512", "key").update(canonical).digest("hex") });
    try {
      await makeClient(staging, vi.fn().mockResolvedValueOnce(json(token())).mockResolvedValueOnce(json({}, 503))).getMarisonProtectedJson("staging", "/branches");
      expect.unreachable("Should throw");
    } catch (e: unknown) {
      assertHttpError(e);
      expect(e.message).toBe("Gagal mengambil /api/branches dari API Marison.");
      expect(e.status).toBe(503);
    }
  });

  it("reads direct/nested collections, stops correctly, and fails after 100 pages", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json(token())).mockResolvedValueOnce(json({ data: [{ id: 1 }], meta: { total_pages: 2 } })).mockResolvedValueOnce(json({ data: { data: [{ id: 2 }] }, meta: { total_pages: 2 } }));
    expect(await makeClient(staging, fetchImpl).getAllMarisonCollection("staging", "/branches")).toEqual([{ id: 1 }, { id: 2 }]);
    const endless = vi.fn().mockResolvedValueOnce(json(token())).mockResolvedValue(json({ data: [], meta: { total_pages: 101 } }));
    const rows = await makeClient(staging, endless).getAllMarisonCollection("staging", "/branches");
    expect(rows).toEqual([]);
    const hundred = vi.fn();
    hundred.mockResolvedValueOnce(json(token()));
    for (let index = 0; index < 100; index += 1) hundred.mockResolvedValueOnce(json({ data: [{}], meta: { total_pages: 101 } }));
    try {
      await makeClient(staging, hundred).getAllMarisonCollection("staging", "/branches");
      expect.unreachable("Should throw");
    } catch (e: unknown) {
      assertHttpError(e);
      expect(e.message).toBe("Pagination /branches melebihi batas aman.");
      expect(e.status).toBe(502);
    }
  });

  it("locks environment at boot and allows late resolved URL with correct canonical signature", async () => {
    const values = { ...staging, MARISON_DEPLOYMENT_ENVIRONMENT: "production", MARISON_PRODUCTION_CLIENT_ID: "prod", MARISON_PRODUCTION_CLIENT_SECRET: "sec" };
    const client = createMarisonApiClient({
      deploymentEnvironment: "staging",
      readEnv: env(values),
      fetchImpl: vi.fn().mockResolvedValue(json(token())),
      nowMs: Date.now,
      nowIso: () => "2026-09-08T00:00:00.000Z",
      timeoutSignal: AbortSignal.timeout
    });
    const state = await client.getMarisonEnvironmentState();
    expect(state.environment).toBe("staging");

    const fetchImpl = vi.fn().mockResolvedValueOnce(json(token())).mockResolvedValue(json({ data: [] }));
    const timeoutSignal = vi.fn(() => AbortSignal.timeout(20_000));
    const resolvingClient = createMarisonApiClient({
      deploymentEnvironment: "production",
      readEnv: env(values),
      fetchImpl,
      nowMs: Date.now,
      nowIso: () => "2026-09-08T00:00:00.000Z",
      timeoutSignal,
    });
    const resolvedUrl = new URL("https://external.marisonregency.id/api/unit?project_id=20&per_page=100");
    await resolvingClient.getMarisonExternalJson({ source_key: "unit" }, "production", resolvedUrl);
    
    const req = fetchImpl.mock.calls[1];
    expect(req[0].toString()).toBe("https://external.marisonregency.id/api/unit?project_id=20&per_page=100");
    expect(req[0].toString()).not.toContain("/api/api/");
    expect((req[1] as RequestInit).signal).toBeUndefined();
    
    const canonical = `GET:/api/unit:token:${createHash("sha256").update(Buffer.alloc(0)).digest("hex")}:2026-09-08T00:00:00.000Z`;
    expect((req[1] as RequestInit).headers).toEqual({
      Authorization: "Bearer token",
      "X-Timestamp": "2026-09-08T00:00:00.000Z",
      "X-Signature": createHmac("sha512", "token").update(canonical).digest("hex")
    });
    expect(canonical).not.toContain("project_id=20");

    const rejectsUrl = async (url: string) => {
      try {
        await resolvingClient.getMarisonExternalJson({}, "production", new URL(url));
        expect.unreachable("Should throw");
      } catch (e: unknown) {
        assertHttpError(e);
      expect(e.message).toBe("URL external Marison tidak valid.");
        expect(e.status).toBe(400);
      }
    };
    await rejectsUrl("https://evil.com/api");
    await rejectsUrl("https://external.marisonregency.id.evil.com/api");
    await rejectsUrl("http://external.marisonregency.id/api");
    await rejectsUrl("https://external.marisonregency.id:8443/api");
    await rejectsUrl("https://external.marisonregency.id/api-evil");
    await rejectsUrl("https://external.marisonregency.id/apis");
  });
});
