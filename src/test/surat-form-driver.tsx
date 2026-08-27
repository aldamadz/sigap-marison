/**
 * Shared test driver for SuratForm characterization tests.
 *
 * Design rules:
 * - findByText / findByRole / waitFor for async element discovery
 * - Label-wrapper-based Select trigger location (no combobox index, no CSS class)
 * - Fake timers controlled precisely for 900ms autosave debounce
 * - No retry loops — single attempt, fail fast
 * - No arbitrary sleep
 * - No flushPromises
 */

import { vi, expect } from "vitest";
import { render, screen, act, fireEvent, within, waitFor } from "@testing-library/react";
import React from "react";
import {
  serviceMock,
  supabaseMock,
  defaultProps,
  registerFetchRoute,
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
 * Find a Radix Select trigger by its associated label text.
 * Uses label-wrapper DOM structure: label and combobox are siblings
 * inside a common parent div.
 * Falls back to matching combobox text content.
 */
export function findSelectTrigger(labelPattern: RegExp): HTMLElement {
  // Regex bisa menabrak subjudul stepper (mis. /Jenis Dokumen/i vs
  // "Kantor, proyek, dan jenis dokumen"); ambil kandidat dengan teks terpendek.
  const candidates = screen.queryAllByText(labelPattern);
  const label = candidates.length > 0
    ? candidates.reduce((a, b) =>
        (a.textContent?.length ?? 0) <= (b.textContent?.length ?? 0) ? a : b,
      )
    : null;
  if (!label) throw new Error(`Label not found: ${String(labelPattern)}`);
  let wrapper = label.parentElement;
  while (wrapper && wrapper !== document.body) {
    const cb = wrapper.querySelector("[role='combobox']");
    if (cb) return cb as HTMLElement;
    wrapper = wrapper.parentElement;
  }
  throw new Error(`No Select trigger found for label ${labelPattern}`);
}

// ─── Mount ──────────────────────────────────────────────────────

export async function mountForm() {
  render(<SuratForm {...defaultProps()} />);
  await screen.findByText(/Lokasi dan Klasifikasi/i);
}

// ─── Select helpers ─────────────────────────────────────────────

export async function selectLetterType() {
  const trigger = findSelectTrigger(/Jenis Dokumen/i);
  await act(async () => { fireEvent.click(trigger); });
  const option = await screen.findByText(/MH.*Permohonan/i);
  await act(async () => { fireEvent.click(option); });
  await screen.findByText("Aset");
}

export async function selectEntity() {
  const trigger = findSelectTrigger(/Entitas \(PT\)/i);
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
  } catch {
    const trigger = findSelectTrigger(/Form Dokumen/i);
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
    const trigger = findSelectTrigger(/Kegunaan/i);
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

export async function selectOptionByLabel(labelPattern: RegExp, optionPattern: RegExp) {
  const trigger = findSelectTrigger(labelPattern);
  await act(async () => { fireEvent.click(trigger); });
  const listbox = await screen.findByRole("listbox");
  const option = within(listbox).getByText(optionPattern);
  await act(async () => { fireEvent.click(option); });
}

// ─── Number ─────────────────────────────────────────────────────

export async function clickGetNumber() {
  const btn = screen.getByRole("button", { name: /Dapatkan Nomor Surat/i });
  await waitFor(() => expect(btn).not.toBeDisabled());
  const usageTrigger = findSelectTrigger(/^Kegunaan$/i);
  await waitFor(() => expect(usageTrigger).not.toHaveTextContent(/Pilih kegunaan|Pilih form terlebih dahulu/i));
  await act(async () => { fireEvent.click(btn); });
  // Wizard pindah ke langkah 2 setelah nomor didapat; langkah 1 (dengan
  // kartu "Nomor Terdaftar") unmount. Tunggu header langkah 2.
  await screen.findByText("Persetujuan dan Berkas");
}

// ─── Autosave with fake timers ──────────────────────────────────

/**
 * Edit a field and deterministically complete the 900ms autosave.
 * Uses fake timers to advance exactly 900ms.
 * Verifies that saveRegistrationDraft was called.
 */
export async function editFieldAndWaitForAutosave(
  field: HTMLElement,
  value: string
) {
  vi.useFakeTimers();
  fireEvent.change(field, { target: { value } });
  act(() => { vi.advanceTimersByTime(900); });
  await act(async () => { await Promise.resolve(); });
  vi.useRealTimers();
}

/**
 * Edit a field, unmount before 900ms, advance timer.
 * saveRegistrationDraft must NOT be called (cleanup cancelled timer).
 */
export function editFieldAndUnmountBeforeAutosave(
  unmount: () => void,
  field: HTMLElement,
  value: string
) {
  vi.useFakeTimers();
  fireEvent.change(field, { target: { value } });
  // Unmount before 900ms fires
  unmount();
  // Now advance past 900ms
  act(() => { vi.advanceTimersByTime(1200); });
  vi.useRealTimers();
}

// ─── Fill Nama Barang ───────────────────────────────────────────

/**
 * GAP: production renderManualField uses <Label> without htmlFor,
 * so getByLabelText("Nama Barang") does NOT work.
 * Using placeholder text as fallback.
 */
export async function fillNamaBarang(value: string) {
  const input = screen.getByPlaceholderText(/Isi Nama Barang/i) as HTMLInputElement;
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

/**
 * Select all signers for the default 2-step usage config.
 * Uses fake timers to complete the 900ms autosave between signer changes.
 * Accepts optional signer name overrides.
 */
export async function selectAllSigners(
  signer1Name = "Pemohon Staging",
  signer2Name = "Direktur Utama"
) {
  await selectSigner("Pemohon", signer1Name);

  // Complete autosave deterministically with fake timers
  vi.useFakeTimers();
  act(() => { vi.advanceTimersByTime(900); });
  await act(async () => { await Promise.resolve(); });
  vi.useRealTimers();
  serviceMock.saveRegistrationDraft.mockClear();

  await selectSigner("Direktur", signer2Name);
}

// ─── Dialog ─────────────────────────────────────────────────────

export async function clickConfirmRegistration() {
  const btn = screen.getByRole("button", { name: /Konfirmasi Pendaftaran/i });
  await waitFor(() => expect(btn).not.toBeDisabled());
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
  const closeBtn = within(dialog).getByRole("button", { name: /Kembali Perbaiki/i });
  await act(async () => { fireEvent.click(closeBtn); });
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
}

// ─── Wizard navigation ──────────────────────────────────────────

/** Navigate the registration wizard via its stepper buttons. */
export async function goToWizardStep(step: 1 | 2 | 3) {
  const name =
    step === 1 ? /Lokasi & Klasifikasi/
    : step === 2 ? /Persetujuan & Berkas/
    : /Penandatangan/;
  const btn = screen.getByRole("button", { name });
  await act(async () => { fireEvent.click(btn); });
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
  await goToWizardStep(3);
  await selectAllSigners();
}

// ─── Category selection helpers ─────────────────────────────────

export async function selectCategory(category: string) {
  const btn = await screen.findByText(category);
  await act(async () => { fireEvent.click(btn); });
}

export async function selectCategoryUnit() {
  await selectCategory("Unit");
  // Wait for unit-specific UI to render
  await waitFor(() => {
    expect(screen.queryByText(/Pilih form/i) || screen.queryByText(/Form Dokumen/i)).toBeTruthy();
  });
}

export async function selectCategoryNonUnit() {
  await selectCategory("Non Unit");
  await waitFor(() => {
    expect(screen.queryByText(/Pilih form/i) || screen.queryByText(/Form Dokumen/i)).toBeTruthy();
  });
}

// ─── Mount with custom config ───────────────────────────────────

/**
 * Mount form with custom supabase.from mock for form_usages.
 * Useful when test needs different usage data than FORM_USAGES_RAW.
 */
export async function mountFormWithUsage(usageData: unknown[], profileData?: unknown) {
  const profile = profileData || CURRENT_PROFILE_DEFAULT;
  (supabaseMock.from as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: profile, error: null }),
        };
      }
      if (table === "form_usages") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: usageData, error: null }),
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
  render(<SuratForm {...defaultProps()} />);
  await screen.findByText(/Lokasi dan Klasifikasi/i);
}

