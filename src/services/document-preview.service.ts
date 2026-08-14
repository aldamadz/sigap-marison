import { supabase } from "@/lib/supabase";

type PdfJobResponse = {
  status?: "ready" | "queued" | "processing" | "done" | "failed";
  jobId?: string;
  pdfUrl?: string;
  viewUrl?: string;
  error?: string;
  requestId?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeJobResponse = (payload: Record<string, unknown>): PdfJobResponse => ({
  status: payload.status as PdfJobResponse["status"],
  jobId: String(payload.jobId || payload.job_id || "") || undefined,
  pdfUrl: String(payload.pdfUrl || payload.pdf_url || "") || undefined,
  viewUrl: String(payload.viewUrl || payload.view_url || "") || undefined,
  error: String(payload.error || payload.error_message || "") || undefined,
  requestId: String(payload.requestId || payload.request_id || "") || undefined,
});

const formatApiError = (payload: Record<string, unknown>, fallback: string, response?: Response) => {
  const requestId = String(payload.requestId || payload.request_id || response?.headers.get("x-request-id") || "").trim();
  const message = String(payload.error || fallback);
  return requestId ? `${message} (ID: ${requestId})` : message;
};

const readJsonPayload = async (response: Response) => {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    throw new Error(`Respons server tidak valid (HTTP ${response.status}).`);
  }
  return await response.json().catch(() => ({})) as Record<string, unknown>;
};

const openLoadingTab = () => {
  const target = window.open("about:blank", "_blank");
  if (!target) return null;
  target.opener = null;
  try {
    target.document.title = "Menyiapkan dokumen - Marison SIGAP";
    target.document.body.textContent = "Dokumen sedang disiapkan...";
    target.document.body.style.fontFamily = "Arial, sans-serif";
    target.document.body.style.padding = "32px";
  } catch {
    // Navigasi tetap dapat dilanjutkan meski browser membatasi akses ke tab sementara.
  }
  return target;
};

const navigatePreviewTab = (target: Window | null, url: string) => {
  if (target && !target.closed) {
    target.location.replace(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
};

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
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(`/api/documents/${suratId}/pdf${query}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await readJsonPayload(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload, "Gagal membuat PDF dokumen.", response));
      }
      const normalized = normalizeJobResponse(payload);
      const valid = Boolean(normalized.status && (
        normalized.jobId || normalized.pdfUrl || normalized.status === "failed"
      ));
      if (valid) return normalized;
      if (attempt === 0) await sleep(250);
    }
    throw new Error("Server tidak memberikan identitas job atau URL PDF.");
  },

  async getJobStatus(jobId: string): Promise<PdfJobResponse> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Tidak terautentikasi");

    const response = await fetch(`/api/pdf-jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    const payload = await readJsonPayload(response);
    if (!response.ok) {
      throw new Error(formatApiError(payload, "Gagal membaca status PDF.", response));
    }
    return normalizeJobResponse(payload);
  },

  async enqueuePdf(suratId: string, options: { refresh?: boolean; signatureId?: string | null } = {}) {
    return this.requestPdfJob(suratId, options);
  },

  async getReadyPdf(
    suratId: string,
    options: { refresh?: boolean; signatureId?: string | null; pollIntervalMs?: number; timeoutMs?: number } = {}
  ): Promise<PdfJobResponse> {
    const initial = await this.requestPdfJob(suratId, options);
    if ((initial.status === "ready" || initial.status === "done") && initial.pdfUrl) {
      return initial;
    }

    if (!initial.jobId) throw new Error("Job PDF tidak tersedia.");

    const startedAt = Date.now();
    const timeoutMs = options.timeoutMs ?? 180000;
    const pollIntervalMs = options.pollIntervalMs ?? 2000;

    while (Date.now() - startedAt < timeoutMs) {
      await sleep(pollIntervalMs);
      const status = await this.getJobStatus(initial.jobId);
      if ((status.status === "done" || status.status === "ready") && status.pdfUrl) {
        return status;
      }
      if (status.status === "failed") {
        throw new Error(status.error || "Gagal membuat PDF dokumen.");
      }
    }

    throw new Error("PDF masih diproses. Coba buka lagi beberapa saat lagi.");
  },

  async getPdfUrl(
    suratId: string,
    options: { refresh?: boolean; signatureId?: string | null; pollIntervalMs?: number; timeoutMs?: number } = {}
  ) {
    const ready = await this.getReadyPdf(suratId, options);
    if (!ready.pdfUrl) throw new Error("URL PDF tidak tersedia.");
    return ready.pdfUrl;
  },

  openPdfInNewTab(pdfUrl: string) {
    window.open(pdfUrl, "_blank", "noopener,noreferrer");
  },

  async createStoredFileViewUrl(suratId: string, path: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Tidak terautentikasi");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(`/api/documents/${suratId}/file-token?path=${encodeURIComponent(path)}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const payload = await readJsonPayload(response);
        if (!response.ok) {
          const error = new Error(formatApiError(payload, "Gagal membuat token file.", response));
          if (response.status < 500 || attempt > 0) throw error;
        } else {
          const viewUrl = String(payload.viewUrl || payload.view_url || "").trim();
          if (viewUrl) return viewUrl;
          if (attempt > 0) throw new Error("URL preview file tidak tersedia.");
        }
      } catch (error) {
        if (attempt > 0) throw error;
      }
      await sleep(250);
    }
    throw new Error("Gagal membuat token file.");
  },

  async openStoredFileInNewTab(suratId: string, path: string) {
    const target = openLoadingTab();
    try {
      const viewUrl = await this.createStoredFileViewUrl(suratId, path);
      navigatePreviewTab(target, viewUrl);
    } catch (error) {
      target?.close();
      throw error;
    }
  },

  async openGeneratedPdfInNewTab(
    suratId: string,
    options: { refresh?: boolean; signatureId?: string | null; pollIntervalMs?: number; timeoutMs?: number } = {}
  ) {
    const target = openLoadingTab();
    try {
      const ready = await this.getReadyPdf(suratId, options);
      const viewUrl = ready.viewUrl || await this.createStoredFileViewUrl(suratId, String(ready.pdfUrl || ""));
      navigatePreviewTab(target, viewUrl);
    } catch (error) {
      target?.close();
      throw error;
    }
  },
};
