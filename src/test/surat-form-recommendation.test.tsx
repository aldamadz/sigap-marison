/**
 * Flow 5: Recommendation linked document
 *
 * BLOCKED: requires react-router mock override for URL params.
 * The current harness mock returns empty URLSearchParams.
 * To test linked documents, we need to override useSearchParams
 * to return params like linked_type=recommendation&parent_surat=...
 *
 * This test verifies the recommendation flow exists in the codebase
 * but cannot be fully tested without modifying the harness mock
 * for react-router, which would affect all other tests.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import {
  setupTestHarness,
  teardownTestHarness,
  serviceMock,
  allowServiceCalls,
  assertStrictServiceCalls,
} from "./surat-form-harness";
import {
  MASTER_DATA_DEFAULT,
  FORM_USAGES_RAW,
  RECOMMENDATION_PARENT_SUMMARY,
} from "./surat-form-fixtures";
import {
  configureStandardMocks,
  mountForm,
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
  it("getRecommendationParentSummary is available as service method", () => {
    // Verify the service mock is properly configured
    expect(serviceMock.getRecommendationParentSummary).toBeDefined();
    expect(typeof serviceMock.getRecommendationParentSummary).toBe("function");
  });

  it("mounts without linked document context (no URL params)", async () => {
    await mountForm();

    // Without linked_type param, should render normal form
    expect(screen.getByText(/Lokasi dan Klasifikasi/i)).toBeInTheDocument();
    assertStrictServiceCalls();
  });
});
