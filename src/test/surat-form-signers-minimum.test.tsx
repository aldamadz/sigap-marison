import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, within } from "@testing-library/react";
import {
  setupTestHarness,
  teardownTestHarness,
  allowServiceCalls,
  assertStrictServiceCalls,
} from "./surat-form-harness";
import {
  configureStandardMocks,
  navigateToNumberGenerated,
  goToWizardStep,
} from "./surat-form-driver";

beforeEach(() => {
  setupTestHarness();
  configureStandardMocks();
  allowServiceCalls(
    "getMasterData",
    "getActiveRegistrationDrafts",
    "generateNoSurat",
    "createRegistrationDraft",
  );
});

afterEach(() => {
  teardownTestHarness();
});

describe("Flow 9: Signer Minimum", () => {
  it("signers build from usage config with correct role names", async () => {
    await navigateToNumberGenerated();
    await goToWizardStep(3);

    const signerSection = screen
      .getByText(/Pejabat Penandatangan/i)
      .closest("section")!;
    expect(
      within(signerSection).getByText("Pemohon")
    ).toBeInTheDocument();
    expect(
      within(signerSection).getByText("Direktur")
    ).toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("signer count matches usage config steps", async () => {
    await navigateToNumberGenerated();
    await goToWizardStep(3);

    // Count buttons with "Pilih" text — one per signer step
    const allButtons = screen.getAllByRole("button");
    const signerButtons = allButtons.filter((btn) =>
      (btn.textContent || "").includes("Pilih")
    );
    // USAGE_DETAIL_DEFAULT has 2 steps
    expect(signerButtons).toHaveLength(2);
    assertStrictServiceCalls();
  });

  it("each signer shows placeholder when no user selected", async () => {
    await navigateToNumberGenerated();
    await goToWizardStep(3);

    expect(screen.getByText(/Pilih Pemohon\.\.\./i)).toBeInTheDocument();
    expect(screen.getByText(/Pilih Direktur\.\.\./i)).toBeInTheDocument();
    assertStrictServiceCalls();
  });
});
