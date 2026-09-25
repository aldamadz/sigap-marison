import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SuratForm } from "@/components/surat/SuratForm";
import {
  allowServiceCalls,
  assertStrictServiceCalls,
  defaultProps,
  registerFetchRoute,
  serviceMock,
  setSearchParamsOverride,
  setupTestHarness,
  teardownTestHarness,
  toastMock,
} from "./surat-form-harness";
import {
  configureStandardMocks,
  clickGetNumber,
  findSelectTrigger,
  goToWizardStep,
  mountFormWithUsage,
  selectEntity,
  selectFormAndUsage,
  selectLetterType,
} from "./surat-form-driver";
import {
  FORM_USAGES_RAW,
  CURRENT_PROFILE_DEFAULT,
  MASTER_DATA_WITH_PROJECTS,
  UNIT_FORM_USAGE_RAW,
  UUID,
  UUID_UNIT,
} from "./surat-form-fixtures";

const REVISION_EVENT_ID = "963b7fab-d4f7-4251-aeb2-5e56a32a66ee";

const unitRevisionDraft = {
  id: UUID.draft,
  revision_event_id: REVISION_EVENT_ID,
  reservation_id: UUID.reservation,
  no_surat: "003/UAI/MKT.1.TEST-02/IX/2026",
  no_urut: 3,
  status: "DRAFT",
  created_by: UUID.user,
  expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  payload: {
    formData: {
      entity_id: UUID.entity,
      dept_id: UUID.dept_pbo as string,
      letter_type_id: UUID.letter_type,
      office_id: UUID.office_pusat,
      project_id: "",
      judul_surat: "Permohonan Order Bangun SPK Pembangunan Rumah 2 Unit",
      penggunaan_id: UUID_UNIT.form_usage,
      form_usage_id: UUID_UNIT.form_usage,
      request_place: "Magelang",
      request_date: "2026-09-22",
      is_aset: false,
      form_input_data: {
        request_category: "unit",
        request_mode: "unit",
        requested_project: {
          value: "19",
          label: "GA01 - Griya Asri",
          id: "proj-001",
          code: "GA01",
          name: "Griya Asri",
          branch: { name: "KC. Semarang" },
        },
        requested_unit_count: 2,
      },
    },
    selectedFormId: UUID_UNIT.form_a,
    selectedUsageId: UUID_UNIT.form_usage,
    linkedDocumentContext: null,
    externalRevision: {
      eventId: REVISION_EVENT_ID,
      generation: 2,
      category: "unit",
      reason: "Jumlah unit dan proyek perlu disesuaikan.",
    },
  },
  signer_assignments: [
    {
      step_order: 1,
      form_usage_step_id: UUID_UNIT.step1,
      user_id: UUID.user,
      label_jabatan: "Pemohon",
      role_name: "membuat",
    },
  ],
  surat_registration_draft_files: [],
};

function registerUnitSources() {
  registerFetchRoute("/api/data-sources/marison_projects/query", {
    options: [
      {
        value: "19",
        label: "GA01 - Griya Asri",
        raw: {
          id: "proj-001",
          code: "GA01",
          name: "Griya Asri",
          branch: { name: "KC. Semarang" },
        },
      },
      {
        value: "20",
        label: "GA02 - Griya Baru",
        raw: {
          id: "proj-002",
          code: "GA02",
          name: "Griya Baru",
          branch: { name: "KC. Solo" },
        },
      },
    ],
  });
  registerFetchRoute("/api/data-sources/marison_units_by_project/query", {
    options: [
      { value: "unit-1", label: "A-01" },
      { value: "unit-2", label: "A-02" },
      { value: "unit-3", label: "A-03" },
    ],
  });
}

async function mountUnitRevisionDraft(
  activeUsageData: unknown[] = UNIT_FORM_USAGE_RAW,
  draft: Omit<typeof unitRevisionDraft, "payload"> & {
    payload: Omit<typeof unitRevisionDraft.payload, "externalRevision"> & {
      externalRevision?: typeof unitRevisionDraft.payload.externalRevision;
    };
    revision_context?: { eventId: string; generation?: number; reason?: string };
    usage_configuration?: Omit<(typeof UNIT_FORM_USAGE_RAW)[number], "form_usage_departments"> & {
      form_usage_departments: Array<{ department_id: string }>;
    };
  } = unitRevisionDraft,
  profile = CURRENT_PROFILE_DEFAULT,
) {
  setSearchParamsOverride(
    new URLSearchParams(`?draft=${UUID.draft}&revision=${REVISION_EVENT_ID}`),
  );
  serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_WITH_PROJECTS);
  serviceMock.getActiveRegistrationDrafts.mockResolvedValue([]);
  serviceMock.getRegistrationDraft.mockResolvedValue(draft);
  registerUnitSources();
  allowServiceCalls(
    "getMasterData",
    "getActiveRegistrationDrafts",
    "getRegistrationDraft",
    "saveRegistrationDraft",
  );

  await mountFormWithUsage(activeUsageData, profile);
  await screen.findByText("Perbaiki Proyek dan Jumlah Unit");
}

beforeEach(() => {
  setupTestHarness();
  configureStandardMocks();
});

afterEach(() => teardownTestHarness());

