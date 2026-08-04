import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { MarisonOutboundQueuePanel } from "@/components/admin/MarisonOutboundQueuePanel";
import { marisonIntegrationService } from "@/services/marison-integration.service";

vi.mock("@/providers/MarisonEnvironmentProvider", () => ({
  useMarisonEnvironment: () => ({ status: { canManage: true, outbound: { ready: true } } }),
}));

vi.mock("@/services/marison-integration.service", async () => {
  const actual = await vi.importActual<typeof import("@/services/marison-integration.service")>("@/services/marison-integration.service");
  return { ...actual, marisonIntegrationService: { listDispatches: vi.fn(), preflightDispatch: vi.fn(), reconcileDispatch: vi.fn(), createReplacement: vi.fn(), preflightReplacement: vi.fn() } };
});

const row = { id: "job-1", suratId: "surat-1", noSurat: "047/UAI/MKT.1.NKMZ7/VII/2026", title: "Unit test", environment: "staging", generation: 1, replacementOfDispatchId: null, kind: "unit", status: "failed_terminal", attemptCount: 3, nextAttemptAt: null, lastAttemptAt: null, externalReference: null, errorCode: null, failureReason: "Resolution sources are required", reconciliationCount: 0, createdAt: "2026-08-03T00:00:00Z", updatedAt: "2026-08-03T00:00:00Z", postStartedAt: null, completedAt: null } as any;
const row422 = { ...row, id: "job-422", postStartedAt: "2026-08-03T00:01:00Z", errorCode: "marison_http_422", failureReason: "Marison menolak request dengan HTTP 422." };
const renderPanel = () => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MarisonOutboundQueuePanel /></QueryClientProvider></MemoryRouter>);

describe("Marison outbound recovery dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(marisonIntegrationService.listDispatches).mockResolvedValue({ environment: "staging", page: 1, pageSize: 20, total: 1, items: [row] });
    vi.mocked(marisonIntegrationService.reconcileDispatch).mockResolvedValue({ success: true });
    vi.mocked(marisonIntegrationService.createReplacement).mockResolvedValue({ replacementId: "job-2" });
  });

  it("keeps form hidden while preflight is checking and blocks network failure", async () => {
    let rejectRequest!: (error: Error) => void;
    vi.mocked(marisonIntegrationService.preflightDispatch).mockReturnValue(new Promise((_, reject) => { rejectRequest = reject; }) as never);
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /bangun ulang/i }));
    expect(screen.getByText(/memeriksa kelayakan/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/alasan dan bukti/i)).not.toBeInTheDocument();
    await act(async () => rejectRequest(new Error("network")));
    await waitFor(() => expect(screen.getByText(/preflight recovery gagal/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /simpan rekonsiliasi/i })).not.toBeEnabled();
  });

  it("shows blocked signer diagnosis and Master User link", async () => {
    vi.mocked(marisonIntegrationService.preflightDispatch).mockResolvedValue({ eligible: false, reasonCode: "SIGNER_IDENTITY_MISSING", reason: "Signer tahap 1 belum memiliki identitas payload yang valid." });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /bangun ulang/i }));
    expect(await screen.findByText(/signer tahap 1/i)).toBeInTheDocument();
    expect(screen.getByText(/mapping penandatangan belum lengkap/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /buka user organization/i })).toHaveAttribute("href", "/admin/users");
    expect(screen.queryByLabelText(/alasan dan bukti/i)).not.toBeInTheDocument();
  });

  it("points a project and branch mismatch to Master Proyek", async () => {
    vi.mocked(marisonIntegrationService.preflightDispatch).mockResolvedValue({ eligible: false, reasonCode: "PROJECT_BRANCH_MISMATCH", reason: "Project ID external terhubung ke Branch ID external yang berbeda." });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /bangun ulang/i }));
    expect(await screen.findByText(/relasi proyek dan kantor tidak cocok/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /buka master proyek/i })).toHaveAttribute("href", "/admin/master-projects");
  });

  it("shows recovery form only after eligible preflight and closes cleanly", async () => {
    vi.mocked(marisonIntegrationService.preflightDispatch).mockResolvedValue({ eligible: true, reasonCode: null, reason: null });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /bangun ulang/i }));
    expect(await screen.findByLabelText(/alasan dan bukti/i)).toBeInTheDocument();
    expect(screen.getByText(/konfigurasi payload siap/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /tutup/i }));
    await waitFor(() => expect(screen.queryByLabelText(/alasan dan bukti/i)).not.toBeInTheDocument());
    expect(marisonIntegrationService.preflightDispatch).toHaveBeenCalledTimes(1);
  });

  it("coalesces double-click recovery into one preflight request", async () => {
    let resolve!: (value: { eligible: boolean; reasonCode: null; reason: null }) => void;
    vi.mocked(marisonIntegrationService.preflightDispatch).mockReturnValue(new Promise((done) => { resolve = done; }) as never);
    renderPanel();
    const button = await screen.findByRole("button", { name: /bangun ulang/i });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(marisonIntegrationService.preflightDispatch).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ eligible: true, reasonCode: null, reason: null }));
  });
});

