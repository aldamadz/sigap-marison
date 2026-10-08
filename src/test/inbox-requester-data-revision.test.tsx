import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InboxPage from "@/pages/surat/InboxPage";

type FixtureItem = { nama_barang?: string; id?: string; keterangan?: string; jumlah: string | number; satuan?: string; estimasi_harga_satuan?: number };
type Fixture = {
  id: string; surat_id: string; task_type: string; step_order: number; role_name: string; is_signed: boolean;
  verifier_snapshot?: { user_id: string; full_name: string }[]; requires_unit_allocation?: boolean;
  surat_registrasi: {
    id: string; no_surat: string; judul_surat: string; status: string; created_at: string; request_date: string; request_place: string;
    requester_snapshot: { full_name: string }; location_snapshot: { office: { name: string }; department: { name: string }; form: { nomor_form: string } };
    form_input_data: { request_category: string; items: FixtureItem[]; requires_recommendation?: boolean };
    policy_snapshot: Record<string, unknown>; surat_signatures: unknown[]; surat_attachments: unknown[];
  };
};

const mocks = vi.hoisted(() => ({
  fixture: {} as Fixture,
  noop: vi.fn(),
  requestRevision: vi.fn(),
  prompt: vi.fn(),
  error: vi.fn(),
  empty: [],
}));

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
vi.mock("@/components/app/AppDialogProvider", () => ({ useAppDialog: () => ({ prompt: mocks.prompt }) }));
vi.mock("@/hooks/useDocumentOpener", () => ({
  useDocumentOpener: () => ({ openPdf: mocks.noop, openFile: mocks.noop, isOpening: () => false }),
  documentOperationKey: { pdf: () => "document", file: () => "file" },
}));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/features/surat/inbox/services/surat-approval-api", () => ({
  suratApprovalApi: { requestProcessRevision: mocks.requestRevision },
}));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: mocks.noop } }));

const reason = "Perbaiki data dan lampiran pendukung.";
const originalScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
const renderInbox = () => render(<MemoryRouter><InboxPage /></MemoryRouter>);
const openRevision = () => {
  fireEvent.click(screen.getByRole("button", { name: "Perbaikan" }));
  return within(screen.getByRole("dialog", { name: "Perbaikan pengajuan" }));
};
const chooseOption = (trigger: HTMLElement, label: string) => {
  fireEvent.keyDown(trigger, { key: "Enter" });
  fireEvent.click(screen.getByRole("option", { name: label }));
};
const useKeu10 = (role = "verifikator") => {
  mocks.fixture.role_name = role;
  mocks.fixture.surat_registrasi.location_snapshot.form.nomor_form = "FM-UAI.KEU-10-00";
  mocks.fixture.surat_registrasi.form_input_data.items = [
    { id: "item", keterangan: "Biaya sertifikat", jumlah: 3, satuan: "dokumen", estimasi_harga_satuan: 150_000 },
  ];
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requestRevision.mockResolvedValue({ id: "revision" });
  mocks.prompt.mockResolvedValue(reason);
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  mocks.fixture = {
    id: "signature", surat_id: "surat", task_type: "approval", step_order: 3, role_name: "menyetujui", is_signed: false,
    surat_registrasi: {
      id: "surat", no_surat: "001/UAI/X/2026", judul_surat: "Pengajuan Aset", status: "PROSES",
      created_at: "2026-10-06", request_date: "2026-10-06", request_place: "Solo",
      requester_snapshot: { full_name: "Pemohon" },
      location_snapshot: { office: { name: "KC. Solo" }, department: { name: "Keuangan" }, form: { nomor_form: "FM-UAI.PGD-03-00" } },
      form_input_data: { request_category: "asset", items: [{ nama_barang: "Laptop", jumlah: "3" }] },
      policy_snapshot: {}, surat_signatures: [], surat_attachments: [],
    },
  };
});

