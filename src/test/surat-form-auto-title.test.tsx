/**
 * Flow 8: Auto-title dan Auto-place
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
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
  it("auto-generates title containing 'Permohonan Aset' and office suffix", async () => {
    await mountForm();
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await selectFormAndUsage();
    await clickGetNumber();

    // For pusat office + asset category + no items:
    // title = "Permohonan Aset Dept. Pengembangan Organisasi Kantor Pusat"
    const calls = setJudulForDisplayMock.mock.calls;
    const lastTitle = calls[calls.length - 1]?.[0] || "";
    expect(lastTitle).toContain("Permohonan Aset");
    expect(lastTitle).toContain("Kantor Pusat");
    assertStrictServiceCalls();
  });

  it("auto-sets request_place to 'Magelang' for pusat office", async () => {
    await mountForm();
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await selectFormAndUsage();
    await clickGetNumber();

    // request_place should be "Magelang" for pusat office
    // Find the request_place input (Tempat field)
    const tempatInput = screen.getByPlaceholderText(/Jakarta|Tempat/i) as HTMLInputElement;
    expect(tempatInput).toBeTruthy();
    expect(tempatInput.value).toBe("Magelang");
    assertStrictServiceCalls();
  });

  it("manual title override prevents auto-update, clear reverts to auto", async () => {
    await mountForm();
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await selectFormAndUsage();
    await clickGetNumber();

    const calls = setJudulForDisplayMock.mock.calls;
    const autoTitle = calls[calls.length - 1]?.[0] || "";

    // Manual override
    const perihal = screen.getByPlaceholderText(/Contoh.*Permohonan/i);
    fireEvent.change(perihal, { target: { value: "Judul Manual Saya" } });
    expect(setJudulForDisplayMock).toHaveBeenLastCalledWith("Judul Manual Saya");

    // Clear override → should revert to auto
    fireEvent.change(perihal, { target: { value: "" } });
    const revertedCalls = setJudulForDisplayMock.mock.calls;
    const revertedTitle = revertedCalls[revertedCalls.length - 1]?.[0] || "";
    expect(revertedTitle).toContain("Permohonan Aset");
    expect(revertedTitle).not.toBe("Judul Manual Saya");
    assertStrictServiceCalls();
  });
});
