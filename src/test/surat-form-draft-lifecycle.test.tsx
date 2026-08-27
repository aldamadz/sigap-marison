import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import {
  setupTestHarness,
  teardownTestHarness,
  serviceMock,
  allowServiceCalls,
  assertStrictServiceCalls,
  toastMock,
  defaultProps,
} from "./surat-form-harness";
import { UUID } from "./surat-form-fixtures";
import { SuratForm } from "@/components/surat/SuratForm";
import {
  configureStandardMocks,
  selectLetterType,
  selectEntity,
  selectCategoryAset,
  selectFormAndUsage,
  clickGetNumber,
  editFieldAndWaitForAutosave,
  editFieldAndUnmountBeforeAutosave,
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

/** Mount and navigate to number generated, returning unmount handle. */
async function mountToNumberGenerated() {
  const { unmount } = render(<SuratForm {...defaultProps()} />);
  await screen.findByText(/Lokasi dan Klasifikasi/i);
  await selectLetterType();
  await selectEntity();
  await selectCategoryAset();
  await selectFormAndUsage();
  await clickGetNumber();
  return { unmount };
}

describe("Flow 6: Draft Lifecycle", () => {
  it("autosave triggers after field edit with 900ms debounce", async () => {
    await mountToNumberGenerated();
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
    await mountToNumberGenerated();
    toastMock.mockClear();

    const perihal = screen.getByPlaceholderText(/Contoh.*Permohonan/i);
    await editFieldAndWaitForAutosave(perihal, "Judul Manual");

    expect(
      screen.getByText(/Perubahan tersimpan otomatis/i)
    ).toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("draft number persists after autosave", async () => {
    await mountToNumberGenerated();

    const perihal = screen.getByPlaceholderText(/Contoh.*Permohonan/i);
    await editFieldAndWaitForAutosave(perihal, "Judul Manual");

    expect(screen.getByText("001/FA/MKT/VIII/2026")).toBeInTheDocument();
    expect(screen.getByText("Persetujuan dan Berkas")).toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("unmount before 900ms cancels autosave timer", async () => {
    const { unmount } = await mountToNumberGenerated();

    const perihal = screen.getByPlaceholderText(/Contoh.*Permohonan/i);
    editFieldAndUnmountBeforeAutosave(unmount, perihal, "Judul Manual");

    // saveRegistrationDraft must NOT be called — cleanup cancelled the timer
    expect(serviceMock.saveRegistrationDraft).not.toHaveBeenCalled();
    assertStrictServiceCalls();
  });
});
