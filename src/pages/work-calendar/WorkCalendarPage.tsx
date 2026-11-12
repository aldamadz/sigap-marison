import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, RefreshCw, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { PersonalReminderButton } from '@/components/notifications/PersonalReminderButton';
import {
  WorkCalendarWorkspace,
  createSupabaseWorkCalendarProfileRepository,
  createSupabaseWorkCalendarSettingsRepository,
  createSupabaseWorkEntryRepository,
  createSupabaseWorkTeamOverviewRepository,
  useWorkCalendarRouteBinding,
  type SupabaseWorkCalendarClient,
  type SupabaseWorkCalendarProfileClient,
  type SupabaseWorkCalendarSettingsClient,
  type SupabaseWorkTeamOverviewClient,
  type WorkEntryOwner,
} from "@/features/work-calendar";

type BootstrapState =
  | { status: "loading" }
  | { status: "missing_profile" }
  | { status: "error"; message: string }
  | { status: "ready"; currentUser: WorkEntryOwner; isTeamViewAvailable: boolean };

/**
 * Bootstrap Director Scale sengaja minimal:
 * - hanya memuat profil pengguna sendiri;
 * - ketersediaan tab Tim diperiksa lewat probe boolean
 *   (`has_work_calendar_team_members`), BUKAN dengan memuat daftar seluruh
 *   anggota. Opsi Kantor/Departemen dan pencarian Anggota dimuat saat tab Tim
 *   benar-benar dibuka.
 *
 * Route ini juga menyediakan binding URL React Router sehingga mode Tim masuk
 * history sesuai kebutuhan dan Back/Forward/deep link memulihkan state.
 */
export default function WorkCalendarPage() {
  const [state, setState] = useState<BootstrapState>({ status: "loading" });
  const route = useWorkCalendarRouteBinding();

  const repository = useMemo(
    () => createSupabaseWorkEntryRepository(supabase as SupabaseWorkCalendarClient),
    [],
  );

  const profileRepository = useMemo(
    () => createSupabaseWorkCalendarProfileRepository(supabase as SupabaseWorkCalendarProfileClient),
    [],
  );

  const teamOverviewRepository = useMemo(
    () => createSupabaseWorkTeamOverviewRepository(supabase as SupabaseWorkTeamOverviewClient),
    [],
  );

  const settingsRepository = useMemo(
    () => createSupabaseWorkCalendarSettingsRepository(supabase as SupabaseWorkCalendarSettingsClient),
    [],
  );

  const loadBootstrapData = useCallback(
    async (signal?: AbortSignal) => {
      setState({ status: "loading" });
      try {
        const profile = await profileRepository.getCurrentProfile(signal);
        if (signal?.aborted) return;

        if (!profile) {
          setState({ status: "missing_profile" });
          return;
        }

        // Probe boolean: tidak ada nama anggota yang dibaca di sini.
        let isTeamViewAvailable = false;
        try {
          isTeamViewAvailable = await teamOverviewRepository.hasAuthorizedTeamMembers(signal);
        } catch {
          // Kegagalan probe tidak boleh memblokir kalender pribadi; tab Tim
          // cukup disembunyikan sampai probe berhasil.
          isTeamViewAvailable = false;
        }
        if (signal?.aborted) return;

        setState({
          status: "ready",
          currentUser: profile,
          isTeamViewAvailable,
        });
      } catch (thrown) {
        if (signal?.aborted) return;
        const message =
          thrown instanceof Error && thrown.message
            ? thrown.message
            : "Gagal memuat profil kerja pengguna.";
        setState({ status: "error", message });
      }
    },
    [profileRepository, teamOverviewRepository],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadBootstrapData(controller.signal);
    return () => controller.abort();
  }, [loadBootstrapData]);

  const handleRetry = useCallback(() => {
    void loadBootstrapData();
  }, [loadBootstrapData]);

  if (state.status === "loading") {
    return (
      <div
        role="status"
        aria-label="Memuat Kalender Kerja"
        className="flex h-[calc(100vh-8rem)] w-full items-center justify-center"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground animate-pulse">Menyiapkan Kalender Kerja...</p>
        </div>
      </div>
    );
  }

  if (state.status === "missing_profile") {
    return (
      <div
        role="alert"
        className="mx-auto my-8 flex max-w-md flex-col items-center justify-center rounded-lg border border-border bg-card p-6 text-center shadow-sm"
      >
        <div className="mb-3 rounded-full bg-muted p-3 text-muted-foreground">
          <UserX className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Profil Pengguna Tidak Ditemukan</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Akun Anda belum memiliki profil kerja aktif atau telah dinonaktifkan. Hubungi administrator sistem.
        </p>
        <Button variant="outline" className="mt-4 gap-2" onClick={handleRetry}>
          <RefreshCw className="h-4 w-4" />
          Coba Lagi
        </Button>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div
        role="alert"
        className="mx-auto my-8 flex max-w-md flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center shadow-sm"
      >
        <div className="mb-3 rounded-full bg-destructive/10 p-3 text-destructive">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-destructive">Gagal Memuat Kalender Kerja</h2>
        <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
        <Button
          variant="outline"
          className="mt-4 gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={handleRetry}
        >
          <RefreshCw className="h-4 w-4" />
          Coba Lagi
        </Button>
      </div>
    );
  }

  return (
    <WorkCalendarWorkspace
      currentUser={state.currentUser}
      renderReminder={entry => entry.ownerId === state.currentUser.id && entry.status !== 'completed'
        ? <PersonalReminderButton kind="calendar" targetId={entry.id} /> : null}
      repository={repository}
      teamOverviewRepository={teamOverviewRepository}
      settingsRepository={settingsRepository}
      isTeamViewAvailableOverride={state.isTeamViewAvailable}
      initialView={route.initialView ?? "day"}
      initialAnchorDate={route.initialAnchorDate ?? undefined}
      routeAdapter={route.adapter}
    />
  );
}
