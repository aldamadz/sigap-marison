/**
 * Shared test driver for SuratForm characterization tests.
 *
 * Design rules:
 * - findByText / findByRole / waitFor for async element discovery
 * - Text-based or value-based element location (no combobox index, no CSS class)
 * - Fake timers controlled precisely for 900ms autosave debounce
 * - No retry loops — single attempt, fail fast
 * - No arbitrary sleep
 */

import { vi, expect } from "vitest";
import { render, screen, act, fireEvent, within, waitFor } from "@testing-library/react";
import React from "react";
import {
  serviceMock,
  supabaseMock,
  toastMock,
  defaultProps,
} from "./surat-form-harness";
import {
  UUID,
  MASTER_DATA_DEFAULT,
  CURRENT_PROFILE_DEFAULT,
  FORM_USAGES_RAW,
  GENERATE_NO_SURAT_RESULT,
  CREATE_DRAFT_RESULT,
  CREATE_REGISTRASI_RESULT,
} from "./surat-form-fixtures";
import { SuratForm } from "@/components/surat/SuratForm";

// ─── Standard mock configuration ────────────────────────────────

export function configureStandardMocks() {
  serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_DEFAULT);
  serviceMock.generateNoSurat.mockResolvedValue(GENERATE_NO_SURAT_RESULT);
  serviceMock.createRegistrationDraft.mockResolvedValue(CREATE_DRAFT_RESULT);
  serviceMock.createRegistrasi.mockResolvedValue(CREATE_REGISTRASI_RESULT);
  serviceMock.finishRegistrationDraft.mockResolvedValue(undefined);
  serviceMock.saveRegistrationDraft.mockResolvedValue(undefined);
  serviceMock.voidRegistrationDraft.mockResolvedValue(undefined);
  serviceMock.getActiveRegistrationDrafts.mockResolvedValue([]);

  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: UUID.user } },
  });

  (supabaseMock.from as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: CURRENT_PROFILE_DEFAULT, error: null }),
        };
      }
      if (table === "form_usages") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: FORM_USAGES_RAW, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        in: vi.fn().mockReturnThis(),
      };
    }
  );
}

// ─── Element location helpers ───────────────────────────────────

/**
 * Find a Radix Select trigger by its displayed text (placeholder or selected value).
 * Falls back to finding by label if text match fails.
 */
function findSelectTrigger(pattern: RegExp): HTMLElement {
  // Try matching by displayed text inside combobox
  const comboboxes = screen.getAllByRole("combobox");
  for (const cb of comboboxes) {
    if (pattern.test(cb.textContent || "")) return cb;
  }
  throw new Error(`No combobox with text matching ${pattern}`);
}

// ─── Mount ──────────────────────────────────────────────────────

export async function mountForm() {
  render(<SuratForm {...defaultProps()} />);
  await screen.findByText(/Lokasi dan Klasifikasi/i);
}

// ─── Select helpers ─────────────────────────────────────────────

export async function selectLetterType() {
  const trigger = findSelectTrigger(/Pilih Jenis/i);
  await act(async () => { fireEvent.click(trigger); });
  const option = await screen.findByText(/MH.*Permohonan/i);
  await act(async () => { fireEvent.click(option); });
  await screen.findByText("Aset");
}

export async function selectEntity() {
  const trigger = findSelectTrigger(/Pilih PT/i);
  await act(async () => { fireEvent.click(trigger); });
  const listbox = await screen.findByRole("listbox");
  const option = within(listbox).getByText(/PT-SIG/i);
  await act(async () => { fireEvent.click(option); });
}

export async function selectCategoryAset() {
  const btn = await screen.findByText("Aset");
  await act(async () => { fireEvent.click(btn); });
  await screen.findByText("Form Dokumen");
}

export async function selectForm() {
  // If only one form is available, it auto-selects. Check first.
  try {
    screen.getByText(/FORM PERMOHONAN ASET/i);
    // Already selected — skip click
  } catch {
    const trigger = findSelectTrigger(/Pilih form/i);
    await act(async () => { fireEvent.click(trigger); });
    const listbox = await screen.findByRole("listbox");
    const option = within(listbox).getByText(/FORM PERMOHONAN ASET/i);
    await act(async () => { fireEvent.click(option); });
  }
  await screen.findByText("Kegunaan");
}

