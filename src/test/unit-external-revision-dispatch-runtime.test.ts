import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const internalToken = "fixture-outbound-internal-token-at-least-32-chars";
const lease = "79700000-0000-4000-8000-000000000001";
const attempt = "79700000-0000-4000-8000-000000000002";
const jobId = "79700000-0000-4000-8000-000000000003";

beforeEach(() => {
  vi.resetModules();
  for (const [name, value] of Object.entries({
    SUPABASE_URL: "https://database.test", SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key",
    SUPABASE_PUBLISHABLE_KEY: "fixture-public-key", APP_PUBLIC_URL: "https://sigap.test",
    STORAGE_MODE: "self_hosted_supabase", STORAGE_SUPABASE_URL: "https://storage.test",
    STORAGE_SUPABASE_SERVICE_ROLE_KEY: "fixture-storage-key",
    STORAGE_PUBLIC_BASE_URL: "https://storage.test/storage/v1/object/public",
    SESSION_SECRET: "fixture-session-secret-at-least-32-characters-long",
    MARISON_DEPLOYMENT_ENVIRONMENT: "production", MARISON_SUBMISSION_DISPATCH_ENABLED: "true",
    MARISON_OUTBOUND_INTERNAL_TOKEN: internalToken, NODE_ENV: "test",
  })) vi.stubEnv(name, value);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No network permitted in fixture"); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

describe("Unit revision production pre-POST boundary", () => {
  it.each([false, true])("holds accepted revisions before logical/transport build (frozen=%s)", async (frozen) => {
    const runtime = await import("../../backend/src/domain-runtime.ts");
    const job = { id: jobId, surat_id: "document", environment: "production", kind: "unit", status: "processing",
      replacement_of_dispatch_id: "g2", lease_token: lease, lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
      post_started_at: null, payload_body: frozen ? '{"fixture":true}' : null };
    const previous = { id: "g2", surat_id: "document", environment: "production", kind: "unit",
      status: "succeeded", external_reference: "2", generation: 2 };
    const rpc = vi.fn(() => { throw new Error("No database writes permitted"); });
    const from = vi.fn((table: string) => {
      expect(["marison_outbound_dispatches", "surat_registrasi"]).toContain(table);
      let id = "";
      const query = {
        select: () => query,
        eq: (column: string, value: string) => { if (column === "id") id = value; return query; },
        maybeSingle: async () => ({ data: table === "surat_registrasi" ? null : id === jobId ? job : previous, error: null }),
      };
      return query;
    });
    runtime.setDomainRuntimeDependenciesForTest({ supabase: { from, rpc: async (name: string, args: unknown) => {
      if (name !== "marison_procurement_routing_block") return rpc();
      expect(args).toEqual({ p_surat_id: job.surat_id });
      return { data: null, error: null };
    } } });
    const request: any = Readable.from([Buffer.from(JSON.stringify({ leaseToken: lease,
      transport: frozen, ...(frozen ? { materializationAttemptId: attempt } : {}) }))]);
    request.method = "POST";
    request.url = `/api/internal/marison/outbound/${jobId}/build`;
    request.headers = { host: "sigap.test", "content-type": "application/json", "x-internal-outbound-token": internalToken };
    const response: any = {
      statusCode: 0, body: "", setHeader: vi.fn(),
      writeHead(code: number) { this.statusCode = code; },
      end(body: string) { this.body = String(body || ""); },
    };
    await runtime.handleRequest(request, response);
    expect(response.statusCode, response.body).toBe(409);
    expect(JSON.parse(response.body).error).toContain("bukti pengembalian external");
    expect(rpc).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(job.payload_body).toBe(frozen ? '{"fixture":true}' : null);
  });
});
