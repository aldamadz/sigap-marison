import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { previewStoredMarisonPayload } from "../../backend/src/lib/marison-payload-preview";
const id = "10000000-0000-4000-8000-000000000001";
const payload = { request_number: "TEST", branch_id: 1, main_document: "https://files.test/main.pdf", items: [{ asset_name: "Komputer", quantity: 3 }], approvals: [{ role: "manager", nik: "TEST-NIK" }] };
const body = JSON.stringify(payload);
const job = { id, environment: "staging", generation: 2, kind: "asset", endpoint: "/asset-purchase-requests", payload, payload_body: body, payload_hash: createHash("sha256").update(body).digest("hex"), post_started_at: "2026-10-21T00:00:00Z" };
describe("stored outbound payload preview", () => {
  it("reads frozen body instead of newer data without mutating the source", () => {
    const stored = { ...job, payload: { changed: true } }, before = structuredClone(stored);
    expect(previewStoredMarisonPayload(stored)).toMatchObject({ source: "frozen", payload, generation: 2, redacted: false });
    expect(stored).toEqual(before);
  });
  it.each(["unit", "non_unit", "fund", "asset"])("supports saved %s bodies", kind => {
    const endpoints: Record<string, string> = { unit: "/unit-submissions", non_unit: "/non-unit-submissions", fund: "/fund-submissions", asset: "/asset-purchase-requests" };
    expect(previewStoredMarisonPayload({ ...job, kind, endpoint: endpoints[kind] }).endpoint).toBe(endpoints[kind]);
  });
  it("distinguishes snapshot and unavailable without inventing payload", () => {
    expect(previewStoredMarisonPayload({ ...job, payload_body: null })).toMatchObject({ source: "snapshot", payload });
    expect(previewStoredMarisonPayload({ ...job, payload_body: null, payload: null })).toMatchObject({ source: "unavailable", payload: null });
  });
  it("masks credentials recursively but preserves business data and file links", () => {
    const result = previewStoredMarisonPayload({ ...job, payload_body: null, payload: { ...payload, Authorization: "Bearer private", headers: { "X-Signature": "private", client_secret: "private" }, nested: [{ access_token: "private" }] } });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result).toMatchObject({ redacted: true, payload: { main_document: payload.main_document, approvals: payload.approvals } });
  });
  it.each(["invalid-json", "[]", "null", "123", '"text"'])("fails closed for corrupt body %s", payload_body => {
    expect(() => previewStoredMarisonPayload({ ...job, payload_body, payload_hash: null })).toThrow(/tidak valid/);
  });
  it("rejects hash mismatch, excessive size/depth and unrecognized endpoints", () => {
    expect(() => previewStoredMarisonPayload({ ...job, payload_hash: "0".repeat(64) })).toThrow(/hash/);
    expect(() => previewStoredMarisonPayload({ ...job, payload_body: null, payload: { value: "x".repeat(2_000_001) } })).toThrow(/tidak valid/);
    let deep: unknown = {}; for (let i = 0; i < 35; i++) deep = { deep };
    expect(() => previewStoredMarisonPayload({ ...job, payload_body: null, payload: deep })).toThrow(/terlalu dalam/);
    expect(previewStoredMarisonPayload({ ...job, endpoint: "https://untrusted.test" }).endpoint).toBeNull();
  });
});
const source = readFileSync("backend/src/domain-runtime.ts", "utf8");
const handler = source.slice(source.indexOf("const getMarisonOutboundPayloadPreview ="), source.indexOf("const preflightMarisonOutboundRecovery ="));
function harness(options: { denied?: boolean; originDenied?: boolean; stored?: unknown; error?: unknown } = {}) {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data: options.stored === undefined ? job : options.stored, error: options.error })) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  const from = vi.fn(() => query);
  const context = { supabase: { from }, requireAdminUser: async () => { if (options.denied) throw Object.assign(new Error("Forbidden"), { status: 403 }); }, getBearerToken: () => "session", marisonDeploymentEnvironment: "staging", previewStoredMarisonPayload,
    assertSameOrigin: () => { if (options.originDenied) throw Object.assign(new Error("Origin"), { status: 403 }); } };
  const runtime = vm.runInNewContext(handler + "\n({getMarisonOutboundPayloadPreview});", context);
  return { get: (value = id) => runtime.getMarisonOutboundPayloadPreview({}, value), from, query };
}
describe("admin payload endpoint", () => {
  it.each([{ denied: true }, { originDenied: true }])("rejects unauthorized before DB access %j", async options => {
    const h = harness(options); await expect(h.get()).rejects.toMatchObject({ status: 403 }); expect(h.from).not.toHaveBeenCalled();
  });
  it("limits access to active environment and a valid dispatch", async () => {
    const h = harness(); expect(await h.get()).toMatchObject({ dispatchId: id });
    expect(h.query.eq).toHaveBeenCalledWith("environment", "staging"); expect(h.query.eq).toHaveBeenCalledWith("id", id);
    await expect(h.get("invalid")).rejects.toMatchObject({ status: 400 });
  });
  it("hides foreign environment, missing jobs and database errors", async () => {
    await expect(harness({ stored: null }).get()).rejects.toMatchObject({ status: 404 });
    await expect(harness({ stored: { ...job, environment: "production" } }).get()).rejects.toMatchObject({ status: 404 });
    await expect(harness({ error: { message: "private database error" } }).get()).rejects.toThrow("Payload pengiriman gagal dimuat.");
  });
  it("registers GET only with no-store and never invokes builder, RPC or vendor", () => {
    expect(readFileSync("backend/src/routes/domain.routes.ts", "utf8")).toContain('{ method: "GET", url: "/api/integrations/marison/dispatches/:dispatchId/payload" }');
    expect(handler).not.toMatch(/\.rpc\(|fetch\(|buildMarisonDispatchPayload|createMarisonOutboundReplacement/);
    expect(source).toContain('res.setHeader("Cache-Control", "private, no-store")');
  });
});
