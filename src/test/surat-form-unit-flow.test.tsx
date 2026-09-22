/** Flow 3: Unit pusat memilih proyek dan jumlah unit sebelum nomor dibuat. */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import {
  setupTestHarness,
  teardownTestHarness,
  serviceMock,
  allowServiceCalls,
  assertStrictServiceCalls,
  registerFetchRoute,
  createDeferred,
  toastMock,
} from "./surat-form-harness";
import { FORM_USAGES_RAW, MASTER_DATA_WITH_PROJECTS, UNIT_FORM_USAGE_RAW } from "./surat-form-fixtures";
import {
  configureStandardMocks,
  selectLetterType,
  selectEntity,
  selectCategory,
  registerExternalDataRoutes,
  mountFormWithUsage,
  selectOptionByLabel,
  clickGetNumber,
  selectForm,
  selectUsage,
  selectFormAndUsage,
  selectCategoryAset,
  selectCategoryUnit,
  selectCategoryNonUnit
} from "./surat-form-driver";

beforeEach(() => {
  setupTestHarness();
  configureStandardMocks();
  serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_WITH_PROJECTS);
  registerExternalDataRoutes();
  allowServiceCalls(
    "getMasterData",
    "getActiveRegistrationDrafts",
    "generateNoSurat",
    "createRegistrationDraft",
  );
});

afterEach(() => teardownTestHarness());

describe("Flow 3: Unit pusat", () => {
  it("does not treat an Asset workflow as permission to request Unit", async () => {
    await mountFormWithUsage(FORM_USAGES_RAW);
    await selectFormAndUsage();
    await selectLetterType();
    await selectEntity();

    // Tidak ada tombol klasifikasi manual; kategori diturunkan dari Kegunaan.
    expect(screen.queryByRole("button", { name: /Pengajuan SPK/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Pengajuan Aset")).not.toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("sends selected Marison project and requested unit count when reserving number", async () => {
    await mountFormWithUsage(UNIT_FORM_USAGE_RAW);
    await selectFormAndUsage(/Unit/i);
    await selectLetterType();
    await selectEntity();


    await selectOptionByLabel(/^Proyek$/i, /GA01 - Griya Asri/i);
    fireEvent.change(screen.getByPlaceholderText("Contoh: 10"), { target: { value: "3" } });
    await clickGetNumber();

    expect(serviceMock.generateNoSurat).toHaveBeenCalledWith(expect.objectContaining({
      form_input_data: expect.objectContaining({
        request_category: "unit",
        request_mode: "unit",
        requested_unit_count: 3,
        requested_project: expect.objectContaining({ code: "GA01", name: "Griya Asri" }),
        unit_request_sentence: "Nama Barang: Permohonan Order Bangun SPK Pembangunan Rumah 3 Unit, SAT: Unit, Jumlah: 3, Status: 2",
      }),
    }));
    await waitFor(() => expect(screen.getByText("001/FA/MKT/VIII/2026")).toBeInTheDocument());
    assertStrictServiceCalls();
  });

  it("blocks number when Marison unit lookup is empty", async () => {
    registerFetchRoute("/api/data-sources/marison_units_by_project/query", { options: [] });
    await mountFormWithUsage(UNIT_FORM_USAGE_RAW);
    await selectFormAndUsage(/Unit/i);
    await selectLetterType();
    await selectEntity();

    await selectOptionByLabel(/^Proyek$/i, /GA01 - Griya Asri/i);
    fireEvent.change(screen.getByPlaceholderText("Contoh: 10"), { target: { value: "1" } });
    await clickNumberButton();

    expect(serviceMock.generateNoSurat).not.toHaveBeenCalled();
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Proyek Belum Punya Unit Tersedia" }),
    ));
    assertStrictServiceCalls();
  });

  it("blocks number when Marison unit lookup fails", async () => {
    registerFetchRoute("/api/data-sources/marison_units_by_project/query", { error: "Vendor Marison tidak terjangkau" }, 500);
    await mountFormWithUsage(UNIT_FORM_USAGE_RAW);
    await selectFormAndUsage(/Unit/i);
    await selectLetterType();
    await selectEntity();

    await selectOptionByLabel(/^Proyek$/i, /GA01 - Griya Asri/i);
    fireEvent.change(screen.getByPlaceholderText("Contoh: 10"), { target: { value: "1" } });
    await clickNumberButton();

    expect(serviceMock.generateNoSurat).not.toHaveBeenCalled();
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Kapasitas Unit Belum Termuat" }),
    ));
    assertStrictServiceCalls();
  });

  it("blocks number while Marison unit lookup is loading", async () => {
    const unitsDeferred = createDeferred<{ options: Array<{ value: string; label: string }> }>();
    registerFetchRoute("/api/data-sources/marison_units_by_project/query", unitsDeferred.promise);
    await mountFormWithUsage(UNIT_FORM_USAGE_RAW);
    await selectFormAndUsage(/Unit/i);
    await selectLetterType();
    await selectEntity();

    await selectOptionByLabel(/^Proyek$/i, /GA01 - Griya Asri/i);
    fireEvent.change(screen.getByPlaceholderText("Contoh: 10"), { target: { value: "1" } });
    await clickNumberButton();

    expect(serviceMock.generateNoSurat).not.toHaveBeenCalled();

    unitsDeferred.resolve({ options: [{ value: "unit-a1", label: "A-01" }] });
    await clickGetNumber();

    expect(serviceMock.generateNoSurat).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText("001/FA/MKT/VIII/2026")).toBeInTheDocument());
    assertStrictServiceCalls();
  });

  it("blocks number when requested count exceeds loaded capacity", async () => {
    registerFetchRoute("/api/data-sources/marison_units_by_project/query", {
      options: [{ value: "unit-a1", label: "A-01" }],
    });
    await mountFormWithUsage(UNIT_FORM_USAGE_RAW);
    await selectFormAndUsage(/Unit/i);
    await selectLetterType();
    await selectEntity();

    await selectOptionByLabel(/^Proyek$/i, /GA01 - Griya Asri/i);
    fireEvent.change(screen.getByPlaceholderText("Contoh: 10"), { target: { value: "2" } });
    await clickNumberButton();

    expect(serviceMock.generateNoSurat).not.toHaveBeenCalled();
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Jumlah Melebihi Kapasitas" }),
    ));
    assertStrictServiceCalls();
  });
});

async function clickNumberButton() {
  const button = screen.getByRole("button", { name: /Dapatkan Nomor Surat/i });
  await waitFor(() => expect(button).not.toBeDisabled());
  await act(async () => { fireEvent.click(button); });
}