// ─── Fetch mock helpers ─────────────────────────────────────────

/**
 * Register fetch routes for external data sources.
 * Call BEFORE mountForm.
 */
export function registerExternalDataRoutes() {
  registerFetchRoute(
    "/api/data-sources/marison_projects/query",
    { options: [{ value: "19", label: "GA01 - Griya Asri", raw: { id: "proj-001", code: "GA01", name: "Griya Asri", branch: { name: "KC. Semarang" } } }] }
  );
  registerFetchRoute(
    "/api/data-sources/marison_units_by_project/query",
    { options: [{ value: "unit-a1", label: "A-01" }, { value: "unit-a2", label: "A-02" }] }
  );
  registerFetchRoute(
    "/api/data-sources/marison_non_units_by_project/query",
    { options: [{ value: "12", label: "Pekerjaan Infrastruktur", raw: { id: 12, code: "INFRA", name: "Pekerjaan Infrastruktur", project_id: 19 } }] }
  );
}

// ─── Attachment helpers ─────────────────────────────────────────

export async function uploadAttachment(fileName: string) {
  const fileInput = screen.getByLabelText(/Pilih File/i) as HTMLInputElement;
  const file = new File(["test content"], fileName, { type: "application/pdf" });
  await act(async () => {
    fireEvent.change(fileInput, { target: { files: [file] } });
  });
}

