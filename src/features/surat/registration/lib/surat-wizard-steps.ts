/**
 * Pure constants and helpers for the registration wizard navigation.
 *
 * Pass J1 refactor: extracts the wizard step definitions and
 * navigation boundary logic from `SuratForm.tsx`.
 *
 * No state is kept here. These functions are pure and only compute
 * derived states or clamp bounds.
 */

export const WIZARD_STEP_LOKASI = 1 as const;
export const WIZARD_STEP_BERKAS = 2 as const;
export const WIZARD_STEP_SIGNERS = 3 as const;

export type WizardStep =
  | typeof WIZARD_STEP_LOKASI
  | typeof WIZARD_STEP_BERKAS
  | typeof WIZARD_STEP_SIGNERS;

export const WIZARD_STEPS: ReadonlyArray<{ step: WizardStep; title: string; description: string }> = [
  {
    step: WIZARD_STEP_LOKASI,
    title: "Lokasi & Klasifikasi",
    description: "Kantor, proyek, dan jenis dokumen",
  },
  {
    step: WIZARD_STEP_BERKAS,
    title: "Persetujuan & Berkas",
    description: "Perihal, tanggal, dan lampiran",
  },
  {
    step: WIZARD_STEP_SIGNERS,
    title: "Penandatangan",
    description: "Tetapkan pejabat penanda tangan",
  },
];

export function clampWizardStep(step: number): WizardStep {
  if (step <= WIZARD_STEP_LOKASI) return WIZARD_STEP_LOKASI;
  if (step >= WIZARD_STEP_SIGNERS) return WIZARD_STEP_SIGNERS;
  return step as WizardStep;
}

export function getNextStep(current: WizardStep): WizardStep {
  return clampWizardStep(current + 1);
}

export function getPreviousStep(current: WizardStep): WizardStep {
  return clampWizardStep(current - 1);
}

export function canGoToStep(target: WizardStep, hasDraft: boolean): boolean {
  if (target === WIZARD_STEP_LOKASI) return true;
  return hasDraft;
}

export function getActiveWizardStep(
  useWizard: boolean,
  hasDraft: boolean,
  currentStep: WizardStep,
): 0 | WizardStep {
  if (!useWizard) return 0;
  return hasDraft ? currentStep : WIZARD_STEP_LOKASI;
}

export function isDocumentIdentityStep(activeStep: 0 | WizardStep): boolean {
  return activeStep === 0 || activeStep === WIZARD_STEP_LOKASI;
}

export function isContentStep(activeStep: 0 | WizardStep): boolean {
  return activeStep === 0 || activeStep === WIZARD_STEP_BERKAS;
}

export function isSignerStep(activeStep: 0 | WizardStep): boolean {
  return activeStep === 0 || activeStep === WIZARD_STEP_SIGNERS;
}

export function shouldShowStepSection(
  sectionStep: WizardStep,
  activeStep: 0 | WizardStep,
  hasDraft: boolean,
  hasSigners: boolean = true,
): boolean {
  if (!hasDraft) return false;
  if (sectionStep === WIZARD_STEP_SIGNERS && !hasSigners) return false;
  
  return activeStep === 0 || activeStep === sectionStep;
}
