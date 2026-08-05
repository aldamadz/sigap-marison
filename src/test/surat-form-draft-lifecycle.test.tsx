import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import {
  setupTestHarness,
  teardownTestHarness,
  serviceMock,
  allowServiceCalls,
  assertStrictServiceCalls,
  toastMock,
} from "./surat-form-harness";
import { UUID } from "./surat-form-fixtures";
import {
  configureStandardMocks,
  navigateToNumberGenerated,
  editFieldAndWaitForAutosave,
} from "./surat-form-driver";

beforeEach(() => {
  setupTestHarness();
  configureStandardMocks();
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

describe("Flow 6: Draft Lifecycle", () => {
  it("autosave triggers after field edit with 900ms debounce", async () => {
    await navigateToNumberGenerated();

    expect(serviceMock.saveRegistrationDraft).not.toHaveBeenCalled();

    const perihal = screen.getByPlaceholderText(/Contoh.*Permohonan/i);
    await editFieldAndWaitForAutosave(perihal, "Judul Manual");

    expect(serviceMock.saveRegistrationDraft).toHaveBeenCalledTimes(1);
    expect(serviceMock.saveRegistrationDraft).toHaveBeenCalledWith(
      UUID.draft,
      expect.objectContaining({ formData: expect.any(Object) }),
      expect.any(Array),
      "details"
    );
    assertStrictServiceCalls();
  });

  it("draft state shows saved after autosave completes", async () => {
    await navigateToNumberGenerated();
    toastMock.mockClear();

    const perihal = screen.getByPlaceholderText(/Contoh.*Permohonan/i);
    await editFieldAndWaitForAutosave(perihal, "Judul Manual");

    expect(
      screen.getByText(/Perubahan tersimpan otomatis/i)
    ).toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("draft number persists after autosave", async () => {
    await navigateToNumberGenerated();

    const perihal = screen.getByPlaceholderText(/Contoh.*Permohonan/i);
    await editFieldAndWaitForAutosave(perihal, "Judul Manual");

    expect(screen.getByText("001/FA/MKT/VIII/2026")).toBeInTheDocument();
    expect(screen.getByText(/Nomor Terdaftar/i)).toBeInTheDocument();
    assertStrictServiceCalls();
  });
});
