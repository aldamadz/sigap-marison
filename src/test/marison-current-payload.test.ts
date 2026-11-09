import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { compareCurrentPayload, currentPayloadPreview, reusableCurrentFileLinks, storedCapabilityLinks } from "../../backend/src/lib/marison-current-payload";
import { previewStoredMarisonPayload } from "../../backend/src/lib/marison-payload-preview";
import { buildMarisonDocumentBundle } from "../../backend/src/lib/marison-document-links";
import { getExternalUnitReference, applyExternalUnitReference } from "@sigap/shared";
import { isDeepStrictEqual } from "node:util";
import { buildProductionCode } from "../../production-code.mjs";

const origin = "https://sigap.test";
const link = `${origin}/api/files/view/${"x".repeat(32)}/old.pdf`;
const hash = createHash("sha256").update("x".repeat(32)).digest("hex");
const parseRef = (path: string) => ({ origin: "external", bucket: "pdfs", path });
const oldPayload = { main_document: link, units: [{ unit_id: 2048, addendum_atas_nominal: 1703120, addendum_bawah_nominal: 0 }, { unit_id: 2074, addendum_atas_nominal: 1703120, addendum_bawah_nominal: 0 }, { unit_id: 2173, addendum_atas_nominal: 0, addendum_bawah_nominal: 0 }] };
const currentPayload = { ...oldPayload, units: [{ unit_id: 2048, addendum_atas_nominal: 1703120, addendum_bawah_nominal: 246000 }, { unit_id: 2074, addendum_atas_nominal: 1703120, addendum_bawah_nominal: 434492 }, { unit_id: 2173, addendum_atas_nominal: 1826521, addendum_bawah_nominal: 1203009 }] };
const job = { id: "job", surat_id: "letter", environment: "staging", generation: 2, status: "succeeded", kind: "unit", endpoint: "/unit-submissions", payload: oldPayload, payload_body: JSON.stringify(oldPayload), payload_hash: createHash("sha256").update(JSON.stringify(oldPayload)).digest("hex"), post_started_at: "2026-10-19" };

describe("current outbound JSON candidate", () => {
  it("compares the corrected 051 values without rewriting the accepted snapshot", () => {
    const before = structuredClone(job);
    const result = currentPayloadPreview(previewStoredMarisonPayload(job), { kind: "unit", endpoint: job.endpoint, payload: currentPayload }, "unit", "2026-10-22", new Date("2026-10-22T01:00:00Z"));
    expect(result).toMatchObject({ source: "latest", validation: "passed", generatedAt: "2026-10-22T01:00:00.000Z", payload: currentPayload });
    expect(result.fieldChanges).toHaveLength(4);
    expect(result.fieldChanges[0]).toMatchObject({ path: "units[0].addendum_bawah_nominal", before: 0, after: 246000 });
    expect(result.payloadHash).not.toBe(job.payload_hash);
    expect(job).toEqual(before);
  });
  it("shows additions, removal and null distinctly, including attachments", () => {
    expect(compareCurrentPayload({ a: null, attachments: ["old"], note: "x" }, { a: null, attachments: ["new"], extra: null })).toEqual([
      { path: "attachments[0]", before: "old", after: "new", added: false, removed: false },
      { path: "note", before: "x", after: null, added: false, removed: true },
      { path: "extra", before: null, after: null, added: true, removed: false },
    ]);
    expect(compareCurrentPayload({ a: 0 }, { a: 0 })).toEqual([]);
  });
  it("blocks endpoint/category drift, redacted history and oversized candidates", () => {
    const stored = previewStoredMarisonPayload(job);
    expect(() => currentPayloadPreview(stored, { endpoint: "/fund-submissions", kind: "fund", payload: {} }, "unit", null)).toThrow(/Kategori/);
    expect(() => currentPayloadPreview({ ...stored, redacted: true }, { endpoint: job.endpoint, kind: "unit", payload: {} }, "unit", null)).toThrow(/tidak lengkap/);
    expect(() => currentPayloadPreview(stored, { endpoint: job.endpoint, kind: "unit", payload: { text: "x".repeat(2000001) } }, "unit", null)).toThrow(/terlalu besar/);
  });
  it("only recovers same-origin capability URLs without query/credentials and deduplicates", () => {
    expect(storedCapabilityLinks({ links: [link, link, link.replace("sigap.test", "foreign.test"), `${link}?token=secret`, "https://user:pass@sigap.test/api/files/view/" + "x".repeat(32)] }, origin)).toEqual(new Map([[hash, link]]));
  });
  it("only reuses a validated same-document current file reference", async () => {
    const entries = [{ url: link, suratId: "letter", purpose: "external_marison", ref: parseRef("new.pdf") }];
    const resolve = reusableCurrentFileLinks(entries, "letter", parseRef);
    expect(await resolve("new.pdf")).toBe(link);
    await expect(resolve("unpublished.pdf")).rejects.toThrow(/belum tersedia/);
    await expect(reusableCurrentFileLinks(entries, "other", parseRef)("new.pdf")).rejects.toThrow();
  });
});

