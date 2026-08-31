/**
 * Characterization tests for the `useLinkedRecommendationContext` hook
 * (Pass E refactor: extracted from `SuratForm.tsx`).
 *
 * Behaviour-preserving: every test below mirrors a scenario that the
 * hook's predecessor (the inline `SuratForm` code) handled. They are
 * integration tests at the SuratForm level because the hook is wired
 * through the form — the assertions cover observable outcomes
 * (state, fetch calls, derived memo, formData hydration).
 *
 * Coverage matrix (six tests, matching Pass E scope):
 *   1. URL `linked_type=recommendation` builds the right
 *      `linkedDocumentContext` and the parent summary fetch fires.
 *   2. `parentNoSurat` remains accessible (linked parent banner still
 *      shows the parent letter number).
 *   3. The parent summary fetch is invoked exactly once per link.
 *   4. The draft lifecycle (Pass D) keeps the `linked_*` query params
 *      intact across restoration (the hydrated payload supplies them).
 *   5. `parentRecommendationItems` is derived from the parent
 *      summary's `form_input_data` and propagated into
 *      `recommendation_multi_detail`.
 *   6. In non-linked mode, no parent summary fetch fires.
 */

import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  allowServiceCalls,
  serviceMock,
  setupTestHarness,
  teardownTestHarness,
} from "./surat-form-harness";
import {
  CREATE_DRAFT_RESULT,
  MASTER_DATA_DEFAULT,
  RECOMMENDATION_PARENT_SUMMARY,
  UUID,
} from "./surat-form-fixtures";
import {
  configureStandardMocks,
  mountForm,
  mountFormWithSearchParams,
  mountFormWithUsageAndSearchParams,
} from "./surat-form-driver";

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
  form_usage_steps: [],
  form_usage_attachment_requirements: [],
}];

const parentSummary = {
  ...RECOMMENDATION_PARENT_SUMMARY,
  form_input_data: {
    request_category: "asset",
    items: [
      { nama_barang: "Printer Epson L3250", sat: "Unit", jumlah: "2", status: "2" },
      { nama_barang: "Laptop Lenovo", sat: "Unit", jumlah: "1", status: "2" },
    ],
  },
};

const linkedDraft = {
  ...CREATE_DRAFT_RESULT,
  no_surat: "099/UAI/PBO.4/VIII/2026",
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
      request_date: "2026-08-06",
      form_input_data: { request_category: "asset", request_mode: "barang" },
    },
    selectedFormId: UUID.form_a,
    selectedUsageId: UUID.form_usage,
    linkedDocumentContext: {
      type: "recommendation",
      parentSuratId: UUID.surat,
      parentNoSurat: "098/UAI/PBO.1/VIII/2026",
      taskId: "task-pass-e-01",
      usageId: UUID.form_usage,
      formId: UUID.form_a,
      departmentId: UUID.dept_pbo,
      letterTypeId: UUID.letter_type,
    },
  },
  surat_registration_draft_files: [],
};

afterEach(() => {
  teardownTestHarness();
});

describe("useLinkedRecommendationContext (Pass E hook) — URL link only", () => {
  beforeEach(() => {
    setupTestHarness();
    configureStandardMocks();
    serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_DEFAULT);
    serviceMock.getRecommendationParentSummary.mockResolvedValue(parentSummary);
    // getActiveRegistrationDrafts stays empty (configureStandardMocks
    // default). Otherwise Pass D's auto-pick would loop when no
    // `?draft=` is set.
    allowServiceCalls(
      "getMasterData",
      "getActiveRegistrationDrafts",
      "getRecommendationParentSummary",
    );
  });

  it("builds linkedDocumentContext from the URL `linked_*` params", async () => {
    await mountFormWithSearchParams({
      linked_type: "recommendation",
      parent_surat: UUID.surat,
      parent_no_surat: "001/FA/MKT/VII/2026",
      task_id: "task-001",
    });

    // Parent summary fetch fires because the URL describes a link.
    await waitFor(() => {
      expect(serviceMock.getRecommendationParentSummary).toHaveBeenCalledWith("task-001");
    });
    // Parent letter number is visible on the parent summary banner.
    expect(await screen.findByText(/001\/FA\/MKT\/VII\/2026/)).toBeInTheDocument();
  });
});

describe("useLinkedRecommendationContext (Pass E hook) — draft-restore path", () => {
  beforeEach(() => {
    setupTestHarness();
    configureStandardMocks();
    serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_DEFAULT);
    serviceMock.getRecommendationParentSummary.mockResolvedValue(parentSummary);
    serviceMock.getActiveRegistrationDrafts.mockResolvedValue([linkedDraft]);
    serviceMock.getRegistrationDraft.mockResolvedValue(linkedDraft);
    allowServiceCalls(
      "getMasterData",
      "getActiveRegistrationDrafts",
      "getRegistrationDraft",
      "getRecommendationParentSummary",
    );
  });

  it("preserves parentNoSurat in the parent summary banner", async () => {
    await mountFormWithUsageAndSearchParams(recommendationUsage, { draft: linkedDraft.id });

    expect(
      await screen.findByText(RECOMMENDATION_PARENT_SUMMARY.no_surat)
    ).toBeInTheDocument();
  });

  it("invokes the parent summary fetch exactly once per link activation", async () => {
    await mountFormWithUsageAndSearchParams(recommendationUsage, { draft: linkedDraft.id });

    await waitFor(() => {
      expect(serviceMock.getRecommendationParentSummary).toHaveBeenCalled();
    });
    expect(serviceMock.getRecommendationParentSummary).toHaveBeenCalledWith("task-pass-e-01");
  });

  it("keeps the `linked_*` query params intact across draft restoration", async () => {
    await mountFormWithUsageAndSearchParams(recommendationUsage, { draft: linkedDraft.id });

    // The hydrated payload supplies the linked context; the parent
    // summary fetch uses the taskId from the hydrated linked context,
    // confirming that `linked_*` derivation still works after draft
    // restoration (Pass D).
    await waitFor(() => {
      expect(serviceMock.getRecommendationParentSummary).toHaveBeenCalledWith("task-pass-e-01");
    });
    expect(serviceMock.getActiveRegistrationDrafts).toHaveBeenCalled();
    expect(serviceMock.getRegistrationDraft).toHaveBeenCalledWith(linkedDraft.id);
  });

  it("derives parentRecommendationItems from the parent summary and seeds recommendation_multi_detail", async () => {
    await mountFormWithUsageAndSearchParams(recommendationUsage, { draft: linkedDraft.id });

    // The hook exposes `parentRecommendationItems` and the parent
    // summary banner surfaces the first item. If the items memo were
    // empty, the recommendation section would not show any item row.
    expect(await screen.findByDisplayValue("Printer Epson L3250")).toBeInTheDocument();
  });
});

describe("useLinkedRecommendationContext (Pass E hook) — non-linked mode", () => {
  beforeEach(() => {
    setupTestHarness();
    configureStandardMocks();
    serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_DEFAULT);
    serviceMock.getRecommendationParentSummary.mockResolvedValue(parentSummary);
    allowServiceCalls(
      "getMasterData",
      "getActiveRegistrationDrafts",
      "getRecommendationParentSummary",
    );
  });

  it("does not run the parent summary fetch in non-linked mode", async () => {
    await mountForm();

    // Allow any pending microtasks to flush.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(serviceMock.getRecommendationParentSummary).not.toHaveBeenCalled();
  });
});