import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { returnedUnitFixture } from "./fixtures/unit-external-revision";

const internalToken = "fixture-outbound-internal-token-at-least-32-chars";
const lease = "80200000-0000-4000-8000-000000000001";
const attempt = "80200000-0000-4000-8000-000000000002";
beforeEach(() => {
  vi.resetModules();
  for (const [key, value] of Object.entries({ SUPABASE_URL: "https://database.test", SUPABASE_SERVICE_ROLE_KEY: "fixture-key", SUPABASE_PUBLISHABLE_KEY: "fixture-public",
    APP_PUBLIC_URL: "https://sigap.test", STORAGE_MODE: "self_hosted_supabase", STORAGE_SUPABASE_URL: "https://storage.test",
    STORAGE_SUPABASE_SERVICE_ROLE_KEY: "fixture-storage", STORAGE_PUBLIC_BASE_URL: "https://storage.test/storage/v1/object/public",
    SESSION_SECRET: "fixture-session-secret-at-least-32-characters-long", MARISON_DEPLOYMENT_ENVIRONMENT: "production",
    MARISON_SUBMISSION_DISPATCH_ENABLED: "true", MARISON_OUTBOUND_INTERNAL_TOKEN: internalToken, NODE_ENV: "test" })) vi.stubEnv(key, value);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

async function request({ unsigned = false, foreignUnit = false, dataError = false, badToken = false, unknown = false, later = false, alreadySent = false, examinerType = '' } = {}) {
  const fixture = returnedUnitFixture();
  fixture.job.id = "80200000-0000-4000-8000-000000000003";
  const payload = structuredClone(fixture.previous.payload);
  if (examinerType) payload.units[0].type = examinerType;
  const job = { ...fixture.job, status: "processing", lease_token: lease, lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
    post_started_at: null, payload_body: JSON.stringify(payload), payload_hash: "fixture-hash", endpoint: "/unit-submissions", contract_version: "fixture" };
  if (unsigned) fixture.evidence.document.surat_signatures[4].is_signed = false;
  if (foreignUnit) payload.units[0].unit_id = 9999;
  job.payload_body = JSON.stringify(payload);
  if (unknown) fixture.previous.status = "outcome_unknown";
  if (alreadySent) job.status = "succeeded";
  if (later) fixture.evidence.dispatches.push({ ...fixture.job, generation: 4, id: "g4" });
  const calls: string[] = [];
  const network = vi.fn(async (url: unknown, init?: RequestInit) => {
    expect(init?.method || "GET").toBe("GET");
    expect(String(url)).toContain("/units?project_id=23");
    return { ok: true, status: 200, json: async () => ({ data: payload.units.map(unit => ({
      id: unit.unit_id, type: "30", name: "Kavling", has_submitted: true,
    })) }) };
  });
  vi.stubGlobal("fetch", network);
  const rpc = vi.fn(() => { throw Error("No writes allowed in transport validation"); });
  const from = vi.fn((table: string) => {
    calls.push(table);
    let id = "";
    const result = () => {
      const value = table === "surat_registrasi" ? fixture.evidence.document
        : table === "surat_revision_events" ? fixture.evidence.revision
        : table === "external_submission_decision_events" ? fixture.evidence.decision
        : table === "surat_external_revision_history" ? fixture.evidence.archive
        : table === "external_data_sources" ? { source_key: "marison_units_by_project", method: "GET",
          endpoint_template: "/units?project_id={project_id}", response_path: "data", value_path: "id", label_path: "name" }
        : id === job.id ? job : id === fixture.previous.id ? fixture.previous : fixture.evidence.dispatches;
      return { data: value, error: dataError && table === "surat_revision_events" ? { message: "fixture-read-error" } : null };
    };
    const query = { select: () => query, eq: (key: string, value: string) => { if (key === "id") id = value; return query; },
      gte: () => query, order: () => query, limit: () => query, maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve) };
    return query;
  });
  const runtime = await import("../../backend/src/domain-runtime.ts");
  runtime.setDomainRuntimeDependenciesForTest({ supabase: { from, rpc: async (name: string, args: unknown) => {
    if (name !== "marison_procurement_routing_block") return rpc();
    expect(args).toEqual({ p_surat_id: job.surat_id });
    return { data: null, error: null };
  } } });
  const req: any = Readable.from([Buffer.from(JSON.stringify({ leaseToken: lease, transport: true, materializationAttemptId: attempt }))]);
  req.method = "POST"; req.url = `/api/internal/marison/outbound/${job.id}/build`;
  req.headers = { host: "sigap.test", "content-type": "application/json", "x-internal-outbound-token": badToken ? "bad-token" : internalToken };
  const res: any = { statusCode: 0, body: "", setHeader: vi.fn(),
    writeHead(code: number) { this.statusCode = code; }, end(body: string) { this.body = String(body); } };
  await runtime.handleRequest(req, res);
  return { fixture, job, res, network, rpc, calls };
}

describe("returned Unit transport boundary", () => {
  it('retains an approved examiner type even when fresh external type differs', async () => {
    const {res,network,rpc}=await request({examinerType:'36/72'});
    expect(res.statusCode,res.body).toBe(200);
    expect(JSON.parse(JSON.parse(res.body).payloadBody).units[0].type).toBe('36/72');
    expect(network).toHaveBeenCalledTimes(1);expect(rpc).not.toHaveBeenCalled();
  });
  it("materializes a verified revision using the same number without a business POST or DB write", async () => {
    const { res, network, rpc } = await request();
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(JSON.parse(res.body).payloadBody);
    expect(body.submission_number).toBe("051/UAI/MKT.1.SGN/X/2026");
    expect(body.units).toHaveLength(3);
    expect(network).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([{ unsigned: true }, { unknown: true }, { later: true }, { alreadySent: true }])("holds unapproved, uncertain, consumed or superseded revisions %j", async config => {
    const { res, network, rpc } = await request(config);
    expect(res.statusCode, res.body).toBe(409); expect(network).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects a submitted unit not owned by the accepted payload", async () => {
    const { res, rpc } = await request({ foreignUnit: true });
    expect(res.statusCode, res.body).toBe(422); expect(rpc).not.toHaveBeenCalled();
  });
  it("fails closed on unavailable private evidence", async () => {
    const { res, network, rpc } = await request({ dataError: true });
    expect(res.statusCode, res.body).toBe(503); expect(network).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it("requires the internal token before reading private evidence", async () => {
    const { res, calls, network } = await request({ badToken: true });
    expect(res.statusCode).toBe(401); expect(calls).toEqual([]); expect(network).not.toHaveBeenCalled();
  });
});
