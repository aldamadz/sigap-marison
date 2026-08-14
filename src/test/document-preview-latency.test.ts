import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession },
  },
}));

describe("document preview fast path", () => {
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
