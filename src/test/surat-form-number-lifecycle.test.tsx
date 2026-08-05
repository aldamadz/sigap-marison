import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, act, fireEvent, waitFor } from "@testing-library/react";
import {
  setupTestHarness,
  teardownTestHarness,
  serviceMock,
  allowServiceCalls,
  assertStrictServiceCalls,
  confirmMock,
  toastMock,
} from "./surat-form-harness";
import { UUID } from "./surat-form-fixtures";
import {
  configureStandardMocks,
  navigateToNumberGenerated,
} from "./surat-form-driver";

beforeEach(() => {
  setupTestHarness();
  configureStandardMocks();
  allowServiceCalls(
    "getMasterData",
    "getActiveRegistrationDrafts",
    "generateNoSurat",
    "createRegistrationDraft",
    "voidRegistrationDraft",
  );
});

afterEach(() => {
  teardownTestHarness();
});

describe("Flow 7: Number Lifecycle", () => {
  it("shows Ubah Identitas button after number is generated", async () => {
    await navigateToNumberGenerated();

    expect(
      screen.getByRole("button", { name: /Ubah Identitas/i })
    ).toBeInTheDocument();
    expect(screen.getByText("001/FA/MKT/VIII/2026")).toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("cancel number calls voidRegistrationDraft and resets form", async () => {
    await navigateToNumberGenerated();

    const btn = screen.getByRole("button", { name: /Ubah Identitas/i });
    await act(async () => { fireEvent.click(btn); });

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Batalkan Nomor Surat?",
        variant: "destructive",
      })
    );

    expect(serviceMock.voidRegistrationDraft).toHaveBeenCalledWith(UUID.draft);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Nomor Dibatalkan" })
    );

    // Form reset
    expect(
      screen.getByRole("button", { name: /Dapatkan Nomor Surat/i })
    ).toBeInTheDocument();
    expect(screen.queryByText("001/FA/MKT/VIII/2026")).not.toBeInTheDocument();

    assertStrictServiceCalls();
  });

  it("cancel number shows error toast on failure", async () => {
    serviceMock.voidRegistrationDraft.mockRejectedValue(
      new Error("Network timeout")
    );

    await navigateToNumberGenerated();
    toastMock.mockClear();

    const btn = screen.getByRole("button", { name: /Ubah Identitas/i });
    await act(async () => { fireEvent.click(btn); });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        title: "Gagal membatalkan nomor",
        description: "Network timeout",
      })
    );
    assertStrictServiceCalls();
  });
});
