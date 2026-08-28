/** Flow MRN-21: Non Aset KC memilih "Tanpa Proyek (Dana Umum)" untuk dana tanpa proyek. */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import {
  setupTestHarness,
  teardownTestHarness,
  serviceMock,
  allowServiceCalls,
  assertStrictServiceCalls,
} from "./surat-form-harness";
import { MASTER_DATA_DEFAULT, CURRENT_PROFILE_KC, FUND_FORM_USAGE_RAW } from "./surat-form-fixtures";
import {
  configureStandardMocks,
  selectLetterType,
  selectEntity,
  selectCategory,
  selectOptionByLabel,
  mountFormWithUsage,
  clickGetNumber,
} from "./surat-form-driver";

afterEach(() => teardownTestHarness());

describe("Flow MRN-21: Non Aset dana umum tanpa proyek", () => {
  beforeEach(() => {
    setupTestHarness();
    configureStandardMocks();
    serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_DEFAULT);
    allowServiceCalls(
      "getMasterData",
      "getActiveRegistrationDrafts",
      "generateNoSurat",
      "createRegistrationDraft",
    );
  });

  it("reserves number for dana umum without a Marison project", async () => {
    await mountFormWithUsage(FUND_FORM_USAGE_RAW, CURRENT_PROFILE_KC);
    await selectLetterType();
    await selectEntity();
    await selectCategory("Non Aset");

    // KC tidak punya proyek siap Marison; fund bisa memilih Tanpa Proyek.
    expect(await screen.findByText("Belum ada proyek yang siap digunakan")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByText("Tanpa Proyek (Dana Umum)"));
    });
    await selectOptionByLabel(/^Jenis Pengajuan Dana$/i, /Biaya Operasional/i);
    await clickGetNumber();

    const payload = serviceMock.generateNoSurat.mock.calls[0][0];
    expect(payload).toMatchObject({
      office_id: CURRENT_PROFILE_KC.office_id,
      project_id: "",
    });
    const input = payload.form_input_data;
    expect(input).toMatchObject({
      request_category: "non_asset",
      request_mode: "barang",
      fund_type: "operational",
      fund_without_project: true,
    });
    expect(input).not.toHaveProperty("requested_project");
    expect(input).not.toHaveProperty("project_code");

    const draftRequest = serviceMock.createRegistrationDraft.mock.calls[0][0];
    expect(draftRequest.payload.formData.form_input_data.requested_project).toBeUndefined();
    expect(draftRequest.payload.formData.form_input_data.fund_without_project).toBe(true);
    await waitFor(() => expect(screen.getByText("001/FA/MKT/VIII/2026")).toBeInTheDocument());

    expect(await screen.findByText("Rincian Fund Submission")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nama barang/jasa"), { target: { value: "Sewa kendaraan operasional" } });
    fireEvent.change(screen.getByLabelText("Jumlah"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Satuan"), { target: { value: "bulan" } });
    const nominal = screen.getByRole("textbox", { name: "Nominal item 1" });
    expect(screen.getAllByText("Rp")).toHaveLength(1);
    fireEvent.change(nominal, { target: { value: "1500000" } });
    fireEvent.blur(nominal);
    expect(await screen.findByText("Rp 1.500.000")).toBeInTheDocument();

    assertStrictServiceCalls();
  });
});
