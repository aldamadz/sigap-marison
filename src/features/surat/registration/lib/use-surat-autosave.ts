import { useEffect, useState } from "react";
import { suratRegistrationApi } from "@/features/surat/registration/services/surat-registration-api";

export type DraftSaveState = "idle" | "saving" | "saved" | "error";

export type UseSuratAutosaveParams = {
  /** Currently active registration draft id; autosave is skipped when null. */
  activeDraftId: string | null;
  /** Reserved no_surat for the draft; autosave waits until it is set. */
  generatedNoSurat: string | null;
  /** A draft being hydrated into the form; autosave must NOT fire during restore. */
  draftToRestore: unknown;
  /** Selected usage; autosave waits until usage is linked to keep payload intact. */
  selectedUsage: { id?: string | null } | null | undefined;
  /** Linked recommendation / revision context for the draft. */
  linkedDocumentContext: unknown;
  externalRevision?: { eventId: string } | null;
  /** The live form payload to persist. */
  effectiveFormData: Record<string, any>;
  /** Active form id. */
  selectedFormId: string | null;
  /** Signer assignments snapshot to persist. */
  signers: any[];
  /** Section label for saveRegistrationDraft. Defaults to "details". */
  currentSection?: string;
  /** Debounce in ms; defaults to 900 (matches the original inline timer). */
  debounceMs?: number;
};

/**
 * Autosave controller for SuratForm registration drafts.
 *
 * Owns the `draftSaveState` (idle | saving | saved | error) and the
 * 900ms debounce timer. On any change to the save-affecting inputs the
 * state flips to `saving`, then `saveRegistrationDraft` runs once after
 * the debounce window. The timer is cleared on unmount and on every
 * re-trigger so rapid edits collapse into a single save.
 *
 * Returns a `[state, setState]` tuple so callers can still drive the
 * value from sibling flows (e.g. explicit submit, draft reset) without
 * breaking the existing UI bindings.
 *
 * Phase 3 refactor scope: behaviour-preserving extraction only. The
 * save call site, the guard conditions, the section label, the debounce
 * window, and the success/failure transitions are all unchanged.
 */
export const useSuratAutosave = (
  params: UseSuratAutosaveParams,
): [DraftSaveState, React.Dispatch<React.SetStateAction<DraftSaveState>>] => {
  const [draftSaveState, setDraftSaveState] = useState<DraftSaveState>("idle");
  const {
    activeDraftId,
    generatedNoSurat,
    draftToRestore,
    selectedUsage,
    linkedDocumentContext,
    externalRevision,
    effectiveFormData,
    selectedFormId,
    signers,
    currentSection = "details",
    debounceMs = 900,
  } = params;

  useEffect(() => {
    if (!activeDraftId || !generatedNoSurat || draftToRestore) return;
    // Jangan pernah menimpa payload dengan kondisi yang sudah kehilangan
    // tautan usage — itu akan menghapus perihal/penanda tangan secara permanen.
    if (!selectedUsage?.id && !linkedDocumentContext) return;
    setDraftSaveState("saving");
    const timeout = window.setTimeout(() => {
      suratRegistrationApi
        .saveRegistrationDraft(
          activeDraftId,
          {
            formData: effectiveFormData,
            selectedFormId,
            selectedUsageId: selectedUsage?.id || "",
            linkedDocumentContext,
            externalRevision,
          },
          signers,
          currentSection,
        )
        .then(() => setDraftSaveState("saved"))
        .catch(() => setDraftSaveState("error"));
    }, debounceMs);
    return () => window.clearTimeout(timeout);
  }, [
    activeDraftId,
    generatedNoSurat,
    effectiveFormData,
    selectedFormId,
    selectedUsage?.id,
    signers,
    draftToRestore,
    linkedDocumentContext,
    externalRevision,
    currentSection,
    debounceMs,
  ]);

  return [draftSaveState, setDraftSaveState];
};
