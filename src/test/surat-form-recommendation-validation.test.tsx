import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  allowServiceCalls,
  serviceMock,
  setupTestHarness,
  teardownTestHarness,
  toastMock,
} from "./surat-form-harness";
import {
  CREATE_DRAFT_RESULT,
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
  },
  form_usage_departments: [{ department_id: UUID.dept_pbo }],
  form_usage_steps: [{
    id: UUID.step1,
    step_order: 1,
    role_name: "membuat",
    label: "Pemohon",
    action_type: "approval",
    candidate_scope: "manual",
    signer_department_id: null,
    form_usage_step_users: [{ user_id: UUID.user }],
    form_usage_step_verifiers: [],
  }],
  form_usage_attachment_requirements: [],
}];

const parentSummary = {
  ...RECOMMENDATION_PARENT_SUMMARY,
  form_input_data: {
    request_category: "asset",
    items: [
      { id: "applicant-printer", nama_barang: "Printer", jumlah: 1 },
      { id: "applicant-laptop", nama_barang: "Laptop", jumlah: 1 },
    ],
  },
};

const draft = {
  ...CREATE_DRAFT_RESULT,
  payload: {
    formData: {
      entity_id: UUID.entity,
      dept_id: UUID.dept_pbo,
      letter_type_id: UUID.letter_type,
      office_id: UUID.office_pusat,
      project_id: "",
      judul_surat: "Rekomendasi Aset",
      penggunaan_id: "",
      is_aset: true,
      form_usage_id: UUID.form_usage,
      request_place: "Magelang",
      request_date: "2026-08-14",
      form_input_data: {
        request_category: "asset",
        recommendation_multi_detail: {
          version: 1,
          items: [
            {
              id: "applicant-printer",
              order: 0,
              status: "not_recommended",
              rejection_reason: "Biaya perbaikan tidak ekonomis",
              applicant_original: { name: "Printer", quantity: 1, notes: "" },
              location: "Marketing",
              pic: "Pemohon Staging",
              details: [],
            },
            {
              id: "applicant-laptop",
              order: 1,
              status: "recommended",
              rejection_reason: "",
              applicant_original: { name: "Laptop", quantity: 1, notes: "" },
              location: "Marketing",
              pic: "Pemohon Staging",
              details: [{
                id: "detail-laptop",
                order: 0,
                action: "purchase_new",
                name: "Laptop",
                quantity: 1,
                description: "Pembelian baru",
                description_manually_edited: false,
                notes: "Untuk staf baru",
                attachments: [],
                reference_links: [],
              }],
            },
          ],
        },
      },
    },
    selectedFormId: UUID.form_a,
    selectedUsageId: UUID.form_usage,
    linkedDocumentContext: {
      type: "recommendation",
      parentSuratId: UUID.surat,
      parentNoSurat: parentSummary.no_surat,
      taskId: parentSummary.task_id,
      usageId: UUID.form_usage,
      formId: UUID.form_a,
      departmentId: UUID.dept_pbo,
      letterTypeId: UUID.letter_type,
    },
  },
  signer_assignments: [{
    step_order: 1,
    form_usage_step_id: UUID.step1,
    user_id: UUID.user,
    label_jabatan: "Pemohon",
    role_name: "membuat",
  }],
  surat_registration_draft_files: [],
};

beforeEach(() => {
  setupTestHarness();
  serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_DEFAULT);
  serviceMock.getActiveRegistrationDrafts.mockResolvedValue([draft]);
  serviceMock.getRegistrationDraft.mockResolvedValue(draft);
  serviceMock.getRecommendationParentSummary.mockResolvedValue(parentSummary);
  serviceMock.saveRegistrationDraft.mockResolvedValue(undefined);
  allowServiceCalls(
    "getMasterData",
    "getActiveRegistrationDrafts",
    "getRegistrationDraft",
    "getRecommendationParentSummary",
    "saveRegistrationDraft",
  );
});

afterEach(() => teardownTestHarness());

describe("recommendation registration validation feedback", () => {
  it("identifies the incomplete recommended item and detail", async () => {
    await mountFormWithUsageAndSearchParams(recommendationUsage, { draft: draft.id });
    await screen.findByText(draft.no_surat);

    const submitButton = await screen.findByRole(
      "button",
      { name: "Konfirmasi Pendaftaran" },
      { timeout: 5_000 },
    );
    await act(async () => fireEvent.click(submitButton));

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith({
      variant: "destructive",
      title: "Daftar Rekomendasi Belum Lengkap",
      description: "Item 2.1: lampiran gambar wajib ditambahkan.",
    }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  }, 15_000);
});
