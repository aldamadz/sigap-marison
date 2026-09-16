/**
 * Hook tampilan Unified Work Calendar.
 *
 * F1: hook ini hanya mengelola state tampilan dan memuat entry melalui
 * `WorkEntryRepository` yang disuntikkan lewat props. Tidak ada akses
 * Supabase, React Query, atau jaringan di dalam modul ini.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  WorkCalendarViewMode,
  WorkDate,
  WorkEntry,
  WorkEntryOwner,
  WorkEntryOwnerId,
  WorkEntryRepository,
} from "../types/work-calendar";
import {
  getWorkCalendarDateRange,
  todayWorkDate,
  workWeekDates,
  workMonthDates,
  shiftWorkDate,
} from "../lib/work-calendar-date";
import {
  buildWorkCalendarDayCells,
  buildWorkCalendarDaySummaries,
  buildWorkEntryOwnerGroups,
  filterWorkEntriesByOwner,
  isWorkCalendarTeamViewAvailable,
  resolveWorkEntryOwnerFilter,
  type WorkEntryOwnerFilterState,
} from "../lib/work-progress";

export interface UseWorkCalendarViewInput {
  repository: WorkEntryRepository;
  currentUserId: WorkEntryOwnerId;
  teamMembers?: readonly WorkEntryOwner[];
  initialView?: WorkCalendarViewMode;
  initialAnchorDate?: WorkDate;
  now?: () => Date;
  /**
   * Mode Tim server-side: entry tim tidak diambil massal lewat
   * `listTeamEntries`. Daftar anggota dan pekerjaannya dimuat terpisah.
   */
  loadTeamEntries?: boolean;
  /** Sumber kebenaran ketersediaan tab Tim di luar `teamMembers`. */
  isTeamViewAvailableOverride?: boolean;
}

export interface UseWorkCalendarViewResult {
  view: WorkCalendarViewMode;
  setView: (view: WorkCalendarViewMode) => void;
  anchorDate: WorkDate;
  setAnchorDate: (date: WorkDate) => void;
  goToPreviousRange: () => void;
  goToNextRange: () => void;
  goToToday: () => void;
  today: WorkDate;
  ownerFilterId: WorkEntryOwnerId | "all";
  setOwnerFilterId: (ownerId: WorkEntryOwnerId | "all") => void;
  entries: readonly WorkEntry[];
  ownEntries: readonly WorkEntry[];
  visibleEntries: readonly WorkEntry[];
  isLoading: boolean;
  error: Error | null;
  reload: () => void;
  isTeamViewAvailable: boolean;
  /** Salinan entry lokal supaya mutasi optimistis tetap reaktif. */
  applyLocalEntry: (entry: WorkEntry) => void;
  removeLocalEntry: (entryId: string) => void;
}

