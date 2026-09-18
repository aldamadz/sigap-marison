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
} from "./surat-form-harness";
import { MASTER_DATA_DEFAULT, CURRENT_PROFILE_KC, NON_UNIT_FORM_USAGE_RAW } from "./surat-form-fixtures";
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
  selectCategoryNonUnit
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
    await selectCategory("Pengajuan Non Unit");
    await selectLetterType();
    await selectEntity();
    

    // MRN-22: Non Unit + branch + no projects must NOT show the
    // "Tidak ada proyek terdaftar" (asset-fallback) banner.
    expect(screen.queryByText("Tidak ada proyek terdaftar")).not.toBeInTheDocument();
    expect(screen.queryByText("Kode proyek pada nomor surat akan memakai 000.")).not.toBeInTheDocument();

    // The Marison-not-ready banner should be visible instead.
    expect(await screen.findByText("Belum ada proyek yang siap digunakan")).toBeInTheDocument();

    // generateNoSurat must NOT be called: click the button directly so the
    // driver's success-path wait does not time out on the rejected branch.
    const btn = screen.getByRole("button", { name: /Dapatkan Nomor Surat/i });
    serviceMock.generateNoSurat.mockClear();
    await act(async () => { fireEvent.click(btn); });
    await waitFor(() => expect(serviceMock.generateNoSurat).not.toHaveBeenCalled());

    assertStrictServiceCalls();
  });
});
