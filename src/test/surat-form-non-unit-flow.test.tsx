/** Flow 4: Non Unit. Flow 14: KC/KCP tanpa proyek memakai kode 000. */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import {
  setupTestHarness,
  teardownTestHarness,
  serviceMock,
  allowServiceCalls,
  assertStrictServiceCalls,
} from "./surat-form-harness";
import { MASTER_DATA_DEFAULT, CURRENT_PROFILE_KC, NON_UNIT_FORM_USAGE_RAW } from "./surat-form-fixtures";
import {
  configureStandardMocks,
  selectLetterType,
  selectEntity,
  selectCategory,
  mountFormWithUsage,
  clickGetNumber,
} from "./surat-form-driver";

afterEach(() => teardownTestHarness());

describe("Flow 4 dan 14: Non Unit KC tanpa proyek", () => {
  beforeEach(() => {
    setupTestHarness();
    configureStandardMocks();
    serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_DEFAULT);
    allowServiceCalls(
      "getMasterData",
      "getActiveRegistrationDrafts",
      "generateNoSurat",
      "createRegistrationDraft",
    );
  });

  it("shows default-project notice and reserves number with canonical 000 fields", async () => {
    await mountFormWithUsage(NON_UNIT_FORM_USAGE_RAW, CURRENT_PROFILE_KC);
    await selectLetterType();
    await selectEntity();
    await selectCategory("Non Unit");

    expect(await screen.findByText("Tidak ada proyek terdaftar")).toBeInTheDocument();
    expect(screen.getByText("Kode proyek pada nomor surat akan memakai 000.")).toBeInTheDocument();
    await clickGetNumber();

    expect(serviceMock.generateNoSurat).toHaveBeenCalledWith(expect.objectContaining({
      office_id: CURRENT_PROFILE_KC.office_id,
      project_id: "",
      form_input_data: expect.objectContaining({
        request_category: "non_unit",
        request_mode: "barang",
        project_code: "000",
        project_name: "Tanpa proyek",
        project_is_default: true,
      }),
    }));
    const draftRequest = serviceMock.createRegistrationDraft.mock.calls[0][0];
    expect(draftRequest.payload.formData.form_input_data).toEqual(expect.objectContaining({
      project_code: "000",
      project_name: "Tanpa proyek",
      project_is_default: true,
    }));
    await waitFor(() => expect(screen.getByText("001/FA/MKT/VIII/2026")).toBeInTheDocument());
    assertStrictServiceCalls();
  });
});
