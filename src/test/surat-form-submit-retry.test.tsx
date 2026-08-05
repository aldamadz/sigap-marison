import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent, cleanup, within } from "@testing-library/react";
import React from "react";
import {
  setupTestHarness, teardownTestHarness, serviceMock, supabaseMock, allowServiceCalls,
  assertStrictServiceCalls, flushPromises, createDeferred, toastMock, onSuccessMock, defaultProps,
} from "./surat-form-harness";
import {
  UUID, MASTER_DATA_DEFAULT, CURRENT_PROFILE_DEFAULT, FORM_USAGES_RAW,
  GENERATE_NO_SURAT_RESULT, CREATE_DRAFT_RESULT, CREATE_REGISTRASI_RESULT,
} from "./surat-form-fixtures";
import { SuratForm } from "@/components/surat/SuratForm";

beforeEach(() => {
  setupTestHarness();
  serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_DEFAULT);
  serviceMock.generateNoSurat.mockResolvedValue(GENERATE_NO_SURAT_RESULT);
  serviceMock.createRegistrationDraft.mockResolvedValue(CREATE_DRAFT_RESULT);
  serviceMock.createRegistrasi.mockResolvedValue(CREATE_REGISTRASI_RESULT);
  serviceMock.finishRegistrationDraft.mockResolvedValue(undefined);
  serviceMock.saveRegistrationDraft.mockResolvedValue(undefined);
  serviceMock.getActiveRegistrationDrafts.mockResolvedValue([]);
  supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: UUID.user } } });
  (supabaseMock.from as unknown as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
    if (table === "profiles") return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: CURRENT_PROFILE_DEFAULT, error: null }) };
    if (table === "form_usages") return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: FORM_USAGES_RAW, error: null }) };
    return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }), in: vi.fn().mockReturnThis() };
  });
  allowServiceCalls("getMasterData", "getActiveRegistrationDrafts", "generateNoSurat", "createRegistrationDraft", "createRegistrasi", "finishRegistrationDraft", "saveRegistrationDraft");
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

async function getNumber() {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Dapatkan Nomor Surat/i })); await flushPromises(80); });
}

async function fillNamaBarang(value: string) {
  const nameLabel = screen.getByText(/Nama Barang/i);
  const fieldContainer = nameLabel.closest("[class*='rounded-lg']") || nameLabel.closest("div")?.parentElement?.parentElement?.parentElement;
  const nameField = fieldContainer?.querySelector("input") as HTMLInputElement;
  await act(async () => { fireEvent.change(nameField, { target: { value } }); });
  // Wait for 900ms autosave debounce to fire and complete
  await act(async () => { await flushPromises(1200); });
}

async function selectSigner(stepIndex: number, userName: string) {
  const signerSection = screen.getByText(/Pejabat Penandatangan/i).closest("section")!;
  const allButtons = Array.from(signerSection.querySelectorAll("button"));
  const signerButtons = allButtons.filter(btn => (btn.textContent || "").includes("Pilih") || btn.className.includes("justify-between"));
  await act(async () => { fireEvent.click(signerButtons[stepIndex]); await flushPromises(200); });

  // Wait for CommandList portal items to render, then find user by text
  await act(async () => { await flushPromises(100); });
  const commandItems = screen.getAllByText(userName);
  const target = commandItems.find(el =>
    el.closest("[cmdk-item]") || el.closest('[role="option"]')
  ) || commandItems[commandItems.length - 1];
  await act(async () => { fireEvent.click(target); await flushPromises(30); });
}

async function clickConfirmRegistration() {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Konfirmasi Pendaftaran/i })); await flushPromises(80); });
}

/** Submit from the open dialog — finds "Daftarkan" button */
async function submitFromDialog() {
  const dialog = screen.getByRole("dialog");
  const buttons = within(dialog).getAllByRole("button");
  const confirmBtn = buttons.find(btn => (btn.textContent || "").includes("Daftarkan")) || buttons[buttons.length - 1];
  await act(async () => { fireEvent.click(confirmBtn); await flushPromises(80); });
}

/** Close dialog via the X button */
async function closeDialog() {
  const dialog = screen.getByRole("dialog");
  const closeBtn = within(dialog).getByRole("button", { name: /Close/i });
  await act(async () => { fireEvent.click(closeBtn); await flushPromises(50); });
}

async function setupReadyForm() {
  await mountForm();
  await selectLetterType();
  await selectEntity();
  await selectCategoryAset();
  await selectFormAndUsage();
  await getNumber();
  await fillNamaBarang("Printer Epson");
  await selectSigner(0, "Pemohon Staging");
  await selectSigner(1, "Direktur Utama");
}

describe("Flow 13: Submit Retry", () => {
  it("submit failure shows error toast and keeps form intact", async () => {
    serviceMock.createRegistrasi.mockRejectedValue(new Error("Server error 500"));

    await setupReadyForm();
    await clickConfirmRegistration();
    await submitFromDialog();

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive", title: "Gagal Menyimpan" })
    );

    // Form still shows number (may appear in both form header and dialog)
    expect(screen.getAllByText("001/FA/MKT/VIII/2026").length).toBeGreaterThanOrEqual(1);
    expect(serviceMock.createRegistrasi).toHaveBeenCalledTimes(1);
    expect(serviceMock.finishRegistrationDraft).not.toHaveBeenCalled();

    assertStrictServiceCalls();
  });

  it("retry after failure succeeds", async () => {
    serviceMock.createRegistrasi
      .mockRejectedValueOnce(new Error("Server error"))
      .mockResolvedValueOnce(CREATE_REGISTRASI_RESULT);

    await setupReadyForm();

    // First attempt — open dialog and submit (fails)
    await clickConfirmRegistration();
    await submitFromDialog();

    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Gagal Menyimpan" }));
    expect(serviceMock.createRegistrasi).toHaveBeenCalledTimes(1);

    // Close the dialog via Close button
    await closeDialog();
    await act(async () => { await flushPromises(80); });

    // Retry — reopen dialog and submit again
    await clickConfirmRegistration();
    await submitFromDialog();

    expect(serviceMock.createRegistrasi).toHaveBeenCalledTimes(2);
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Pendaftaran Berhasil" }));
    expect(onSuccessMock).toHaveBeenCalled();
    expect(serviceMock.finishRegistrationDraft).toHaveBeenCalledWith(UUID.draft, "SUBMITTED");

    assertStrictServiceCalls();
  });

  it("double-click prevention calls createRegistrasi only once", async () => {
    const deferred = createDeferred<typeof CREATE_REGISTRASI_RESULT>();
    serviceMock.createRegistrasi.mockReturnValue(deferred.promise);

    await setupReadyForm();

    // Open confirm dialog
    await clickConfirmRegistration();

    const dialog = screen.getByRole("dialog");
    const buttons = within(dialog).getAllByRole("button");
    const confirmBtn = buttons.find(btn => (btn.textContent || "").includes("Daftarkan")) || buttons[buttons.length - 1];

    // Double-click: two rapid clicks on confirm
    await act(async () => {
      fireEvent.click(confirmBtn);
      fireEvent.click(confirmBtn);
    });

    // createRegistrasi should be called only once despite double-click
    expect(serviceMock.createRegistrasi).toHaveBeenCalledTimes(1);

    // Resolve the deferred
    await act(async () => {
      deferred.resolve(CREATE_REGISTRASI_RESULT);
      await flushPromises(80);
    });

    expect(onSuccessMock).toHaveBeenCalled();
    assertStrictServiceCalls();
  });
});
