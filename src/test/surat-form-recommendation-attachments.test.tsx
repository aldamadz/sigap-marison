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
  { id: "draft-file-paste", file_url: "https://files.example/paste.png", file_name: "paste.png", file_type: "image/png", file_size: 11, requirement_key: "recommendation_item_1" },
  { id: "draft-file-picker", file_url: "https://files.example/picker.png", file_name: "picker.png", file_type: "image/png", file_size: 12, requirement_key: "recommendation_item_2" },
  { id: "draft-file-drop", file_url: "https://files.example/drop.png", file_name: "drop.png", file_type: "image/png", file_size: 13, requirement_key: "recommendation_item_3" },
];

async function openItem(name: string) {
  await act(async () => fireEvent.click(await screen.findByRole("button", { name: new RegExp(name) })));
}

function currentDropzone() {
  return screen.getByRole("button", { name: /Tempel screenshot atau unggah gambar/i });
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
    const pickerInput = within(pickerZone).getByLabelText("Pilih Gambar") as HTMLInputElement;
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

    await openItem("Item Picker");
    const pickerPreview = screen.getByAltText("Lampiran gambar rekomendasi item 2").closest("div")?.parentElement;
    expect(pickerPreview).toBeTruthy();
    await act(async () => fireEvent.click(within(pickerPreview as HTMLElement).getByRole("button")));
    await waitFor(() => expect(serviceMock.deleteRegistrationDraftFile).toHaveBeenCalledWith("draft-file-picker"));
    expect(screen.queryByText("picker.png")).not.toBeInTheDocument();

    await openItem("Item Paste");
    expect(screen.getByText("paste.png")).toBeInTheDocument();
    await openItem("Item Drop");
    expect(screen.getByText("drop.png")).toBeInTheDocument();
    expect(serviceMock.deleteRegistrationDraftFile).toHaveBeenCalledTimes(1);
    assertStrictServiceCalls();
  }, 15_000);
});
