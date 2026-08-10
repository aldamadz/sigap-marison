import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  allowServiceCalls,
  assertStrictServiceCalls,
  serviceMock,
  setSearchParamsOverride,
  setupTestHarness,
  supabaseMock,
  teardownTestHarness,
} from "./surat-form-harness";
import {
  CREATE_DRAFT_RESULT,
  CURRENT_PROFILE_DEFAULT,
  MASTER_DATA_DEFAULT,
  RECOMMENDATION_PARENT_SUMMARY,
  UUID,
} from "./surat-form-fixtures";
import { mountFormWithUsageAndSearchParams } from "./surat-form-driver";

const recommendationUsage = [{
  id: UUID.form_usage,
  name: "Rekomendasi Aset",
  form_id: UUID.form_a,
  request_category: "asset",
  scope_type: null,
  recommendation_config: null,
  master_forms: {
    id: UUID.form_a,
    nama_form: "FORM REKOMENDASI ASET",
    nomor_form: "REC-001",
    link_form: "https://storage.example.com/recommendation.xlsx",
    department_id: UUID.dept_pbo,
    input_schema: JSON.stringify([
      {
        key: "recommendation_items",
        label: "Daftar Rekomendasi",
        type: "table",
        required: true,
        table_config: { start_row: 10, end_row: 20, columns: [] },
      },
      { key: "request_place", label: "Tempat", default_source: "request_place", cell: "C5" },
      { key: "request_date", label: "Tanggal", default_source: "request_date", cell: "C6" },
    ]),
    unit_config: null,
    signature_layout: null,
  },
  form_usage_departments: [{ department_id: UUID.dept_pbo }],
  form_usage_steps: [],
  form_usage_attachment_requirements: [],
}];

const parentSummary = {
  ...RECOMMENDATION_PARENT_SUMMARY,
  form_input_data: {
    request_category: "asset",
    items: [
      { nama_barang: "Item Paste" },
      { nama_barang: "Item Picker" },
      { nama_barang: "Item Drop" },
    ],
  },
};

const draft = {
  ...CREATE_DRAFT_RESULT,
  no_surat: "099/UAI/PBO.4/VIII/2026",
  payload: {
    formData: {
      entity_id: UUID.entity,
      dept_id: UUID.dept_pbo,
      letter_type_id: UUID.letter_type,
      office_id: UUID.office_pusat,
      project_id: "",
      judul_surat: "Acceptance Lampiran Rekomendasi",
      penggunaan_id: "",
      is_aset: true,
      form_usage_id: UUID.form_usage,
      request_place: "Magelang",
      request_date: "2026-08-06",
      form_input_data: { request_category: "asset", request_mode: "barang" },
    },
    selectedFormId: UUID.form_a,
    selectedUsageId: UUID.form_usage,
    linkedDocumentContext: {
      type: "recommendation",
      parentSuratId: UUID.surat,
      parentNoSurat: "098/UAI/PBO.1/VIII/2026",
      taskId: "task-acceptance-02",
      usageId: UUID.form_usage,
      formId: UUID.form_a,
      departmentId: UUID.dept_pbo,
      letterTypeId: UUID.letter_type,
    },
  },
  surat_registration_draft_files: [],
};

const uploadRows = [
  { id: "draft-file-paste", draft_id: CREATE_DRAFT_RESULT.id, file_url: "https://files.example/paste.png", file_name: "paste.png", file_type: "image/png", file_size: 11, requirement_key: "recommendation_item_1", requirement_label: "Lampiran gambar rekomendasi item 1", created_at: "2026-08-10T01:00:00.000Z" },
  { id: "draft-file-picker", draft_id: CREATE_DRAFT_RESULT.id, file_url: "https://files.example/picker.png", file_name: "picker.png", file_type: "image/png", file_size: 12, requirement_key: "recommendation_item_2", requirement_label: "Lampiran gambar rekomendasi item 2", created_at: "2026-08-10T01:01:00.000Z" },
  { id: "draft-file-drop", draft_id: CREATE_DRAFT_RESULT.id, file_url: "https://files.example/drop.png", file_name: "drop.png", file_type: "image/png", file_size: 13, requirement_key: "recommendation_item_3", requirement_label: "Lampiran gambar rekomendasi item 3", created_at: "2026-08-10T01:02:00.000Z" },
];

async function openItem(name: string) {
  await act(async () => fireEvent.click(await screen.findByRole("button", { name: new RegExp(name) })));
}

function currentDropzone() {
  const input = screen.getByLabelText(/Pilih gambar item/i);
  if (!input.parentElement) throw new Error("Recommendation image dropzone not found");
  return input.parentElement;
}