describe("Marison outbound replacement preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(marisonIntegrationService.listDispatches).mockResolvedValue({ environment: "staging", page: 1, pageSize: 20, total: 1, items: [row422] });
    vi.mocked(marisonIntegrationService.createReplacement).mockResolvedValue({ replacementId: "job-2" });
  });

  it("shows NIK diagnosis with area specificity and roles from safe context", async () => {
    vi.mocked(marisonIntegrationService.preflightReplacement).mockResolvedValue({
      eligible: true,
      vendorDiagnosis: { detailsAvailable: true, specificity: "area", summary: "Identitas external ditolak vendor", issues: [{ path: "", label: "Identitas external", message: "NIK tidak terdaftar.", specificity: "area" }] },
      payloadBodyInvariantViolated: false,
      safeContext: { roles: ["Pemohon", "Penandatangan tahap 1", "Penandatangan tahap 2"], unitTypes: undefined, hasProjectId: true, hasBranchId: true, attachmentCount: 1 },
      localValidationIssues: null,
      changedAreas: [],
      sigapChanged: false,
      noSigapChangesNote: "Belum ada perubahan terkait yang terdeteksi di SIGAP. Pastikan data referensi di Marison sudah diperbaiki sebelum membuat pengiriman pengganti.",
    });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /buat pengiriman pengganti/i }));
    expect(await screen.findByText(/identitas external ditolak/i)).toBeInTheDocument();
    expect(screen.getByText(/nik tidak terdaftar/i)).toBeInTheDocument();
    expect(screen.getByText(/vendor tidak menyebutkan nik milik siapa yang ditolak/i)).toBeInTheDocument();
    expect(screen.getByText(/pemohon.*penandatangan tahap 1.*penandatangan tahap 2/i)).toBeInTheDocument();
    expect(screen.getByText(/belum ada perubahan/i)).toBeInTheDocument();
  });

  it("shows unit type diagnosis with safe context unit types", async () => {
    vi.mocked(marisonIntegrationService.preflightReplacement).mockResolvedValue({
      eligible: true,
      vendorDiagnosis: { detailsAvailable: true, specificity: "area", summary: "Identitas external ditolak vendor", issues: [{ path: "", label: "Tipe unit", message: "Tipe unit tidak ditemukan di referensi.", specificity: "area" }] },
      payloadBodyInvariantViolated: false,
      safeContext: { roles: ["Pemohon"], unitTypes: ["60", "60/72"], hasProjectId: true, hasBranchId: true, attachmentCount: 2 },
      localValidationIssues: null,
      changedAreas: ["Tipe unit berubah dari 60 menjadi 60/72."],
      sigapChanged: true,
    });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /buat pengiriman pengganti/i }));
    expect(await screen.findByText(/tipe unit tidak dikenali vendor/i)).toBeInTheDocument();
    expect(screen.getByText(/tipe unit yang dikirim: 60, 60\/72/i)).toBeInTheDocument();
    expect(screen.getByText(/tipe unit berubah dari 60 menjadi 60\/72/i)).toBeInTheDocument();
  });

  it("does not expose NIK or raw payload in browser", async () => {
    vi.mocked(marisonIntegrationService.preflightReplacement).mockResolvedValue({
      eligible: true,
      vendorDiagnosis: { detailsAvailable: true, specificity: "area", summary: "Identitas external ditolak vendor", issues: [{ path: "", label: "Identitas external", message: "NIK tidak terdaftar.", specificity: "area" }] },
      payloadBodyInvariantViolated: false,
      safeContext: { roles: ["Pemohon", "Penandatangan tahap 1"] },
      localValidationIssues: null,
      changedAreas: ["Mapping pemohon berubah."],
      sigapChanged: true,
    });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /buat pengiriman pengganti/i }));
    await screen.findByText(/identitas external ditolak/i);
    const panelText = screen.getByRole("dialog").textContent || "";
    expect(panelText).not.toMatch(/\d{16}/);
  });

  it("requires Marison fix confirmation when SIGAP has no changes", async () => {
    vi.mocked(marisonIntegrationService.preflightReplacement).mockResolvedValue({
      eligible: true,
      vendorDiagnosis: { detailsAvailable: true, specificity: "area", summary: "Identitas external ditolak vendor", issues: [{ path: "", label: "Identitas external", message: "NIK tidak terdaftar.", specificity: "area" }] },
      payloadBodyInvariantViolated: false,
      safeContext: { roles: ["Pemohon"] },
      localValidationIssues: null,
      changedAreas: [],
      sigapChanged: false,
      noSigapChangesNote: "Belum ada perubahan terkait yang terdeteksi di SIGAP.",
    });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /buat pengiriman pengganti/i }));
    await screen.findByText(/belum ada perubahan/i);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
    fireEvent.change(screen.getByLabelText(/alasan dan perbaikan/i), { target: { value: "Data diperbaiki di Marison." } });
    const submit = screen.getByRole("button", { name: /^buat pengiriman pengganti$/i });
    expect(submit).toBeDisabled();
  });

  it("shows payload invariant violation", async () => {
    vi.mocked(marisonIntegrationService.preflightReplacement).mockResolvedValue({
      eligible: false,
      vendorDiagnosis: { detailsAvailable: false, specificity: "generic", summary: "", issues: [] },
      payloadBodyInvariantViolated: true,
      safeContext: null,
      localValidationIssues: null,
      changedAreas: null,
      sigapChanged: false,
    });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /buat pengiriman pengganti/i }));
    expect(await screen.findByText(/payload sebelumnya tidak tersedia/i)).toBeInTheDocument();
  });

  it("creates replacement after confirmation and locks dialog while saving", async () => {
    let resolve!: (value: { replacementId: string }) => void;
    vi.mocked(marisonIntegrationService.createReplacement).mockReturnValue(new Promise((done) => { resolve = done; }) as never);
    vi.mocked(marisonIntegrationService.preflightReplacement).mockResolvedValue({
      eligible: true,
      vendorDiagnosis: { detailsAvailable: true, specificity: "area", summary: "Identitas external ditolak vendor", issues: [{ path: "", label: "Identitas external", message: "NIK tidak terdaftar.", specificity: "area" }] },
      payloadBodyInvariantViolated: false,
      safeContext: { roles: ["Pemohon"] },
      localValidationIssues: null,
      changedAreas: ["Mapping pemohon berubah."],
      sigapChanged: true,
    });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /buat pengiriman pengganti/i }));
    await screen.findByText(/mapping pemohon berubah/i);
    fireEvent.change(screen.getByLabelText(/alasan dan perbaikan/i), { target: { value: "Mapping proyek diperbaiki." } });
    const submit = screen.getByRole("button", { name: /^buat pengiriman pengganti$/i });
    fireEvent.click(submit);
    await waitFor(() => expect(marisonIntegrationService.createReplacement).toHaveBeenCalledTimes(1));
    fireEvent.click(submit);
    expect(marisonIntegrationService.createReplacement).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();
    await act(async () => resolve({ replacementId: "job-2" }));
    await waitFor(() => expect(screen.queryByLabelText(/alasan dan perbaikan/i)).not.toBeInTheDocument());
  });

  it("keeps replacement context open and shows an inline conflict", async () => {
    vi.mocked(marisonIntegrationService.createReplacement).mockRejectedValue(new Error("Job pengganti sudah dibuat. Muat ulang antrean."));
    vi.mocked(marisonIntegrationService.preflightReplacement).mockResolvedValue({
      eligible: true,
      vendorDiagnosis: { detailsAvailable: true, specificity: "area", summary: "Identitas external ditolak vendor", issues: [{ path: "", label: "Identitas external", message: "NIK tidak terdaftar.", specificity: "area" }] },
      payloadBodyInvariantViolated: false,
      safeContext: { roles: ["Pemohon"] },
      localValidationIssues: null,
      changedAreas: [],
      sigapChanged: true,
    });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /buat pengiriman pengganti/i }));
    await screen.findByText(/identitas external ditolak/i);
    fireEvent.change(screen.getByLabelText(/alasan dan perbaikan/i), { target: { value: "Payload sudah dikoreksi." } });
    fireEvent.click(screen.getByRole("button", { name: /^buat pengiriman pengganti$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/sudah dibuat/i);
    expect(screen.getByLabelText(/alasan dan perbaikan/i)).toHaveValue("Payload sudah dikoreksi.");
  });
});