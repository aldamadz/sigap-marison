import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession },
  },
}));

describe("document preview fast path", () => {
  it("reports an already failed job immediately without polling", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "failed", jobId: "job-failed", error: "Renderer unavailable",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { documentPreviewService } = await import("@/services/document-preview.service");
    await expect(documentPreviewService.getReadyPdf("surat-1")).rejects.toThrow("Renderer unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("detects a completed first render after 500ms, then polls at 1000ms", async () => {
    vi.useFakeTimers();
    try {
      const response = (body: object) => new Response(JSON.stringify(body), {
        status: 200, headers: { "content-type": "application/json" },
      });
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(response({ status: "queued", jobId: "job-1" }))
        .mockResolvedValueOnce(response({ status: "processing", jobId: "job-1" }))
        .mockResolvedValueOnce(response({ status: "done", jobId: "job-1", pdfUrl: "external://dokumen_surat/pdf/ready.pdf" }));
      vi.stubGlobal("fetch", fetchMock);
      const { documentPreviewService } = await import("@/services/document-preview.service");
      const ready = documentPreviewService.getReadyPdf("surat-1");
      await vi.advanceTimersByTimeAsync(499);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(999);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect((await ready).status).toBe("done");
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally { vi.useRealTimers(); }
  });
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    getSession.mockResolvedValue({
      data: { session: { access_token: "session-token" } },
    });
  });

  it("opens a cached PDF from the job response without requesting a second file token", async () => {
    const replace = vi.fn();
    const target = {
      closed: false,
      close: vi.fn(),
      document: { title: "", body: { textContent: "", style: { fontFamily: "", padding: "" } } },
      location: { replace },
      opener: null,
    };
    vi.spyOn(window, "open").mockReturnValue(target as unknown as Window);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "ready",
      pdfUrl: "external://dokumen_surat/staging/pdf/cached.pdf",
      viewUrl: "/api/files/view/one-time-token/Permohonan_Aset.pdf",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { documentPreviewService } = await import("@/services/document-preview.service");
    await documentPreviewService.openGeneratedPdfInNewTab("20000000-0000-4000-8000-000000000002");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/documents/20000000-0000-4000-8000-000000000002/pdf");
    expect(replace).toHaveBeenCalledWith("/api/files/view/one-time-token/Permohonan_Aset.pdf");
  });

  it("uses the viewer token returned by the completed poll", async () => {
    const replace = vi.fn();
    const target = {
      closed: false,
      close: vi.fn(),
      document: { title: "", body: { textContent: "", style: { fontFamily: "", padding: "" } } },
      location: { replace },
      opener: null,
    };
    vi.spyOn(window, "open").mockReturnValue(target as unknown as Window);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "queued", jobId: "job-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: "done",
        jobId: "job-1",
        pdfUrl: "external://dokumen_surat/staging/pdf/generated.pdf",
        viewUrl: "/api/files/view/polled-token/Permohonan_Aset.pdf",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const { documentPreviewService } = await import("@/services/document-preview.service");
    await documentPreviewService.openGeneratedPdfInNewTab(
      "20000000-0000-4000-8000-000000000002",
      { pollIntervalMs: 0 },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/api/pdf-jobs/job-1");
    expect(replace).toHaveBeenCalledWith("/api/files/view/polled-token/Permohonan_Aset.pdf");
  });
});
