import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegistrationSummaryDialog, RegistrationSummaryDocument, type RegistrationSummaryData } from "@/components/surat/RegistrationSummaryDialog";
import {
  confirmMock, createDeferred, serviceMock, setSearchParamsOverride, setupTestHarness,
  supabaseMock, teardownTestHarness, registerFetchRoute,
  toastMock,
} from "./surat-form-harness";
import TindakLanjutSuratPage from "@/pages/surat/TindakLanjutSuratPage";
import { configureStandardMocks, goToWizardStep, mountFormWithUsage } from "./surat-form-driver";
import {
  CURRENT_PROFILE_KC, FUND_FORM_USAGE_RAW, MASTER_DATA_WITH_PROJECTS, MULTI_ITEM_FORM_USAGE_RAW,
  NON_UNIT_FORM_USAGE_RAW, UUID,
} from "./surat-form-fixtures";

const integration = vi.hoisted(() => ({ submit: vi.fn(), openFile: vi.fn() }));
vi.mock("@/features/surat/registration/services/external-revision-submit", () => ({
  executeExternalRevisionSubmit: integration.submit,
  getExternalRevisionSuccessDescription: () => "Approval dilanjutkan.",
}));
vi.mock("@/services/document-preview.service", () => ({
  documentPreviewService: { openStoredFileInNewTab: integration.openFile },
}));
const revisionService = Object.assign(serviceMock, {
  createExternalSubmissionRevisionDraft: vi.fn(), acceptProcessRevision: vi.fn(), cancelAfterRevision: vi.fn(),
});
const revisionSupabase = Object.assign(supabaseMock, { rpc: vi.fn() });

const eventId = "963b7fab-d4f7-4251-aeb2-5e56a32a66ee";
const items = [
  { id: "item-a", nama_barang: "Biaya pertama", keterangan: "Biaya pertama", jumlah: 2, sat: "paket", satuan: "paket", harga_satuan: 10000, estimasi_harga_satuan: 10000, nominal: 20000, status: "2" },
  { id: "item-b", nama_barang: "Biaya kedua", keterangan: "Biaya kedua", jumlah: 1, sat: "paket", satuan: "paket", harga_satuan: 20000, estimasi_harga_satuan: 20000, nominal: 20000, status: "2" },
];
const storedFile = {
  id: UUID.draft_file, draft_id: UUID.draft, file_url: "https://storage.example/original.pdf",
  file_name: "original.pdf", file_type: "application/pdf", file_size: 20,
  requirement_key: "requester_additional", requirement_label: "Lampiran tambahan", created_at: "2026-10-08",
};
const protectedFile = {
  id: "finance-file", surat_id: UUID.surat, file_name: "finance.pdf", file_url: "https://storage.example/finance.pdf",
};

type TestUsage = {
  id: string;
  form_id: string;
  request_category: string;
  form_usage_steps: Array<{ id: string; role_name: string; label: string }>;
};

function makeDraft(usage: TestUsage = FUND_FORM_USAGE_RAW[0], rows: Record<string, unknown>[] = items) {
  const formData = {
    entity_id: UUID.entity, dept_id: UUID.dept_pbo, letter_type_id: UUID.letter_type,
    office_id: UUID.office_kc, project_id: "proj-001", judul_surat: "Judul asli pemohon",
    penggunaan_id: usage.id, form_usage_id: usage.id, is_aset: usage.request_category === "asset",
    request_place: "Tempat asli", request_date: "2026-10-07",
    form_input_data: { request_category: usage.request_category, request_mode: "barang", items: rows, fund_type: "operational", catatan: "Catatan asli", keu10_purpose_code: "land" },
  };
  return {
    id: UUID.draft, no_surat: "001/UAI/KEU/X/2026", reservation_id: null, status: "DRAFT",
    revision_event_id: eventId,
    revision_context: { eventId, reason: "Lengkapi data pengajuan", requesterEditRequired: true },
    created_by: UUID.user, expires_at: "2099-10-08", no_urut: 1,
    payload: {
      formData, selectedFormId: usage.form_id, selectedUsageId: usage.id, linkedDocumentContext: null,
      externalRevision: {
        eventId, requesterEditRequired: true, reason: "Lengkapi data pengajuan",
        baseline: { formData: structuredClone(formData), attachments: [storedFile] },
        protectedAttachments: [protectedFile],
        policySnapshot: undefined as Record<string, unknown> | undefined,
      },
    },
    signer_assignments: usage.form_usage_steps.map((step, index) => ({
      step_order: index + 1, form_usage_step_id: step.id, user_id: index === 0 ? UUID.user : UUID.user3,
      role_name: step.role_name, label_jabatan: step.label,
    })),
    surat_registration_draft_files: [storedFile],
  };
}

