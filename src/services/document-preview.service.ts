import { supabase } from "@/lib/supabase";

type PdfJobResponse = {
  status?: "ready" | "queued" | "processing" | "done" | "failed";
  jobId?: string;
  pdfUrl?: string;
  error?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const documentPreviewService = {
  async requestPdfJob(
    suratId: string,
    options: { refresh?: boolean; signatureId?: string | null } = {}
  ): Promise<PdfJobResponse> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Tidak terautentikasi");

    const params = new URLSearchParams();
    if (options.refresh) params.set("refresh", "1");
    if (options.signatureId) params.set("signature_id", options.signatureId);
    const query = params.toString() ? `?${params.toString()}` : "";
    const response = await fetch(`/api/documents/${suratId}/pdf${query}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || "Gagal membuat PDF dokumen.");
    }

    return payload as PdfJobResponse;
  },

  async getJobStatus(jobId: string): Promise<PdfJobResponse> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Tidak terautentikasi");

    const response = await fetch(`/api/pdf-jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || "Gagal membaca status PDF.");
    }

    return payload as PdfJobResponse;
  },

  async enqueuePdf(suratId: string, options: { refresh?: boolean; signatureId?: string | null } = {}) {
    return this.requestPdfJob(suratId, options);
  },

  async getPdfUrl(
    suratId: string,
    options: { refresh?: boolean; signatureId?: string | null; pollIntervalMs?: number; timeoutMs?: number } = {}
  ) {
    const initial = await this.requestPdfJob(suratId, options);
    if ((initial.status === "ready" || initial.status === "done") && initial.pdfUrl) {
      return initial.pdfUrl;
    }

    if (!initial.jobId) throw new Error("Job PDF tidak tersedia.");

    const startedAt = Date.now();
    const timeoutMs = options.timeoutMs ?? 180000;
    const pollIntervalMs = options.pollIntervalMs ?? 2000;

    while (Date.now() - startedAt < timeoutMs) {
      await sleep(pollIntervalMs);
      const status = await this.getJobStatus(initial.jobId);
      if ((status.status === "done" || status.status === "ready") && status.pdfUrl) {
        return status.pdfUrl;
      }
      if (status.status === "failed") {
        throw new Error(status.error || "Gagal membuat PDF dokumen.");
      }
    }

    throw new Error("PDF masih diproses. Coba buka lagi beberapa saat lagi.");
  },

  openPdfInNewTab(pdfUrl: string) {
    window.open(pdfUrl, "_blank", "noopener,noreferrer");
  },

  async openStoredFileInNewTab(suratId: string, path: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Tidak terautentikasi");

    const response = await fetch(`/api/documents/${suratId}/file-token?path=${encodeURIComponent(path)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || "Gagal membuat token file.");
    if (!payload?.viewUrl) throw new Error("URL preview file tidak tersedia.");

    window.open(payload.viewUrl, "_blank", "noopener,noreferrer");
  },
};
