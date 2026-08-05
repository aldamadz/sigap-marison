import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent, cleanup, within } from "@testing-library/react";
import React from "react";
import {
  setupTestHarness, teardownTestHarness, serviceMock, supabaseMock, allowServiceCalls,
  assertStrictServiceCalls, flushPromises, confirmMock, toastMock, defaultProps,
} from "./surat-form-harness";
import {
  UUID, MASTER_DATA_DEFAULT, CURRENT_PROFILE_DEFAULT, FORM_USAGES_RAW,
  GENERATE_NO_SURAT_RESULT, CREATE_DRAFT_RESULT,
} from "./surat-form-fixtures";
import { SuratForm } from "@/components/surat/SuratForm";

beforeEach(() => {
  setupTestHarness();
  serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_DEFAULT);
  serviceMock.generateNoSurat.mockResolvedValue(GENERATE_NO_SURAT_RESULT);
  serviceMock.createRegistrationDraft.mockResolvedValue(CREATE_DRAFT_RESULT);
  serviceMock.voidRegistrationDraft.mockResolvedValue(undefined);
  serviceMock.getActiveRegistrationDrafts.mockResolvedValue([]);
  supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: UUID.user } } });
  (supabaseMock.from as unknown as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
    if (table === "profiles") return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: CURRENT_PROFILE_DEFAULT, error: null }) };
    if (table === "form_usages") return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: FORM_USAGES_RAW, error: null }) };
    return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }), in: vi.fn().mockReturnThis() };
  });
  allowServiceCalls("getMasterData", "getActiveRegistrationDrafts", "generateNoSurat", "createRegistrationDraft", "voidRegistrationDraft");
});

afterEach(() => { cleanup(); teardownTestHarness(); });

async function mountForm() { render(<SuratForm {...defaultProps()} />); await act(async () => { await flushPromises(50); }); }

async function selectLetterType() {
  const combo = screen.getAllByRole("combobox")[3];
  await act(async () => { fireEvent.click(combo); await flushPromises(10); });
  await act(async () => { fireEvent.click(screen.getByText(/MH.*Permohonan/i)); await flushPromises(30); });
}

async function selectEntity() {
  await act(async () => { fireEvent.click(screen.getAllByRole("combobox")[1]); await flushPromises(200); });
  try {
    const lb = screen.getByRole("listbox");
    await act(async () => { fireEvent.click(within(lb).getByText(/PT-SIG/i)); await flushPromises(30); });
  } catch { const all = screen.getAllByText(/PT-SIG/i); await act(async () => { fireEvent.click(all[all.length - 1]); await flushPromises(30); }); }
}

async function selectCategoryAset() { await act(async () => { fireEvent.click(screen.getByText("Aset")); await flushPromises(30); }); }

async function selectFormAndUsage() {
  const combos = screen.getAllByRole("combobox");
  await act(async () => { fireEvent.click(combos[combos.length - 2]); await flushPromises(200); });
  const lb1 = screen.getByRole("listbox");
  await act(async () => { fireEvent.click(within(lb1).getByText(/FORM PERMOHONAN ASET/i)); await flushPromises(50); });
  const c2 = screen.getAllByRole("combobox");
  await act(async () => { fireEvent.click(c2[c2.length - 1]); await flushPromises(200); });
  const lb2 = screen.getByRole("listbox");
  await act(async () => { fireEvent.click(within(lb2).getByText(/Permohonan Aset/i)); await flushPromises(50); });
}

async function getNumber() {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Dapatkan Nomor Surat/i })); await flushPromises(80); });
}

describe("Flow 7: Number Lifecycle", () => {
  it("shows Ubah Identitas button after number is generated", async () => {
    await mountForm();
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await selectFormAndUsage();
    await getNumber();

    expect(screen.getByRole("button", { name: /Ubah Identitas/i })).toBeInTheDocument();
    expect(screen.getByText("001/FA/MKT/VIII/2026")).toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("cancel number calls voidRegistrationDraft and resets form", async () => {
    await mountForm();
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await selectFormAndUsage();
    await getNumber();

    // Click Ubah Identitas
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Ubah Identitas/i }));
      await flushPromises(80);
    });

    // Verify confirm dialog was called
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Batalkan Nomor Surat?",
        variant: "destructive",
      })
    );

    // Verify voidRegistrationDraft was called
    expect(serviceMock.voidRegistrationDraft).toHaveBeenCalledWith(UUID.draft);

    // Verify toast
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Nomor Dibatalkan" }));

    // Verify form reset — Dapatkan Nomor Surat button reappears
    expect(screen.getByRole("button", { name: /Dapatkan Nomor Surat/i })).toBeInTheDocument();
    expect(screen.queryByText("001/FA/MKT/VIII/2026")).not.toBeInTheDocument();

    assertStrictServiceCalls();
  });

  it("cancel number shows error toast on failure", async () => {
    serviceMock.voidRegistrationDraft.mockRejectedValue(new Error("Network timeout"));

    await mountForm();
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await selectFormAndUsage();
    await getNumber();

    toastMock.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Ubah Identitas/i }));
      await flushPromises(80);
    });

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
