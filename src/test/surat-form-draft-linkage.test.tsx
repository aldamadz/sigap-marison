/** Draft linkage: usage id + penanda tangan tidak boleh rusak oleh efek internal maupun autosave. */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import {
  setupTestHarness,
  teardownTestHarness,
  serviceMock,
  allowServiceCalls,
  assertStrictServiceCalls,
} from "./surat-form-harness";
import {
  MASTER_DATA_DEFAULT,
  FORM_USAGES_RAW_WITH_DRAFT,
  buildDraftForRestore,
  UUID,
} from "./surat-form-fixtures";
import {
  configureStandardMocks,
  mountFormWithUsageAndSearchParams,
  editFieldAndWaitForAutosave,
} from "./surat-form-driver";

/* eslint-disable @typescript-eslint/no-explicit-any */
function draftWithPayloadMutation(mutate: (payload: any) => any) {
  const base = buildDraftForRestore();
  return { ...base, payload: mutate({ ...(base.payload as Record<string, unknown>) }) };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

beforeEach(() => {
  setupTestHarness();
  configureStandardMocks();
  serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_DEFAULT);
  allowServiceCalls(
    "getMasterData",
    "getActiveRegistrationDrafts",
    "getRegistrationDraft",
    "saveRegistrationDraft",
  );
});

afterEach(() => teardownTestHarness());

describe("draft linkage protection", () => {
  it("mismatch kategori workflow setelah nomor terdaftar tidak menghapus usage & penanda tangan", async () => {
    // Admin mengubah kategori workflow usage antara dua sesi:
    // draft bernomor masih asset, tapi usage kini hanya melayani non_asset.
    serviceMock.getRegistrationDraft.mockResolvedValue(draftWithPayloadMutation((payload) => ({
      ...payload,
      formData: {
        ...(payload as any).formData,
        form_input_data: {
          ...(payload as any).formData.form_input_data,
          request_category: "non_asset",
        },
      },
    })));

    await mountFormWithUsageAndSearchParams(FORM_USAGES_RAW_WITH_DRAFT, { draft: UUID.draft });

    expect(await screen.findByText("001/FA/MKT/VIII/2026")).toBeInTheDocument();
    expect(await screen.findByText("Pemohon Staging")).toBeInTheDocument();

    const perihal = screen.getByPlaceholderText(/Contoh.*Permohonan/i);
    serviceMock.saveRegistrationDraft.mockClear();
    await editFieldAndWaitForAutosave(perihal, "Judul Tetap");

    expect(serviceMock.saveRegistrationDraft).toHaveBeenCalledTimes(1);
    expect(serviceMock.saveRegistrationDraft).toHaveBeenCalledWith(
      UUID.draft,
      expect.objectContaining({ selectedUsageId: UUID.form_usage }),
      expect.arrayContaining([
        expect.objectContaining({ form_usage_step_id: UUID.step1, user_id: UUID.user }),
      ]),
      "details",
    );
    assertStrictServiceCalls();
  });

  it("autosave menolak menimpa payload yang sudah kehilangan tautan usage", async () => {
    // Kondisi baris DB nyata: selectedUsageId/form_usage_id/penggunaan_id kosong.
    const base = buildDraftForRestore();
    serviceMock.getRegistrationDraft.mockResolvedValue({
      ...base,
      signer_assignments: [],
      payload: {
        ...(base.payload as Record<string, unknown>),
        formData: {
          ...((base.payload as any).formData),
          penggunaan_id: "",
          form_usage_id: "",
        },
        selectedUsageId: "",
      },
    });

    await mountFormWithUsageAndSearchParams(FORM_USAGES_RAW_WITH_DRAFT, { draft: UUID.draft });

    expect(await screen.findByText("001/FA/MKT/VIII/2026")).toBeInTheDocument();
    // Field perihal tetap dirender dan bisa diedit meski tautan usage hilang.
    const perihal = screen.getByPlaceholderText(/Contoh.*Permohonan/i);
    await editFieldAndWaitForAutosave(perihal, "Perubahan Lokal");

    expect(serviceMock.saveRegistrationDraft).not.toHaveBeenCalled();
    assertStrictServiceCalls();
  });

  it("restore normal tetap autosave dan menyimpan selectedUsageId", async () => {
    serviceMock.getRegistrationDraft.mockResolvedValue(buildDraftForRestore());

    await mountFormWithUsageAndSearchParams(FORM_USAGES_RAW_WITH_DRAFT, { draft: UUID.draft });

    expect(await screen.findByText("001/FA/MKT/VIII/2026")).toBeInTheDocument();

    const perihal = screen.getByPlaceholderText(/Contoh.*Permohonan/i);
    serviceMock.saveRegistrationDraft.mockClear();
    await editFieldAndWaitForAutosave(perihal, "Judul Normal");

    expect(serviceMock.saveRegistrationDraft).toHaveBeenCalledWith(
      UUID.draft,
      expect.objectContaining({ selectedUsageId: UUID.form_usage }),
      expect.any(Array),
      "details",
    );
    assertStrictServiceCalls();
  });
});
