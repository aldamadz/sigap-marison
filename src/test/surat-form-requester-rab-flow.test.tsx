import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { setupTestHarness, teardownTestHarness, allowServiceCalls, assertStrictServiceCalls, serviceMock } from "./surat-form-harness";
import { CURRENT_PROFILE_KC, FUND_FORM_USAGE_RAW, MASTER_DATA_DEFAULT } from "./surat-form-fixtures";
import { configureStandardMocks, mountFormWithUsage, selectFormAndUsage, selectLetterType, selectEntity, selectOptionByLabel, clickGetNumber } from "./surat-form-driver";

afterEach(teardownTestHarness);
describe("requester RAB registration flow", () => {
  beforeEach(() => {
    setupTestHarness();
    configureStandardMocks();
    serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_DEFAULT);
    allowServiceCalls("getMasterData", "getActiveRegistrationDrafts", "generateNoSurat", "createRegistrationDraft", "saveRegistrationDraft");
  });
  it("adds/removes the classified RAB upload when checkbox changes in the real form", async () => {
    const usages = FUND_FORM_USAGE_RAW.map(usage => ({ ...usage, form_usage_steps: usage.form_usage_steps.map(step =>
      step.step_order === 2 ? { ...step, role_name: "memeriksa", label: "Mgr. Perencanaan" } : step) }));
    await mountFormWithUsage(usages, CURRENT_PROFILE_KC);
    await selectFormAndUsage(/Dana/i);
    await selectLetterType();
    await selectEntity();
    fireEvent.click(screen.getByText("Tanpa Proyek (Dana Umum)"));
    await selectOptionByLabel(/^Jenis Pengajuan Dana$/i, /Biaya Operasional/i);
    await clickGetNumber();
    const checkbox = await screen.findByRole("checkbox", { name: "Ada RAB" });
    expect(checkbox).not.toBeChecked();
    expect(screen.queryByText("RAB dari pemohon")).not.toBeInTheDocument();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(await screen.findByText("RAB dari pemohon")).toBeInTheDocument();
    fireEvent.click(checkbox);
    expect(screen.queryByText("RAB dari pemohon")).not.toBeInTheDocument();
    expect(screen.getByText("RAB akan dilengkapi oleh tim pemeriksa Perencanaan.")).toBeInTheDocument();
    assertStrictServiceCalls();
  });
});
