import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InboxPage from "@/pages/surat/InboxPage";
import { FUND_SUBMISSION_TYPES } from "@/features/surat/registration/usages/fund/fund-types";

const mocks = vi.hoisted(() => {
  const fixture = {
    id: "signature", surat_id: "surat", task_type: "approval", step_order: 1, role_name: "Pemohon", is_signed: false,
    surat_registrasi: {
      id: "surat", no_surat: "001/UAI/KEU/X/2026", judul_surat: "Pengajuan Dana", created_at: "2026-10-06", request_date: "2026-10-06", request_place: "Solo",
      requester_snapshot: { full_name: "Pemohon" },
      location_snapshot: { office: { name: "KC. Solo" }, department: { name: "Keuangan" }, project: { name: "Proyek Solo" }, form: { nomor_form: "FM-UAI.KEU-10-00", nama_form: "Pengajuan Dana" } },
      form_input_data: {
        request_category: "non_asset", keu10_purpose_code: "certificate", fund_type: "marketing_cost", fund_amount: 1, free_cash_sisa_bulan_lalu: 1,
        items: [{ id: "item", keterangan: "Biaya sertifikat", jumlah: 3, satuan: "dokumen", estimasi_harga_satuan: 150_000, total: 1, status: "PGD" }],
      },
      policy_snapshot: { keu10_config: { version: 1, disposition: "legal_land", purposes: [{ code: "certificate", label: "Sertifikat tanah" }], approval_threshold: null } },
      surat_signatures: [], surat_attachments: [],
    },
  };
  return { fixture, noop: vi.fn(), save: vi.fn(), requestRevision: vi.fn().mockResolvedValue({ id: "revision" }), pdfTables: vi.fn<(doc: unknown, options: { head?: unknown; body?: unknown }) => void>(), empty: [] };
});

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.noop }),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: queryKey[0] === "surat-inbox-detail" ? mocks.fixture : queryKey[0] === "user-profile-inbox" ? null : mocks.empty,
    isFetching: false, isLoading: false,
  }),
}));
vi.mock("@/features/surat/inbox/lib/use-inbox-pagination", () => ({
  useInboxPagination: () => ({
    items: [mocks.fixture], total: 1, remaining: 0, hasMore: false, loading: false, error: null, isFetching: false,
    detailCache: {}, setDetailCache: mocks.noop, loadMore: mocks.noop, refetch: mocks.noop, refetchFull: mocks.noop,
    finishTaskLocally: mocks.noop, refreshAfterAction: mocks.noop, resetPagination: mocks.noop,
  }),
}));
vi.mock("@/providers/AttentionProvider", () => ({ useAttention: () => ({ refetch: mocks.noop }) }));
vi.mock("@/components/app/AppDialogProvider", () => ({ useAppDialog: () => ({ confirm: mocks.noop }) }));
vi.mock("@/hooks/useDocumentOpener", () => ({
  useDocumentOpener: () => ({ openPdf: mocks.noop, openFile: mocks.noop, isOpening: () => false }), documentOperationKey: { pdf: () => "document", file: () => "file" },
}));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/features/surat/inbox/services/surat-approval-api", () => ({ suratApprovalApi: { requestProcessRevision: mocks.requestRevision } }));
vi.mock("jspdf", () => ({
  jsPDF: class {
    lastAutoTable = { finalY: 160 };
    setTextColor = mocks.noop;
    setDrawColor = mocks.noop;
    setFillColor = mocks.noop;
    setLineWidth = mocks.noop;
    setFont = mocks.noop;
    setFontSize = mocks.noop;
    text = mocks.noop;
    line = mocks.noop;
    rect = mocks.noop;
    addPage = mocks.noop;
    addImage = mocks.noop;
    save = mocks.save;
  },
}));
vi.mock("jspdf-autotable", () => ({ default: mocks.pdfTables }));

