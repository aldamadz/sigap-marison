import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSuratWizardStepper } from "@/features/surat/registration/lib/use-surat-wizard-stepper";
import { WIZARD_STEP_LOKASI, WIZARD_STEP_BERKAS, WIZARD_STEP_SIGNERS } from "@/features/surat/registration/lib/surat-wizard-steps";

describe("useSuratWizardStepper pure unit tests", () => {
  it("1. initial step remains 1", () => {
    const { result } = renderHook(() => useSuratWizardStepper(true, false, false));
    expect(result.current.currentStep).toBe(WIZARD_STEP_LOKASI);
  });

  it("2. next: 1 -> 2 -> 3 and clamps at 3 (when draft allows)", () => {
    const { result } = renderHook(() => useSuratWizardStepper(true, true, true));

    expect(result.current.currentStep).toBe(WIZARD_STEP_LOKASI);

    act(() => result.current.goToNextStep());
    expect(result.current.currentStep).toBe(WIZARD_STEP_BERKAS);

    act(() => result.current.goToNextStep());
    expect(result.current.currentStep).toBe(WIZARD_STEP_SIGNERS);

    act(() => result.current.goToNextStep());
    expect(result.current.currentStep).toBe(WIZARD_STEP_SIGNERS);
  });

  it("3. previous: 3 -> 2 -> 1 and clamps at 1", () => {
    const { result } = renderHook(() => useSuratWizardStepper(true, true, true));

    act(() => result.current.goToStep(WIZARD_STEP_SIGNERS));
    expect(result.current.currentStep).toBe(WIZARD_STEP_SIGNERS);

    act(() => result.current.goToPreviousStep());
    expect(result.current.currentStep).toBe(WIZARD_STEP_BERKAS);

    act(() => result.current.goToPreviousStep());
    expect(result.current.currentStep).toBe(WIZARD_STEP_LOKASI);

    act(() => result.current.goToPreviousStep());
    expect(result.current.currentStep).toBe(WIZARD_STEP_LOKASI);
  });

  it("4. direct navigation follows canGoToStep (blocked if no draft)", () => {
    // No draft -> blocked from reaching step 2/3
    const { result } = renderHook(() => useSuratWizardStepper(true, false, false));

    act(() => result.current.goToStep(WIZARD_STEP_BERKAS));
    expect(result.current.currentStep).toBe(WIZARD_STEP_LOKASI);

    // Also blocks Next
    act(() => result.current.goToNextStep());
    expect(result.current.currentStep).toBe(WIZARD_STEP_LOKASI);
  });

  it("5. reset form brings wizard back to step 1", () => {
    const { result } = renderHook(() => useSuratWizardStepper(true, true, true));

    act(() => result.current.goToStep(WIZARD_STEP_BERKAS));
    expect(result.current.currentStep).toBe(WIZARD_STEP_BERKAS);

    act(() => result.current.resetWizardStep());
    expect(result.current.currentStep).toBe(WIZARD_STEP_LOKASI);
  });

  it("exposes proper derived visibility flags", () => {
    const { result, rerender } = renderHook(
      (props) => useSuratWizardStepper(props.useWizard, props.hasDraft, props.hasSigners),
      { initialProps: { useWizard: true, hasDraft: true, hasSigners: false } }
    );

    // Step 1
    expect(result.current.isIdentityActive).toBe(true);
    expect(result.current.showSectionBerkas).toBe(false);
    expect(result.current.showSectionSigners).toBe(false);

    // Step 2
    act(() => result.current.goToStep(WIZARD_STEP_BERKAS));
    expect(result.current.isContentActive).toBe(true);
    expect(result.current.showSectionBerkas).toBe(true);
    expect(result.current.showSectionSigners).toBe(false); // Signers still false

    // Try Step 3 without signers -> visibility should be false for signers
    act(() => result.current.goToStep(WIZARD_STEP_SIGNERS));
    expect(result.current.isSignerActive).toBe(true);
    expect(result.current.showSectionBerkas).toBe(false);
    expect(result.current.showSectionSigners).toBe(false); // No signers

    // Step 3 with signers
    rerender({ useWizard: true, hasDraft: true, hasSigners: true });
    expect(result.current.showSectionSigners).toBe(true);
  });
});
