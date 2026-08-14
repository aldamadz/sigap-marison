import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bootDomainRuntime, closeApp, stubRuntimeEnv, unstubRuntimeEnv, type BootedRuntime,
} from "./harness/domain-runtime-harness";

const suratId = "20000000-0000-4000-8000-000000000002";
const jobId = "10000000-0000-4000-8000-000000000001";
const userId = "40000000-0000-4000-8000-000000000004";
const pdfUrl = "https://storage.test/storage/v1/object/public/dokumen_surat/staging/pdf/cached.pdf";

const createQuery = (table: string, tokenInserts: unknown[]) => {
  const equal = new Map<string, unknown>();
  const included = new Map<string, unknown[]>();
  const builder: any = {
    select: () => builder,
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
      if (table === "surat_registrasi") return {
        data: {
          id: suratId,
          no_surat: "001/TEST/VIII/2026",
          judul_surat: "Permohonan Aset",
          status: "SELESAI",
          file_path: "dokumen_surat/staging/source.xlsx",
          pdf_path: null,
          lampiran_path: null,
          created_by: userId,
        },
        error: null,
      };
      if (table === "document_pdf_jobs") {
        if (included.has("status")) return { data: null, error: null };
        if (equal.get("status") === "done") return {
          data: { id: jobId, status: "done", pdf_url: pdfUrl, error_message: null, signature_id: null },
          error: null,
        };
      }
      return { data: null, error: null };
    },
    single: async () => {
      if (table === "document_pdf_jobs") return {
        data: { id: jobId, surat_id: suratId, signature_id: null, status: "done", pdf_url: pdfUrl, error_message: null },
        error: null,
      };
      return { data: null, error: null };
    },
    then: (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
  };
  return builder;
};

const createClients = () => {
  const tokenInserts: unknown[] = [];
  const supabase = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })) },
    from: vi.fn((table: string) => createQuery(table, tokenInserts)),
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
  });
});
