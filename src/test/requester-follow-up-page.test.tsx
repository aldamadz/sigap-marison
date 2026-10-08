import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TindakLanjutSuratPage from "@/pages/surat/TindakLanjutSuratPage";

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[], rpc: vi.fn(), accept: vi.fn(), cancel: vi.fn(), draft: vi.fn(), toast: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) }, rpc: mocks.rpc,
  from: () => ({ select() { return this; }, eq() { return this; }, async order() { return { data: mocks.rows, error: null }; } }),
} }));
vi.mock("@/services/surat.service", () => ({ suratService: {
  acceptProcessRevision: mocks.accept, cancelAfterRevision: mocks.cancel, createExternalSubmissionRevisionDraft: mocks.draft,
} }));
vi.mock("sonner", () => ({ toast: { success: mocks.toast, error: vi.fn() } }));
vi.mock("@/components/surat/RegistrationSummaryDialog", () => ({ RegistrationSummaryDocument: () => <div>Dokumen asli</div> }));
vi.mock("@/components/surat/registration-summary-data", () => ({ buildRegistrationSummaryData: (row: unknown) => row }));
const eventId = "963b7fab-d4f7-4251-aeb2-5e56a32a66ee";
const clients: QueryClient[] = [];
function mount(changes: Record<string, unknown>) {
  mocks.rows = [{ id: "document", created_by: "owner", judul_surat: "Pengajuan revisi", surat_signatures: [],
    data_snapshot: { revision: { event_id: eventId, target_type: "requester", reason: "Perbaiki pengajuan", changes } },
  }];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(<MemoryRouter><QueryClientProvider client={client}><TindakLanjutSuratPage /></QueryClientProvider></MemoryRouter>);
  return client;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.accept.mockResolvedValue({});
  mocks.rpc.mockResolvedValue({ data: [{ event_id: eventId, started_at: "2026-10-08T01:00:00Z",
    measured_at: "2026-10-08T02:00:00Z", elapsed_minutes: 60, sla_minutes: 120,
    timezone: "Asia/Jakarta", config_source: "default", department_name: null }], error: null });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });

describe("follow-up page SLA and revision compatibility", () => {
  it.each([true, false])("keeps requester edit=%s mode and shows SLA separately", async requesterEdit => {
    mount(requesterEdit ? { requester_edit_required: true } : { signer_revision_required: true });
    expect(await screen.findByRole("heading", { name: "SLA perbaikan" })).toBeInTheDocument();
    expect(screen.getByText("SLA perbaikan: Sisa 1 jam")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: requesterEdit ? "Perbaiki Pengajuan" : "Lanjutkan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: requesterEdit ? "Lanjutkan" : "Perbaiki Pengajuan" })).not.toBeInTheDocument();
    expect(screen.getByText("Dokumen asli")).toBeInTheDocument();
  });
  it.each([true, false])("uses internal resume copy only for marked internal=%s", async internal => {
    mount(internal ? { signer_revision_required: true } : {});
    fireEvent.click(await screen.findByRole("button", { name: "Lanjutkan" }));
    if (internal) expect(screen.getByText("Data revisi akan diterima. Pengajuan kembali ke tahap yang meminta perbaikan.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lanjutkan Proses" }));
    await waitFor(() => expect(mocks.accept).toHaveBeenCalledWith(eventId, ""));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("Pengajuan dilanjutkan", {
      description: internal ? "Pengajuan kembali ke tahap yang meminta perbaikan."
        : "Persetujuan dimulai ulang agar seluruh pihak mengetahui perubahan terbaru.",
    }));
  });
  it("preserves legacy external draft action", async () => {
    mount({ external_submission_revision: true });
    expect(await screen.findByRole("button", { name: "Perbaiki Pengajuan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lanjutkan" })).not.toBeInTheDocument();
  });
  it("manual refresh invalidates the SLA query too", async () => {
    const client = mount({ signer_revision_required: true });
    await screen.findByRole("heading", { name: "SLA perbaikan" });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    fireEvent.click(screen.getByRole("button", { name: "Segarkan" }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["requester-follow-up-sla"] });
  });
});