function configureSupabase() {
  (supabaseMock.from as unknown as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
    if (table === "profiles") {
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: CURRENT_PROFILE_DEFAULT, error: null }) };
    }
    if (table === "form_usages") {
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: recommendationUsage, error: null }) };
    }
    return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }), in: vi.fn().mockReturnThis() };
  });
}

beforeEach(() => {
  setupTestHarness();
  configureSupabase();
  setSearchParamsOverride(new URLSearchParams({ draft: draft.id }));
  serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_DEFAULT);
  serviceMock.getActiveRegistrationDrafts.mockResolvedValue([draft]);
  serviceMock.getRegistrationDraft.mockResolvedValue(draft);
  serviceMock.getRecommendationParentSummary.mockResolvedValue(parentSummary);
  serviceMock.uploadRegistrationDraftFiles
    .mockResolvedValueOnce([uploadRows[0]])
    .mockResolvedValueOnce([uploadRows[1]])
    .mockResolvedValueOnce([uploadRows[2]]);
  serviceMock.deleteRegistrationDraftFile.mockResolvedValue(undefined);
  serviceMock.saveRegistrationDraft.mockResolvedValue(undefined);
  allowServiceCalls(
    "getMasterData",
    "getActiveRegistrationDrafts",
    "getRegistrationDraft",
    "getRecommendationParentSummary",
    "uploadRegistrationDraftFiles",
    "deleteRegistrationDraftFile",
    "saveRegistrationDraft",
  );
});

afterEach(() => teardownTestHarness());

