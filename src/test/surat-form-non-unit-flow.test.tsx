/**
 * Flow 4: Non Unit
 * Flow 14: KC/KCP tanpa proyek memakai kode 000
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
  CURRENT_PROFILE_KC,
  NON_UNIT_FORM_USAGE_RAW,
} from "./surat-form-fixtures";
import {
  configureStandardMocks,
  selectLetterType,
  selectEntity,
  selectCategory,
  registerExternalDataRoutes,
  mountFormWithUsage,
} from "./surat-form-driver";

describe("Flow 4: Non Unit", () => {
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

  it("non-unit category button is clickable", async () => {
    await mountFormWithUsage(NON_UNIT_FORM_USAGE_RAW);
    await selectLetterType();
    await selectEntity();

    const nonUnitBtn = screen.getByText("Non Unit");
    expect(nonUnitBtn).toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("selecting non-unit category shows form selectors", async () => {
    await mountFormWithUsage(NON_UNIT_FORM_USAGE_RAW);
    await selectLetterType();
    await selectEntity();
    await selectCategory("Non Unit");

    await waitFor(() => {
      expect(screen.getByText(/Form Dokumen/i)).toBeInTheDocument();
    });
    assertStrictServiceCalls();
  });
});

describe("Flow 14: KC/KCP kode 000", () => {
  beforeEach(() => {
    setupTestHarness();
    configureStandardMocks();
    serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_WITH_PROJECTS);
    registerExternalDataRoutes();
    allowServiceCalls(
      "getMasterData",
      "getActiveRegistrationDrafts",
    );
  });

  afterEach(() => {
    teardownTestHarness();
  });

  it("KC office mounts without crash", async () => {
    await mountFormWithUsage(NON_UNIT_FORM_USAGE_RAW, CURRENT_PROFILE_KC);
    await selectLetterType();
    await selectEntity();

    expect(screen.getByText(/Lokasi dan Klasifikasi/i)).toBeInTheDocument();
    assertStrictServiceCalls();
  });
});