async function mountDraft(usage: TestUsage = FUND_FORM_USAGE_RAW[0], rows = items, configure?: (draft: ReturnType<typeof makeDraft>) => void) {
  const draft = makeDraft(usage, rows);
  configure?.(draft);
  setSearchParamsOverride(new URLSearchParams(`draft=${UUID.draft}`));
  serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_WITH_PROJECTS);
  serviceMock.getRegistrationDraft.mockResolvedValue(draft);
  serviceMock.deleteRegistrationDraftFile.mockResolvedValue(undefined);
  registerFetchRoute("/api/data-sources/marison_non_units_by_project/query", { options: [] });
  await mountFormWithUsage([usage], CURRENT_PROFILE_KC);
  await screen.findByDisplayValue("Judul asli pemohon");
  return draft;
}

beforeEach(() => {
  setupTestHarness();
  configureStandardMocks();
  integration.submit.mockReset().mockResolvedValue({ surat_id: UUID.surat, next_step: "approval" });
  integration.openFile.mockReset().mockResolvedValue(undefined);
  revisionSupabase.rpc.mockReset().mockResolvedValue({ data: [], error: null });
});
afterEach(() => teardownTestHarness());

describe("Issue 490 requester draft UI", () => {
  it("restores original fields and preserves the immutable baseline through autosave and return to draft list", async () => {
    const draft = await mountDraft();
    expect(screen.getByDisplayValue("Tempat asli")).toBeEnabled();
    expect(screen.getByDisplayValue("Judul asli pemohon")).toBeEnabled();
    expect(screen.getByLabelText("Catatan perbaikan pemohon (opsional)")).toHaveValue("");
    fireEvent.change(screen.getAllByLabelText("Jumlah")[0], { target: { value: "3" } });
    await waitFor(() => expect(serviceMock.saveRegistrationDraft).toHaveBeenCalled(), { timeout: 2500 });
    const payload = serviceMock.saveRegistrationDraft.mock.calls.at(-1)![1];
    expect(payload.externalRevision).toEqual(draft.payload.externalRevision);
    expect(payload.formData).toMatchObject({ judul_surat: "Judul asli pemohon", request_place: "Tempat asli", request_date: "2026-10-07" });
    expect(payload.externalRevision.baseline.formData.form_input_data.items[0].jumlah).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: /Daftar draft/i }));
    await waitFor(() => expect(serviceMock.saveRegistrationDraft.mock.calls.at(-1)![1].externalRevision).toEqual(draft.payload.externalRevision));
  });

  it("confirms unlinking attachments, keeps protected files read-only and opens them through the existing opener", async () => {
    await mountDraft();
    expect(screen.queryByRole("button", { name: "Hapus finance.pdf" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Buka finance.pdf" }));
    await waitFor(() => expect(integration.openFile).toHaveBeenCalledWith(UUID.surat, protectedFile.file_url));
    confirmMock.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Hapus original.pdf" }));
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(serviceMock.deleteRegistrationDraftFile).not.toHaveBeenCalled();
    expect(screen.getByText("original.pdf")).toBeInTheDocument();
    confirmMock.mockResolvedValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Hapus original.pdf" }));
    await waitFor(() => expect(serviceMock.deleteRegistrationDraftFile).toHaveBeenCalledWith(UUID.draft_file));
    expect(screen.queryByText("original.pdf")).not.toBeInTheDocument();
  });

  it("shows data/item/file changes before submitting and does not require a general note", async () => {
    await mountDraft();
    fireEvent.change(screen.getAllByLabelText("Jumlah")[0], { target: { value: "3" } });
    fireEvent.change(screen.getByDisplayValue("Judul asli pemohon"), { target: { value: "Judul diperbaiki" } });
    fireEvent.click(screen.getByRole("button", { name: "Hapus original.pdf" }));
    await waitFor(() => expect(screen.queryByText("original.pdf")).not.toBeInTheDocument());
    const addedFile = { ...storedFile, id: "added-file", file_url: "https://storage.example/new.pdf", file_name: "new.pdf" };
    serviceMock.uploadRegistrationDraftFiles.mockResolvedValue([addedFile]);
    fireEvent.change(screen.getByLabelText(/Unggah Lampiran Tambahan/i), {
      target: { files: [new File(["new"], "new.pdf", { type: "application/pdf" })] },
    });
    await screen.findByText("new.pdf");
    await goToWizardStep(3);
    fireEvent.click(screen.getByRole("button", { name: "Tinjau dan Kirim Perbaikan" }));
    expect(toastMock.mock.calls.filter(([value]) => value.variant === "destructive")).toEqual([]);
    const dialog = await screen.findByRole("dialog", { name: "Periksa perbaikan sebelum dikirim" });
    expect(within(dialog).getByRole("heading", { name: "Ringkasan perubahan" })).toBeInTheDocument();
    expect(within(dialog).getByText(/Judul asli pemohon.*menjadi Judul diperbaiki/)).toBeInTheDocument();
    expect(within(dialog).getByText("Item: 0 ditambahkan, 1 diubah, 0 dihapus")).toBeInTheDocument();
    expect(within(dialog).getByText("Lampiran: 1 ditambahkan, 1 dihapus")).toBeInTheDocument();
    expect(within(dialog).queryByText(/Ditambahkan: finance.pdf/)).not.toBeInTheDocument();
    expect(integration.submit).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Data Sudah Benar, Kirim Perbaikan" }));
    await waitFor(() => expect(integration.submit).toHaveBeenCalledWith(expect.objectContaining({
      revisionEventId: eventId, draftId: UUID.draft,
      formData: expect.objectContaining({ judul_surat: "Judul diperbaiki", form_input_data: expect.objectContaining({ items: expect.arrayContaining([expect.objectContaining({ jumlah: "3" })]) }) }),
    })));
  });

  it.each(["PGD", "KEU1", "KEU10", "non-unit"])("confirms removal via the shared module setter for %s", async (module) => {
    const usage = module === "non-unit" ? NON_UNIT_FORM_USAGE_RAW[0] : {
      ...FUND_FORM_USAGE_RAW[0],
      master_forms: { ...FUND_FORM_USAGE_RAW[0].master_forms, nomor_form: module === "KEU10" ? "FM-UAI.KEU-10-00" : module === "KEU1" ? "FM-UAI.KEU-01-00" : "FM-UAI.PGD-01-00" },
      ...(module === "KEU10" ? { keu10_config: { version: 1, disposition: "legal_land", purposes: [{ code: "land", label: "Tanah" }], approval_threshold: null } } : {}),
    };
    await mountDraft(usage, module === "non-unit" ? items.map(row => ({ ...row, item_name: row.nama_barang })) : items);
    const remove = screen.getAllByRole("button", { name: /^Hapus( item( 1)?| pekerjaan)?$/i })[0];
    const getRows = () => module === "non-unit" ? screen.getAllByLabelText(/Nama pekerjaan/) : screen.getAllByLabelText("Jumlah");
    confirmMock.mockResolvedValueOnce(false);
    fireEvent.click(remove);
    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    expect(getRows()).toHaveLength(2);
    confirmMock.mockResolvedValueOnce(true);
    fireEvent.click(remove);
    await waitFor(() => expect(getRows()).toHaveLength(1));
    // Last-row replacement must also be confirmed, even when array length stays one.
    confirmMock.mockResolvedValueOnce(false);
    fireEvent.click(screen.getAllByRole("button", { name: /^Hapus( item( 1)?| pekerjaan)?$/i })[0]);
    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(3));
    expect(getRows()[0]).toHaveValue(module === "non-unit" ? "Biaya kedua" : 1);
  });

  it("confirms generic table deletion and does not overwrite an edit made while confirmation is pending", async () => {
    await mountDraft(MULTI_ITEM_FORM_USAGE_RAW[0]);
    const pending = createDeferred<boolean>();
    confirmMock.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getAllByRole("button", { name: /^Hapus$/i })[0]);
    fireEvent.change(screen.getAllByDisplayValue("Biaya pertama")[0], { target: { value: "Perubahan baru" } });
    await act(async () => pending.resolve(true));
    expect(screen.getByDisplayValue("Perubahan baru")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("Biaya kedua").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: /^Hapus$/i })[0]);
    await waitFor(() => expect(screen.queryByDisplayValue("Perubahan baru")).not.toBeInTheDocument());
  });
});

