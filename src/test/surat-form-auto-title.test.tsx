/**
 * Flow 8: Auto-title dan Auto-place
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import {
  setupTestHarness,
  teardownTestHarness,
  serviceMock,
  allowServiceCalls,
  assertStrictServiceCalls,
  setJudulForDisplayMock,
} from "./surat-form-harness";
import {
  configureStandardMocks,
  mountForm,
  selectLetterType,
  selectEntity,
  selectCategoryAset,
  selectFormAndUsage,
  clickGetNumber,
} from "./surat-form-driver";

beforeEach(() => {
  setupTestHarness();
  configureStandardMocks();
  allowServiceCalls(
    "getMasterData",
    "getActiveRegistrationDrafts",
    "generateNoSurat",
    "createRegistrationDraft",
    "saveRegistrationDraft",
  );
});

afterEach(() => {
  teardownTestHarness();
});

describe("Flow 8: Auto-title and Auto-place", () => {
  it("auto-generates exact title from category and office", async () => {
    await mountForm();
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await selectFormAndUsage();
    await clickGetNumber();

    await waitFor(() => expect(setJudulForDisplayMock).toHaveBeenLastCalledWith(
      "Permohonan Aset Dept. Pengembangan Organisasi Kantor Pusat"
    ));
    expect(screen.getByPlaceholderText(/Contoh.*Permohonan/i)).toHaveValue(
      "Permohonan Aset Dept. Pengembangan Organisasi Kantor Pusat"
    );
    assertStrictServiceCalls();
  });

  it("auto-sets request_place to 'Magelang' for pusat office", async () => {
    await mountForm();
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await selectFormAndUsage();
    await clickGetNumber();

    expect(screen.getByPlaceholderText(/Jakarta|Tempat/i)).toHaveValue("Magelang");
    assertStrictServiceCalls();
  });

  it("manual title override prevents auto-update, clear reverts to auto", async () => {
    await mountForm();
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await selectFormAndUsage();
    await clickGetNumber();

    const perihal = screen.getByPlaceholderText(/Contoh.*Permohonan/i);
    fireEvent.change(perihal, { target: { value: "Judul Manual Saya" } });
    expect(perihal).toHaveValue("Judul Manual Saya");
    expect(setJudulForDisplayMock).toHaveBeenLastCalledWith("Judul Manual Saya");

    fireEvent.change(perihal, { target: { value: "" } });
    await waitFor(() => expect(perihal).toHaveValue(
      "Permohonan Aset Dept. Pengembangan Organisasi Kantor Pusat"
    ));
    expect(setJudulForDisplayMock).toHaveBeenLastCalledWith(
      "Permohonan Aset Dept. Pengembangan Organisasi Kantor Pusat"
    );
    assertStrictServiceCalls();
  });
});