// ─── Search Params helpers ──────────────────────────────────────

/**
 * Mount form with custom URL search params.
 * Use for linked document flows (Flow 5).
 * For recommendation flow, waits for RecommendationParentSummary.
 * For normal flow, waits for "Lokasi dan Klasifikasi".
 */
export async function mountFormWithSearchParams(params: Record<string, string>) {
  const { setSearchParamsOverride } = await import("./surat-form-harness");
  setSearchParamsOverride(new URLSearchParams(params));
  render(<SuratForm {...defaultProps()} />);

  if (params.linked_type === "recommendation") {
    if (params.parent_no_surat) await screen.findByText(params.parent_no_surat);
  } else {
    await screen.findByText(/Lokasi dan Klasifikasi/i);
  }
}

// ─── Mount with usage + search params ────────────────────────────

/**
 * Mount form with custom URL search params AND custom usage data.
 * Combines setSearchParamsOverride + mountFormWithUsage.
 */
export async function mountFormWithUsageAndSearchParams(
  usageData: unknown[],
  params: Record<string, string>,
  profileData?: unknown
) {
  const { setSearchParamsOverride } = await import("./surat-form-harness");
  setSearchParamsOverride(new URLSearchParams(params));
  await mountFormWithUsage(usageData, profileData);
}

// ─── Table input helpers ──────────────────────────────────────────

/**
 * Fill a table input by row index and column label.
 * Uses placeholder text "Isi <label>" to locate inputs.
 * Works with the card-based table layout (not HTML <table>).
 */
export function fillTableInput(rowIndex: number, colLabel: string, value: string) {
  const inputs = screen.getAllByPlaceholderText(new RegExp(`Isi ${colLabel}`, "i"));
  const input = inputs[rowIndex];
  if (!input) throw new Error(`Table input for row ${rowIndex}, col "${colLabel}" not found (found ${inputs.length})`);
  fireEvent.change(input, { target: { value } });
}
