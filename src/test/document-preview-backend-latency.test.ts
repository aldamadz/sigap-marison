import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bootDomainRuntime, closeApp, stubRuntimeEnv, unstubRuntimeEnv, type BootedRuntime,
} from "./harness/domain-runtime-harness";

const suratId = "20000000-0000-4000-8000-000000000002";
const jobId = "10000000-0000-4000-8000-000000000001";
const userId = "40000000-0000-4000-8000-000000000004";
const pdfUrl = "https://storage.test/storage/v1/object/public/dokumen_surat/staging/pdf/cached.pdf";

type PreviewFixtureOptions = {
  recommendation?: boolean;
  createdBy?: string;
  signer?: boolean;
  readJob?: (kind: "active" | "done") => Promise<void>;
  activeJob?: boolean;
  signatures?: Record<string, unknown>[];
};

const createQuery = (table: string, tokenInserts: unknown[], options: PreviewFixtureOptions) => {
  const equal = new Map<string, unknown>();
  const included = new Map<string, unknown[]>();
  let columns: string[] = [];
  const builder: any = {
    select: (value: string) => { columns = value.split(",").map(column => column.trim()); return builder; },
    eq: (column: string, value: unknown) => { equal.set(column, value); return builder; },
    in: (column: string, values: unknown[]) => { included.set(column, values); return builder; },
    not: () => builder,
    order: () => builder,
    limit: () => builder,
    insert: (value: unknown) => {
      if (table === "file_view_tokens") tokenInserts.push(value);
      return Promise.resolve({ data: null, error: null });
    },
    maybeSingle: async () => {
      if (table === "profiles") return {
        data: { role: "staff", is_active: true, deleted_at: null },
        error: null,
      };
      if (table === "surat_registrasi") return {
        data: {
          id: suratId,
          no_surat: "001/TEST/VIII/2026",
          judul_surat: "Permohonan Aset",
          status: "SELESAI",
          file_path: "dokumen_surat/staging/source.xlsx",
          pdf_path: null,
          lampiran_path: null,
          created_by: options.createdBy ?? userId,
        },
        error: null,
      };
      if (table === "document_pdf_jobs") {
        if (included.has("status")) {
          await options.readJob?.("active");
          return {
            data: options.activeJob ? { id: jobId, status: "processing", pdf_url: null, error_message: null, signature_id: null } : null,
            error: null,
          };
        }
        if (equal.get("status") === "done") {
          await options.readJob?.("done");
          return {
            data: { id: jobId, status: "done", pdf_url: pdfUrl, error_message: null, signature_id: equal.get("signature_id") || null },
            error: null,
          };
        }
      }
      if (table === "surat_linked_documents" && options.recommendation) return {
        data: { child_surat_id: suratId },
        error: null,
      };
      return { data: null, error: null };
    },
    single: async () => {
      if (table === "document_pdf_jobs") return {
        data: { id: jobId, surat_id: suratId, signature_id: null, status: "done", pdf_url: pdfUrl, error_message: null },
        error: null,
      };
      return { data: null, error: null };
    },
    then: (resolve: (value: unknown) => unknown) => resolve({
      data: table === "surat_signatures" ? (options.signatures ?? (options.signer
        ? [{ id: "signature-id", user_id: userId, verifier_snapshot: [] }] : []))
        .map(row => Object.fromEntries(Object.entries(row).filter(([key]) => columns.includes(key)))) : [],
      error: null,
    }),
  };
  return builder;
};

const createClients = (options: PreviewFixtureOptions = {}) => {
  const tokenInserts: unknown[] = [];
  const supabase = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })) },
    from: vi.fn((table: string) => createQuery(table, tokenInserts, options)),
    rpc: vi.fn(async (name: string) => {
      if (name === "enqueue_recommendation_pdf_job" && options.recommendation) return {
        data: { id: jobId, status: "done", pdf_url: pdfUrl },
        error: null,
      };
      throw new Error(`Unexpected RPC: ${name}`);
    }),
  };
  return { supabase, storageSupabase: { storage: { from: vi.fn() } }, tokenInserts };
};

let booted: BootedRuntime | null;

beforeEach(async () => {
  stubRuntimeEnv(vi);
  booted = await bootDomainRuntime();
});

afterEach(async () => {
  await closeApp(booted);
  booted = null;
  unstubRuntimeEnv(vi);
});