export async function selectUsage() {
  const matches = screen.queryAllByText(/Permohonan Aset/i);
  const alreadySelected = matches.some(
    el => el.closest("[role='combobox']") !== null
  );
  if (!alreadySelected) {
    const trigger = findSelectTrigger(/Pilih kegunaan/i);
    await act(async () => { fireEvent.click(trigger); });
    const listbox = await screen.findByRole("listbox");
    const option = within(listbox).getByText(/Permohonan Aset/i);
    await act(async () => { fireEvent.click(option); });
  }
}

export async function selectFormAndUsage() {
  await selectForm();
  await selectUsage();
}

// ─── Number ─────────────────────────────────────────────────────

export async function clickGetNumber() {
  const btn = screen.getByRole("button", { name: /Dapatkan Nomor Surat/i });
  await act(async () => {
    fireEvent.click(btn);
  });
  await screen.findByText(/Nomor Terdaftar/i);
}

// ─── Autosave with fake timers ──────────────────────────────────

export async function editFieldAndWaitForAutosave(
  field: HTMLElement,
  value: string
) {
  vi.useFakeTimers();
  fireEvent.change(field, { target: { value } });
  act(() => {
    vi.advanceTimersByTime(900);
  });
  await act(async () => {
    await Promise.resolve();
  });
  vi.useRealTimers();
}

// ─── Fill Nama Barang ───────────────────────────────────────────

export async function fillNamaBarang(value: string) {
  const label = screen.getByText("Nama Barang");
  const card = label.closest("[class*='rounded-lg']");
  const input = card?.querySelector("input") as HTMLInputElement;
  if (!input) throw new Error("Nama Barang input not found");
  fireEvent.change(input, { target: { value } });
}

// ─── Signer selection ───────────────────────────────────────────

export async function selectSigner(stepLabel: string, userName: string) {
  const trigger = await screen.findByRole("button", {
    name: new RegExp(`Pilih ${stepLabel}`),
  });
  await act(async () => { fireEvent.click(trigger); });
  const userOption = await screen.findByText(userName);
  await act(async () => { fireEvent.click(userOption); });
}

export async function selectAllSigners() {
  await selectSigner("Pemohon", "Pemohon Staging");
  await waitFor(() => {
    expect(serviceMock.saveRegistrationDraft).toHaveBeenCalled();
  });
  serviceMock.saveRegistrationDraft.mockClear();
  await selectSigner("Direktur", "Direktur Utama");
}

// ─── Dialog ─────────────────────────────────────────────────────

export async function clickConfirmRegistration() {
  const btn = screen.getByRole("button", { name: /Konfirmasi Pendaftaran/i });
  await act(async () => { fireEvent.click(btn); });
  await screen.findByRole("dialog");
}

export async function submitFromDialog() {
  const dialog = screen.getByRole("dialog");
  const confirmBtn = within(dialog).getByRole("button", { name: /Daftarkan/i });
  await act(async () => { fireEvent.click(confirmBtn); });
}

export async function closeDialog() {
  const dialog = screen.getByRole("dialog");
  const closeBtn = within(dialog).getAllByRole("button").find(
    btn => !btn.textContent?.includes("Daftarkan")
  );
  if (closeBtn) await act(async () => { fireEvent.click(closeBtn); });
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
}

// ─── Full flow helpers ──────────────────────────────────────────

export async function navigateToNumberReady() {
  await mountForm();
  await selectLetterType();
  await selectEntity();
  await selectCategoryAset();
  await selectFormAndUsage();
}

export async function navigateToNumberGenerated() {
  await navigateToNumberReady();
  await clickGetNumber();
}

export async function navigateToReadyToSubmit() {
  await navigateToNumberGenerated();
  await fillNamaBarang("Printer Epson");
  await selectAllSigners();
}
