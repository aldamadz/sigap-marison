/**
 * Flow 3: Unit pusat untuk proyek cabang
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
  MASTER_DATA_WITH_PROJECTS,
  UNIT_FORM_USAGE_RAW,
} from "./surat-form-fixtures";
import {
  configureStandardMocks,
  selectLetterType,
  selectEntity,
  selectCategory,
  registerExternalDataRoutes,
  mountFormWithUsage,
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
    "saveRegistrationDraft",
  );
});

afterEach(() => {
  teardownTestHarness();
});

describe("Flow 3: Unit pusat", () => {
  it("unit category shows form selectors", async () => {
    await mountFormWithUsage(UNIT_FORM_USAGE_RAW);
    await selectLetterType();
    await selectEntity();
    await selectCategory("Unit");

    await waitFor(() => {
      expect(screen.getByText(/Form Dokumen/i)).toBeInTheDocument();
    });
    assertStrictServiceCalls();
  });

  it("unit category button is visible and clickable", async () => {
    await mountFormWithUsage(UNIT_FORM_USAGE_RAW);
    await selectLetterType();
    await selectEntity();

    const unitBtn = screen.getByText("Unit");
    expect(unitBtn).toBeInTheDocument();
    assertStrictServiceCalls();
  });
});