describe("PDF job preview fast path", () => {
  it("loads the signed state needed to serve a native stage3 snapshot", async () => {
    const signatureId = "30000000-0000-4000-8000-000000000003";
    const clients = createClients({ signatures: [{
      id: signatureId, user_id: userId, is_signed: true,
      file_path_snap: `native://document/${suratId}/approval/${signatureId}/1`, pdf_path_snap: null,
    }] });
    booted!.runtime.setDomainRuntimeDependenciesForTest(clients);
    const response = await booted!.app.inject({
      method: "GET", url: `/api/documents/${suratId}/pdf?signature_id=${signatureId}`,
      headers: { authorization: "Bearer session-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ready", signatureId, viewUrl: expect.stringMatching(/^\/api\/files\/view\//) });
    expect(clients.tokenInserts).toHaveLength(1);
  });

  it.each([false, undefined])("does not render a signature without a verified signed state: %s", async isSigned => {
    const signatureId = "30000000-0000-4000-8000-000000000003";
    const clients = createClients({ signatures: [{
      id: signatureId, user_id: userId, is_signed: isSigned,
      file_path_snap: `native://document/${suratId}/approval/${signatureId}/1`, pdf_path_snap: pdfUrl,
    }] });
    booted!.runtime.setDomainRuntimeDependenciesForTest(clients);
    const response = await booted!.app.inject({
      method: "GET", url: `/api/documents/${suratId}/pdf?signature_id=${signatureId}`,
      headers: { authorization: "Bearer session-token" },
    });
    expect(response.statusCode).toBe(422);
    expect(clients.tokenInserts).toHaveLength(0);
    expect(clients.supabase.from).not.toHaveBeenCalledWith("document_pdf_jobs");
  });

  it("mints the one-time viewer token in the cached PDF response", async () => {
    const clients = createClients();
    booted!.runtime.setDomainRuntimeDependenciesForTest(clients);

    const response = await booted!.app.inject({
      method: "GET",
      url: `/api/documents/${suratId}/pdf`,
      headers: { authorization: "Bearer session-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ready",
      jobId,
      pdfUrl,
      viewUrl: expect.stringMatching(/^\/api\/files\/view\/[A-Za-z0-9_-]+\/Permohonan_Aset\.pdf$/),
    });
    expect(clients.tokenInserts).toHaveLength(1);
    expect(clients.supabase.from).not.toHaveBeenCalledWith("surat_attachments");
  });

  it("authenticates only once when a polled PDF job becomes ready", async () => {
    const clients = createClients();
    booted!.runtime.setDomainRuntimeDependenciesForTest(clients);

    const response = await booted!.app.inject({
      method: "GET",
      url: `/api/pdf-jobs/${jobId}`,
      headers: { authorization: "Bearer session-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "done", jobId, viewUrl: expect.stringMatching(/^\/api\/files\/view\//) });
    expect(clients.supabase.auth.getUser).toHaveBeenCalledTimes(1);
    expect(clients.tokenInserts).toHaveLength(1);
    expect(clients.supabase.from).not.toHaveBeenCalledWith("surat_attachments");
  });

  it("returns the current recommendation PDF without queueing another render", async () => {
    const clients = createClients({ recommendation: true });
    booted!.runtime.setDomainRuntimeDependenciesForTest(clients);

    const response = await booted!.app.inject({
      method: "GET",
      url: `/api/documents/${suratId}/pdf`,
      headers: { authorization: "Bearer session-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ready",
      jobId,
      pdfUrl,
      cached: true,
      refreshed: false,
      viewUrl: expect.stringMatching(/^\/api\/files\/view\//),
    });
    expect(clients.supabase.rpc).toHaveBeenCalledWith("enqueue_recommendation_pdf_job", {
      p_surat_id: suratId,
      p_source_file_path: "dokumen_surat/staging/source.xlsx",
      p_requested_by: userId,
      p_refresh: false,
    });
    expect(clients.tokenInserts).toHaveLength(1);
  });

  it("starts active and cached-job reads together and preserves active-job priority", async () => {
    let releaseReads!: () => void;
    const barrier = new Promise<void>((resolve) => { releaseReads = resolve; });
    const readJob = vi.fn(async (_kind: "active" | "done") => barrier);
    const clients = createClients({ readJob, activeJob: true });
    booted!.runtime.setDomainRuntimeDependenciesForTest(clients);
    const pendingResponse = booted!.app.inject({
      method: "GET",
      url: `/api/documents/${suratId}/pdf`,
      headers: { authorization: "Bearer session-token" },
    }).then((response) => response);

    try {
      await vi.waitFor(() => expect(readJob.mock.calls).toEqual([["active"], ["done"]]));
    } finally {
      releaseReads();
    }
    const response = await pendingResponse;
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "processing", jobId });
    expect(clients.tokenInserts).toHaveLength(0);
  });

  it("allows the assigned signer without loading unrelated attachments", async () => {
    const clients = createClients({ createdBy: "other-requester", signer: true });
    booted!.runtime.setDomainRuntimeDependenciesForTest(clients);
    const response = await booted!.app.inject({
      method: "GET", url: `/api/documents/${suratId}/pdf`,
      headers: { authorization: "Bearer session-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ready" });
    expect(clients.supabase.from).toHaveBeenCalledWith("surat_signatures");
    expect(clients.supabase.from).not.toHaveBeenCalledWith("surat_attachments");
  });

  it("rejects another user before reading jobs or minting a viewer token", async () => {
    const clients = createClients({ createdBy: "other-requester" });
    booted!.runtime.setDomainRuntimeDependenciesForTest(clients);
    const response = await booted!.app.inject({
      method: "GET", url: `/api/documents/${suratId}/pdf`,
      headers: { authorization: "Bearer session-token" },
    });
    expect(response.statusCode).toBe(403);
    expect(clients.supabase.from).not.toHaveBeenCalledWith("document_pdf_jobs");
    expect(clients.tokenInserts).toHaveLength(0);
  });

  it("still loads attachment references for the arbitrary file-token route", async () => {
    const clients = createClients();
    booted!.runtime.setDomainRuntimeDependenciesForTest(clients);
    const response = await booted!.app.inject({
      method: "POST",
      url: `/api/documents/${suratId}/file-token?path=${encodeURIComponent("dokumen_surat/staging/source.xlsx")}`,
      headers: { authorization: "Bearer session-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(clients.supabase.from).toHaveBeenCalledWith("surat_attachments");
    expect(clients.tokenInserts).toHaveLength(1);
  });
});
