import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootDomainRuntime, closeApp, fetchCalls, stubRuntimeEnv, unstubRuntimeEnv, type BootedRuntime } from "./harness/domain-runtime-harness";

const suratId = "20000000-0000-4000-8000-000000000002";
const pdf = Buffer.from("%PDF-1.7\nnew published bytes\n");
const url = (path: string) => `https://storage.test/storage/v1/object/public/dokumen_surat/${path}`;
let booted: BootedRuntime | null;
beforeEach(async () => { stubRuntimeEnv(vi); booted = await bootDomainRuntime(); });
afterEach(async () => { await closeApp(booted); booted = null; unstubRuntimeEnv(vi); });

function clients(category: string, purpose = "external_marison", attachment = false) {
  const token = { id: "t", surat_id: suratId, purpose, bucket: "dokumen_surat", object_path: "old.pdf", storage_origin: "external", reference_kind: attachment ? "attachment_pdf" : "main_pdf", reference_attachment_id: attachment ? "a" : null };
  const original = structuredClone(token);
  const current = { id: "a", surat_id: suratId, signature_id: "s", stage: "approval", requirement_key: "rab", file_name: "rab.pdf", file_type: "application/pdf", file_url: url("new.pdf") };
  const records: Record<string, unknown> = {
    file_view_tokens: token,
    surat_registrasi: { id: suratId, status: "DONE", file_path: "native://current", pdf_path: url("new.pdf"), form_input_data: { request_category: category }, surat_signatures: [{ id: "s", step_order: 1, is_signed: true, signed_at: "2026-10-22" }] },
    document_pdf_jobs: [{ status: "done", signature_id: null, source_file_path: "native://current", pdf_url: url("new.pdf") }],
    surat_attachments: attachment ? [current] : [],
    surat_attachment_file_history: attachment ? [{ attachment_snapshot: { ...current, file_url: url("old.pdf") } }] : [],
  };
  const rpc = vi.fn(async (name: string) => {
    if (name !== "consume_file_view_token") throw new Error(`Unexpected write ${name}`);
    return { data: [{ token_id: "t", surat_id: suratId, bucket: "dokumen_surat", object_path: "old.pdf", storage_origin: "external" }], error: null };
  });
  const supabase = {
    rpc,
    from(table: string) {
      if (!(table in records)) throw new Error(`Unexpected table ${table}`);
      const result = { data: records[table], error: null };
      const chain: any = {};
      for (const method of ["select", "eq", "order"]) chain[method] = () => chain;
      chain.maybeSingle = async () => result;
      chain.limit = async () => result;
      return chain;
    },
  };
  const download = vi.fn(async (path: string) => {
    if (path !== (purpose === "preview" ? "old.pdf" : "new.pdf")) throw new Error("Wrong file version");
    return { data: { type: "application/pdf", arrayBuffer: async () => pdf }, error: null };
  });
  return { supabase, storageSupabase: { storage: { from: () => ({ download }) } }, download, rpc, token, original };
}

describe("delivered external PDF API", () => {
  it.each(["asset", "unit", "non_unit", "fund"])("serves the latest %s main PDF repeatedly using the same URL without dispatching", async category => {
    const mock = clients(category);
    booted!.runtime.setDomainRuntimeDependenciesForTest(mock);
    for (let i = 0; i < 2; i++) {
      const result = await booted!.app.inject({ method: "GET", url: `/api/files/view/${"x".repeat(32)}/document.pdf` });
      expect(result.statusCode).toBe(200);
      expect(result.rawPayload).toEqual(pdf);
      expect(result.headers["cache-control"]).toContain("no-store");
    }
    expect(mock.token).toEqual(mock.original);
    expect(mock.download.mock.calls).toEqual([["new.pdf"], ["new.pdf"]]);
    expect(mock.rpc.mock.calls.every(([name]) => name === "consume_file_view_token")).toBe(true);
    expect(fetchCalls).toEqual([]);
  });
  it("follows attachment stable identity while retaining the original token", async () => {
    const mock = clients("unit", "external_marison", true);
    booted!.runtime.setDomainRuntimeDependenciesForTest(mock);
    expect((await booted!.app.inject({ method: "GET", url: `/api/files/view/${"y".repeat(32)}/attachment.pdf` })).statusCode).toBe(200);
    expect(mock.download.mock.calls).toEqual([["new.pdf"]]);
    expect(mock.token).toEqual(mock.original);
  });
  it("leaves a preview pinned to its original version", async () => {
    const mock = clients("fund", "preview");
    booted!.runtime.setDomainRuntimeDependenciesForTest(mock);
    expect((await booted!.app.inject({ method: "GET", url: `/api/files/view/${"z".repeat(32)}/preview.pdf` })).statusCode).toBe(200);
    expect(mock.download.mock.calls).toEqual([["old.pdf"]]);
  });
});
