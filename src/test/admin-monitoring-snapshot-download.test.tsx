import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MonitoringAdminPage from "@/pages/admin/AdminMonitoringPage";

const state = vi.hoisted(() => ({
  openPdf: vi.fn(), openFile: vi.fn(), openingKey: "", document: {} as Record<string, any>,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey, enabled = true }: { queryKey: string[]; enabled?: boolean }) => ({
    data: !enabled ? undefined : queryKey[0] === "admin-monitoring-list"
      ? { rows: [state.document], count: 1, pageSize: 24 }
      : queryKey[0] === "surat-detail" ? state.document : [],
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useDocumentOpener", () => ({
  documentOperationKey: {
    pdf: (id: string, suffix = "main") => `pdf:${id}:${suffix}`,
    file: (id: string, suffix: string) => `file:${id}:${suffix}`,
  },
  useDocumentOpener: () => ({ openPdf: state.openPdf, openFile: state.openFile, isOpening: (key: string) => key === state.openingKey }),
}));
vi.mock("@/services/surat.service", () => ({ suratService: {} }));
vi.mock("@/services/surat-monitoring.service", () => ({ suratMonitoringService: {} }));
vi.mock("@/components/dashboard/SuratSummaryCards", () => ({ SuratSummaryCards: () => null }));
vi.mock("@/components/surat/RegistrationSummaryDialog", () => ({ RegistrationSummaryDocument: () => null }));
vi.mock("@/components/surat/registration-summary-data", () => ({ buildRegistrationSummaryData: () => ({}) }));

beforeEach(() => {
  vi.clearAllMocks();
  state.openingKey = "";
  state.document = {
    id: "document-1", no_surat: "014/UAI/PBO.1/X/2026", judul_surat: "Pengajuan aset",
    created_at: "2026-10-23T00:00:00Z", status: "PROSES", current_step: 4,
    surat_attachments: [],
    surat_signatures: [1, 2, 3, 4, 5].map(step => ({
      id: `signature-${step}`, step_order: step, role_name: `Pejabat ${step}`,
      is_signed: step <= 3, status: step <= 3 ? "APPROVED" : "PENDING",
      file_path_snap: step <= 3 ? `native://document/document-1/approval/signature-${step}/1` : null,
      pdf_path_snap: null, signed_at: step <= 3 ? "2026-10-23T01:00:00Z" : null,
    })),
  };
});

const showTimeline = () => {
  render(<MonitoringAdminPage />);
  fireEvent.click(screen.getByRole("button", { name: "Riwayat lengkap" }));
};

describe("admin monitoring signed snapshots", () => {
  it("opens the canonical PDF for signature3 instead of treating its native marker as a storage file", () => {
    showTimeline();
    fireEvent.click(screen.getByRole("button", { name: "Unduh PDF tahap 3" }));
    expect(state.openPdf).toHaveBeenCalledWith("document-1", "pdf:document-1:signature-3", { signatureId: "signature-3" });
    expect(state.openFile).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Unduh PDF tahap 4" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unduh PDF tahap 5" })).not.toBeInTheDocument();
  });

  it("keeps a historical step pinned even after later signatures finish", () => {
    state.document.status = "DONE";
    state.document.surat_signatures.forEach((signature: any) => { signature.is_signed = true; });
    showTimeline();
    fireEvent.click(screen.getByRole("button", { name: "Unduh PDF tahap 3" }));
    expect(state.openPdf).toHaveBeenCalledWith("document-1", "pdf:document-1:signature-3", { signatureId: "signature-3" });
  });

  it("uses the same signature-bound PDF route for legacy stored snapshots", () => {
    state.document.surat_signatures[2].file_path_snap = "dokumen_surat/legacy.xlsx";
    state.document.surat_signatures[2].pdf_path_snap = "https://storage.test/storage/v1/object/public/dokumen_surat/legacy.pdf";
    showTimeline();
    fireEvent.click(screen.getByRole("button", { name: "Unduh PDF tahap 3" }));
    expect(state.openPdf).toHaveBeenCalledWith("document-1", "pdf:document-1:signature-3", { signatureId: "signature-3" });
    expect(state.openFile).not.toHaveBeenCalled();
  });

  it("does not offer an unsigned or rejected stage as a signed snapshot", () => {
    Object.assign(state.document.surat_signatures[3], { file_path_snap: "native://document/old", status: "REJECTED" });
    showTimeline();
    expect(screen.queryByRole("button", { name: "Unduh PDF tahap 4" })).not.toBeInTheDocument();
  });

  it("disables only the snapshot currently opening", () => {
    state.openingKey = "pdf:document-1:signature-3";
    showTimeline();
    expect(screen.getByRole("button", { name: "Unduh PDF tahap 3" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Unduh PDF tahap 2" })).toBeEnabled();
  });
});