describe("recommendation item image input routes", () => {
  it("keeps paste, picker, and drop files bound to their own item and deletes only selected item", async () => {
    await mountFormWithUsageAndSearchParams(recommendationUsage, { draft: draft.id });
    await screen.findByRole("button", { name: /Item Paste/ });

    const pasteFile = new File(["paste-image"], "paste.png", { type: "image/png" });
    await act(async () => {
      fireEvent.paste(currentDropzone(), { clipboardData: { files: [pasteFile] } });
    });
    expect(await screen.findByText("paste.png")).toBeInTheDocument();

    await openItem("Item Picker");
    const pickerFile = new File(["picker-image"], "picker.png", { type: "image/png" });
    const pickerZone = currentDropzone();
    const pickerInput = within(pickerZone).getByLabelText("Pilih gambar item 2") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(pickerInput, { target: { files: [pickerFile] } });
    });
    expect(await screen.findByText("picker.png")).toBeInTheDocument();

    await openItem("Item Drop");
    const dropFile = new File(["drop-image"], "drop.png", { type: "image/png" });
    await act(async () => {
      fireEvent.drop(currentDropzone(), { dataTransfer: { files: [dropFile] } });
    });
    expect(await screen.findByText("drop.png")).toBeInTheDocument();

    expect(serviceMock.uploadRegistrationDraftFiles.mock.calls).toEqual([
      [draft.id, [pasteFile], { key: "recommendation_item_1", label: "Lampiran gambar rekomendasi item 1" }],
      [draft.id, [pickerFile], { key: "recommendation_item_2", label: "Lampiran gambar rekomendasi item 2" }],
      [draft.id, [dropFile], { key: "recommendation_item_3", label: "Lampiran gambar rekomendasi item 3" }],
    ]);

    await openItem("Item Paste");
    expect(screen.getByText("paste.png")).toBeInTheDocument();
    expect(screen.getByAltText("Lampiran gambar rekomendasi item 1")).toHaveAttribute("src", uploadRows[0].file_url);
    await openItem("Item Picker");
    expect(screen.getByText("picker.png")).toBeInTheDocument();
    expect(screen.getByAltText("Lampiran gambar rekomendasi item 2")).toHaveAttribute("src", uploadRows[1].file_url);
    await openItem("Item Drop");
    expect(screen.getByText("drop.png")).toBeInTheDocument();
    expect(screen.getByAltText("Lampiran gambar rekomendasi item 3")).toHaveAttribute("src", uploadRows[2].file_url);

    await waitFor(
      () => expect(serviceMock.saveRegistrationDraft).toHaveBeenCalled(),
      { timeout: 5_000 },
    );
    const savedRows = serviceMock.saveRegistrationDraft.mock.calls.at(-1)?.[1]?.formData?.form_input_data?.recommendation_items;
    expect(savedRows).toEqual([
      expect.objectContaining({ recommendation_attachment_draft_file_id: "draft-file-paste", recommendation_attachment_file_name: "paste.png", recommendation_attachment_source: "paste" }),
      expect.objectContaining({ recommendation_attachment_draft_file_id: "draft-file-picker", recommendation_attachment_file_name: "picker.png", recommendation_attachment_source: "upload" }),
      expect.objectContaining({ recommendation_attachment_draft_file_id: "draft-file-drop", recommendation_attachment_file_name: "drop.png", recommendation_attachment_source: "drop" }),
    ]);
    const rowsBeforeDelete = structuredClone(savedRows);
    const saveCountBeforeDelete = serviceMock.saveRegistrationDraft.mock.calls.length;

    await openItem("Item Picker");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Hapus lampiran gambar item 2" })));
    await waitFor(() => expect(serviceMock.deleteRegistrationDraftFile).toHaveBeenCalledWith("draft-file-picker"));
    expect(screen.queryByText("picker.png")).not.toBeInTheDocument();
    await waitFor(
      () => expect(serviceMock.saveRegistrationDraft.mock.calls.length).toBeGreaterThan(saveCountBeforeDelete),
      { timeout: 5_000 },
    );
    const rowsAfterDelete = serviceMock.saveRegistrationDraft.mock.calls.at(-1)?.[1]?.formData?.form_input_data?.recommendation_items;
    expect(rowsAfterDelete[0]).toEqual(rowsBeforeDelete[0]);
    expect(rowsAfterDelete[1]).toEqual(expect.objectContaining({
      recommendation_attachment_draft_file_id: "",
      recommendation_attachment_source: "",
    }));
    expect(rowsAfterDelete[2]).toEqual(rowsBeforeDelete[2]);

    await openItem("Item Paste");
    expect(screen.getByText("paste.png")).toBeInTheDocument();
    await openItem("Item Drop");
    expect(screen.getByText("drop.png")).toBeInTheDocument();
    expect(serviceMock.deleteRegistrationDraftFile).toHaveBeenCalledTimes(1);
    assertStrictServiceCalls();
  }, 15_000);

  it("restores each persisted attachment identity and preserves all associations on the next autosave", async () => {
    const persistedRows = uploadRows.map((file, index) => ({
      nama_barang: parentSummary.form_input_data.items[index].nama_barang,
      uraian: `Uraian ${index + 1}`,
      recommendation_attachment_draft_file_id: file.id,
      recommendation_attachment_url: file.file_url,
      recommendation_attachment_file_name: file.file_name,
      recommendation_attachment_file_type: file.file_type,
      recommendation_attachment_file_size: file.file_size,
      recommendation_attachment_source: index === 0 ? "paste" : index === 1 ? "upload" : "drop",
    }));
    const restoredDraft = {
      ...draft,
      payload: {
        ...draft.payload,
        formData: {
          ...draft.payload.formData,
          form_input_data: {
            ...draft.payload.formData.form_input_data,
            recommendation_items: persistedRows,
          },
        },
      },
      surat_registration_draft_files: uploadRows,
    };
    serviceMock.getActiveRegistrationDrafts.mockResolvedValue([restoredDraft]);
    serviceMock.getRegistrationDraft.mockResolvedValue(restoredDraft);
    serviceMock.saveRegistrationDraft.mockClear();

    await mountFormWithUsageAndSearchParams(recommendationUsage, { draft: restoredDraft.id });
    await screen.findByText(restoredDraft.no_surat, {}, { timeout: 5_000 });

    for (const [index, name] of ["Item Paste", "Item Picker", "Item Drop"].entries()) {
      await openItem(name);
      expect(screen.getByText(uploadRows[index].file_name)).toBeInTheDocument();
      expect(screen.getByAltText(`Lampiran gambar rekomendasi item ${index + 1}`)).toHaveAttribute("src", uploadRows[index].file_url);
    }

    await openItem("Item Paste");
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/Pembelian baru.*service adaptor/i), {
        target: { value: "Uraian item A setelah reopen" },
      });
    });
    await waitFor(() => expect(serviceMock.saveRegistrationDraft).toHaveBeenCalled(), { timeout: 5_000 });
    const savedRows = serviceMock.saveRegistrationDraft.mock.calls.at(-1)?.[1]?.formData?.form_input_data?.recommendation_items;
    expect(savedRows.map((row: Record<string, unknown>) => ({
      id: row.recommendation_attachment_draft_file_id,
      source: row.recommendation_attachment_source,
      name: row.recommendation_attachment_file_name,
    }))).toEqual([
      { id: "draft-file-paste", source: "paste", name: "paste.png" },
      { id: "draft-file-picker", source: "upload", name: "picker.png" },
      { id: "draft-file-drop", source: "drop", name: "drop.png" },
    ]);
    assertStrictServiceCalls();
  }, 15_000);
});
