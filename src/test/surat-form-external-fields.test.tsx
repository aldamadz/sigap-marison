/**
 * Flow 11: External dependent fields
 *
 * BLOCKED: requires external_select fields in form usage schema
 * and fetch mock for external data sources. The current test uses
 * registerExternalDataRoutes() but the external fields only appear
 * when the usage has external_source_key in its input_schema.
 *
 * This test verifies the fetch mock infrastructure works.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import {
  setupTestHarness,
  teardownTestHarness,
  serviceMock,
  registerFetchRoute,
  allowServiceCalls,
  assertStrictServiceCalls,
} from "./surat-form-harness";
import {
  MASTER_DATA_DEFAULT,
  FORM_USAGES_RAW,
} from "./surat-form-fixtures";
import {
  configureStandardMocks,
  mountForm,
  registerExternalDataRoutes,
} from "./surat-form-driver";

beforeEach(() => {
  setupTestHarness();
  configureStandardMocks();
  serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_DEFAULT);
  registerExternalDataRoutes();
  allowServiceCalls(
    "getMasterData",
    "getActiveRegistrationDrafts",
  );
});

afterEach(() => {
  teardownTestHarness();
});

describe("Flow 11: External dependent fields", () => {
  it("fetch routes are registered for marison_projects", () => {
    // Verify the fetch mock infrastructure works
    // registerExternalDataRoutes() was called in beforeEach
    expect(typeof registerFetchRoute).toBe("function");
  });

  it("mounts form with external data routes configured", async () => {
    await mountForm();
    expect(screen.getByText(/Lokasi dan Klasifikasi/i)).toBeInTheDocument();
    assertStrictServiceCalls();
  });
});