afterEach(() => {
  cleanup();
  if (originalScrollIntoView) Object.defineProperty(Element.prototype, "scrollIntoView", originalScrollIntoView);
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Inbox requester data and attachment revision", () => {
  it.each([true, false])("defaults to general return with structured items=%s", async (hasItems) => {
    if (!hasItems) mocks.fixture.surat_registrasi.form_input_data.items = [];
    renderInbox();
    const dialog = openRevision();
    expect(dialog.getByRole("radio", { name: "Minta Perbaikan Pemohon" })).toBeChecked();
    expect(dialog.queryByText("Perubahan item")).not.toBeInTheDocument();
    const input = dialog.getByLabelText("Alasan pengembalian");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("minlength", "5");
    fireEvent.change(input, { target: { value: `  ${reason}  ` } });
    fireEvent.click(dialog.getByRole("button", { name: /Minta perbaikan|Kirim revisi/ }));
    await waitFor(() => expect(mocks.requestRevision).toHaveBeenCalledExactlyOnceWith({
      suratId: "surat", signatureId: "signature", targetType: "requester", targetStep: null, reason,
      changes: { note: reason, requested_by: "approval_inbox", requires_resign: true, restart_step: 3, requester_edit_required: true },
    }));
  });

  it.each(["", "    ", " abcd "])("rejects an insufficient general reason %j", (value) => {
    renderInbox();
    const dialog = openRevision();
    fireEvent.change(dialog.getByLabelText("Alasan pengembalian"), { target: { value } });
    fireEvent.click(dialog.getByRole("button", { name: /Minta perbaikan|Kirim revisi/ }));
    expect(mocks.requestRevision).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith("Catatan revisi minimal 5 karakter.");
  });

  it("preserves suggested item validation and payload", async () => {
    renderInbox();
    const dialog = openRevision();
    fireEvent.click(dialog.getByRole("radio", { name: "Revisi oleh Penandatangan" }));
    fireEvent.click(dialog.getByRole("button", { name: /Minta perbaikan|Kirim revisi/ }));
    expect(mocks.requestRevision).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("Pilih minimal satu item"));
    chooseOption(dialog.getByRole("combobox"), "Tidak disetujui");
    fireEvent.change(dialog.getByRole("textbox"), { target: { value: "abcd" } });
    fireEvent.click(dialog.getByRole("button", { name: /Minta perbaikan|Kirim revisi/ }));
    expect(mocks.requestRevision).not.toHaveBeenCalled();
    fireEvent.change(dialog.getByRole("textbox"), { target: { value: reason } });
    fireEvent.click(dialog.getByRole("button", { name: /Minta perbaikan|Kirim revisi/ }));
    await waitFor(() => expect(mocks.requestRevision).toHaveBeenCalledOnce());
    const payload = mocks.requestRevision.mock.calls[0][0];
    expect(payload).toMatchObject({ targetType: "requester", reason, changes: {
      requires_resign: true, restart_step: 3, item_revisions: [{ index: 0, action: "reject", nama_barang: "Laptop", alasan: reason }],
    } });
    expect(payload.changes).not.toHaveProperty("requester_edit_required");
    expect(payload.changes).not.toHaveProperty("external_submission_revision");
  });

  it("does not send hidden item changes or use their reasons in general mode", async () => {
    renderInbox();
    const dialog = openRevision();
    fireEvent.click(dialog.getByRole("radio", { name: "Revisi oleh Penandatangan" }));
    chooseOption(dialog.getByRole("combobox"), "Tidak disetujui");
    fireEvent.change(dialog.getByRole("textbox"), { target: { value: "Usulan item sebelumnya" } });
    fireEvent.click(dialog.getByRole("radio", { name: "Minta Perbaikan Pemohon" }));
    fireEvent.click(dialog.getByRole("button", { name: /Minta perbaikan|Kirim revisi/ }));
    expect(mocks.requestRevision).not.toHaveBeenCalled();
    fireEvent.change(dialog.getByLabelText("Alasan pengembalian"), { target: { value: reason } });
    fireEvent.click(dialog.getByRole("button", { name: /Minta perbaikan|Kirim revisi/ }));
    await waitFor(() => expect(mocks.requestRevision).toHaveBeenCalledOnce());
    expect(mocks.requestRevision.mock.calls[0][0].changes).toEqual({
      note: reason, requested_by: "approval_inbox", requires_resign: true, restart_step: 3, requester_edit_required: true,
    });
  });

  it("resets the mode when reopening the return dialog", () => {
    renderInbox();
    const dialog = openRevision();
    fireEvent.click(dialog.getByRole("radio", { name: "Revisi oleh Penandatangan" }));
    fireEvent.click(dialog.getByRole("button", { name: "Batal" }));
    expect(openRevision().getByRole("radio", { name: "Minta Perbaikan Pemohon" })).toBeChecked();
  });

  it.each([
    ["checker", "Tim pemeriksa", 3, 3],
    ["signer", "Signer sebelumnya", 2, 2],
    ["recommendation", "Tim IT / rekomendasi", null, 3],
  ])("preserves %s destination behavior", async (target, label, targetStep, restartStep) => {
    mocks.fixture.verifier_snapshot = [{ user_id: "checker", full_name: "Pemeriksa" }];
    mocks.fixture.surat_registrasi.form_input_data.requires_recommendation = true;
    renderInbox();
    const targetSelect = screen.getAllByRole("combobox").find((element) => element.textContent === "Pemohon")!;
    chooseOption(targetSelect, String(label));
    const dialog = openRevision();
    expect(dialog.queryByRole("radio")).not.toBeInTheDocument();
    chooseOption(dialog.getByRole("combobox"), "Tidak disetujui");
    fireEvent.change(dialog.getByRole("textbox"), { target: { value: reason } });
    fireEvent.click(dialog.getByRole("button", { name: /Minta perbaikan|Kirim revisi/ }));
    await waitFor(() => expect(mocks.requestRevision).toHaveBeenCalledOnce());
    const payload = mocks.requestRevision.mock.calls[0][0];
    expect(payload).toMatchObject({ targetType: target, targetStep, reason, changes: {
      requires_resign: true, restart_step: restartStep, item_revisions: [{ action: "reject", alasan: reason }],
    } });
    expect(payload.changes).not.toHaveProperty("requester_edit_required");
  });

  it.each(["pemohon", "memeriksa", "menyetujui", "verifikator"])("allows KEU10 %s general return without item validation", async (role) => {
    useKeu10(role);
    mocks.fixture.surat_registrasi.form_input_data.items[0].jumlah = 0;
    renderInbox();
    const dialog = openRevision();
    expect(dialog.queryByLabelText("Keterangan")).not.toBeInTheDocument();
    if (role !== "verifikator") expect(dialog.queryByRole("radio", { name: "Revisi oleh Penandatangan" })).not.toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText("Alasan pengembalian"), { target: { value: reason } });
    fireEvent.click(dialog.getByRole("button", { name: /Minta perbaikan|Kirim revisi/ }));
    await waitFor(() => expect(mocks.requestRevision).toHaveBeenCalledExactlyOnceWith({
      suratId: "surat", signatureId: "signature", targetType: "requester", targetStep: null, reason,
      changes: { note: reason, requested_by: "approval_inbox", requires_resign: true, restart_step: 3, requester_edit_required: true },
    }));
  });

  it("retains validated KEU10 proposals for the formal verifier in item mode", async () => {
    useKeu10();
    renderInbox();
    const dialog = openRevision();
    fireEvent.click(dialog.getByRole("radio", { name: "Revisi oleh Penandatangan" }));
    fireEvent.change(dialog.getByLabelText("Jumlah"), { target: { value: "0" } });
    fireEvent.change(dialog.getByLabelText("Alasan pengembalian / koreksi"), { target: { value: reason } });
    fireEvent.click(dialog.getByRole("button", { name: /Minta perbaikan|Kirim revisi/ }));
    expect(mocks.requestRevision).not.toHaveBeenCalled();
    fireEvent.change(dialog.getByLabelText("Jumlah"), { target: { value: "2" } });
    fireEvent.click(dialog.getByRole("button", { name: /Minta perbaikan|Kirim revisi/ }));
    await waitFor(() => expect(mocks.requestRevision).toHaveBeenCalledOnce());
    const payload = mocks.requestRevision.mock.calls[0][0];
    expect(payload.changes).toMatchObject({ requires_resign: true, restart_step: 3,
      keu10_proposed_input: { items: [expect.objectContaining({ jumlah: "2", total: 300_000 })] },
    });
    expect(payload.changes).not.toHaveProperty("requester_edit_required");
    expect(mocks.fixture.surat_registrasi.form_input_data.items[0].jumlah).toBe(3);
  });

  it("marks the separate verification dead-end return as requester editing", async () => {
    mocks.fixture.task_type = "verification";
    mocks.fixture.requires_unit_allocation = true;
    mocks.fixture.surat_registrasi.form_input_data.request_category = "unit";
    renderInbox();
    fireEvent.click(screen.getByRole("button", { name: "Minta perbaikan" }));
    await waitFor(() => expect(mocks.requestRevision).toHaveBeenCalledExactlyOnceWith({
      suratId: "surat", signatureId: "signature", targetType: "requester", targetStep: null, reason,
      changes: { note: reason, requested_by: "verification_inbox", requester_edit_required: true,
        requires_resign: true, restart_step: 3, unit_availability_dead_end: true },
    }));
  });

  it("does not expose general return for other verification tasks", () => {
    mocks.fixture.task_type = "verification";
    renderInbox();
    expect(screen.queryByRole("button", { name: /Minta perbaikan/ })).not.toBeInTheDocument();
  });
});
