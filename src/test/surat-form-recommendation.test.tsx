/**
 * Flow 5: Recommendation linked document
 *
 * Asserts:
 * - getRecommendationParentSummary called with correct task_id
 * - Parent no_surat and items rendered in DOM
 * - Normal form renders without recommendation context
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
  UUID,
  MASTER_DATA_DEFAULT,
  RECOMMENDATION_PARENT_SUMMARY,
} from "./surat-form-fixtures";
import {
  configureStandardMocks,
  mountForm,
  mountFormWithSearchParams,
} from "./surat-form-driver";

afterEach(() => {
  teardownTestHarness();
});

describe("Flow 5: Recommendation linked document", () => {
  beforeEach(() => {
    setupTestHarness();
    configureStandardMocks();
    serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_DEFAULT);
    serviceMock.getRecommendationParentSummary.mockResolvedValue(RECOMMENDATION_PARENT_SUMMARY);
    allowServiceCalls(
      "getMasterData",
      "getActiveRegistrationDrafts",
      "getRecommendationParentSummary",
    );
  });

  it("calls getRecommendationParentSummary with correct task ID", async () => {
    await mountFormWithSearchParams({
      linked_type: "recommendation",
      parent_surat: UUID.surat,
      parent_no_surat: "001/FA/MKT/VII/2026",
      task_id: "task-001",
    });

    await waitFor(() => {
      expect(serviceMock.getRecommendationParentSummary).toHaveBeenCalledTimes(1);
    });

    const callArg = serviceMock.getRecommendationParentSummary.mock.calls[0][0];
    expect(callArg).toBe("task-001");
    assertStrictServiceCalls();
  });

  it("renders exact recommendation parent context and item", async () => {
    await mountFormWithSearchParams({
      linked_type: "recommendation",
      parent_surat: UUID.surat,
      parent_no_surat: "001/FA/MKT/VII/2026",
      task_id: "task-001",
    });

    expect(await screen.findByText("001/FA/MKT/VII/2026")).toBeInTheDocument();
    expect(screen.getByText("Permohonan Aset : Printer Epson")).toBeInTheDocument();
    expect(screen.getByText("Pemohon Staging")).toBeInTheDocument();
    expect(screen.getByText("Pengembangan Organisasi")).toBeInTheDocument();
    expect(screen.getByText(/Printer Epson L3250/i)).toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("without linked_type param renders normal form", async () => {
    await mountForm();

    expect(screen.getByText(/Lokasi dan Klasifikasi/i)).toBeInTheDocument();
    expect(serviceMock.getRecommendationParentSummary).not.toHaveBeenCalled();
    assertStrictServiceCalls();
  });
});
