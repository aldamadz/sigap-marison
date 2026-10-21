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
function harness(options: { denied?: boolean; originDenied?: boolean; stored?: unknown; error?: unknown; letter?: unknown; tokenError?: unknown } = {}) {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data: options.stored === undefined ? job : options.stored, error: options.error })) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  const letterQuery = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data: options.letter === undefined ? { id: "letter-a", status: "DONE", pdf_path: "main.pdf" } : options.letter, error: null })) };
  letterQuery.select.mockReturnValue(letterQuery); letterQuery.eq.mockReturnValue(letterQuery);
  const tokens = { select: vi.fn(), in: vi.fn(async () => ({ data: [], error: options.tokenError })) };
  tokens.select.mockReturnValue(tokens);
  const prepare = vi.fn(() => ({ payload: { type: "marketing_cost", main_document: "verified-link" }, payloadHash: "candidate" }));
  const from = vi.fn((table: string) => table === "surat_registrasi" ? letterQuery : table === "file_view_tokens" ? tokens : query);
  const context = { supabase: { from }, requireAdminUser: async () => { if (options.denied) throw Object.assign(new Error("Forbidden"), { status: 403 }); }, getBearerToken: () => "session", marisonDeploymentEnvironment: "staging", previewStoredMarisonPayload,
    process: { env: { APP_PUBLIC_URL: "https://sigap.test" } }, fundPostmanLinks: () => [{ tokenHash: "hash" }], previewFundForPostman: prepare,
    resolveFinalMarisonPdfPath: () => "main.pdf", parseStorageRef: vi.fn(),
    assertSameOrigin: () => { if (options.originDenied) throw Object.assign(new Error("Origin"), { status: 403 }); } };
  const runtime = vm.runInNewContext(handler + "\n({getMarisonOutboundPayloadPreview});", context);
  return { get: (value = id, view = "stored") => runtime.getMarisonOutboundPayloadPreview({}, value, view), from, query, letterQuery, tokens, prepare };
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
  it("validates view before DB and refuses Postman for other kinds or incomplete history", async () => {
    const h = harness(); await expect(h.get(id, "other")).rejects.toMatchObject({ status: 400 });
    expect(h.from).not.toHaveBeenCalled();
    await expect(h.get(id, "postman")).rejects.toMatchObject({ status: 409 });
    await expect(harness({ stored: { ...job, kind: "fund", endpoint: "/fund-submissions", payload_body: null } }).get(id, "postman")).rejects.toMatchObject({ status: 409 });
  });
  it("uses read-only letter/token queries and returns separate source/hash for the candidate", async () => {
    const h = harness({ stored: { ...job, surat_id: "letter-a", kind: "fund", endpoint: "/fund-submissions" } });
    expect(await h.get(id, "postman")).toMatchObject({ source: "postman", payloadHash: "candidate", sourcePayloadHash: job.payload_hash, payload: { type: "marketing_cost" } });
    expect(h.letterQuery.eq).toHaveBeenCalledWith("id", "letter-a");
    expect(h.tokens.in).toHaveBeenCalledWith("token_hash", ["hash"]);
    expect(h.prepare).toHaveBeenCalledOnce();
    const stored = await h.get(); expect(stored).toMatchObject({ source: "frozen", payloadHash: job.payload_hash });
  });
  it("blocks nonfinal/missing letters and token lookup errors", async () => {
    const stored = { ...job, surat_id: "letter-a", kind: "fund", endpoint: "/fund-submissions" };
    await expect(harness({ stored, letter: { status: "PROSES" } }).get(id, "postman")).rejects.toMatchObject({ status: 409 });
    await expect(harness({ stored, letter: null }).get(id, "postman")).rejects.toMatchObject({ status: 409 });
    await expect(harness({ stored, tokenError: { message: "private" } }).get(id, "postman")).rejects.toThrow("Tautan payload gagal diperiksa.");
  });
});
