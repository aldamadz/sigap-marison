import { useState, useCallback } from "react";
import {
  WIZARD_STEP_LOKASI,
  WIZARD_STEP_BERKAS,
  WIZARD_STEP_SIGNERS,
  canGoToStep,
  getActiveWizardStep,
  getNextStep,
  getPreviousStep,
  shouldShowStepSection,
  isDocumentIdentityStep,
  isContentStep,
  isSignerStep,
  type WizardStep,
} from "./surat-wizard-steps";

export function useSuratWizardStepper(
  useWizard: boolean,
  hasDraft: boolean,
  hasSigners: boolean,
) {
  const [currentStep, setCurrentStep] = useState<WizardStep>(WIZARD_STEP_LOKASI);

  const activeWizardStep = getActiveWizardStep(useWizard, hasDraft, currentStep);
  const showSectionBerkas = shouldShowStepSection(WIZARD_STEP_BERKAS, activeWizardStep, hasDraft);
  const showSectionSigners = shouldShowStepSection(WIZARD_STEP_SIGNERS, activeWizardStep, hasDraft, hasSigners);
  const isIdentityActive = isDocumentIdentityStep(activeWizardStep);
  const isContentActive = isContentStep(activeWizardStep);
  const isSignerActive = isSignerStep(activeWizardStep);

  const goToStep = useCallback((step: WizardStep) => {
    if (canGoToStep(step, hasDraft)) {
      setCurrentStep(step);
    }
  }, [hasDraft]);

  const goToNextStep = useCallback(() => {
    const next = getNextStep(currentStep);
    if (canGoToStep(next, hasDraft)) {
      setCurrentStep(next);
    }
  }, [currentStep, hasDraft]);

  const goToPreviousStep = useCallback(() => {
    setCurrentStep(getPreviousStep(currentStep));
  }, [currentStep]);

  const resetWizardStep = useCallback(() => {
    setCurrentStep(WIZARD_STEP_LOKASI);
  }, []);

  return {
    currentStep,
    activeWizardStep,
    showSectionBerkas,
    showSectionSigners,
    isIdentityActive,
    isContentActive,
    isSignerActive,
    setCurrentStep, // escape hatch for explicit jumps from draft logic
    goToStep,
    goToNextStep,
    goToPreviousStep,
    resetWizardStep,
  };
}