describe("Issue 490 follow-up mode", () => {
  it.each([true, false])("requester_edit_required=%s selects draft editing versus proposal confirmation for KEU10", async (requesterEditRequired) => {
    const row = {
      id: UUID.surat, judul_surat: "Pengajuan perlu ditinjau", no_surat: "001/KEU/2026",
      location_snapshot: { form: { nomor_form: "FM-UAI.KEU-10-00" } },
      form_input_data: { request_category: "non_asset", items }, surat_signatures: [],
      data_snapshot: { revision: { event_id: eventId, target_type: "requester", reason: "Koreksi anggaran", changes: {
        requester_edit_required: requesterEditRequired,
        item_revisions: [{ index: 0, action: "adjust", nama_barang: "Biaya pertama", nilai_diajukan: 20000, nilai_disetujui: 10000, value_type: "money", alasan: "Batas anggaran" }],
      } } },
    };
    supabaseMock.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [row], error: null }),
    }) as never);
    revisionService.createExternalSubmissionRevisionDraft.mockResolvedValue({ id: UUID.draft, revision_event_id: eventId });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><TindakLanjutSuratPage /></QueryClientProvider>);
    if (requesterEditRequired) {
      fireEvent.click(await screen.findByRole("button", { name: "Perbaiki Pengajuan" }));
      await waitFor(() => expect(revisionService.createExternalSubmissionRevisionDraft).toHaveBeenCalledWith(eventId));
      expect(screen.queryByRole("button", { name: "Simpan perbaikan dan lanjutkan" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Lanjutkan" })).not.toBeInTheDocument();
    } else {
      const proposals = (await screen.findByRole("heading", { name: "Perubahan yang diajukan" })).closest("section")!;
      expect(within(proposals).getByText("Rp 20.000")).toBeInTheDocument();
      expect(within(proposals).getByText("Rp 10.000")).toBeInTheDocument();
      expect(within(proposals).getByText("Batas anggaran")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Perbaiki Pengajuan" })).not.toBeInTheDocument();
    }
    client.clear();
  });
});

