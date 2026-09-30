/** Flow 2: independent multi-item rows. Flow 12: summary and submit payload. */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, act, within, waitFor } from "@testing-library/react";
import {
  setupTestHarness,
  teardownTestHarness,
  serviceMock,
  allowServiceCalls,
  assertStrictServiceCalls,
} from "./surat-form-harness";
import { MASTER_DATA_DEFAULT, MULTI_ITEM_FORM_USAGE_RAW, UUID } from "./surat-form-fixtures";
import {
  configureStandardMocks,
  selectLetterType,
  selectEntity,
  selectCategoryAset,
  clickGetNumber,
  mountFormWithUsage,
  fillTableInput,
  selectAllSigners,
  goToWizardStep,
  clickConfirmRegistration,
  submitFromDialog,
  selectForm,
  selectUsage,
  selectFormAndUsage,
  selectCategory,
  selectCategoryUnit,
  selectCategoryNonUnit
} from "./surat-form-driver";

beforeEach(() => {
  setupTestHarness();
  configureStandardMocks();
  serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_DEFAULT);
  allowServiceCalls(
    "getMasterData",
    "getActiveRegistrationDrafts",
    "generateNoSurat",
    "createRegistrationDraft",
    "saveRegistrationDraft",
    "createRegistrasi",
    "finishRegistrationDraft",
  );
});

afterEach(() => teardownTestHarness());

async function reachMultiItemForm() {
  await mountFormWithUsage(MULTI_ITEM_FORM_USAGE_RAW);
  await selectFormAndUsage();
    await selectLetterType();
  await selectEntity();

  await clickGetNumber();
}

function fillTwoItems() {
  fillTableInput(0, "Nama Barang", "Printer Epson");
  fillTableInput(0, "Satuan", "Unit");
  fillTableInput(0, "Jumlah", "2");
  fillTableInput(0, "Status", "2");
  fillTableInput(0, "Keterangan", "Pengadaan kantor");
}

describe("Flow 2: Aset Multi-Item", () => {
  it("keeps two rows independent", async () => {
    await reachMultiItemForm();
    fillTwoItems();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Tambah Baris/i })); });
    fillTableInput(1, "Nama Barang", "Scanner Canon");
    fillTableInput(1, "Satuan", "Paket");
    fillTableInput(1, "Jumlah", "1");

    expect(screen.getByDisplayValue("Printer Epson")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Scanner Canon")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Unit")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Paket")).toBeInTheDocument();
    assertStrictServiceCalls();
  });
});

describe("Flow 12: Summary Payload", () => {
  it("shows number, item, requester, signers and submits same observable payload", async () => {
    await reachMultiItemForm();
    fillTwoItems();
    await waitFor(() => expect(screen.getByPlaceholderText(/Contoh.*Permohonan/i)).toHaveValue(
      "Pengajuan Aset: Printer Epson Dept. Pengembangan Organisasi Kantor Pusat"
    ));
    await goToWizardStep(3);
    await clickConfirmRegistration();

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("001/FA/MKT/VIII/2026")).toBeInTheDocument();
    expect(within(dialog).getByText("Printer Epson")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Pemohon Staging").length).toBeGreaterThanOrEqual(1);
    expect(within(dialog).getAllByText("Direktur Utama").length).toBeGreaterThanOrEqual(1);
    expect(within(dialog).getAllByText("2").length).toBeGreaterThanOrEqual(1);

    await submitFromDialog();
    await waitFor(() => expect(serviceMock.createRegistrasi).toHaveBeenCalledTimes(1));
    const [payload, signers, recommendation, files] = serviceMock.createRegistrasi.mock.calls[0];
    expect(payload).toEqual(expect.objectContaining({
      no_surat: "001/FA/MKT/VIII/2026",
      reservation_id: UUID.reservation,
      draft_id: UUID.draft,
      form_input_data: expect.objectContaining({
        request_category: "asset",
        items: [expect.objectContaining({ nama_barang: "Printer Epson", sat: "Unit", jumlah: "2" })],
      }),
    }));
    expect(signers).toEqual([
      expect.objectContaining({ step_order: 1, user_id: UUID.user }),
      expect.objectContaining({ step_order: 2, user_id: UUID.user3 }),
    ]);
    expect(recommendation).toBeNull();
    expect(files).toEqual([]);
    expect(serviceMock.finishRegistrationDraft).toHaveBeenCalledWith(UUID.draft, "SUBMITTED");
    assertStrictServiceCalls();
  });
});
