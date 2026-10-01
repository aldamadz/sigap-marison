/** Flow 4: Non Unit on a branch with no projects must NOT silently use the
 *  MRN-22 virtual "000" scope.  That scope is reserved for `requestCategory
 *  === "asset"`.  Non Unit must show the "Belum ada proyek" rejection and
 *  block generateNoSurat.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import {
  setupTestHarness,
  teardownTestHarness,
  serviceMock,
  allowServiceCalls,
  assertStrictServiceCalls,
  getFetchCalls,
} from "./surat-form-harness";
import { MASTER_DATA_DEFAULT, MASTER_DATA_WITH_PROJECTS, CURRENT_PROFILE_KC, NON_UNIT_FORM_USAGE_RAW } from "./surat-form-fixtures";
import {
  configureStandardMocks,
  selectLetterType,
  selectEntity,
  selectCategory,
  mountFormWithUsage,
  selectForm,
  selectUsage,
  selectFormAndUsage,
  selectCategoryAset,
  selectCategoryUnit,
  selectCategoryNonUnit,
  findSelectTrigger,
  selectOptionByLabel,
  registerExternalDataRoutes,
} from "./surat-form-driver";

afterEach(() => teardownTestHarness());

describe("Flow 4: Non Unit KC tanpa proyek ditolak (MRN-22 hanya untuk Aset)", () => {
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

  it("menolak Non Unit di cabang tanpa proyek dan tidak memanggil generateNoSurat", async () => {
    await mountFormWithUsage(NON_UNIT_FORM_USAGE_RAW, CURRENT_PROFILE_KC);
    await selectFormAndUsage(/Non Unit/i);
    await selectLetterType();
    await selectEntity();


    // MRN-22: Non Unit + branch + no projects must NOT show the
    // "Tidak ada proyek terdaftar" (asset-fallback) banner.
    expect(screen.queryByText("Tidak ada proyek terdaftar")).not.toBeInTheDocument();
    expect(screen.queryByText("Kode proyek pada nomor surat akan memakai 000.")).not.toBeInTheDocument();

    // The Marison-not-ready banner should be visible instead.
    expect(await screen.findByText("Belum ada proyek yang siap digunakan")).toBeInTheDocument();
    expect(screen.queryByText("Proyek belum terhubung ke Marison")).not.toBeInTheDocument();
    expect(screen.queryByText("Pekerjaan Non Unit")).not.toBeInTheDocument();

    // generateNoSurat must NOT be called: click the button directly so the
    // driver's success-path wait does not time out on the rejected branch.
    const btn = screen.getByRole("button", { name: /Dapatkan Nomor Surat/i });
    serviceMock.generateNoSurat.mockClear();
    await act(async () => { fireEvent.click(btn); });
    await waitFor(() => expect(serviceMock.generateNoSurat).not.toHaveBeenCalled());

    assertStrictServiceCalls();
  });

  it("reserves a number before showing project work and loading work types", async () => {
    serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_WITH_PROJECTS);
    registerExternalDataRoutes();
    await mountFormWithUsage(NON_UNIT_FORM_USAGE_RAW, CURRENT_PROFILE_KC);
    await selectFormAndUsage(/Non Unit/i);

    expect(findSelectTrigger(/^Proyek Tujuan$/)).toBeInTheDocument();
    expect(screen.queryByText("Pekerjaan Non Unit")).not.toBeInTheDocument();
    expect(screen.queryByText("Proyek belum terhubung ke Marison")).not.toBeInTheDocument();
    expect(getFetchCalls("marison_non_units_by_project")).toHaveLength(0);

    await selectOptionByLabel(/^Proyek Tujuan$/, /GA01 - Griya Asri/);
    expect(screen.queryByText("Pekerjaan Non Unit")).not.toBeInTheDocument();
    expect(getFetchCalls("marison_non_units_by_project")).toHaveLength(0);
    await selectLetterType();
    await selectEntity();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Dapatkan Nomor Surat/i })); });
    await waitFor(() => expect(serviceMock.createRegistrationDraft).toHaveBeenCalledTimes(1));
    const workType = await screen.findByRole("button", { name: /Pilih jenis pekerjaan Non Unit/ });
    await waitFor(() => expect(workType).toBeEnabled());
    expect(screen.getAllByRole("button", { name: /Pilih jenis pekerjaan Non Unit/ })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Persetujuan & Berkas" })).toBeInTheDocument();
    expect(serviceMock.generateNoSurat).toHaveBeenCalledTimes(1);
    expect(serviceMock.createRegistrationDraft.mock.calls[0][0].payload.formData.project_id).toBeTruthy();
    expect(getFetchCalls("marison_non_units_by_project")).toHaveLength(1);
    expect(screen.queryByText("Proyek belum terhubung ke Marison")).not.toBeInTheDocument();
    assertStrictServiceCalls();
  });
});
