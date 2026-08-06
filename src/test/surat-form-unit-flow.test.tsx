/** Flow 3: Unit pusat memilih proyek dan jumlah unit sebelum nomor dibuat. */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import {
  setupTestHarness,
  teardownTestHarness,
  serviceMock,
  allowServiceCalls,
  assertStrictServiceCalls,
} from "./surat-form-harness";
import { MASTER_DATA_WITH_PROJECTS, UNIT_FORM_USAGE_RAW } from "./surat-form-fixtures";
import {
  configureStandardMocks,
  selectLetterType,
  selectEntity,
  selectCategory,
  registerExternalDataRoutes,
  mountFormWithUsage,
  selectOptionByLabel,
  clickGetNumber,
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
  it("sends selected Marison project and requested unit count when reserving number", async () => {
    await mountFormWithUsage(UNIT_FORM_USAGE_RAW);
    await selectLetterType();
    await selectEntity();
    await selectCategory("Unit");

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
});
