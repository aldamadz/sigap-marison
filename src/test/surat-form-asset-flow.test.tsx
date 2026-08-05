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
  it("renders location section on mount", async () => {
    await mountForm();
    expect(screen.getByText(/Lokasi dan Klasifikasi/i)).toBeInTheDocument();
    expect(screen.getByText(/Kantor Penerbit/i)).toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("shows category buttons after selecting letter type", async () => {
    await mountForm();
    await selectLetterType();
    expect(screen.getByText("Aset")).toBeInTheDocument();
    expect(screen.getByText("Unit")).toBeInTheDocument();
    expect(screen.getByText("Non Unit")).toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("shows form/usage selectors after clicking Aset", async () => {
    await mountForm();
    await selectLetterType();
    await selectCategoryAset();
    expect(screen.getByText("Form Dokumen")).toBeInTheDocument();
    expect(screen.getByText("Kegunaan")).toBeInTheDocument();
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
    expect(screen.getByText(/Nomor Terdaftar/i)).toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Nomor Berhasil Didapatkan" })
    );
    assertStrictServiceCalls();
  });

  it("shows sections 2 and 3 after number generation", async () => {
    await navigateToNumberReady();
    await clickGetNumber();

    expect(screen.getByText(/Persetujuan dan Berkas/i)).toBeInTheDocument();
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