describe("KEU 10 inbox display and summary export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fixture.surat_registrasi.form_input_data.fund_type = "marketing_cost";
    mocks.fixture.role_name = "Pemohon";
    mocks.fixture.step_order = 1;
    mocks.fixture.surat_registrasi.form_input_data.items[0].jumlah = 3;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  });
  afterEach(() => vi.unstubAllGlobals());
  it.each(["FM-UAI.KEU-10-00", "FM-MBN.KEU-10-00"])("renders %s without PGD item columns or KEU 1 finance", (number) => {
    mocks.fixture.surat_registrasi.location_snapshot.form.nomor_form = number;
    render(<MemoryRouter><InboxPage /></MemoryRouter>);
    expect(screen.getByRole("columnheader", { name: "Estimasi Harga Satuan" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Status" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Nama Barang" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Free Cash|Kebutuhan Dana|Kas Kecil/)).not.toBeInTheDocument();
    expect(screen.getByText("Sertifikat tanah")).toBeInTheDocument();
    expect(screen.getByText("Cabang / Proyek")).toBeInTheDocument();
    expect(screen.getAllByText("Rp 450.000")).toHaveLength(2);
  });
  it("exports KEU 10 identity, purpose, item arithmetic and only Grand Total", async () => {
    mocks.fixture.surat_registrasi.location_snapshot.form.nomor_form = "FM-MBN.KEU-10-00";
    render(<MemoryRouter><InboxPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Export Summary" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    const tables = mocks.pdfTables.mock.calls.map(([, options]) => options);
    expect(tables[0].body).toEqual(expect.arrayContaining([
      ["No. Formulir", "FM-MBN.KEU-10-00"], ["Tujuan Pengajuan", "Sertifikat tanah"], ["Proyek", "Proyek Solo"],
    ]));
    expect(tables[1].head).toEqual([["No.", "Keterangan", "Jumlah", "Satuan", "Estimasi Harga Satuan", "Total"]]);
    expect(tables[1].body).toEqual([[1, "Biaya sertifikat", 3, "dokumen", "Rp 150.000", "Rp 450.000"]]);
    expect(tables[2].body).toEqual([["Grand Total", "Rp 450.000"]]);
    expect(JSON.stringify(tables)).not.toMatch(/Free Cash|Kebutuhan Dana|Kas Kecil|Nama Barang|Jenis Pengajuan Dana/);
  });
  it.each(FUND_SUBMISSION_TYPES)("omits legacy $label from KEU detail and export", async ({ value, label }) => {
    mocks.fixture.surat_registrasi.form_input_data.fund_type = value;
    render(<MemoryRouter><InboxPage /></MemoryRouter>);
    expect(screen.queryByText(label)).not.toBeInTheDocument();
    expect(screen.queryByText("Jenis Pengajuan Dana")).not.toBeInTheDocument();
    expect(screen.queryByText(value)).not.toBeInTheDocument();
    expect(screen.queryByText("certificate")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Export Summary" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    const tables = mocks.pdfTables.mock.calls.map(([, options]) => options);
    expect(tables[0].body).toEqual(expect.arrayContaining([["Tujuan Pengajuan", "Sertifikat tanah"]]));
    expect(JSON.stringify(tables)).not.toContain("Jenis Pengajuan Dana");
    expect(JSON.stringify(tables)).not.toContain(value);
  });
  it.each([
    { role: "pemohon", label: "Branch Manager", step: 1 },
    { role: "memeriksa", label: "Manager", step: 2 },
    { role: "menyetujui", label: "Director", step: 5 },
  ])("$label can return KEU 10 with a reason, but cannot edit or propose values", async ({ role, step }) => {
    mocks.fixture.role_name = role;
    mocks.fixture.step_order = step;
    mocks.fixture.surat_registrasi.form_input_data.items[0].jumlah = 0;
    render(<MemoryRouter><InboxPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Perbaikan" }));
    const dialog = within(screen.getByRole("dialog", { name: "Perbaikan pengajuan" }));
    expect(dialog.queryByLabelText("Keterangan")).not.toBeInTheDocument();
    expect(dialog.queryByRole("textbox", { name: /Estimasi harga satuan/ })).not.toBeInTheDocument();
    expect(dialog.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText("Alasan pengembalian"), { target: { value: "abcd" } });
    fireEvent.click(dialog.getByRole("button", { name: /Minta perbaikan|Kirim revisi/ }));
    expect(mocks.requestRevision).not.toHaveBeenCalled();
    fireEvent.change(dialog.getByLabelText("Alasan pengembalian"), { target: { value: "Perbaiki rincian dan lampiran." } });
    fireEvent.click(dialog.getByRole("button", { name: /Minta perbaikan|Kirim revisi/ }));
    await waitFor(() => expect(mocks.requestRevision).toHaveBeenCalledOnce());
    expect(mocks.requestRevision).toHaveBeenCalledWith(expect.objectContaining({
      targetType: "requester", targetStep: null, reason: "Perbaiki rincian dan lampiran.",
      changes: { note: "Perbaiki rincian dan lampiran.", requested_by: "approval_inbox", requires_resign: true, restart_step: step, requester_edit_required: true },
    }));
  });
  it("only the formal Finance verifier can propose validated items for requester confirmation", async () => {
    mocks.fixture.role_name = "verifikator";
    mocks.fixture.step_order = 4;
    render(<MemoryRouter><InboxPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Perbaikan" }));
    const dialog = within(screen.getByRole("dialog", { name: "Perbaikan pengajuan" }));
    fireEvent.click(dialog.getByRole("radio", { name: "Revisi oleh Penandatangan" }));
    expect(dialog.getByLabelText("Keterangan")).toBeInTheDocument();
    expect(dialog.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText("Jumlah"), { target: { value: "0" } });
    fireEvent.change(dialog.getByLabelText("Alasan pengembalian / koreksi"), { target: { value: "Koreksi jumlah menjadi dua dokumen." } });
    fireEvent.click(dialog.getByRole("button", { name: /Minta perbaikan|Kirim revisi/ }));
    expect(mocks.requestRevision).not.toHaveBeenCalled();
    fireEvent.change(dialog.getByLabelText("Jumlah"), { target: { value: "2" } });
    fireEvent.click(dialog.getByRole("button", { name: /Minta perbaikan|Kirim revisi/ }));
    await waitFor(() => expect(mocks.requestRevision).toHaveBeenCalledOnce());
    expect(mocks.requestRevision).toHaveBeenCalledWith(expect.objectContaining({
      targetType: "requester", targetStep: null,
      changes: expect.objectContaining({ requires_resign: true, restart_step: 4, signer_revision_required: true, keu10_proposed_input: { items: [expect.objectContaining({ jumlah: "2", total: 300_000 })] } }),
    }));
    expect(mocks.fixture.surat_registrasi.form_input_data.items[0].jumlah).toBe(3);
  });
});
