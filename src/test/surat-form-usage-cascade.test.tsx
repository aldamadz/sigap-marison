/**
 * Flow 15: Perubahan usage/form ketika draft sudah ada
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import {
  setupTestHarness,
  teardownTestHarness,
  serviceMock,
  allowServiceCalls,
  assertStrictServiceCalls,
} from "./surat-form-harness";
import {
  MASTER_DATA_DEFAULT,
} from "./surat-form-fixtures";
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
  serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_DEFAULT);
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

describe("Flow 15: Usage/form cascade", () => {
  it("form and usage auto-select when only one option available", async () => {
    await mountForm();
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await selectFormAndUsage();

    const btn = screen.getByRole("button", { name: /Dapatkan Nomor Surat/i });
    expect(btn).not.toBeDisabled();
    assertStrictServiceCalls();
  });

  it("number persists after form/usage selection", async () => {
    await mountForm();
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await selectFormAndUsage();
    await clickGetNumber();

    expect(screen.getByText("001/FA/MKT/VIII/2026")).toBeInTheDocument();
    assertStrictServiceCalls();
  });
});
