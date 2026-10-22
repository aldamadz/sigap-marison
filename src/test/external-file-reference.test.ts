import { describe, expect, it, vi } from "vitest";
import { chooseExternalFileReference, resolveExternalFileReference } from "../../backend/src/lib/external-file-reference";
const parseRef = (value: string) => /^(primary|external):/.test(value) ? { origin: value.split(":")[0], bucket: "pdfs", path: value.split(":")[1] } : null;
const token = { id: "t", surat_id: "doc", purpose: "external_marison", bucket: "pdfs", object_path: "old.pdf", storage_origin: "external" };
const document = { id: "doc", status: "DONE", file_path: "native://doc", pdf_path: "external:new.pdf", surat_signatures: [{ id: "sig", step_order: 1, is_signed: true, signed_at: "2026-10-22" }] };
const jobs = [{ status: "done", pdf_url: "external:old.pdf", source_file_path: "native://doc", signature_id: null as string | null }, { status: "done", pdf_url: "external:new.pdf", source_file_path: "native://doc", signature_id: null as string | null }];
const old = { id: "a", surat_id: "doc", signature_id: "s", stage: "unit_allocation", requirement_key: "rekap_adendum_unit", file_url: "external:old.pdf", file_name: "old.pdf", file_type: "application/pdf" };
const latest = { ...old, file_url: "external:recap-new.pdf", file_name: "new.pdf" };
const fixture = () => ({ token: structuredClone(token), document: structuredClone(document), jobs: structuredClone(jobs), attachments: [] as typeof old[], history: [] as typeof old[], parseRef });
describe("latest published external PDF reference", () => {
  it("follows the current approved main PDF without changing the old snapshot", () => {
    const input = fixture(), before = structuredClone(input.token);
    expect(chooseExternalFileReference(input).path).toBe("new.pdf");
    expect(input.token).toEqual(before);
  });
  it.each(["preview", "email"])("keeps %s links pinned", purpose => {
    const input=fixture();input.token.purpose=purpose;
    expect(chooseExternalFileReference(input).path).toBe("old.pdf");
  });
  it("does not expose an unapproved revision", () => {
    const input=fixture();input.document.status="PROSES";
    expect(chooseExternalFileReference(input).path).toBe("old.pdf");
  });
  it("waits for canonical main publication rather than a queued or signer-only PDF", () => {
    const input=fixture();input.jobs[1].status="queued";
    expect(chooseExternalFileReference(input).path).toBe("old.pdf");
    input.jobs[1].status="done";input.jobs[1].signature_id="sig";
    expect(chooseExternalFileReference(input).path).toBe("old.pdf");
  });
  it.each(["unsigned", "revoked", "expired", "foreign"])("rejects %s references", scenario => {
    const input=fixture();
    if(scenario==="unsigned")input.document.surat_signatures[0].is_signed=false;
    if(scenario==="revoked")Object.assign(input.token,{revoked_at:"2026-01-01"});
    if(scenario==="expired")Object.assign(input.token,{expires_at:"2020-01-01"});
    if(scenario==="foreign")input.document.id="other";
    expect(()=>chooseExternalFileReference(input)).toThrow();
  });
  it("resolves a replaced attachment through its archived stable identity", () => {
    const input=fixture();input.jobs=[];input.history=[old];input.attachments=[latest];
    expect(chooseExternalFileReference(input).path).toBe("recap-new.pdf");
  });
  it("resolves legacy generated recap replacement with a new row ID", () => {
    const input=fixture();input.jobs=[];input.history=[old];input.attachments=[{...latest,id:"new-id"}];
    expect(chooseExternalFileReference(input).path).toBe("recap-new.pdf");
  });
  it("fails closed when a replacement slot contains multiple possible PDFs", () => {
    const input=fixture();input.jobs=[];input.history=[old];input.attachments=[{...latest,id:"new-a"},{...latest,id:"new-b"}];
    expect(()=>chooseExternalFileReference(input)).toThrow();
  });
  it("does not substitute an unrelated attachment or a cross-origin collision", () => {
    const input=fixture();input.jobs=[];input.history=[old];input.attachments=[{...latest,id:"new-a",surat_id:"foreign"}];
    expect(()=>chooseExternalFileReference(input)).toThrow();
    input.attachments=[{...latest,file_url:"primary:recap-new.pdf"}];
    expect(()=>chooseExternalFileReference(input)).toThrow();
  });
  it("does not confuse a PDF attachment with a main-document historical path", () => {
    const input=fixture();input.attachments=[old];
    expect(()=>chooseExternalFileReference(input)).toThrow();
    Object.assign(input.token,{reference_kind:"attachment_pdf",reference_attachment_id:"a"});
    expect(chooseExternalFileReference(input).path).toBe("old.pdf");
  });
});

describe("canonical resolver boundary", () => {
  function clientFor(failure?: string) {
    const records: Record<string, unknown> = {
      file_view_tokens: token, surat_registrasi: document, document_pdf_jobs: jobs,
      surat_attachments: [], surat_attachment_file_history: [],
    };
    const from = vi.fn((table: string) => {
      const result = { data: records[table], error: failure === table ? new Error("unavailable") : null };
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "order"]) chain[method] = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => result);
      chain.limit = vi.fn(async () => result);
      return chain;
    });
    return { from };
  }
  it("reads the publication without writing tokens, jobs or sending requests", async () => {
    const client = clientFor();
    expect((await resolveExternalFileReference(client, "t", parseRef)).path).toBe("new.pdf");
    expect(client.from.mock.calls.map(([table]) => table)).toEqual([
      "file_view_tokens", "surat_registrasi", "document_pdf_jobs", "surat_attachments", "surat_attachment_file_history",
    ]);
  });
  it.each(["file_view_tokens", "surat_registrasi", "document_pdf_jobs", "surat_attachments", "surat_attachment_file_history"])("fails closed if %s cannot be read", async table => {
    await expect(resolveExternalFileReference(clientFor(table), "t", parseRef)).rejects.toThrow();
  });
  it("preserves the recommendation RPC's validated current coordinate", async () => {
    const client = clientFor();
    const validated = { origin: "external", bucket: "pdfs", path: "recommendation-new.pdf" };
    expect(await resolveExternalFileReference(client, "t", parseRef, { ...token, purpose: "external_marison_recommendation_pdf" }, validated)).toEqual(validated);
    expect(client.from).not.toHaveBeenCalled();
  });
});
