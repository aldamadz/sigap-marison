/** Flow 15: restored numbered draft keeps its persisted form/usage and fields locked. */
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
  goToWizardStep,
} from "./surat-form-driver";

beforeEach(() => {
  setupTestHarness();
  configureStandardMocks();
  serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_DEFAULT);
  serviceMock.getRegistrationDraft.mockResolvedValue(buildDraftForRestore());
  allowServiceCalls("getMasterData", "getActiveRegistrationDrafts", "getRegistrationDraft");
});

afterEach(() => teardownTestHarness());

describe("Flow 15: numbered draft form/usage ownership", () => {
  it("restores persisted values and does not expose a form/usage switch after number reservation", async () => {
    await mountFormWithUsageAndSearchParams(FORM_USAGES_RAW_WITH_DRAFT, { draft: UUID.draft });

    expect(serviceMock.getRegistrationDraft).toHaveBeenCalledWith(UUID.draft);
    expect(await screen.findByText("001/FA/MKT/VIII/2026")).toBeInTheDocument();

    // Langkah 1: form & kegunaan tampil read-only, tanpa combobox switch
    await goToWizardStep(1);
    expect(await screen.findByText("FORM PERMOHONAN ASET")).toBeInTheDocument();
    expect(screen.getByText("Permohonan Aset")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /Form Dokumen/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /Kegunaan/i })).not.toBeInTheDocument();

    // Langkah 2: nilai draft ter-restore di kolom form dinamis;
    // panel read-only (langkah 1) sudah tidak tampil
    await goToWizardStep(2);
    expect(await screen.findByDisplayValue("Printer Epson")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Isi Nama Barang/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Isi Keterangan Barang/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /Form Dokumen/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /Kegunaan/i })).not.toBeInTheDocument();
    expect(serviceMock.generateNoSurat).not.toHaveBeenCalled();
    expect(serviceMock.createRegistrationDraft).not.toHaveBeenCalled();
    assertStrictServiceCalls();
  });
});