const source = readFileSync("backend/src/domain-runtime.ts", "utf8");
const generator = source.slice(source.indexOf("const generateCurrentMarisonPayloadPreview ="), source.indexOf("const getMarisonOutboundPayloadPreview ="));
function harness(options: { status?: string; signed?: boolean; missingToken?: boolean; revoked?: boolean; expired?: boolean; concurrent?: boolean; noPdf?: boolean } = {}) {
  let reads = 0;
  const letter = { id: "letter", status: options.status || "DONE", updated_at: "2026-10-22", file_path: "native://document/letter", pdf_path: options.noPdf ? null : "new.pdf", surat_signatures: [{ id: "s", is_signed: options.signed !== false, signed_at: "2026-10-22" }], surat_attachments: [] };
  const token = { id: "t", token_hash: hash, purpose: "external_marison", surat_id: "letter", revoked_at: options.revoked ? "2026-10-22" : null, expires_at: options.expired ? "2000-01-01" : null };
  const from = vi.fn((table: string) => {
    if (!["surat_registrasi", "file_view_tokens", "marison_outbound_dispatches"].includes(table)) throw new Error(`Unexpected table ${table}`);
    const chain: any = {};
    for (const method of ["select", "eq", "limit"]) chain[method] = () => chain;
    chain.maybeSingle = async () => {
      if (table === "marison_outbound_dispatches") return { data: { id: "accepted-generation" }, error: null };
      reads++;
      return { data: { ...letter, status: options.concurrent && reads > 1 ? "PROSES" : letter.status }, error: null };
    };
    chain.in = async () => ({ data: options.missingToken ? [] : [token], error: null });
    return chain;
  });
  const mint = vi.fn(() => { throw new Error("Token mint forbidden"); });
  const rpc = vi.fn(() => { throw new Error("Unexpected RPC"); });
  const resolver = vi.fn(async () => parseRef("new.pdf"));
  const context = {
    assertMarisonProcurementRoute: async () => {},
    supabase: { from, rpc }, storedCapabilityLinks, reusableCurrentFileLinks, currentPayloadPreview, previewStoredMarisonPayload,
    process: { env: { APP_PUBLIC_URL: origin } }, parseStorageRef: parseRef, resolveExternalFileReference: resolver,
    getMarisonOutboundMappings: async () => ({}),
    buildMarisonDispatchPayload: async (surat: typeof letter, _actor: unknown, overrides: { existingFileLink: (path: string) => Promise<string>; requireUnsubmittedUnitReferences: boolean }) => {
      expect(overrides.requireUnsubmittedUnitReferences).toBe(false);
      const documents = await context.buildLinks(surat, null, overrides.existingFileLink);
      return { kind: "unit", endpoint: job.endpoint, payload: { ...currentPayload, main_document: documents.mainDocument } };
    },
    buildLinks: null as any,
    resolveFinalMarisonPdfPath: (surat: typeof letter) => surat.pdf_path,
    asArrayValue: (value: unknown) => Array.isArray(value) ? value : [], buildMarisonDocumentBundle, buildPersistentMarisonFileLink: mint,
    expandRecommendationFileReferences: async (payload: unknown) => ({ payload }),
    assertMarisonOutboundContract: (_kind: string, payload: unknown) => payload,
  };
  const docSource = source.slice(source.indexOf("const buildMarisonDocumentLinks ="), source.indexOf("const buildMarisonUnitPayload ="));
  const runtime = vm.runInNewContext(docSource + generator + "\n({generateCurrentMarisonPayloadPreview,buildMarisonDocumentLinks});", context);
  context.buildLinks = runtime.buildMarisonDocumentLinks;
  return { run: () => runtime.generateCurrentMarisonPayloadPreview(job, previewStoredMarisonPayload(job)), from, rpc, mint, resolver };
}

