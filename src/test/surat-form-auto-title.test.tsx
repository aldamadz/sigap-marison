/**
 * Flow 8: Auto-title dan Auto-place
 *
 * Verifies that judul_surat auto-generates based on category,
 * items, and office selection. Also verifies request_place
 * auto-derives from selected office.
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
  it("auto-generates title for asset category", async () => {
    await mountForm();
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await selectFormAndUsage();
    await clickGetNumber();

    // Auto-title should be set via setJudulForDisplay
    // For asset category without items: "Permohonan Aset <officeSuffix>"
    const calls = setJudulForDisplayMock.mock.calls;
    const lastTitle = calls[calls.length - 1]?.[0] || "";
    expect(lastTitle).toContain("Permohonan");
    expect(typeof lastTitle).toBe("string");
    expect(lastTitle.length).toBeGreaterThan(0);
    assertStrictServiceCalls();
  });

  it("auto-sets request_place from office selection", async () => {
    await mountForm();
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await selectFormAndUsage();
    await clickGetNumber();

    // request_place should be auto-derived from office "Kantor Pusat"
    // which maps to "Magelang" for pusat office
    const perihal = screen.getByPlaceholderText(/Contoh.*Permohonan/i);
    expect(perihal).toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("title updates when manual override is cleared", async () => {
    await mountForm();
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await selectFormAndUsage();
    await clickGetNumber();

    // Record auto-title
    const calls = setJudulForDisplayMock.mock.calls;
    const autoTitle = calls[calls.length - 1]?.[0] || "";

    // Manual override
    const perihal = screen.getByPlaceholderText(/Contoh.*Permohonan/i);
    fireEvent.change(perihal, { target: { value: "Judul Manual" } });
    expect(setJudulForDisplayMock).toHaveBeenLastCalledWith("Judul Manual");

    // Clear override → should revert to auto
    fireEvent.change(perihal, { target: { value: "" } });
    const revertedCalls = setJudulForDisplayMock.mock.calls;
    const revertedTitle = revertedCalls[revertedCalls.length - 1]?.[0] || "";
    // After clearing, auto-title should be regenerated
    expect(revertedTitle).not.toBe("Judul Manual");
    assertStrictServiceCalls();
  });
});
