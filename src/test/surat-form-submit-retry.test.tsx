import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, within, fireEvent, act } from "@testing-library/react";
import {
  setupTestHarness,
  teardownTestHarness,
  serviceMock,
  allowServiceCalls,
  assertStrictServiceCalls,
  createDeferred,
  toastMock,
  onSuccessMock,
} from "./surat-form-harness";
import { UUID, CREATE_REGISTRASI_RESULT } from "./surat-form-fixtures";
import {
  configureStandardMocks,
  navigateToReadyToSubmit,
  clickConfirmRegistration,
  submitFromDialog,
  closeDialog,
  selectForm,
  selectUsage,
  selectFormAndUsage,
  selectCategory,
  selectCategoryAset,
  selectCategoryUnit,
  selectCategoryNonUnit
} from "./surat-form-driver";

beforeEach(() => {
  setupTestHarness();
  configureStandardMocks();
  allowServiceCalls(
    "getMasterData",
    "getActiveRegistrationDrafts",
    "generateNoSurat",
    "createRegistrationDraft",
    "createRegistrasi",
    "finishRegistrationDraft",
    "saveRegistrationDraft",
  );
});

afterEach(() => {
  teardownTestHarness();
});

describe("Flow 13: Submit Retry", () => {
  it("submit failure shows error toast and keeps form intact", async () => {
    serviceMock.createRegistrasi.mockRejectedValue(
      new Error("Server error 500")
    );

    await navigateToReadyToSubmit();
    await clickConfirmRegistration();
    await submitFromDialog();

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: "Server error 500",
      })
    );

    // Form still shows number (may appear in multiple places)
    expect(screen.getAllByText("001/FA/MKT/VIII/2026").length).toBeGreaterThanOrEqual(1);
    expect(serviceMock.createRegistrasi).toHaveBeenCalledTimes(1);
    expect(serviceMock.finishRegistrationDraft).not.toHaveBeenCalled();
    assertStrictServiceCalls();
  });

  it("retry after failure succeeds", async () => {
    serviceMock.createRegistrasi
      .mockRejectedValueOnce(new Error("Server error"))
      .mockResolvedValueOnce(CREATE_REGISTRASI_RESULT);

    await navigateToReadyToSubmit();

    // First attempt — fails
    await clickConfirmRegistration();
    await submitFromDialog();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Gagal Menyimpan" })
    );
    expect(serviceMock.createRegistrasi).toHaveBeenCalledTimes(1);

    // Close dialog, retry
    await closeDialog();
    await clickConfirmRegistration();
    await submitFromDialog();

    expect(serviceMock.createRegistrasi).toHaveBeenCalledTimes(2);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Pendaftaran Berhasil" })
    );
    expect(onSuccessMock).toHaveBeenCalled();
    expect(serviceMock.finishRegistrationDraft).toHaveBeenCalledWith(
      UUID.draft,
      "SUBMITTED"
    );
    assertStrictServiceCalls();
  });

  it("double-click prevention calls createRegistrasi only once", async () => {
    const deferred = createDeferred<typeof CREATE_REGISTRASI_RESULT>();
    serviceMock.createRegistrasi.mockReturnValue(deferred.promise);

    await navigateToReadyToSubmit();
    await clickConfirmRegistration();

    const dialog = screen.getByRole("dialog");
    const confirmBtn = within(dialog).getByRole("button", {
      name: /Daftarkan/i,
    });

    // Double-click
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);

    expect(serviceMock.createRegistrasi).toHaveBeenCalledTimes(1);

    // Resolve
    deferred.resolve(CREATE_REGISTRASI_RESULT);
    await act(async () => { await Promise.resolve(); });

    expect(onSuccessMock).toHaveBeenCalled();
    assertStrictServiceCalls();
  });
});
