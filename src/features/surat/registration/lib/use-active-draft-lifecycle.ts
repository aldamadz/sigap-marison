import { useCallback, useState } from "react";
import type { SuratRegistrationDraft } from "@/services/surat.service";

/**
 * Result shape of `useActiveDraftLifecycle`.
 *
 * Owns the `activeDraftId` / `activeDraftReservationId` pair that the
 * SuratForm used to declare inline. Wraps every write site in a named
 * helper so the call-site intent is visible without reading the
 * setter sequence.
 *
 * Behaviour-preserving refactor (Pass F). Every wrapper preserves the
 * exact setter sequence that lived in `SuratForm.tsx` before — only
 * the *declarations* move.
 *
 *  | write site                  | before (SuratForm)                | after (hook)         |
 *  | --------------------------- | --------------------------------- | -------------------- |
 *  | draft restored (L1449-1450) | setActiveDraftId(id) + reservation| markDraftRestored(d) |
 *  | draft created (L1857-1858)  | setActiveDraftId(id) + reservation| markDraftCreated(d)  |
 *  | cancel / void (L1896-1897)  | setActiveDraftId(null) +          | markDraftVoided()    |
 *  |                             | setActiveDraftReservationId(null) |                      |
 *  | reset form (L1998-1999)     | setActiveDraftId(null) +          | clearActiveDraftId() |
 *  |                             | setActiveDraftReservationId(null) |                      |
 *
 *  The submit-success path does NOT clear `activeDraftId` directly —
 *  it calls `resetForm()` which calls `clearActiveDraftId()` via the
 *  hook. `markDraftFinished()` is exposed for symmetry and for the
 *  characterization tests but is NOT wired into the submit flow: the
 *  existing call order (`finishRegistrationDraft` → `setActiveDrafts
 *  filter` → `resetForm()`) is preserved verbatim.
 */
export type UseActiveDraftLifecycleResult = {
  /** The currently-active registration draft id, or null when no draft is open. */
  activeDraftId: string | null;
  /** The reservation id paired with the active draft, or null. */
  activeDraftReservationId: string | null;
  /**
   * Escape-hatch setter that mirrors the original `useState` setter.
   * Kept for compatibility (existing autosave / consumer code that
   * might need to mutate directly) and for tests that need to seed
   * a specific value.
   */
  setActiveDraftId: React.Dispatch<React.SetStateAction<string | null>>;
  /**
   * Escape-hatch setter for the reservation id. Kept for the
   * submit-success tail (`resetForm()` already clears it via
   * `clearActiveDraftId()`, but the existing call site at L2393
   * invokes this setter directly after `resetForm()` — preserved
   * verbatim for behaviour parity).
   */
  setActiveDraftReservationId: React.Dispatch<React.SetStateAction<string | null>>;
  /** Resets both fields to `null`. Used by the form-reset path. */
  clearActiveDraftId: () => void;
  /** Sets `activeDraftId` + `activeDraftReservationId` from a newly-created draft. */
  markDraftCreated: (draft: Pick<SuratRegistrationDraft, "id" | "reservation_id">) => void;
  /** Sets `activeDraftId` + `activeDraftReservationId` from a restored draft. */
  markDraftRestored: (draft: Pick<SuratRegistrationDraft, "id" | "reservation_id">) => void;
  /** Clears both fields. Used by the cancel / void / "Ubah Identitas" path. */
  markDraftVoided: () => void;
  /**
   * Clears both fields. NOT wired into the submit-success path because
   * the existing call order goes through `resetForm()` which already
   * clears via `clearActiveDraftId()`. Exposed for symmetry / tests.
   */
  markDraftFinished: () => void;
};

/**
 * Lifecycle controller for the SuratForm "active draft id" pair.
 *
 * Pass F refactor: behaviour-preserving extraction. The hook does NOT
 * touch:
 *   - autosave (Pass C) — autosave receives `activeDraftId` from the
 *      component as before.
 *   - draft URL fetch (Pass D) — that hook owns the URL→fetch flow;
 *      the hydrate effect still calls `markDraftRestored` on the
 *      restored draft payload.
 *   - linked recommendation context (Pass E) — independent.
 *   - submit / signer / PDF / API / DB / migration.
 *
 * Wrappers preserve the original setter pair (`activeDraftId` +
 * `activeDraftReservationId`) without reordering or adding side
 * effects. Reads outside the hook remain raw `activeDraftId` /
 * `activeDraftReservationId` accesses — no migration needed.
 */
export const useActiveDraftLifecycle = (): UseActiveDraftLifecycleResult => {
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [activeDraftReservationId, setActiveDraftReservationId] = useState<string | null>(null);

  const clearActiveDraftId = useCallback(() => {
    setActiveDraftId(null);
    setActiveDraftReservationId(null);
  }, []);

  const markDraftCreated = useCallback(
    (draft: Pick<SuratRegistrationDraft, "id" | "reservation_id">) => {
      setActiveDraftId(draft.id);
      setActiveDraftReservationId(draft.reservation_id);
    },
    [],
  );

  const markDraftRestored = useCallback(
    (draft: Pick<SuratRegistrationDraft, "id" | "reservation_id">) => {
      setActiveDraftId(draft.id);
      setActiveDraftReservationId(draft.reservation_id);
    },
    [],
  );

  const markDraftVoided = useCallback(() => {
    setActiveDraftId(null);
    setActiveDraftReservationId(null);
  }, []);

  const markDraftFinished = useCallback(() => {
    setActiveDraftId(null);
    setActiveDraftReservationId(null);
  }, []);

  return {
    activeDraftId,
    activeDraftReservationId,
    setActiveDraftId,
    setActiveDraftReservationId,
    clearActiveDraftId,
    markDraftCreated,
    markDraftRestored,
    markDraftVoided,
    markDraftFinished,
  };
};