describe("current payload read-only orchestration", () => {
  it("returns corrected values and duplicate warning even if the accepted Unit is already submitted externally", async () => {
    const h = harness();
    expect(await h.run()).toMatchObject({ source: "latest", acceptedPreviously: true, payload: currentPayload });
    expect(h.mint).not.toHaveBeenCalled(); expect(h.rpc).not.toHaveBeenCalled();
  });
  it.each([{ status: "PROSES" }, { signed: false }, { missingToken: true }, { revoked: true }, { expired: true }, { concurrent: true }, { noPdf: true }])("fails closed without any write for %j", async options => {
    const h = harness(options);
    await expect(h.run()).rejects.toThrow();
    expect(h.mint).not.toHaveBeenCalled(); expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe("canonical Unit builder", () => {
  it.each([true, false])("uses saved examiner references and never overwrites external master data (external type=%s)", async hasType => {
    const builder = source.slice(source.indexOf("const buildMarisonUnitPayload ="), source.indexOf("const normalizeMarisonItems ="));
    const reference = { value: 2048, raw: { type: hasType ? '30' : null, production_code: '001/UAI/PRC/5.2/07/10/2026', has_submitted: false, land_area: 60 } };
    const saved = { ...reference, allocation_detail: { unit_type: '36/72', production_serial: '009', production_block: '6.1', production_date: '2026-11-09', struktur_atas: '100', struktur_bawah: '200' } };
    const original = structuredClone(reference);
    const approved = { allocated_units: structuredClone([saved]) };
    const receipt = vi.fn((_project: number, refs: unknown[]) => refs);
    const context = {
      isDeepStrictEqual, supabase: { rpc: vi.fn(async () => ({ data: approved, error: null })) },
      getMarisonRequestedProject: () => ({}), requireExternalInteger: (v: unknown) => Number(v), externalIdFrom: (v: any) => Number(v.value),
      queryExternalDataSource: async () => ({ options: [reference] }), MARISON_UNITS_SOURCE_KEY: 'units',
      getMarisonAllocatedUnits: () => [saved], asPlainRecord: (v: unknown) => v || {}, getExternalRaw: (v: any) => v.raw || {},
      applyExternalUnitReference, buildProductionCode, firstString: (...values: unknown[]) => values.find(v => typeof v === 'string' && v.trim()) || '',
      normalizeExternalDate: (v: string) => v, parseExternalMoney: Number, verifiedUnitReplacementReceipt: receipt,
      buildMarisonDocumentLinks: async () => ({ mainDocument: link, attachments: [] }), normalizeMarisonSubmissionApprovals: () => [],
      MARISON_OUTBOUND_CONTRACT_VERSION: 'test', assertMarisonOutboundContract: (_kind: string, value: unknown) => value,
    };
    const runtime = vm.runInNewContext(builder + '\n({buildMarisonUnitPayload});', context);
    const result = await runtime.buildMarisonUnitPayload({no_surat:'TEST',created_at:'2026-11-09'}, {}, null,
      { projectId:23, branchId:1, requireUnsubmittedUnitReferences:true });
    expect(result.payload.units[0]).toMatchObject({ unit_id:2048,type:'36/72',production_code:'009/UAI/PRC/6.1/09/11/2026',addendum_atas_nominal:100,addendum_bawah_nominal:200 });
    expect(receipt).toHaveBeenCalledWith(23, [{id:2048,type:'36/72',hasSubmitted:false}]);
    expect(reference).toEqual(original);
    saved.allocation_detail.unit_type = '';
    await expect(runtime.buildMarisonUnitPayload({}, {}, null, {projectId:23,branchId:1})).rejects.toThrow(/berubah setelah pemeriksaan/);
    approved.allocated_units[0].allocation_detail.unit_type = '';
    await expect(runtime.buildMarisonUnitPayload({}, {}, null, {projectId:23,branchId:1})).rejects.toThrow(/Tipe kavling/);
    context.supabase.rpc.mockResolvedValueOnce({ data: null, error: null } as any);
    await expect(runtime.buildMarisonUnitPayload({}, {}, null, {projectId:23,branchId:1})).rejects.toThrow(/bukti pemeriksaan/);
    context.supabase.rpc.mockResolvedValueOnce({ data: approved, error: { code: 'fixture-error' } } as any);
    await expect(runtime.buildMarisonUnitPayload({}, {}, null, {projectId:23,branchId:1})).rejects.toThrow(/bukti pemeriksaan/);
    context.queryExternalDataSource = async () => ({options: []});
    await expect(runtime.buildMarisonUnitPayload({}, {}, null, {projectId:23,branchId:1})).rejects.toThrow(/tidak tersedia/);
  });
  it("uses corrected allocation amounts and keeps submitted-unit preview separate from send eligibility", async () => {
    const builder = source.slice(source.indexOf("const buildMarisonUnitPayload ="), source.indexOf("const normalizeMarisonItems ="));
    const money = source.slice(source.indexOf("const parseExternalMoney ="), source.indexOf("const normalizeExternalDate ="));
    const units = currentPayload.units.map((unit, index) => ({ value: unit.unit_id, allocation_detail: {
      struktur_atas: String(unit.addendum_atas_nominal), struktur_bawah: String(unit.addendum_bawah_nominal),
      production_serial: ["001", "002", "006"][index], production_block: "5.3", production_date: "2026-08-21",
    } }));
    const context = { getMarisonRequestedProject: () => ({ id: 23 }), requireExternalInteger: (value: unknown) => Number(value),
      isDeepStrictEqual, supabase: { rpc: async () => ({ data: { allocated_units: structuredClone(units) }, error: null }) },
      externalIdFrom: (value: any) => Number(value.value || value.id),
      queryExternalDataSource: async () => ({ options: units.map(unit => ({ value: unit.value, raw: { type: "30", has_submitted: true } })) }),
      MARISON_UNITS_SOURCE_KEY: "units", getMarisonAllocatedUnits: () => units, asPlainRecord: (v: unknown) => v || {},
      getExternalRaw: (v: any) => v.raw || {}, getExternalUnitReference, applyExternalUnitReference, buildProductionCode,
      firstString: (...v: unknown[]) => v.find(value => typeof value === "string" && value.trim()) || "",
      normalizeExternalDate: (value: string) => value, verifiedUnitReplacementReceipt: () => { throw new Error("Preview must not authorize resend"); },
      buildMarisonDocumentLinks: async (_surat: unknown, _actor: unknown, resolve: (value: string) => Promise<string>) => ({ mainDocument: await resolve("new.pdf"), attachments: [] }),
      normalizeMarisonSubmissionApprovals: (_kind: string, approvals: unknown) => approvals,
      MARISON_OUTBOUND_CONTRACT_VERSION: "test", assertMarisonOutboundContract: (_kind: string, value: unknown) => value,
    };
    const runtime = vm.runInNewContext(money + builder + "\n({buildMarisonUnitPayload});", context);
    const result = await runtime.buildMarisonUnitPayload({ no_surat: "051/UAI/MKT.1.SGN/X/2026", judul_surat: "SPK 30 Unit", created_at: "2026-10-19" }, {}, null,
      { projectId: 23, branchId: 1, nik: "TEST", approvals: [], existingFileLink: async () => link, requireUnsubmittedUnitReferences: false });
    expect(result.payload.units.map((u: any) => ({ unit_id: u.unit_id, addendum_atas_nominal: u.addendum_atas_nominal, addendum_bawah_nominal: u.addendum_bawah_nominal }))).toEqual(currentPayload.units);
    expect(result.payload.units[0].production_code).toBe("001/UAI/PRC/5.3/21/08/2026");
    expect(job.payload.units[2].addendum_atas_nominal).toBe(0);
  });
});
