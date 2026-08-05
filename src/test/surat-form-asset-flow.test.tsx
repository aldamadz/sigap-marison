/**
 * Flow 1: Aset Tanpa Rekomendasi
 *
 * Characterization test — captures current behavior before refactor.
 * All service calls are mocked. No network, no Supabase staging.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, cleanup, within } from "@testing-library/react";
import React from "react";
import {
  setupTestHarness,
  teardownTestHarness,
  serviceMock,
  supabaseMock,
  allowServiceCalls,
  assertStrictServiceCalls,
  flushPromises,
  toastMock,
  onSuccessMock,
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

// ─── Helpers ────────────────────────────────────────────────────

async function mountForm() {
  render(<SuratForm {...defaultProps()} />);
  await act(async () => { await flushPromises(50); });
}

function getComboboxes() {
  return screen.getAllByRole("combobox");
}

async function selectEntity() {
  // Select Entitas (PT) — combobox index 1 (after office=0)
  const combo = getComboboxes()[1];
  await act(async () => {
    fireEvent.click(combo);
    await flushPromises(200);
  });
  try {
    const listbox = screen.getByRole("listbox");
    const option = within(listbox).getByText(/PT-SIG/i);
    await act(async () => {
      fireEvent.click(option);
      await flushPromises(30);
    });
  } catch {
    const all = screen.getAllByText(/PT-SIG/i);
    if (all.length > 0) {
      await act(async () => {
        fireEvent.click(all[all.length - 1]);
        await flushPromises(30);
      });
    }
  }
}

async function selectLetterType() {
  // comboboxes[3] = Jenis Dokumen (after office=0, entity=1, dept=2)
  const combo = getComboboxes()[3];
  await act(async () => {
    fireEvent.click(combo);
    await flushPromises(10);
  });
  const option = screen.getByText(/MH.*Permohonan/i);
  await act(async () => {
    fireEvent.click(option);
    await flushPromises(30);
  });
}

async function selectCategoryAset() {
  await act(async () => {
    fireEvent.click(screen.getByText("Aset"));
    await flushPromises(30);
  });
}

async function selectFormAndUsage() {
  // After category selected, 2 new Selects appear: Form Dokumen + Kegunaan
  // They are the last 2 comboboxes
  const combos = getComboboxes();
  const formTrigger = combos[combos.length - 2]; // Form Dokumen
  const usageTrigger = combos[combos.length - 1]; // Kegunaan

  // Select Form — click trigger, then click the option in the listbox
  await act(async () => {
    fireEvent.click(formTrigger);
    await flushPromises(200);
  });

  // Radix Select renders options in a portal with role="listbox"
  // Find the listbox, then find the option inside it
  let formClicked = false;
  try {
    const listbox = screen.getByRole("listbox");
    const option = within(listbox).getByText(/FORM PERMOHONAN ASET/i);
    await act(async () => {
      fireEvent.click(option);
      await flushPromises(30);
    });
    formClicked = true;
  } catch {
    // Fallback: try getAllByText and pick the portal one (last in DOM)
    const all = screen.getAllByText(/FORM PERMOHONAN ASET/i);
    if (all.length > 0) {
      await act(async () => {
        fireEvent.click(all[all.length - 1]);
        await flushPromises(30);
      });
      formClicked = true;
    }
  }
  if (!formClicked) throw new Error("Could not click FORM PERMOHONAN ASET option");

  // Select Usage — click trigger, then click the option
  await act(async () => {
    fireEvent.click(usageTrigger);
    await flushPromises(200);
  });

  let usageClicked = false;
  try {
    const listbox = screen.getByRole("listbox");
    const option = within(listbox).getByText(/Permohonan Aset/i);
    await act(async () => {
      fireEvent.click(option);
      await flushPromises(30);
    });
    usageClicked = true;
  } catch {
    const all = screen.getAllByText(/Permohonan Aset/i);
    if (all.length > 0) {
      await act(async () => {
        fireEvent.click(all[all.length - 1]);
        await flushPromises(30);
      });
      usageClicked = true;
    }
  }
  if (!usageClicked) throw new Error("Could not click Permohonan Aset option");
}

async function clickGetNumber() {
  const btn = screen.getByRole("button", { name: /Dapatkan Nomor Surat/i });
  await act(async () => {
    fireEvent.click(btn);
    await flushPromises(80);
  });
}

async function selectSignerInPopover(signerSection: HTMLElement, stepIndex: number, userName: string) {
  // Each signer step has a button showing "Pilih {label_jabatan}..." or selected user name
  // These buttons are inside the Popover and have class "justify-between"
  const allButtons = Array.from(signerSection.querySelectorAll("button"));
  // Filter to the signer selection buttons — they have text like "Pilih Pemohon..."
  const signerButtons = allButtons.filter(btn => {
    const text = btn.textContent || "";
    return text.includes("Pilih") || btn.className.includes("justify-between");
  });

  const trigger = signerButtons[stepIndex];
  if (!trigger) throw new Error(`Signer trigger at step ${stepIndex} not found`);
  await act(async () => {
    fireEvent.click(trigger);
    await flushPromises(200);
  });

  // The CommandList renders in a Popover portal
  // Find the user by text - search in the entire document (portal)
  const commandItems = screen.getAllByText(userName);
  // Click the one inside a CommandItem (has data attributes from cmdk)
  const target = commandItems.find(el =>
    el.closest("[cmdk-item]") || el.closest('[role="option"]')
  ) || commandItems[0];

  await act(async () => {
    fireEvent.click(target);
    await flushPromises(30);
  });
}

async function clickConfirmRegistration() {
  const btn = screen.getByRole("button", { name: /Konfirmasi Pendaftaran/i });
  await act(async () => {
    fireEvent.click(btn);
    await flushPromises(30);
  });
}

async function submitFromDialog() {
  const dialog = screen.getByRole("dialog");
  // Find the confirm button — it's the primary button in the dialog footer
  const buttons = within(dialog).getAllByRole("button");
  const confirmBtn = buttons.find(btn =>
    btn.textContent?.includes("Daftarkan") || btn.className.includes("bg-primary")
  ) || buttons[buttons.length - 1];

  await act(async () => {
    fireEvent.click(confirmBtn);
    await flushPromises(80);
  });
}

// ─── Test Suite ─────────────────────────────────────────────────

describe("Flow 1: Aset Tanpa Rekomendasi", () => {
  beforeEach(() => {
    setupTestHarness();

    serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_DEFAULT);
    serviceMock.generateNoSurat.mockResolvedValue(GENERATE_NO_SURAT_RESULT);
    serviceMock.createRegistrationDraft.mockResolvedValue(CREATE_DRAFT_RESULT);
    serviceMock.createRegistrasi.mockResolvedValue(CREATE_REGISTRASI_RESULT);
    serviceMock.finishRegistrationDraft.mockResolvedValue(undefined);

    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: UUID.user } },
    });

    (supabaseMock.from as unknown as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
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
    });

    allowServiceCalls(
      "getMasterData",
      "getActiveRegistrationDrafts",
      "generateNoSurat",
      "createRegistrationDraft",
      "createRegistrasi",
      "finishRegistrationDraft",
    );
  });

  afterEach(() => {
    cleanup();
    teardownTestHarness();
  });

  it("renders location section on mount", async () => {
    await mountForm();
    expect(screen.getByText(/Lokasi dan Klasifikasi/i)).toBeInTheDocument();
    expect(screen.getByText(/Kantor Penerbit/i)).toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("shows category buttons after selecting letter type", async () => {
    await mountForm();
    await selectLetterType();
    expect(screen.getByText("Aset")).toBeInTheDocument();
    expect(screen.getByText("Unit")).toBeInTheDocument();
    expect(screen.getByText("Non Unit")).toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("shows form/usage selectors after clicking Aset", async () => {
    await mountForm();
    await selectLetterType();
    await selectCategoryAset();
    expect(screen.getByText("Form Dokumen")).toBeInTheDocument();
    expect(screen.getByText("Kegunaan")).toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("calls generateNoSurat and createRegistrationDraft on get number", async () => {
    await mountForm();
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await selectFormAndUsage();
    await clickGetNumber();

    expect(serviceMock.generateNoSurat).toHaveBeenCalledTimes(1);
    expect(serviceMock.createRegistrationDraft).toHaveBeenCalledTimes(1);

    const generateArg = serviceMock.generateNoSurat.mock.calls[0][0];
    expect(generateArg.office_id).toBe(UUID.office_pusat);
    expect(generateArg.dept_id).toBe(UUID.dept_pbo);
    expect(generateArg.form_input_data.request_category).toBe("asset");

    const draftArg = serviceMock.createRegistrationDraft.mock.calls[0][0];
    expect(draftArg.noUrut).toBe(1);
    expect(draftArg.noSurat).toBe("001/FA/MKT/VIII/2026");
    expect(draftArg.payload.selectedFormId).toBe(UUID.form_a);
    expect(draftArg.payload.selectedUsageId).toBe(UUID.form_usage);

    assertStrictServiceCalls();
  });

  it("shows registered number and toast after get number", async () => {
    await mountForm();
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await selectFormAndUsage();
    await clickGetNumber();

    expect(screen.getByText("001/FA/MKT/VIII/2026")).toBeInTheDocument();
    expect(screen.getByText(/Nomor Terdaftar/i)).toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Nomor Berhasil Didapatkan" })
    );
    assertStrictServiceCalls();
  });

  it("shows sections 2 and 3 after number generation", async () => {
    await mountForm();
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await selectFormAndUsage();
    await clickGetNumber();

    expect(screen.getByText(/Persetujuan dan Berkas/i)).toBeInTheDocument();
    expect(screen.getByText(/Pejabat Penandatangan/i)).toBeInTheDocument();
    expect(screen.getByText("Pemohon")).toBeInTheDocument();
    expect(screen.getByText("Direktur")).toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("full happy path: get number → fill → signer → submit", async () => {
    await mountForm();
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await selectFormAndUsage();
    await clickGetNumber();

    // Fill Nama Barang field — find the Input sibling of the label's container
    const nameLabel = screen.getByText(/Nama Barang/i);
    const fieldContainer = nameLabel.closest("[class*='rounded-lg']") || nameLabel.closest("div")?.parentElement?.parentElement?.parentElement;
    const nameField = fieldContainer?.querySelector("input") as HTMLInputElement;
    expect(nameField).toBeTruthy();
    await act(async () => {
      fireEvent.change(nameField, { target: { value: "Printer Epson" } });
      await flushPromises(10);
    });

    // Select signers
    const signerSection = screen.getByText(/Pejabat Penandatangan/i).closest("section")!;
    await selectSignerInPopover(signerSection, 0, "Pemohon Staging");
    await selectSignerInPopover(signerSection, 1, "Direktur Utama");

    // Click Konfirmasi Pendaftaran
    await clickConfirmRegistration();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Submit
    await submitFromDialog();

    // Verify createRegistrasi was called
    expect(serviceMock.createRegistrasi).toHaveBeenCalledTimes(1);
    const submitArg = serviceMock.createRegistrasi.mock.calls[0][0];
    expect(submitArg.no_surat).toBe("001/FA/MKT/VIII/2026");
    expect(submitArg.form_input_data.nama_barang).toBe("Printer Epson");
    expect(submitArg.form_input_data.request_category).toBe("asset");

    // Verify finishRegistrationDraft
    expect(serviceMock.finishRegistrationDraft).toHaveBeenCalledWith(UUID.draft, "SUBMITTED");

    // Verify success
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Pendaftaran Berhasil" }));
    expect(onSuccessMock).toHaveBeenCalledWith("001/FA/MKT/VIII/2026", expect.any(String));

    assertStrictServiceCalls();
  });
});
