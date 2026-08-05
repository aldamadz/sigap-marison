/**
 * Flow 5: Recommendation linked document
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

afterEach(() => {
  teardownTestHarness();
});

describe("Flow 5: Recommendation linked document", () => {
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

  it("renders recommendation parent summary with correct data", async () => {
    await mountFormWithSearchParams({
      linked_type: "recommendation",
      parent_surat: UUID.surat,
      parent_no_surat: "001/FA/MKT/VII/2026",
      task_id: "task-001",
    });

    await waitFor(() => {
      expect(serviceMock.getRecommendationParentSummary).toHaveBeenCalled();
    });

    // Should show parent surat number
    await waitFor(() => {
      expect(screen.getByText(/001\/FA\/MKT\/VII\/2026/i)).toBeInTheDocument();
    });

    // Should show parent item name
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
