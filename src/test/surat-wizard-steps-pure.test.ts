import { describe, expect, it } from "vitest";
import {
  WIZARD_STEP_BERKAS,
  WIZARD_STEP_LOKASI,
  WIZARD_STEP_SIGNERS,
  canGoToStep,
  clampWizardStep,
  getActiveWizardStep,
  getNextStep,
  getPreviousStep,
  isContentStep,
  isDocumentIdentityStep,
  isSignerStep,
  shouldShowStepSection,
} from "@/features/surat/registration/lib/surat-wizard-steps";

describe("wizard step helpers", () => {
  describe("clampWizardStep", () => {
    it("1. clamp step di bawah 1 menjadi 1", () => {
      expect(clampWizardStep(0)).toBe(WIZARD_STEP_LOKASI);
      expect(clampWizardStep(-5)).toBe(WIZARD_STEP_LOKASI);
    });

    it("2. clamp step di atas 3 menjadi 3", () => {
      expect(clampWizardStep(4)).toBe(WIZARD_STEP_SIGNERS);
      expect(clampWizardStep(100)).toBe(WIZARD_STEP_SIGNERS);
    });

    it("returns valid steps unchanged", () => {
      expect(clampWizardStep(1)).toBe(WIZARD_STEP_LOKASI);
      expect(clampWizardStep(2)).toBe(WIZARD_STEP_BERKAS);
      expect(clampWizardStep(3)).toBe(WIZARD_STEP_SIGNERS);
    });
  });

  describe("navigation", () => {
    it("3. next dari 1 ke 2, 2 ke 3, 3 tetap 3", () => {
      expect(getNextStep(WIZARD_STEP_LOKASI)).toBe(WIZARD_STEP_BERKAS);
      expect(getNextStep(WIZARD_STEP_BERKAS)).toBe(WIZARD_STEP_SIGNERS);
      expect(getNextStep(WIZARD_STEP_SIGNERS)).toBe(WIZARD_STEP_SIGNERS);
    });

    it("4. previous dari 3 ke 2, 2 ke 1, 1 tetap 1", () => {
      expect(getPreviousStep(WIZARD_STEP_SIGNERS)).toBe(WIZARD_STEP_BERKAS);
      expect(getPreviousStep(WIZARD_STEP_BERKAS)).toBe(WIZARD_STEP_LOKASI);
      expect(getPreviousStep(WIZARD_STEP_LOKASI)).toBe(WIZARD_STEP_LOKASI);
    });
  });

  describe("canGoToStep", () => {
    it("always allows going to LOKASI (step 1)", () => {
      expect(canGoToStep(WIZARD_STEP_LOKASI, false)).toBe(true);
      expect(canGoToStep(WIZARD_STEP_LOKASI, true)).toBe(true);
    });

    it("only allows going to BERKAS/SIGNERS if hasDraft is true", () => {
      expect(canGoToStep(WIZARD_STEP_BERKAS, false)).toBe(false);
      expect(canGoToStep(WIZARD_STEP_BERKAS, true)).toBe(true);
      expect(canGoToStep(WIZARD_STEP_SIGNERS, false)).toBe(false);
      expect(canGoToStep(WIZARD_STEP_SIGNERS, true)).toBe(true);
    });
  });

  describe("getActiveWizardStep", () => {
    it("returns 0 if not using wizard", () => {
      expect(getActiveWizardStep(false, false, WIZARD_STEP_LOKASI)).toBe(0);
      expect(getActiveWizardStep(false, true, WIZARD_STEP_BERKAS)).toBe(0);
    });

    it("returns current step if using wizard and has draft", () => {
      expect(getActiveWizardStep(true, true, WIZARD_STEP_BERKAS)).toBe(WIZARD_STEP_BERKAS);
    });

    it("forces step 1 if using wizard but no draft", () => {
      expect(getActiveWizardStep(true, false, WIZARD_STEP_SIGNERS)).toBe(WIZARD_STEP_LOKASI);
    });
  });

  describe("step predicates", () => {
    it("isDocumentIdentityStep", () => {
      expect(isDocumentIdentityStep(0)).toBe(true);
      expect(isDocumentIdentityStep(WIZARD_STEP_LOKASI)).toBe(true);
      expect(isDocumentIdentityStep(WIZARD_STEP_BERKAS)).toBe(false);
      expect(isDocumentIdentityStep(WIZARD_STEP_SIGNERS)).toBe(false);
    });

    it("isContentStep", () => {
      expect(isContentStep(0)).toBe(true);
      expect(isContentStep(WIZARD_STEP_LOKASI)).toBe(false);
      expect(isContentStep(WIZARD_STEP_BERKAS)).toBe(true);
      expect(isContentStep(WIZARD_STEP_SIGNERS)).toBe(false);
    });

    it("isSignerStep", () => {
      expect(isSignerStep(0)).toBe(true);
      expect(isSignerStep(WIZARD_STEP_LOKASI)).toBe(false);
      expect(isSignerStep(WIZARD_STEP_BERKAS)).toBe(false);
      expect(isSignerStep(WIZARD_STEP_SIGNERS)).toBe(true);
    });
  });

  describe("shouldShowStepSection", () => {
    it("5. helper section step mengembalikan boolean yang sama seperti kondisi lama", () => {
      // Old: showSectionBerkas = Boolean(generatedNoSurat) && (!useRegistrationWizard || activeWizardStep === 2)
      // which means: if !hasDraft -> false
      //              if activeStep === 0 -> true (non-wizard)
      //              if activeStep === 2 -> true
      expect(shouldShowStepSection(WIZARD_STEP_BERKAS, WIZARD_STEP_BERKAS, true)).toBe(true);
      expect(shouldShowStepSection(WIZARD_STEP_BERKAS, 0, true)).toBe(true);
      expect(shouldShowStepSection(WIZARD_STEP_BERKAS, WIZARD_STEP_LOKASI, true)).toBe(false);
      expect(shouldShowStepSection(WIZARD_STEP_BERKAS, WIZARD_STEP_BERKAS, false)).toBe(false);

      // Old: showSectionSigners = Boolean(generatedNoSurat) && signers.length > 0 && (!useRegistrationWizard || activeWizardStep === 3)
      expect(shouldShowStepSection(WIZARD_STEP_SIGNERS, WIZARD_STEP_SIGNERS, true, true)).toBe(true);
      expect(shouldShowStepSection(WIZARD_STEP_SIGNERS, 0, true, true)).toBe(true);
      expect(shouldShowStepSection(WIZARD_STEP_SIGNERS, WIZARD_STEP_SIGNERS, true, false)).toBe(false);
      expect(shouldShowStepSection(WIZARD_STEP_SIGNERS, WIZARD_STEP_LOKASI, true, true)).toBe(false);
    });
  });
});
