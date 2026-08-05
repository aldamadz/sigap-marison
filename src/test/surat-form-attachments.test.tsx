/**
 * Flow 10: Required attachment dan upload progress
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
  ATTACHMENT_FORM_USAGE_RAW,
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
  serviceMock.uploadRegistrationDraftFiles.mockResolvedValue([
    { id: "file-001", file_name: "surat-kuasa.pdf", requirement_key: "surat_kuasa" },
  ]);
  allowServiceCalls(
    "getMasterData",
    "getActiveRegistrationDrafts",
    "generateNoSurat",
    "createRegistrationDraft",
    "uploadRegistrationDraftFiles",
    "saveRegistrationDraft",
  );
});

afterEach(() => {
  teardownTestHarness();
});

describe("Flow 10: Required attachment", () => {
  it("shows required attachment label after number generation", async () => {
    await mountFormWithUsage(ATTACHMENT_FORM_USAGE_RAW);
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await clickGetNumber();

    await waitFor(() => {
      expect(screen.getByText(/Surat Kuasa/i)).toBeInTheDocument();
    });
    assertStrictServiceCalls();
  });

  it("number is displayed after successful generation", async () => {
    await mountFormWithUsage(ATTACHMENT_FORM_USAGE_RAW);
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await clickGetNumber();

    expect(screen.getByText("001/FA/MKT/VIII/2026")).toBeInTheDocument();
    assertStrictServiceCalls();
  });
});
