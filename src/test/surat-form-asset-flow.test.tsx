/**
 * Flow 1: Aset Tanpa Rekomendasi
 *
 * Characterization test — captures current behavior before refactor.
 * All service calls are mocked. No network, no Supabase staging.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, within } from "@testing-library/react";
import {
  setupTestHarness,
  teardownTestHarness,
  serviceMock,
  allowServiceCalls,
  assertStrictServiceCalls,
  toastMock,
  onSuccessMock,
} from "./surat-form-harness";
import { UUID } from "./surat-form-fixtures";
import {
  configureStandardMocks,
  mountForm,
  selectLetterType,
  selectEntity,
  selectCategoryAset,
  selectFormAndUsage,
  clickGetNumber,
  fillNamaBarang,
  selectAllSigners,
  clickConfirmRegistration,
  submitFromDialog,
  navigateToNumberReady,
  navigateToNumberGenerated,
  navigateToReadyToSubmit,
  goToWizardStep,
  selectForm,
  selectUsage,
  selectCategory,
  selectCategoryUnit,
  selectCategoryNonUnit
} from "./surat-form-driver";

beforeEach(() => {
  setupTestHarness();
  configureStandardMocks();
  allowServiceCalls(
    "getMasterData",
    "getActiveRegistrationDrafts",
    "generateNoSurat",
    "createRegistrationDraft",
    "createRegistrasi",
    "finishRegistrationDraft",
    "saveRegistrationDraft",
  );
});

afterEach(() => {
  teardownTestHarness();
});

describe("Flow 1: Aset Tanpa Rekomendasi", () => {
  it("renders Form selector on mount without location or usage", async () => {
    await mountForm();
    expect(screen.getAllByText(/Form & Lokasi/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Pilih Formulir")).toBeInTheDocument();
    // Progressive disclosure: Kegunaan + lokasi belum tampil sebelum Form dipilih.
    expect(screen.queryByText("Kegunaan")).not.toBeInTheDocument();
    expect(screen.queryByText(/Kantor Penerbit/i)).not.toBeInTheDocument();
    // Tidak ada tombol klasifikasi manual.
    expect(screen.queryByText("Pengajuan Aset")).not.toBeInTheDocument();
    expect(screen.queryByText("Pengajuan SPK")).not.toBeInTheDocument();
    expect(screen.queryByText("Pengajuan Dana")).not.toBeInTheDocument();
    expect(screen.queryByText("Pengajuan Non Unit")).not.toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("shows usage selector after selecting form, still without location", async () => {
    await mountForm();
    await selectForm();
    expect(screen.getByText("Kegunaan")).toBeInTheDocument();
    expect(screen.queryByText(/Kantor Penerbit/i)).not.toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("shows location/context after selecting usage", async () => {
    await mountForm();
    await selectFormAndUsage();
    expect(screen.getByText("Pilih Formulir")).toBeInTheDocument();
    expect(screen.getByText("Kegunaan")).toBeInTheDocument();
    expect(screen.getByText(/Kantor Penerbit/i)).toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("calls generateNoSurat and createRegistrationDraft on get number", async () => {
    await navigateToNumberReady();
    await clickGetNumber();

    expect(serviceMock.generateNoSurat).toHaveBeenCalledTimes(1);
    expect(serviceMock.createRegistrationDraft).toHaveBeenCalledTimes(1);

    const generateArg = serviceMock.generateNoSurat.mock.calls[0][0];
    expect(generateArg.office_id).toBe(UUID.office_pusat);
    expect(generateArg.dept_id).toBe(UUID.dept_pbo);
    expect(generateArg.form_input_data.request_category).toBe("asset");

    const draftArg = serviceMock.createRegistrationDraft.mock.calls[0][0];
    expect(draftArg.noUrut).toBe(1);
    expect(draftArg.noSurat).toBe("001/FA/MKT/VIII/2026");
    expect(draftArg.payload.selectedFormId).toBe(UUID.form_a);
    expect(draftArg.payload.selectedUsageId).toBe(UUID.form_usage);

    assertStrictServiceCalls();
  });

  it("shows registered number and toast after get number", async () => {
    await navigateToNumberReady();
    await clickGetNumber();

    expect(screen.getByText("001/FA/MKT/VIII/2026")).toBeInTheDocument();
    expect(screen.getAllByText("Persetujuan & Berkas").length).toBeGreaterThanOrEqual(1);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Nomor Berhasil Didapatkan" })
    );
    assertStrictServiceCalls();
  });

  it("shows sections 2 and 3 after number generation", async () => {
    await navigateToNumberReady();
    await clickGetNumber();

    expect(screen.getAllByText(/Persetujuan & Berkas/i).length).toBeGreaterThanOrEqual(1);

    await goToWizardStep(3);

    expect(screen.getByText(/Pejabat Penandatangan/i)).toBeInTheDocument();
    expect(screen.getByText("Pemohon")).toBeInTheDocument();
    expect(screen.getByText("Direktur")).toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("full happy path: get number → fill → signer → submit", async () => {
    await navigateToReadyToSubmit();

    // Click Konfirmasi Pendaftaran → dialog opens
    await clickConfirmRegistration();

    // Submit from dialog
    await submitFromDialog();

    // Verify createRegistrasi was called
    expect(serviceMock.createRegistrasi).toHaveBeenCalledTimes(1);
    const submitArg = serviceMock.createRegistrasi.mock.calls[0][0];
    expect(submitArg.no_surat).toBe("001/FA/MKT/VIII/2026");
    expect(submitArg.form_input_data.nama_barang).toBe("Printer Epson");
    expect(submitArg.form_input_data.request_category).toBe("asset");

    // Verify finishRegistrationDraft
    expect(serviceMock.finishRegistrationDraft).toHaveBeenCalledWith(
      UUID.draft,
      "SUBMITTED"
    );

    // Verify success
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Pendaftaran Berhasil" })
    );
    expect(onSuccessMock).toHaveBeenCalledWith(
      "001/FA/MKT/VIII/2026",
      expect.any(String)
    );

    assertStrictServiceCalls();
  });
});
