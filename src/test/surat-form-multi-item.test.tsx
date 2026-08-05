/**
 * Flow 2: Aset Multi-Item
 * Flow 12: Summary Payload
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
  MULTI_ITEM_FORM_USAGE_RAW,
} from "./surat-form-fixtures";
import {
  configureStandardMocks,
  selectLetterType,
  selectEntity,
  selectCategoryAset,
  clickGetNumber,
  mountFormWithUsage,
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

describe("Flow 2: Aset Multi-Item", () => {
  it("items table appears after getting number with multi-item usage", async () => {
    await mountFormWithUsage(MULTI_ITEM_FORM_USAGE_RAW);
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await clickGetNumber();

    await waitFor(() => {
      expect(screen.getByText(/Items/i)).toBeInTheDocument();
    });
    assertStrictServiceCalls();
  });

  it("items table has Nama Barang column", async () => {
    await mountFormWithUsage(MULTI_ITEM_FORM_USAGE_RAW);
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await clickGetNumber();

    await waitFor(() => {
      expect(screen.getByText(/Nama Barang/i)).toBeInTheDocument();
    });
    assertStrictServiceCalls();
  });
});

describe("Flow 12: Summary Payload", () => {
  it("number is displayed after successful generation", async () => {
    await mountFormWithUsage(MULTI_ITEM_FORM_USAGE_RAW);
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await clickGetNumber();

    expect(screen.getByText("001/FA/MKT/VIII/2026")).toBeInTheDocument();
    assertStrictServiceCalls();
  });
});
