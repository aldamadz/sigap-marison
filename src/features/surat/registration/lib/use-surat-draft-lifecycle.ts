import { useCallback, useEffect, useState } from "react";
import { suratRegistrationApi } from "@/features/surat/registration/services/surat-registration-api";
import type { SuratRegistrationDraft } from "@/services/surat.service";

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
  currentProfile: { id: string } | null | undefined;
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
  /** Setter exposed so callers (e.g. submit confirm) can prune the list locally. */
  setActiveDrafts: React.Dispatch<
    React.SetStateAction<SuratRegistrationDraft[]>
  >;
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
 * Pass D refactor: behaviour-preserving extraction only. Every guard, every
 * toast, every setSearchParams call is copied verbatim from SuratForm.tsx.
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
    setDraftLoading(Boolean(draftId));

    Promise.all([
      refreshActiveDrafts(),
      draftId ? suratRegistrationApi.getRegistrationDraft(draftId) : Promise.resolve(null),
    ])
      .then(([drafts, requestedDraft]) => {
        if (cancelled) return;
        if (requestedDraft) {
          setDraftToRestore(requestedDraft);
          return;
        }
        if (!draftId && !isCurrentUserAdmin && drafts.length === 1) {
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

  return {
    activeDrafts,
    draftToRestore,
    draftLoading,
    refreshActiveDrafts,
    setDraftToRestore,
    setActiveDrafts,
  };
};