describe("SPK Unit requester revision", () => {
  it("restores its archived usage configuration without exposing it as an active option", async () => {
    const archivedUsage = {
      ...UNIT_FORM_USAGE_RAW[0],
      name: "[UJI STAGING] Pengajuan SPK Unit",
      status: "archived",
    };

    await mountUnitRevisionDraft(
      FORM_USAGES_RAW,
      { ...unitRevisionDraft, usage_configuration: archivedUsage },
    );

    expect(screen.getByText("[UJI STAGING] Pengajuan SPK Unit")).toBeInTheDocument();
    expect(screen.getByText("FORM PERMOHONAN UNIT")).toBeInTheDocument();
    await waitFor(() => expect(findSelectTrigger(/^Proyek$/i)).not.toBeDisabled());
    expect(screen.getByLabelText("Jumlah Unit Diajukan")).toHaveValue(2);
    expect(screen.queryByText("\\n")).not.toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("opens the returned draft on its editable unit context", async () => {
    await mountUnitRevisionDraft();

    expect(screen.getByText("Jumlah unit dan proyek perlu disesuaikan.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Catatan perbaikan pemohon (opsional)")).not.toBeInTheDocument();

    const project = findSelectTrigger(/^Proyek$/i);
    const count = screen.getByLabelText("Jumlah Unit Diajukan");
    await waitFor(() => expect(project).not.toBeDisabled());
    expect(count).not.toBeDisabled();
    expect(count).toHaveValue(2);
    assertStrictServiceCalls();
  });

  it("recovers edit mode when autosave removed revision metadata from the payload", async () => {
    const payloadWithoutRevision = { ...unitRevisionDraft.payload, externalRevision: undefined };
    await mountUnitRevisionDraft(UNIT_FORM_USAGE_RAW, {
      ...unitRevisionDraft,
      payload: payloadWithoutRevision,
      revision_context: {
        eventId: REVISION_EVENT_ID,
        generation: 2,
        reason: "Jumlah unit dan proyek perlu disesuaikan.",
      },
    });

    expect(screen.getByText("Jumlah unit dan proyek perlu disesuaikan.")).toBeInTheDocument();
    await waitFor(() => expect(findSelectTrigger(/^Proyek$/i)).not.toBeDisabled());
    expect(screen.getByLabelText("Jumlah Unit Diajukan")).not.toBeDisabled();
    await waitFor(() => expect(serviceMock.saveRegistrationDraft).toHaveBeenCalledWith(
      UUID.draft,
      expect.objectContaining({ externalRevision: expect.objectContaining({ eventId: REVISION_EVENT_ID }) }),
      expect.any(Array),
      expect.any(String),
    ), { timeout: 2000 });
    assertStrictServiceCalls();
  });

  it("keeps the original Marketing department valid for an admin revising its historical Unit letter", async () => {
    const archivedUsage = {
      ...UNIT_FORM_USAGE_RAW[0],
      status: "archived",
      form_usage_departments: [{ department_id: UUID.dept_sales }],
    };
    await mountUnitRevisionDraft(
      FORM_USAGES_RAW,
      {
        ...unitRevisionDraft,
        payload: {
          ...unitRevisionDraft.payload,
          formData: { ...unitRevisionDraft.payload.formData, dept_id: UUID.dept_sales },
        },
        usage_configuration: archivedUsage,
      },
      { ...CURRENT_PROFILE_DEFAULT, role: "admin" },
    );

    expect(screen.queryByRole("button", { name: /Ubah Identitas/i })).not.toBeInTheDocument();
    await waitFor(() => expect(findSelectTrigger(/^Proyek$/i)).not.toBeDisabled());
    expect(screen.getByLabelText("Jumlah Unit Diajukan")).not.toBeDisabled();
    await goToWizardStep(3);
    const review = screen.getByRole("button", { name: "Tinjau dan Kirim Perbaikan" });
    await waitFor(() => expect(review).not.toBeDisabled());
    fireEvent.click(review);
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Mode Unit Tidak Diizinkan" }));
    assertStrictServiceCalls();
  });

  it("allows changing both project and count, then persists the revised values", async () => {
    await mountUnitRevisionDraft();

    const project = findSelectTrigger(/^Proyek$/i);
    await waitFor(() => expect(project).not.toBeDisabled());
    await act(async () => { fireEvent.click(project); });
    await act(async () => { fireEvent.click(await screen.findByText(/GA02 - Griya Baru/)); });

    const count = screen.getByLabelText("Jumlah Unit Diajukan");
    fireEvent.change(count, { target: { value: "3" } });

    await waitFor(() => {
      expect(serviceMock.saveRegistrationDraft).toHaveBeenCalledWith(
        UUID.draft,
        expect.objectContaining({
          formData: expect.objectContaining({
            form_input_data: expect.objectContaining({
              requested_project: expect.objectContaining({ code: "GA02", name: "Griya Baru" }),
              requested_unit_count: 3,
            }),
          }),
        }),
        expect.any(Array),
        expect.any(String),
      );
    }, { timeout: 2000 });
    assertStrictServiceCalls();
  });

  it("keeps project and count locked for an ordinary numbered draft", async () => {
    serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_WITH_PROJECTS);
    registerUnitSources();
    allowServiceCalls("getMasterData", "getActiveRegistrationDrafts", "generateNoSurat", "createRegistrationDraft");

    await mountFormWithUsage(UNIT_FORM_USAGE_RAW);
    await selectFormAndUsage(/Unit/i);
    await selectLetterType();
    await selectEntity();
    const project = findSelectTrigger(/^Proyek$/i);
    await waitFor(() => expect(project).not.toBeDisabled());
    await act(async () => { fireEvent.click(project); });
    await act(async () => { fireEvent.click(await screen.findByText(/GA01 - Griya Asri/)); });
    fireEvent.change(screen.getByLabelText("Jumlah Unit Diajukan"), { target: { value: "2" } });
    await clickGetNumber();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Form & Lokasi/i }));
    });

    expect(screen.queryByText("Perbaiki Proyek dan Jumlah Unit")).not.toBeInTheDocument();
    expect(findSelectTrigger(/^Proyek$/i)).toBeDisabled();
    expect(screen.getByLabelText("Jumlah Unit Diajukan")).toBeDisabled();
    assertStrictServiceCalls();
  });
});
