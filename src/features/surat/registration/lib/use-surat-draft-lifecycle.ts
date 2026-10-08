import { useCallback, useEffect, useState } from "react";
import { suratRegistrationApi } from "@/features/surat/registration/services/surat-registration-api";
import type { SuratRegistrationDraft } from "@/services/surat.service";
import { assertDraftRequesterLocation, type DraftRequesterProfile } from "./draft-requester-location";

export type ToastFn = (args: {
  variant?: "default" | "destructive";
  title: string;
  description?: string;
}) => void;

export type SetSearchParams = (
  next: Record<string, string> | (() => Record<string, string>),
  options?: { replace?: boolean },
) => void;

export type UseSuratDraftLifecycleParams = {
  /** Current profile signal — the URL→fetch effect waits until profile exists. */
  currentProfile: DraftRequesterProfile | null | undefined;
  /** Admin view opens the multi-draft modal; non-admin gets auto-pick when only one draft exists. */
  isCurrentUserAdmin: boolean;
  /** react-router URLSearchParams (read-only access by the hook). */
  searchParams: URLSearchParams;
  /** react-router setter, forwarded so the hook can rewrite ?draft=... cleanly. */
  setSearchParams: SetSearchParams;
  /** Toast used for the "Draft tidak dapat dibuka" failure path. */
  toast: ToastFn;
};

export type UseSuratDraftLifecycleResult = {
  activeDrafts: SuratRegistrationDraft[];
  draftToRestore: SuratRegistrationDraft | null;
  draftLoading: boolean;
  /** Reload the active-drafts list. Returns the resolved list (empty on error). */
  refreshActiveDrafts: () => Promise<SuratRegistrationDraft[]>;
  /** Setter exposed so callers (e.g. the hydrate effect) can clear draftToRestore. */
  setDraftToRestore: React.Dispatch<
    React.SetStateAction<SuratRegistrationDraft | null>
  >;
  /** Finish a draft by id and remove it from the active list if successful. */
  finishSubmittedDraft: (draftId: string | null | undefined) => Promise<void>;
};

/**
 * Lifecycle controller for SuratForm registration drafts.
 *
 * Owns:
 *   - `activeDrafts` (the list shown in the resume-draft modal)
 *   - `draftToRestore` (a draft fetched from `?draft=...` that the component
 *      will hydrate form state from)
 *   - `draftLoading` (true while the URL→fetch effect is in flight)
 *   - `refreshActiveDrafts` (the loader used everywhere a draft is created,
 *      voided, or finished)
 *   - the URL→fetch effect that resolves `?draft=...` and either schedules
 *      a hydrate, auto-picks the only available draft for non-admins, or
 *      toasts on failure.
 *
 * Ordinary drafts must match the current requester location before hydration.
 * The hydrate effect stays in the component because it writes 12+ form-state
 * setters; it consumes `draftToRestore` from the hook and clears it via the
 * exposed setter.
 */
export const useSuratDraftLifecycle = (
  params: UseSuratDraftLifecycleParams,
): UseSuratDraftLifecycleResult => {
  const { currentProfile, isCurrentUserAdmin, searchParams, setSearchParams, toast } = params;

  const [activeDrafts, setActiveDrafts] = useState<SuratRegistrationDraft[]>([]);
  const [draftToRestore, setDraftToRestore] = useState<SuratRegistrationDraft | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);

  const refreshActiveDrafts = useCallback(async (): Promise<SuratRegistrationDraft[]> => {
    try {
      const drafts = await suratRegistrationApi.getActiveRegistrationDrafts();
      setActiveDrafts(drafts);
      return drafts;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Draft registrasi gagal dimuat.";
      if (!message.toLowerCase().includes("surat_registration_drafts")) {
        toast({ variant: "destructive", title: "Gagal memuat draft", description: message });
      }
      return [];
    }
  }, [toast]);

  useEffect(() => {
    if (!currentProfile) return;
    let cancelled = false;
    const draftId = searchParams.get("draft");
    setDraftToRestore(null);
    setDraftLoading(Boolean(draftId));

    Promise.all([
      refreshActiveDrafts(),
      draftId ? suratRegistrationApi.getRegistrationDraft(draftId) : Promise.resolve(null),
    ])
      .then(([drafts, requestedDraft]) => {
        if (cancelled) return;
        if (requestedDraft) {
          assertDraftRequesterLocation(requestedDraft, currentProfile, isCurrentUserAdmin);
          setDraftToRestore(requestedDraft);
          return;
        }
        if (!draftId && !isCurrentUserAdmin && drafts.length === 1) {
          try {
            assertDraftRequesterLocation(drafts[0], currentProfile, false);
          } catch {
            return;
          }
          setSearchParams({ draft: drafts[0].id }, { replace: true });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSearchParams({}, { replace: true });
        toast({
          variant: "destructive",
          title: "Draft tidak dapat dibuka",
          description: error instanceof Error ? error.message : "Draft tidak ditemukan atau sudah kedaluwarsa.",
        });
      })
      .finally(() => { if (!cancelled) setDraftLoading(false); });

    return () => { cancelled = true; };
  }, [currentProfile, isCurrentUserAdmin, refreshActiveDrafts, searchParams, setSearchParams, toast]);

  const finishSubmittedDraft = useCallback(async (draftId: string | null | undefined): Promise<void> => {
    if (!draftId) return;
    await suratRegistrationApi.finishRegistrationDraft(draftId, "SUBMITTED");
    setActiveDrafts(previous => previous.filter(draft => draft.id !== draftId));
  }, []);

  return {
    activeDrafts,
    draftToRestore,
    draftLoading,
    refreshActiveDrafts,
    setDraftToRestore,
    finishSubmittedDraft,
  };
};