describe("KEU10 full draft frozen final signer", () => {
  const candidates = [
    { id: UUID.user2, full_name: "Direktur I Beku", job_title: "Direktur I", is_active: true, department_id: "dir", kedudukan: "Pusat" },
    { id: UUID.user3, full_name: "Direktur Utama A", job_title: "Direktur Utama", is_active: true, department_id: "dir", kedudukan: "Pusat" },
    { id: UUID.user4, full_name: "Direktur Utama B", job_title: "Direktur Utama", is_active: true, department_id: "dir", kedudukan: "Pusat" },
    { id: "unfrozen", full_name: "Penyetuju di luar snapshot", job_title: "Direktur Utama", is_active: true, department_id: "dir", kedudukan: "Pusat" },
  ];
  const frozenConfig = { version: 1, disposition: "tactical_land", purposes: [{ code: "land", label: "Tujuan beku" }], approval_threshold: 2_000_000 };
  const usage = { ...FUND_FORM_USAGE_RAW[0], master_forms: { ...FUND_FORM_USAGE_RAW[0].master_forms, nomor_form: "FM-UAI.KEU-10-00" },
    keu10_config: { version: 1, disposition: "legal_land", purposes: [{ code: "live", label: "Tujuan live" }], approval_threshold: null } };
  const row = [{ ...items[0], jumlah: 1, estimasi_harga_satuan: 1_500_000 }];
  async function mountKeu10(ids: string[]) {
    return mountDraft(usage, row, draft => {
      draft.payload.externalRevision.policySnapshot = { keu10_config: frozenConfig, keu10_steps: [{
        id: usage.form_usage_steps[1].id, role_name: "menyetujui", signer_department_id: "dir", candidate_user_ids: ids,
      }] };
    });
  }
  it("uses frozen policy despite live drift, auto-selects only a unique eligible signer and flushes it before submit", async () => {
    revisionSupabase.rpc.mockResolvedValue({ data: candidates, error: null });
    const draft = await mountKeu10([UUID.user2, UUID.user3]);
    expect(screen.getByRole("combobox", { name: "Tujuan Pengajuan" })).toHaveTextContent("Tujuan beku");
    await goToWizardStep(3);
    expect(await screen.findByRole("button", { name: "Direktur I Beku" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Pemohon Staging" })).toBeDisabled();
    await goToWizardStep(2);
    fireEvent.change(screen.getByLabelText("Jumlah"), { target: { value: "2" } });
    await goToWizardStep(3);
    expect(await screen.findByRole("button", { name: "Direktur Utama A" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Tinjau dan Kirim Perbaikan" }));
    const dialog = await screen.findByRole("dialog", { name: "Periksa perbaikan sebelum dikirim" });
    expect(within(dialog).getByText("Direktur Utama A")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Data Sudah Benar, Kirim Perbaikan" }));
    await waitFor(() => expect(integration.submit).toHaveBeenCalledOnce());
    expect(revisionSupabase.rpc).toHaveBeenCalledWith("get_keu10_revision_final_candidates", { p_event_id: eventId });
    const lastSave = serviceMock.saveRegistrationDraft.mock.calls.at(-1)!;
    expect(lastSave[1].externalRevision.policySnapshot).toEqual(draft.payload.externalRevision.policySnapshot);
    expect(lastSave[2]).toEqual([
      expect.objectContaining({ user_id: UUID.user, role_name: "membuat" }),
      expect.objectContaining({ user_id: UUID.user3, role_name: "menyetujui" }),
    ]);
  });
  it("clears an invalid DI above the threshold, leaves ambiguity unselected and excludes unfrozen users", async () => {
    revisionSupabase.rpc.mockResolvedValue({ data: candidates, error: null });
    await mountKeu10([UUID.user2, UUID.user3, UUID.user4]);
    fireEvent.change(screen.getByLabelText("Jumlah"), { target: { value: "2" } });
    await goToWizardStep(3);
    const final = await screen.findByRole("button", { name: "Pilih Direktur..." });
    expect(final).toBeEnabled();
    expect(screen.getByRole("button", { name: "Tinjau dan Kirim Perbaikan" })).toBeDisabled();
    fireEvent.click(final);
    const list = await screen.findByRole("listbox");
    expect(within(list).queryByText("Direktur I Beku")).not.toBeInTheDocument();
    expect(within(list).queryByText("Penyetuju di luar snapshot")).not.toBeInTheDocument();
    fireEvent.click(within(list).getByText("Direktur Utama B"));
    expect(screen.getByRole("button", { name: "Direktur Utama B" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Tinjau dan Kirim Perbaikan" })).toBeEnabled();
  });
  it("preserves a previously valid selection among multiple candidates instead of forcing a different signer", async () => {
    revisionSupabase.rpc.mockResolvedValue({ data: candidates, error: null });
    await mountDraft(usage, [{ ...row[0], jumlah: 2 }], draft => {
      draft.payload.externalRevision.policySnapshot = { keu10_config: frozenConfig, keu10_steps: [{
        id: usage.form_usage_steps[1].id, role_name: "menyetujui", signer_department_id: "dir", candidate_user_ids: [UUID.user3, UUID.user4],
      }] };
    });
    await goToWizardStep(3);
    expect(await screen.findByRole("button", { name: "Direktur Utama A" })).toBeEnabled();
  });
  it.each(["error", "missing-policy"])("blocks confirmation for %s without trusting the live directory", async (mode) => {
    revisionSupabase.rpc.mockResolvedValue({ data: candidates, error: mode === "error" ? new Error("RPC unavailable") : null });
    if (mode === "error") await mountKeu10([UUID.user2, UUID.user3]);
    else await mountDraft(usage, row);
    await goToWizardStep(3);
    expect(screen.getByRole("button", { name: "Tinjau dan Kirim Perbaikan" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pemohon Staging" })).toBeDisabled();
    expect(integration.submit).not.toHaveBeenCalled();
  });
});

describe("Signer revision summary integration", () => {
  const data: RegistrationSummaryData = {
    noSurat: "001/KEU/2026", title: "Pengajuan dana", category: "non_asset", usageName: "Dana", formName: "Form dana",
    requesterName: "Pemohon", departmentName: "Keuangan", officeName: "Pusat", requestPlace: "Solo", requestDate: "2026-10-08",
    fields: [{ key: "items", label: "Rincian", value: items }], attachments: [], signers: [], isRecommendation: false,
    revision: { reason: "Koreksi penandatangan", changes: { item_revisions: [{ index: 0, nama_barang: "Biaya pertama", action: "adjust", nilai_diajukan: 20000, nilai_disetujui: 10000, value_type: "money", alasan: "Batas anggaran" }] } },
  };
  it.each(["document", "dialog"])("shows the parent component between identity and items in %s", (view) => {
    render(view === "document" ? <RegistrationSummaryDocument data={data} />
      : <RegistrationSummaryDialog open data={data} submitting={false} onOpenChange={() => {}} onConfirm={() => {}} />);
    const identity = screen.getByRole("heading", { name: "Identitas Dokumen" });
    const reason = screen.getByText(/Koreksi penandatangan/);
    const content = screen.getByRole("heading", { name: "Isi Dokumen" });
    expect(identity.compareDocumentPosition(reason) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(reason.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