export function useWorkCalendarView(input: UseWorkCalendarViewInput): UseWorkCalendarViewResult {
  const { repository, currentUserId, teamMembers, initialView, initialAnchorDate, now } = input;
  const loadTeamEntries = input.loadTeamEntries ?? true;

  const readNow = useCallback(() => (now ? now() : new Date()), [now]);

  const [today, setToday] = useState<WorkDate>(() => todayWorkDate(readNow()));
  const [view, setViewState] = useState<WorkCalendarViewMode>(initialView ?? "day");
  const [anchorDate, setAnchorDateState] = useState<WorkDate>(
    () => initialAnchorDate ?? todayWorkDate(readNow()),
  );
  const [ownerFilterIdState, setOwnerFilterIdState] = useState<WorkEntryOwnerId | "all">("all");
  const [entries, setEntries] = useState<readonly WorkEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const isTeamViewAvailable =
    input.isTeamViewAvailableOverride ?? isWorkCalendarTeamViewAvailable(teamMembers);

  /**
   * Keamanan filter: bila anggota yang dipilih hilang dari daftar (misalnya
   * struktur tim berubah), filter dibersihkan ke "Semua anggota". Nilai yang
   * dikembalikan juga sudah aman pada render pertama, jadi tidak pernah ada
   * frame dengan filter menggantung.
   */
  const ownerFilterState = resolveWorkEntryOwnerFilter(ownerFilterIdState, teamMembers ?? []);
  const isOwnerFilterAvailable = ownerFilterIdState === ownerFilterState.effectiveOwnerFilterId;
  const ownerFilterId: WorkEntryOwnerId | "all" = ownerFilterState.effectiveOwnerFilterId;

  useEffect(() => {
    if (!isOwnerFilterAvailable) setOwnerFilterIdState("all");
  }, [isOwnerFilterAvailable]);

  const dateRange = useMemo(
    () => getWorkCalendarDateRange(view === "team" ? "day" : view, anchorDate),
    [view, anchorDate],
  );
  const { fromDate, toDate } = dateRange;

  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const controller = new AbortController();
    let active = true;

    setIsLoading(true);
    setError(null);

    const load = async (): Promise<void> => {
      try {
        const result =
          view === "team" && !loadTeamEntries
            ? []
            : view === "team"
              ? await repository.listTeamEntries({
                  fromDate,
                  toDate,
                  signal: controller.signal,
                })
              : await repository.listEntries({
                  ownerId: currentUserId,
                  fromDate,
                  toDate,
                  signal: controller.signal,
                });
        if (!active || requestRef.current !== requestId) return;
        setEntries(result);
      } catch (thrown) {
        if (!active || requestRef.current !== requestId) return;
        if (controller.signal.aborted) return;
        setError(thrown instanceof Error ? thrown : new Error("Gagal memuat pekerjaan."));
        setEntries([]);
      } finally {
        if (active && requestRef.current === requestId) setIsLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [repository, view, fromDate, toDate, currentUserId, reloadToken, loadTeamEntries]);

  // Jam dinding tidak dipakai untuk perhitungan; hanya untuk menyegarkan `today`.
  useEffect(() => {
    setToday(todayWorkDate(readNow()));
  }, [readNow]);

  const goToPreviousRange = useCallback(() => {
    setAnchorDateState((current) => {
      if (view === "day" || view === "team") return shiftWorkDate(current, -1);
      if (view === "week") return shiftWorkDate(current, -7);
      if (view === "month") {
        const [year, month] = [Number(current.slice(0, 4)), Number(current.slice(5, 7))];
        const targetMonth = month === 1 ? 12 : month - 1;
        const targetYear = month === 1 ? year - 1 : year;
        return `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`;
      }
      return current;
    });
  }, [view]);

  const goToNextRange = useCallback(() => {
    setAnchorDateState((current) => {
      if (view === "day" || view === "team") return shiftWorkDate(current, 1);
      if (view === "week") return shiftWorkDate(current, 7);
      if (view === "month") {
        const [year, month] = [Number(current.slice(0, 4)), Number(current.slice(5, 7))];
        const targetMonth = month === 12 ? 1 : month + 1;
        const targetYear = month === 12 ? year + 1 : year;
        return `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`;
      }
      return current;
    });
  }, [view]);

  const goToToday = useCallback(() => {
    setAnchorDateState(todayWorkDate(readNow()));
  }, [readNow]);

  const setView = useCallback(
    (next: WorkCalendarViewMode) => {
      if (next === "team" && !isTeamViewAvailable) return;
      if (next === "team") {
        setAnchorDateState(todayWorkDate(readNow()));
      }
      setViewState(next);
    },
    [isTeamViewAvailable, readNow],
  );

  const setAnchorDate = useCallback((date: WorkDate) => {
    setAnchorDateState(date);
  }, []);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const applyLocalEntry = useCallback((entry: WorkEntry) => {
    setEntries((current) => {
      const index = current.findIndex((candidate) => candidate.id === entry.id);
      if (index === -1) return [...current, entry];
      const next = current.slice();
      next[index] = entry;
      return next;
    });
  }, []);

  const removeLocalEntry = useCallback((entryId: string) => {
    setEntries((current) => current.filter((entry) => entry.id !== entryId));
  }, []);

  const ownEntries = useMemo(
    () => entries.filter((entry) => entry.ownerId === currentUserId),
    [entries, currentUserId],
  );

  const visibleEntries = useMemo(() => {
    if (view !== "team" || ownerFilterId === "all") return entries;
    return filterWorkEntriesByOwner(entries, ownerFilterId);
    // `ownerFilterId` sudah aman (fallback "all") sehingga tidak pernah
    // menyaring dengan id anggota yang sudah tidak tersedia.
  }, [entries, view, ownerFilterId]);

  return {
    view,
    setView,
    anchorDate,
    setAnchorDate,
    goToPreviousRange,
    goToNextRange,
    goToToday,
    today,
    ownerFilterId,
    setOwnerFilterId: setOwnerFilterIdState,
    entries,
    ownEntries,
    visibleEntries,
    isLoading,
    error,
    reload,
    isTeamViewAvailable,
    applyLocalEntry,
    removeLocalEntry,
  };
}

export interface WorkCalendarDerivedView {
  daySummaries: ReturnType<typeof buildWorkCalendarDaySummaries>;
  monthCells: ReturnType<typeof buildWorkCalendarDayCells>;
  ownerGroups: ReturnType<typeof buildWorkEntryOwnerGroups>;
  /** Status filter pemilik efektif; sumber kebenaran mode Tim. */
  ownerFilter: WorkEntryOwnerFilterState;
  weekDates: readonly WorkDate[];
  monthDates: readonly WorkDate[];
}

/** Turunan tampilan yang dihitung ulang hanya ketika input berubah. */
export function useWorkCalendarDerivedView(input: {
  view: WorkCalendarViewMode;
  anchorDate: WorkDate;
  today: WorkDate;
  entries: readonly WorkEntry[];
  visibleEntries: readonly WorkEntry[];
  ownerFilterId: WorkEntryOwnerId | "all";
  currentUserId: WorkEntryOwnerId;
  teamMembers?: readonly WorkEntryOwner[];
}): WorkCalendarDerivedView {
  const {
    view,
    anchorDate,
    today,
    entries,
    visibleEntries,
    ownerFilterId,
    currentUserId,
    teamMembers,
  } = input;

  // Filter selalu dievaluasi terhadap anggota yang benar-benar tersedia. Bila
  // anggota terpilih hilang, kelompok jatuh kembali ke "Semua anggota" dan
  // state filter dibersihkan lewat efek penyelaras di hook tampilan.
  // `ownerFilterId` sudah merupakan nilai efektif dari `useWorkCalendarView`.
  const effectiveOwnerFilterId = ownerFilterId;

  return useMemo(() => {
    const weekDates = workWeekDates(anchorDate);
    const monthDates = workMonthDates(anchorDate);
    const scopeDates = view === "month" ? monthDates : view === "week" ? weekDates : [anchorDate];
    const scopeEntries = view === "team" ? visibleEntries : entries;
    // Status filter dihitung di dalam memo supaya identitas objeknya stabil
    // dan turunan tidak dihitung ulang tiap render.
    const ownerFilter = resolveWorkEntryOwnerFilter(effectiveOwnerFilterId, teamMembers ?? []);

    return {
      daySummaries: buildWorkCalendarDaySummaries(scopeEntries, scopeDates, today),
      monthCells: buildWorkCalendarDayCells(
        scopeEntries,
        monthDates,
        today,
        Number(anchorDate.slice(5, 7)),
      ),
      // Kelompok dibangun dari `visibleEntries`, bukan seluruh `entries`,
      // supaya metrik dan daftar hanya berasal dari anggota yang tersaring.
      ownerGroups: buildWorkEntryOwnerGroups(
        visibleEntries,
        teamMembers ?? [],
        currentUserId,
        effectiveOwnerFilterId,
      ),
      ownerFilter,
      weekDates,
      monthDates,
    };
  }, [
    view,
    anchorDate,
    today,
    entries,
    visibleEntries,
    effectiveOwnerFilterId,
    currentUserId,
    teamMembers,
  ]);
}
