import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent, cleanup, within } from "@testing-library/react";
import React from "react";
import {
  setupTestHarness, teardownTestHarness, serviceMock, supabaseMock, allowServiceCalls,
  assertStrictServiceCalls, flushPromises, toastMock, defaultProps,
} from "./surat-form-harness";
import {
  UUID, MASTER_DATA_DEFAULT, CURRENT_PROFILE_DEFAULT, FORM_USAGES_RAW,
  GENERATE_NO_SURAT_RESULT, CREATE_DRAFT_RESULT, buildDraftForRestore,
} from "./surat-form-fixtures";
import { SuratForm } from "@/components/surat/SuratForm";

beforeEach(() => {
  setupTestHarness();
  serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_DEFAULT);
  serviceMock.generateNoSurat.mockResolvedValue(GENERATE_NO_SURAT_RESULT);
  serviceMock.createRegistrationDraft.mockResolvedValue(CREATE_DRAFT_RESULT);
  serviceMock.saveRegistrationDraft.mockResolvedValue(undefined);
  serviceMock.getActiveRegistrationDrafts.mockResolvedValue([]);
  supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: UUID.user } } });
  (supabaseMock.from as unknown as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
    if (table === "profiles") return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: CURRENT_PROFILE_DEFAULT, error: null }) };
    if (table === "form_usages") return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: FORM_USAGES_RAW, error: null }) };
    return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }), in: vi.fn().mockReturnThis() };
  });
  allowServiceCalls("getMasterData", "getActiveRegistrationDrafts", "generateNoSurat", "createRegistrationDraft", "saveRegistrationDraft");
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
  try { const lb = screen.getByRole("listbox"); await act(async () => { fireEvent.click(within(lb).getByText(/PT-SIG/i)); await flushPromises(30); }); }
  catch { const all = screen.getAllByText(/PT-SIG/i); await act(async () => { fireEvent.click(all[all.length - 1]); await flushPromises(30); }); }
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

async function clickGetNumber() {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Dapatkan Nomor Surat/i })); await flushPromises(80); });
}

describe("Flow 6: Draft Lifecycle", () => {
  it("autosave triggers after field edit with 900ms debounce", async () => {
    // Setup without fake timers first
    await mountForm();
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await selectFormAndUsage();
    await clickGetNumber();

    // Verify saveRegistrationDraft NOT called yet
    expect(serviceMock.saveRegistrationDraft).not.toHaveBeenCalled();

    // Edit perihal to trigger autosave
    const perihal = screen.getByPlaceholderText(/Contoh.*Permohonan/i);
    await act(async () => {
      fireEvent.change(perihal, { target: { value: "Judul Manual" } });
    });

    // Wait for debounce (900ms) + buffer
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1200));
    });

    // saveRegistrationDraft should have been called
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
    await mountForm();
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await selectFormAndUsage();
    await clickGetNumber();

    toastMock.mockClear();

    const perihal = screen.getByPlaceholderText(/Contoh.*Permohonan/i);
    await act(async () => {
      fireEvent.change(perihal, { target: { value: "Judul Manual" } });
    });

    // Wait for autosave to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1200));
    });

    // "Perubahan tersimpan otomatis" should be visible
    expect(screen.getByText(/Perubahan tersimpan otomatis/i)).toBeInTheDocument();

    assertStrictServiceCalls();
  });

  it("draft number persists after autosave", async () => {
    await mountForm();
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await selectFormAndUsage();
    await clickGetNumber();

    const perihal = screen.getByPlaceholderText(/Contoh.*Permohonan/i);
    await act(async () => {
      fireEvent.change(perihal, { target: { value: "Judul Manual" } });
    });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1200));
    });

    // Number should still be displayed
    expect(screen.getByText("001/FA/MKT/VIII/2026")).toBeInTheDocument();
    expect(screen.getByText(/Nomor Terdaftar/i)).toBeInTheDocument();

    assertStrictServiceCalls();
  });
});
