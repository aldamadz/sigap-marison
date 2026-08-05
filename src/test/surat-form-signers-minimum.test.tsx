import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent, cleanup, within } from "@testing-library/react";
import React from "react";
import {
  setupTestHarness, teardownTestHarness, serviceMock, supabaseMock, allowServiceCalls,
  assertStrictServiceCalls, flushPromises, defaultProps,
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
  serviceMock.getActiveRegistrationDrafts.mockResolvedValue([]);
  supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: UUID.user } } });
  (supabaseMock.from as unknown as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
    if (table === "profiles") return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: CURRENT_PROFILE_DEFAULT, error: null }) };
    if (table === "form_usages") return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: FORM_USAGES_RAW, error: null }) };
    return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }), in: vi.fn().mockReturnThis() };
  });
  allowServiceCalls("getMasterData", "getActiveRegistrationDrafts", "generateNoSurat", "createRegistrationDraft");
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

describe("Flow 9: Signer Minimum", () => {
  it("signers build from usage config with correct role names", async () => {
    await mountForm();
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await selectFormAndUsage();
    await getNumber();

    const signerSection = screen.getByText(/Pejabat Penandatangan/i).closest("section")!;
    expect(within(signerSection).getByText("Pemohon")).toBeInTheDocument();
    expect(within(signerSection).getByText("Direktur")).toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("signer count matches usage config steps", async () => {
    await mountForm();
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await selectFormAndUsage();
    await getNumber();

    // Count signer selection buttons (those with "Pilih" text)
    const signerSection = screen.getByText(/Pejabat Penandatangan/i).closest("section")!;
    const allButtons = Array.from(signerSection.querySelectorAll("button"));
    const signerButtons = allButtons.filter(btn => {
      const text = btn.textContent || "";
      return text.includes("Pilih") || text.includes("Pilih ");
    });

    // USAGE_DETAIL_DEFAULT has 2 steps (step1 = Pemohon, step2 = Direktur)
    expect(signerButtons).toHaveLength(2);
    assertStrictServiceCalls();
  });

  it("each signer shows placeholder when no user selected", async () => {
    await mountForm();
    await selectLetterType();
    await selectEntity();
    await selectCategoryAset();
    await selectFormAndUsage();
    await getNumber();

    expect(screen.getByText(/Pilih Pemohon\.\.\./i)).toBeInTheDocument();
    expect(screen.getByText(/Pilih Direktur\.\.\./i)).toBeInTheDocument();
    assertStrictServiceCalls();
  });
});
