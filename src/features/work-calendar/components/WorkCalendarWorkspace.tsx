/**
 * WorkCalendarWorkspace — orkestrator Unified Work Calendar (CAL-03 F1).
 *
 * Batasan F1:
 * - tidak memanggil Supabase; seluruh data masuk melalui `repository` props;
 * - tidak mengimpor komponen/service/schema agenda lama;
 * - tidak terpasang pada route atau sidebar aplikasi;
 * - fixture hanya dipakai oleh test dan visual verification.
 *
 * Keputusan UX F1:
 * - default view "Hari";
 * - quick entry hanya butuh judul; Enter menyimpan, Esc membatalkan;
 * - status `completed` meminta realisasi inline; `blocked` meminta alasan inline;
 * - overdue diturunkan dari tanggal dan status, bukan disimpan;
 * - mode Tim selalu read-only terhadap entry bawahan.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CalendarDays, LoaderCircle, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type {
  WorkCalendarDayMeta,
  WorkCalendarHoliday,
  WorkCalendarSettingsRepository,
  WorkCalendarViewMode,
  WorkCalendarWorkSettings,
  WorkCalendarWorkspaceProps,
  WorkDate,
  WorkEntry,
  WorkEntryDraft,
  WorkEntryEvent,
  WorkEntryOwner,
  WorkEntryPatch,
  WorkEntryStatus,
  WorkProgressCounts,
} from "../types/work-calendar";
import { isWorkEntryConflictError } from "../lib/work-entry-conflict";
import { formatWorkDateFull, getWorkCalendarDateRange } from "../lib/work-calendar-date";
import { getWorkEntryStatusFollowUp } from "../lib/work-entry-status";
import { isWorkEntryVisibleInRange, selectWorkEntriesForDate } from "../lib/work-entry-carryover";
import {
  computeWorkProgress,
  createWorkCalendarPermissions,
} from "../lib/work-progress";
import { normalizeWorkEntryText, validateWorkEntryInput } from "../lib/work-entry-validation";
import { getWorkCalendarAddAction } from "../lib/work-calendar-add-action";
import {
  DEFAULT_WORK_CALENDAR_STATUS_FILTER,
  filterWorkEntriesByStatus,
  type WorkCalendarStatusFilter,
} from "../lib/work-calendar-status-filter";
import { useWorkCalendarDerivedView, useWorkCalendarView } from "../hooks/use-work-calendar-view";
import { WorkCalendarToolbar } from "./WorkCalendarToolbar";
import { QuickWorkEntry } from "./QuickWorkEntry";
import { DailyProgressSummary } from "./DailyProgressSummary";
import { DailyWorkView } from "./DailyWorkView";
import { WeeklyWorkView } from "./WeeklyWorkView";
import { MonthlyWorkView } from "./MonthlyWorkView";
import { TeamProgressView } from "./TeamProgressView";
import { TeamOverviewView } from "./TeamOverviewView";
import { WorkEntryList, type WorkCalendarViewInteractionProps } from "./WorkEntryList";
import { WorkEntryDetail } from "./WorkEntryDetail";
import {
  WorkEntryCreateDialog,
  type WorkEntryCreateInput,
} from "./WorkEntryCreateDialog";
import { QuickAddSurface } from "./QuickAddSurface";
import { AnimatePresence } from "./WorkCalendarMotion";
import { useWorkCalendarCompact } from "../hooks/use-work-calendar-compact";
import {
  normalizeWorkEntryQueryId,
  resolveSelectedWorkEntry,
  shouldDiscardWorkEntryQueryId,
} from "../lib/work-entry-selection";
import { useWorkTeamOverview } from "../hooks/use-work-team-overview";
import {
  DEFAULT_WORK_CALENDAR_WORK_SETTINGS,
  buildWorkCalendarDayMetaMap,
  normalizeWorkSettings,
} from "../lib/work-day-config";

interface StatusPrompt {
  entryId: string;
  entryTitle: string;
  fromStatus: WorkEntryStatus;
  target: WorkEntryStatus;
}

export function WorkCalendarWorkspace({  currentUser,
  repository,
  teamMembers,
  permissions,
  initialView,
  initialAnchorDate,
  now,
  teamOverviewRepository,
  isTeamViewAvailableOverride,
  routeAdapter,
  settingsRepository,
  workSettings: workSettingsOverride,
  holidays: holidaysOverride,
}: WorkCalendarWorkspaceProps) {
  const calendar = useWorkCalendarView({
    repository,
    currentUserId: currentUser.id,
    teamMembers,
    initialView: initialView ?? "day",
    initialAnchorDate,
    now,
    loadTeamEntries: teamOverviewRepository === undefined,
    isTeamViewAvailableOverride,
  });

  const teamOverview = useWorkTeamOverview({
    repository: teamOverviewRepository ?? null,
    enabled: teamOverviewRepository !== undefined && calendar.view === "team",
    // Tanggal tunggal mode Tim: selalu mengikuti tanggal acuan kalender.
    workDate: calendar.anchorDate,
    adapter: routeAdapter,
  });

  const teamDepartmentOptions = teamOverview.departmentOptions;

  const derived = useWorkCalendarDerivedView({
    view: calendar.view,
    anchorDate: calendar.anchorDate,
    today: calendar.today,
    entries: calendar.entries,
    visibleEntries: calendar.visibleEntries,
    ownerFilterId: calendar.ownerFilterId,
    currentUserId: currentUser.id,
    teamMembers,
  });

  const effectivePermissions = useMemo(
    () => permissions ?? createWorkCalendarPermissions(currentUser.id),
    [permissions, currentUser.id],
  );

  // ==== Hari/jam kerja dan hari libur (CAL-03 F6) ====

  /**
   * Pengaturan efektif: override test menang, lalu hasil repository, lalu
   * default Senin-Jumat. Tidak pernah menulis konfigurasi KPI.
   */
  const [loadedWorkSettings, setLoadedWorkSettings] = useState<WorkCalendarWorkSettings | null>(
    null,
  );
  const [loadedHolidays, setLoadedHolidays] = useState<readonly WorkCalendarHoliday[] | null>(null);

  const effectiveWorkSettings =
    workSettingsOverride ?? loadedWorkSettings ?? DEFAULT_WORK_CALENDAR_WORK_SETTINGS;
  const effectiveHolidays = holidaysOverride ?? loadedHolidays ?? [];
  const [exportSettingsStatus, setExportSettingsStatus] = useState<"loading" | "ready" | "error">(
    settingsRepository && !(workSettingsOverride && holidaysOverride) ? "loading" : "ready",
  );
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportControllerRef = useRef<AbortController | null>(null);

  const visibleMetaDates = useMemo<readonly WorkDate[]>(() => {
    if (calendar.view === "month") return derived.monthDates;
    if (calendar.view === "week") return derived.weekDates;
    return [calendar.anchorDate];
  }, [calendar.view, calendar.anchorDate, derived.monthDates, derived.weekDates]);

  const dayMeta = useMemo<ReadonlyMap<WorkDate, WorkCalendarDayMeta>>(
    () => buildWorkCalendarDayMetaMap(visibleMetaDates, effectiveWorkSettings, effectiveHolidays),
    [visibleMetaDates, effectiveWorkSettings, effectiveHolidays],
  );

  const metaRange = useMemo(
    () => getWorkCalendarDateRange(
      calendar.view === "team" ? "day" : calendar.view,
      calendar.anchorDate,
    ),
    [calendar.view, calendar.anchorDate],
  );

  /**
   * Muat pengaturan dan libur untuk rentang yang terlihat. Kegagalan tidak
   * memblokir kalender: pengaturan jatuh ke default dan libur disembunyikan,
   * sementara pekerjaan tetap tampil.
   */
  useEffect(() => {
    if (!settingsRepository) return undefined;
    if (workSettingsOverride && holidaysOverride) return undefined;

    const controller = new AbortController();
    let active = true;
    setExportSettingsStatus("loading");

    const load = async (): Promise<void> => {
      let failed = false;
      if (!workSettingsOverride) {
        try {
          const settings = await settingsRepository.getWorkSettings(controller.signal);
          if (!active || controller.signal.aborted) return;
          setLoadedWorkSettings(normalizeWorkSettings(settings));
        } catch {
          if (!active || controller.signal.aborted) return;
          setLoadedWorkSettings(DEFAULT_WORK_CALENDAR_WORK_SETTINGS);
          failed = true;
        }
      }

      if (!holidaysOverride) {
        try {
          const holidays = await settingsRepository.listHolidays({
            fromDate: metaRange.fromDate,
            toDate: metaRange.toDate,
            signal: controller.signal,
          });
          if (!active || controller.signal.aborted) return;
          setLoadedHolidays(holidays);
        } catch {
          if (!active || controller.signal.aborted) return;
          setLoadedHolidays([]);
          failed = true;
        }
      }
      if (active && !controller.signal.aborted) setExportSettingsStatus(failed ? "error" : "ready");
    };

    void load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [settingsRepository, workSettingsOverride, holidaysOverride, metaRange.fromDate, metaRange.toDate]);

  useEffect(() => {
    setExportError(null);
    return () => exportControllerRef.current?.abort();
  }, [calendar.view, calendar.anchorDate, currentUser.id]);

  /**
   * Sinkronisasi URL (React Router) untuk tanggal acuan dan tampilan:
   * tanggal acuan selalu tercermin di query `date` dan tab di query `view`
   * supaya refresh/deep link membuka konteks yang sama. Ditulis dengan
   * `replace` agar history tetap fokus pada perubahan filter/halaman Tim.
   */
  useEffect(() => {
    if (!routeAdapter) return;
    routeAdapter.writeAnchorDate(calendar.anchorDate, { replace: true });
    routeAdapter.writeView(calendar.view, { replace: true });
  }, [routeAdapter, calendar.anchorDate, calendar.view]);

  /**
   * Adopsi navigasi luar (Back/Forward) untuk tanggal acuan dan tab. Navigasi
   * pertama (mount) dilewati karena sudah ditangani `initialView`/
   * `initialAnchorDate`.
   */
  const routeKey = routeAdapter?.key ?? null;
  const lastRouteKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!routeAdapter || routeKey === null) return;
    if (lastRouteKeyRef.current === null) {
      lastRouteKeyRef.current = routeKey;
      return;
    }
    if (lastRouteKeyRef.current === routeKey) return;
    lastRouteKeyRef.current = routeKey;

    const urlDate = routeAdapter.readAnchorDate();
    if (urlDate && urlDate !== calendar.anchorDate) calendar.setAnchorDate(urlDate);
    const urlView = routeAdapter.readView();
    if (urlView && urlView !== calendar.view) calendar.setView(urlView);
    // `calendar` sengaja tidak menjadi dependensi: adopsi hanya dipicu oleh
    // perubahan kunci URL agar tidak ada loop umpan-balik.
  }, [routeAdapter, routeKey]);

  /**
   * Seleksi detail selalu berasal dari URL (`?entry=<id>`) bila binding route
   * tersedia, sehingga refresh/deep link/Back/Forward konsisten (CAL-03 F4B).
   * Tanpa binding route (mis. workspace dipakai tertanam pada test/harness),
   * seleksi jatuh ke state lokal supaya kontrak UI tetap sama.
   */
  const [internalSelectedEntryId, setInternalSelectedEntryId] = useState<string | null>(null);
  const selectedEntryId = routeAdapter ? routeAdapter.readEntryId() : internalSelectedEntryId;
  const selectedEntryIdRef = useRef<string | null>(null);
  selectedEntryIdRef.current = selectedEntryId;

  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<StatusPrompt | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);
  /** Panel hari pada tampilan Bulan: tanggal yang sedang terbuka. */
  const [monthPanelDate, setMonthPanelDate] = useState<WorkDate | null>(null);
  const [expandedOwnerId, setExpandedOwnerId] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  /**
   * Filter status pribadi pada command surface (CAL-03 redesign tahap 1).
   * Dideklarasikan di sini agar dapat dipakai memo panel bulan di bawah.
   */
  const [statusFilter, setStatusFilter] = useState<WorkCalendarStatusFilter>(
    DEFAULT_WORK_CALENDAR_STATUS_FILTER,
  );
  /**
   * Quick Add kontekstual (CAL-03 F4B): tanggal target + area pemicu. `anchor`
   * adalah elemen tanggal yang diklik (dipakai popover desktop); `rect`
   * dipakai saat area pemicu tidak lagi tersedia. Tidak ada entry ganda: satu
   * tanggal hanya bisa punya satu panel pada satu waktu.
   */
  const [quickAddTarget, setQuickAddTarget] = useState<{
    date: WorkDate;
    anchor: HTMLElement | null;
  } | null>(null);
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [quickAddError, setQuickAddError] = useState<string | null>(null);
  /**
   * Editor pembuatan lengkap dari aksi "Tambah detail" pada Quick Add.
   * Quick Add selalu ditutup sebelum editor ini dibuka, sehingga keduanya
   * tidak pernah hidup bersamaan. Tanggal target + judul yang diketik
   * dipertahankan di sini.
   */
  const [createEditor, setCreateEditor] = useState<{
    date: WorkDate;
    title: string;
  } | null>(null);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createSubmittingRef = useRef(false);
  /**
   * Resolusi deep link Tim (`?view=team&entry=<id>`): entry mungkin belum
   * termuat massal setelah refresh. Resolver read-only `getEntryById`
   * menentukan apakah entry boleh dilihat.
   */
  const [resolvedTeamEntry, setResolvedTeamEntry] = useState<WorkEntry | null>(null);
  const [teamResolutionStatus, setTeamResolutionStatus] = useState<
    "idle" | "loading" | "ready"
  >("idle");
  const isCompact = useWorkCalendarCompact();
  /**
   * Entry yang menunggu konfirmasi hapus. Selama state ini terisi, tidak ada
   * pemanggilan `repository.deleteEntry`. `AlertDialog` memakai `open` yang
   * dikendalikan UI (bukan `AlertDialogTrigger`) supaya fokus kembali ke
   * tombol menu pemicu setelah `Batal` tanpa dipaksa membuka menu lagi.
   */
  const [pendingDeleteEntryId, setPendingDeleteEntryId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  /** Id entry yang menunggu konfirmasi; dipakai untuk memulihkan fokus. */
  const deleteTriggerIdRef = useRef<string | null>(null);
  const quickEntryInputRef = useRef<HTMLInputElement>(null);

  const viewDate = calendar.anchorDate;
  const quickEntryDate = calendar.view === "day" ? calendar.anchorDate : calendar.today;

  const selectedEntryLocal = useMemo(
    () =>
      resolveSelectedWorkEntry({
        requestedId: selectedEntryId,
        entries: calendar.entries,
        extraEntries: teamOverview.memberEntries,
      }),
    [calendar.entries, teamOverview.memberEntries, selectedEntryId],
  );

  /**
   * Mode Tim server-side memuat pekerjaan anggota secara lazy, sehingga deep
   * link setelah refresh belum ada di `memberEntries`. Hanya dalam kondisi itu
   * resolver `getEntryById` dijalankan — mode lain tetap memakai data yang
   * sudah dimuat supaya tidak ada perluasan cakupan.
   */
  const needsTeamEntryResolution =
    calendar.view === "team" && selectedEntryId !== null && selectedEntryLocal === null;

  useEffect(() => {
    if (!needsTeamEntryResolution || selectedEntryId === null) {
      setResolvedTeamEntry(null);
      setTeamResolutionStatus("idle");
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setResolvedTeamEntry(null);
    setTeamResolutionStatus("loading");

    void repository
      .getEntryById({ entryId: selectedEntryId, signal: controller.signal })
      .then((entry) => {
        // Permintaan lama tidak boleh menimpa hasil baru.
        if (!active || controller.signal.aborted) return;
        setResolvedTeamEntry(entry);
        setTeamResolutionStatus("ready");
      })
      .catch(() => {
        if (!active || controller.signal.aborted) return;
        setResolvedTeamEntry(null);
        setTeamResolutionStatus("ready");
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [needsTeamEntryResolution, repository, selectedEntryId]);

  const selectedEntry = selectedEntryLocal ?? resolvedTeamEntry;
  const selectedEntryIdForEvents = selectedEntry?.id ?? null;
  const selectedEntryUpdatedAt = selectedEntry?.updatedAt ?? null;

  /**
   * Riwayat peristiwa detail (CAL-03 F5). Dimuat per entry yang terbuka,
   * dibatalkan saat ganti/tutup, dan tidak pernah memblokir tampilan detail:
   * kegagalan cukup menyembunyikan timeline. `updatedAt` menjadi pemicu
   * muat ulang sehingga aksi siklus hidup langsung menampilkan peristiwanya.
   */
  const [entryEvents, setEntryEvents] = useState<readonly WorkEntryEvent[]>([]);
  const [entryEventsStatus, setEntryEventsStatus] = useState<"idle" | "loading" | "ready">("idle");

  useEffect(() => {
    if (selectedEntryIdForEvents === null) {
      setEntryEvents([]);
      setEntryEventsStatus("idle");
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setEntryEventsStatus("loading");

    void repository
      .listEntryEvents({ entryId: selectedEntryIdForEvents, signal: controller.signal })
      .then((events) => {
        if (!active || controller.signal.aborted) return;
        setEntryEvents(events);
        setEntryEventsStatus("ready");
      })
      .catch(() => {
        if (!active || controller.signal.aborted) return;
        setEntryEvents([]);
        setEntryEventsStatus("ready");
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [repository, selectedEntryIdForEvents, selectedEntryUpdatedAt]);

  /**
   * Setelah entry Tim teresolusi dari deep link, buka baris anggota yang
   * sedang tampil (bila ada) supaya keterkaitan panel dan baris terlihat.
   * Anggota di luar halaman/filter aktif tidak menghalangi detail terbuka.
   */
  useEffect(() => {
    if (calendar.view !== "team" || !selectedEntry) return;
    if (teamOverviewRepository === undefined) return;
    if (teamOverview.expandedMemberId === selectedEntry.ownerId) return;
    const memberVisible = (teamOverview.data?.members ?? []).some(
      (member) => member.owner.id === selectedEntry.ownerId,
    );
    if (!memberVisible) return;
    teamOverview.toggleMember(selectedEntry.ownerId);
  }, [calendar.view, selectedEntry, teamOverview, teamOverviewRepository]);

  /** Data yang relevan untuk detail sudah selesai dimuat. */
  const detailDataReady =
    !calendar.isLoading &&
    (calendar.view !== "team" ||
      (teamOverview.status !== "loading" &&
        (!needsTeamEntryResolution || teamResolutionStatus === "ready")));

  /**
   * Peta pemilik untuk detail. Mode Tim server hanya menyediakan anggota dari
   * pencarian terbatas dan halaman yang sedang tampil, sehingga nama diambil
   * dari data halaman yang sudah dimuat — bukan dari seluruh roster.
   */
  const ownerById = useMemo(() => {
    const map = new Map<string, WorkEntryOwner>();
    for (const member of teamMembers ?? []) map.set(member.id, member);
    for (const option of teamOverview.memberOptions) {
      if (!map.has(option.id)) {
        map.set(option.id, {
          id: option.id,
          name: option.label,
          jobTitle: option.sublabel,
        });
      }
    }
    for (const member of teamOverview.data?.members ?? []) {
      if (!map.has(member.owner.id)) map.set(member.owner.id, member.owner);
    }
    return map;
  }, [teamMembers, teamOverview.memberOptions, teamOverview.data]);

  const monthPanelEntries = useMemo(() => {
    if (!monthPanelDate) return [] as WorkEntry[];
    return selectWorkEntriesForDate(calendar.entries, monthPanelDate, calendar.today);
  }, [calendar.entries, monthPanelDate, calendar.today]);

  const monthPanelProgress = useMemo<WorkProgressCounts>(
    () => computeWorkProgress(monthPanelEntries, calendar.today),
    [monthPanelEntries, calendar.today],
  );

  const daySummary = useMemo(
    () =>
      derived.daySummaries.find((summary) => summary.date === viewDate) ?? {
        date: viewDate,
        entries: [] as WorkEntry[],
        progress: computeWorkProgress([], calendar.today),
      },
    [derived.daySummaries, viewDate, calendar.today],
  );

  /**
   * Filter status pribadi (CAL-03 redesign tahap 1). Filter hanya menyaring,
   * tidak pernah mengurutkan ulang: urutan waktu kerja tetap dipegang
   * `compareWorkEntries` di tingkat repository, sehingga pekerjaan berjam
   * tetap bermakna setelah difilter. Filter bersifat pribadi — mode Tim
   * (read-only) tidak pernah memakainya.
   */
  const filterEntries = useCallback(
    (entries: readonly WorkEntry[]) =>
      filterWorkEntriesByStatus(entries, statusFilter, calendar.today),
    [statusFilter, calendar.today],
  );

  const filteredDaySummary = useMemo(
    () => ({ ...daySummary, entries: filterEntries(daySummary.entries) }),
    [daySummary, filterEntries],
  );

  const filteredWeekSummaries = useMemo(
    () =>
      derived.daySummaries.map((summary) => ({
        ...summary,
        entries: filterEntries(summary.entries),
      })),
    [derived.daySummaries, filterEntries],
  );

  const filteredMonthCells = useMemo(
    () =>
      derived.monthCells.map((cell) => ({ ...cell, entries: filterEntries(cell.entries) })),
    [derived.monthCells, filterEntries],
  );

  // ==== Mutasi ====

  const createEntry = useCallback(
    async (workDate: WorkDate, title: string): Promise<boolean> => {
      setQuickSaving(true);
      setQuickError(null);
      try {
        const draft: WorkEntryDraft = {
          ownerId: currentUser.id,
          workDate,
          title,
          status: "planned",
          kind: "work",
          isAllDay: true,
        };
        const created = await repository.createEntry(draft);
        calendar.applyLocalEntry(created);
        return true;
      } catch (thrown) {
        setQuickError(
          thrown instanceof Error && thrown.message
            ? thrown.message
            : "Pekerjaan gagal disimpan. Coba lagi.",
        );
        return false;
      } finally {
        setQuickSaving(false);
      }
    },
    [calendar, currentUser.id, repository],
  );

  const handleQuickSubmit = useCallback(
    (title: string) => {
      void (async () => {
        const ok = await createEntry(quickEntryDate, title);
        // Input baru dikosongkan setelah simpan berhasil.
        if (ok) setQuickTitle("");
      })();
    },
    [createEntry, quickEntryDate],
  );

  const patchEntry = useCallback(
    async (entry: WorkEntry, patch: WorkEntryPatch): Promise<boolean> => {
      setSavingEntryId(entry.id);
      setMutationError(null);
      try {
        const updated = await repository.updateEntry({
          entryId: entry.id,
          patch,
          expectedUpdatedAt: entry.updatedAt,
        });
        calendar.applyLocalEntry(updated);
        return true;
      } catch (thrown) {
        setMutationError(
          isWorkEntryConflictError(thrown)
            ? thrown instanceof Error && thrown.message
              ? thrown.message
              : "Pembaruan gagal karena data telah berubah atau tidak ditemukan. Muat ulang halaman."
            : thrown instanceof Error && thrown.message
              ? thrown.message
              : "Perubahan gagal disimpan. Coba lagi.",
        );
        return false;
      } finally {
        setSavingEntryId(null);
      }
    },
    [calendar, repository],
  );

  const handleUpdateTitle = useCallback(
    (entry: WorkEntry, title: string) => {
      void patchEntry(entry, { title });
    },
    [patchEntry],
  );

  const handleRequestStatus = useCallback((entry: WorkEntry, status: WorkEntryStatus) => {
    if (entry.status === status) return;
    const followUp = getWorkEntryStatusFollowUp(status);
    if (followUp === null) {
      setPrompt(null);
      void (async () => {
        setSavingEntryId(entry.id);
        setMutationError(null);
        try {
          const updated = await repository.updateEntry({
            entryId: entry.id,
            patch: { status },
            expectedUpdatedAt: entry.updatedAt,
          });
          calendar.applyLocalEntry(updated);
        } catch (thrown) {
          setMutationError(
            isWorkEntryConflictError(thrown)
              ? thrown instanceof Error && thrown.message
                ? thrown.message
                : "Status gagal disimpan karena data telah berubah. Muat ulang halaman."
              : thrown instanceof Error && thrown.message
                ? thrown.message
                : "Status gagal disimpan. Coba lagi.",
          );
        } finally {
          setSavingEntryId(null);
        }
      })();
      return;
    }

    setPrompt({
      entryId: entry.id,
      entryTitle: entry.title,
      fromStatus: entry.status,
      target: status,
    });
  }, [calendar, repository]);

  const handleSubmitFollowUp = useCallback(
    async (entry: WorkEntry, value: string) => {
      if (!prompt) return;
      const text = normalizeWorkEntryText(value);
      if (!text) return;

      const patch: WorkEntryPatch =
        prompt.target === "completed"
          ? { status: "completed", realization: text, blockedReason: null }
          : { status: "blocked", blockedReason: text };

      const validation = validateWorkEntryInput({
        title: entry.title,
        status: prompt.target,
        kind: entry.kind,
        realization: patch.realization ?? entry.realization,
        blockedReason: patch.blockedReason ?? entry.blockedReason,
        notes: entry.notes,
        location: entry.location,
        startsAt: entry.startsAt,
        endsAt: entry.endsAt,
        workDate: entry.workDate,
      });

      if (!validation.ok) {
        setMutationError(
          validation.errors.realization ?? validation.errors.blockedReason ?? "Data belum lengkap.",
        );
        return;
      }

      const ok = await patchEntry(entry, patch);
      if (ok) setPrompt(null);
    },
    [patchEntry, prompt],
  );

  const handleCancelFollowUp = useCallback(() => {
    setPrompt(null);
    setMutationError(null);
  }, []);

  // ==== Seleksi detail lewat URL (CAL-03 F4B) ====

  /**
   * Membuka detail: push history baru sehingga Browser Back menutup panel,
   * bukan kembali ke halaman sebelumnya. Tanpa binding route, seleksi hanya
   * disimpan di state lokal.
   */
  const openEntryDetail = useCallback(
    (entry: WorkEntry) => {
      setMonthPanelDate(null);
      setQuickAddTarget(null);
      setCreateEditor(null);
      setCreateError(null);
      if (routeAdapter) {
        routeAdapter.writeEntryId(entry.id, { replace: false });
        return;
      }
      setInternalSelectedEntryId(entry.id);
    },
    [routeAdapter],
  );

  /**
   * Menutup detail: replace supaya entri history "detail terbuka" tidak
   * tertinggal dan tidak dapat dibuka ulang oleh Forward.
   */
  const closeEntryDetail = useCallback(() => {
    if (routeAdapter) {
      routeAdapter.writeEntryId(null, { replace: true });
      return;
    }
    setInternalSelectedEntryId(null);
  }, [routeAdapter]);

  /**
   * Perlindungan deep link: id `entry` yang tidak dapat diresolusi (tidak ada
   * atau bukan hak pengguna) dibuang dari URL — tetapi hanya setelah data
   * selesai dimuat, supaya deep link valid tidak terhapus saat loading.
   * Tanpa binding route, id lokal yang tidak lagi ada cukup dibersihkan.
   */
  useEffect(() => {
    if (
      !shouldDiscardWorkEntryQueryId({
        requestedId: selectedEntryId,
        resolvedEntry: selectedEntry,
        dataReady: detailDataReady,
      })
    ) {
      return;
    }
    if (routeAdapter) {
      routeAdapter.writeEntryId(null, { replace: true });
      return;
    }
    setInternalSelectedEntryId(null);
  }, [routeAdapter, selectedEntryId, selectedEntry, detailDataReady]);

  const handleDelete = useCallback(
    async (entry: WorkEntry) => {
      setIsDeleting(true);
      setMutationError(null);
      try {
        await repository.deleteEntry({
          entryId: entry.id,
          expectedUpdatedAt: entry.updatedAt,
        });
        calendar.removeLocalEntry(entry.id);
        if (selectedEntryIdRef.current === entry.id) closeEntryDetail();
        if (prompt?.entryId === entry.id) setPrompt(null);
      } catch (thrown) {
        setMutationError(
          isWorkEntryConflictError(thrown)
            ? thrown instanceof Error && thrown.message
              ? thrown.message
              : "Pekerjaan gagal dihapus karena data telah berubah. Muat ulang halaman."
            : thrown instanceof Error && thrown.message
              ? thrown.message
              : "Pekerjaan gagal dihapus. Coba lagi.",
        );
      } finally {
        setIsDeleting(false);
        setPendingDeleteEntryId(null);
      }
    },
    [calendar, closeEntryDetail, prompt, repository],
  );

  const pendingDeleteEntry = useMemo(
    () => calendar.entries.find((entry) => entry.id === pendingDeleteEntryId) ?? null,
    [calendar.entries, pendingDeleteEntryId],
  );

  const handleMoveToDate = useCallback(
    (entry: WorkEntry, date: WorkDate) => {
      void patchEntry(entry, { workDate: date });
    },
    [patchEntry],
  );

  const handleSaveDetail = useCallback(
    async (entry: WorkEntry, patch: WorkEntryPatch) => {
      setDetailSaving(true);
      const ok = await patchEntry(entry, patch);
      setDetailSaving(false);
      if (ok) closeEntryDetail();
    },
    [closeEntryDetail, patchEntry],
  );

  /**
   * Aksi cepat siklus hidup dari panel detail: patch baris yang sama tanpa
   * menutup panel, supaya pengguna langsung melihat status/timeline terbaru.
   */
  const handleQuickSaveDetail = useCallback(
    async (entry: WorkEntry, patch: WorkEntryPatch) => {
      setDetailSaving(true);
      await patchEntry(entry, patch);
      setDetailSaving(false);
    },
    [patchEntry],
  );

  // ==== Quick Add kontekstual (Minggu/Bulan) ====

  /**
   * Membuka Quick Add untuk satu tanggal. `event.currentTarget` disimpan
   * sebagai anchor popover desktop; bottom sheet mobile tidak memakainya.
   */
  const openQuickAdd = useCallback(
    (date: WorkDate, anchor: HTMLElement | null) => {
      setQuickAddTarget((current) =>
        current && current.date === date && current.anchor === anchor ? current : { date, anchor },
      );
      setQuickAddError(null);
      // Tidak ada modal bertumpuk: Quick Add menutup detail/editor yang terbuka.
      closeEntryDetail();
      setCreateEditor(null);
      setCreateError(null);
    },
    [closeEntryDetail],
  );

  const closeQuickAdd = useCallback(() => {
    setQuickAddTarget(null);
    setQuickAddError(null);
  }, []);

  /**
   * Simpan dari Quick Add. `quickAddSaving` + kunci sinkron di panel mencegah
   * entry ganda; entry baru langsung terlihat lewat `applyLocalEntry` tanpa
   * reload.
   */
  const handleQuickAddSubmit = useCallback(
    async (date: WorkDate, title: string): Promise<boolean> => {
      setQuickAddSaving(true);
      setQuickAddError(null);
      try {
        const draft: WorkEntryDraft = {
          ownerId: currentUser.id,
          workDate: date,
          title,
          status: "planned",
          kind: "work",
          isAllDay: true,
        };
        const created = await repository.createEntry(draft);
        calendar.applyLocalEntry(created);
        return true;
      } catch (thrown) {
        setQuickAddError(
          thrown instanceof Error && thrown.message
            ? thrown.message
            : "Pekerjaan gagal disimpan. Coba lagi.",
        );
        return false;
      } finally {
        setQuickAddSaving(false);
      }
    },
    [calendar, currentUser.id, repository],
  );

  /**
   * Aksi "Tambah detail" pada Quick Add: tutup Quick Add lalu buka editor
   * pembuatan lengkap pada tanggal + judul yang sama. Tidak ada entry yang
   * dibuat pada langkah ini; `createEntry` hanya dipanggil saat editor
   * disimpan. Quick Add dan editor lengkap tidak pernah hidup bersamaan.
   */
  const handleQuickAddOpenFullEditor = useCallback(
    (date: WorkDate, title: string) => {
      closeQuickAdd();
      setCreateError(null);
      createSubmittingRef.current = false;
      setCreateEditor({ date, title });
    },
    [closeQuickAdd],
  );

  /**
   * Simpan dari editor pembuatan lengkap. Tepat satu `createEntry` per
   * percobaan (dijaga kunci sinkron + `createSaving`); error tetap berada di
   * editor dan editor tidak ditutup.
   */
  const handleCreateSubmit = useCallback(
    async (input: WorkEntryCreateInput): Promise<boolean> => {
      if (createSubmittingRef.current) return false;
      createSubmittingRef.current = true;
      setCreateSaving(true);
      setCreateError(null);
      try {
        const draft: WorkEntryDraft = {
          ownerId: currentUser.id,
          workDate: input.workDate,
          title: input.title,
          status: "planned",
          kind: "work",
          isAllDay: input.isAllDay,
          startsAt: input.startsAt ?? null,
          endsAt: input.endsAt ?? null,
          location: input.location,
          notes: input.notes,
          dueDate: input.dueDate,
          colorSwatch: input.colorSwatch,
        };
        const created = await repository.createEntry(draft);
        calendar.applyLocalEntry(created);
        setCreateEditor(null);
        return true;
      } catch (thrown) {
        setCreateError(
          thrown instanceof Error && thrown.message
            ? thrown.message
            : "Pekerjaan gagal disimpan. Coba lagi.",
        );
        return false;
      } finally {
        createSubmittingRef.current = false;
        setCreateSaving(false);
      }
    },
    [calendar, currentUser.id, repository],
  );

  const closeCreateEditor = useCallback(() => {
    if (createSubmittingRef.current) return;
    setCreateEditor(null);
    setCreateError(null);
  }, []);

  // ==== Navigasi tampilan ====

  const handleSelectView = useCallback(
    (next: WorkCalendarViewMode) => {
      calendar.setView(next);
      setMonthPanelDate(null);
      closeEntryDetail();
      closeQuickAdd();
      setPrompt(null);
    },
    [calendar, closeEntryDetail, closeQuickAdd],
  );

  const handleAdd = useCallback(() => {
    const action = getWorkCalendarAddAction({
      view: calendar.view,
      anchorDate: calendar.anchorDate,
      today: calendar.today,
    });
    if (calendar.view !== action.targetView || calendar.anchorDate !== action.targetDate) {
      calendar.setView(action.targetView);
      calendar.setAnchorDate(action.targetDate);
    }
    // Fokus dipindahkan setelah render ulang agar input sudah terpasang.
    window.requestAnimationFrame(() => quickEntryInputRef.current?.focus());
  }, [calendar]);

  const openMonthDay = useCallback(
    (date: WorkDate) => {
      setMonthPanelDate(date);
      closeEntryDetail();
      closeQuickAdd();
      setPrompt(null);
    },
    [closeEntryDetail, closeQuickAdd],
  );

  /**
   * Aksi "Tambahkan pekerjaan ke tanggal ini" pada panel Bulan: pindah ke
   * tampilan Hari pada tanggal panel, lalu fokuskan quick entry. Tanggal
   * target adalah tanggal panel sehingga tidak pernah berbeda dari label.
   */
  const handleAddToMonthPanelDate = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!monthPanelDate) return;
      const date = monthPanelDate;
      calendar.setView("day");
      calendar.setAnchorDate(date);
      setMonthPanelDate(null);
      window.requestAnimationFrame(() => quickEntryInputRef.current?.focus());
      event.currentTarget.blur();
    },
    [calendar, monthPanelDate],
  );

  const openDayFromWeek = useCallback(
    (date: WorkDate) => {
      calendar.setView("day");
      calendar.setAnchorDate(date);
    },
    [calendar],
  );

  const interactions: WorkCalendarViewInteractionProps = {
    today: calendar.today,
    permissions: effectivePermissions,
    promptEntryId: prompt?.entryId ?? null,
    promptType: prompt ? getWorkEntryStatusFollowUp(prompt.target) : null,
    savingEntryId,
    selectedEntryId,
    onUpdateTitle: handleUpdateTitle,
    onRequestStatus: handleRequestStatus,
    onSubmitFollowUp: (entry, value) => {
      void handleSubmitFollowUp(entry, value);
    },
    onCancelFollowUp: handleCancelFollowUp,
    onOpenDetail: openEntryDetail,
    onMoveToDate: handleMoveToDate,
    onDelete: (entry) => {
      // Tidak ada penghapusan sebelum konfirmasi: hanya menyimpan target.
      deleteTriggerIdRef.current = entry.id;
      setPendingDeleteEntryId(entry.id);
    },
  };

  const addAction = getWorkCalendarAddAction({
    view: calendar.view,
    anchorDate: calendar.anchorDate,
    today: calendar.today,
  });

  const handleExportPdf = async (): Promise<void> => {
    if (exportControllerRef.current || calendar.isLoading || calendar.error || calendar.view === "team") return;
    if (exportSettingsStatus !== "ready") {
      setExportError("Pengaturan jam kerja atau hari libur belum berhasil dimuat. Muat ulang halaman lalu coba kembali.");
      return;
    }
    const controller = new AbortController();
    exportControllerRef.current = controller;
    setIsExporting(true);
    setExportError(null);
    const range = { ...metaRange };
    const exportEntries = filterEntries(calendar.ownEntries).filter((entry) =>
      isWorkEntryVisibleInRange(entry, range.fromDate, range.toDate, calendar.today),
    );
    const snapshotNow = now ? now() : new Date();
    try {
      const { exportWorkCalendarPdf } = await import("../lib/work-calendar-pdf");
      if (controller.signal.aborted) return;
      const pdf = await exportWorkCalendarPdf({
        entries: exportEntries,
        repository,
        owner: currentUser,
        settings: effectiveWorkSettings,
        holidays: effectiveHolidays,
        fromDate: range.fromDate,
        toDate: range.toDate,
        now: snapshotNow,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) pdf.save(`kalender-kerja-${range.fromDate}-${range.toDate}.pdf`);
    } catch {
      if (!controller.signal.aborted) setExportError("PDF belum dapat dibuat. Pastikan riwayat pekerjaan dapat dimuat, lalu coba kembali.");
    } finally {
      if (exportControllerRef.current === controller) {
        exportControllerRef.current = null;
        setIsExporting(false);
      }
    }
  };

  return (
    <div className="sigap-page work-calendar-scope">
      <WorkCalendarToolbar
        view={calendar.view}
        anchorDate={calendar.anchorDate}
        today={calendar.today}
        isTeamViewAvailable={calendar.isTeamViewAvailable}
        ownerFilterId={calendar.ownerFilterId}
        teamMembers={teamMembers ?? []}
        showOwnerFilter={teamOverviewRepository === undefined}
        addLabel={addAction.label}
        statusFilter={calendar.view === "team" ? undefined : statusFilter}
        onSelectStatusFilter={setStatusFilter}
        onSelectView={handleSelectView}
        onPrevious={calendar.goToPreviousRange}
        onNext={calendar.goToNextRange}
        onToday={calendar.goToToday}
        onSelectOwner={(ownerId) => calendar.setOwnerFilterId(ownerId)}
        onAdd={handleAdd}
        onExportPdf={() => { void handleExportPdf(); }}
        exportDisabled={calendar.isLoading || calendar.error !== null || filterEntries(calendar.ownEntries).length === 0 || exportSettingsStatus === "loading"}
        isExporting={isExporting}
      >
        {calendar.view === "day" ? (
          <div className="space-y-2.5 border-t border-border pt-2.5">
            <QuickWorkEntry
              value={quickTitle}
              isSaving={quickSaving}
              error={quickError}
              onChange={setQuickTitle}
              onSubmit={handleQuickSubmit}
              onDismissError={() => setQuickError(null)}
              inputRef={quickEntryInputRef}
            />
            {!calendar.isLoading && !calendar.error ? (
              <DailyProgressSummary counts={daySummary.progress} />
            ) : null}
          </div>
        ) : null}
      </WorkCalendarToolbar>

      {exportError ? <p role="alert" className="text-sm text-destructive">{exportError}</p> : null}

      {mutationError && (
        <div
          role="alert"
          data-testid="work-calendar-mutation-error"
          className="flex items-start gap-2 rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="flex-1">{mutationError}</span>
          <button
            type="button"
            onClick={() => setMutationError(null)}
            aria-label="Tutup pesan kesalahan"
            className="rounded-sm p-0.5 hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {calendar.isLoading && (
        <div aria-live="polite" aria-busy="true" className="space-y-2">
          <span className="sr-only">Memuat pekerjaan</span>
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="h-[74px] animate-pulse rounded-sm border border-border bg-muted/50"
            />
          ))}
        </div>
      )}

      {!calendar.isLoading && calendar.error && (
        <div
          role="alert"
          data-testid="work-calendar-load-error"
          className="flex flex-wrap items-center gap-2 rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="flex-1">Gagal memuat pekerjaan. Periksa koneksi lalu coba lagi.</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-sm"
            onClick={calendar.reload}
          >
            <LoaderCircle aria-hidden="true" />
            Coba lagi
          </Button>
        </div>
      )}

      {!calendar.isLoading && !calendar.error && calendar.view === "day" && (
        <DailyWorkView
          summary={filteredDaySummary}
          heading={formatWorkDateFull(viewDate)}
          interactions={interactions}
          dayMeta={dayMeta.get(viewDate)}
        />
      )}

      {/* Detail pekerjaan: satu pola untuk Hari, Minggu, Bulan, dan Tim.
          `AnimatePresence` memegang exit animation, sedangkan perilaku modal
          (focus trap, kunci scroll, Escape, overlay, pemulihan fokus) dimiliki
          `WorkCalendarModal` (Radix Dialog). Kunci per id memastikan ganti
          entry memainkan animasi masuk seperti panel baru. */}
      <AnimatePresence>
        {!calendar.error &&
          !calendar.isLoading &&
          detailDataReady &&
          selectedEntry && (
            <WorkEntryDetail
              key={selectedEntry.id}
              entry={selectedEntry}
              owner={ownerById.get(selectedEntry.ownerId)}
              today={calendar.today}
              events={entryEvents}
              eventsStatus={entryEventsStatus}
              readOnly={
                calendar.view === "team" || !effectivePermissions.canEditEntry(selectedEntry)
              }
              isSaving={calendar.view === "team" ? false : detailSaving}
              onSave={(patch) => {
                if (calendar.view === "team") return;
                void handleSaveDetail(selectedEntry, patch);
              }}
              onQuickSave={(patch) => {
                if (calendar.view === "team") return;
                void handleQuickSaveDetail(selectedEntry, patch);
              }}
              onClose={closeEntryDetail}
            />
          )}
      </AnimatePresence>

      {!calendar.isLoading && !calendar.error && calendar.view === "week" && (
        <WeeklyWorkView
          summaries={filteredWeekSummaries}
          interactions={interactions}
          dayMeta={dayMeta}
          onSelectDate={openDayFromWeek}
          onQuickAdd={(date, anchor) => openQuickAdd(date, anchor)}
        />
      )}

      {!calendar.isLoading && !calendar.error && calendar.view === "month" && (
        <>
          <MonthlyWorkView
            cells={filteredMonthCells}
            today={calendar.today}
            dayMeta={dayMeta}
            onOpenDay={openMonthDay}
            onQuickAdd={(date, anchor) => openQuickAdd(date, anchor)}
            onOpenEntry={(entry) => openEntryDetail(entry)}
          />

          {monthPanelDate && (
            <section
              aria-labelledby="work-month-panel-title"
              data-testid="work-month-day-panel"
              className="space-y-2 rounded-sm border border-border bg-card p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="work-month-panel-title" className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {formatWorkDateFull(monthPanelDate)}
                </h2>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-sm"
                    onClick={() => {
                      calendar.setView("day");
                      calendar.setAnchorDate(monthPanelDate);
                      setMonthPanelDate(null);
                    }}
                  >
                    Buka tampilan hari
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="rounded-sm"
                    onClick={() => setMonthPanelDate(null)}
                    aria-label="Tutup panel hari"
                  >
                    <X aria-hidden="true" />
                    Tutup
                  </Button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {monthPanelProgress.completed} selesai dari {monthPanelProgress.total} pekerjaan
                {monthPanelProgress.overdue > 0 ? `, ${monthPanelProgress.overdue} terlambat` : ""}
              </p>

              <WorkEntryList
                entries={filterEntries(monthPanelEntries)}
                emptyLabel="Belum ada pekerjaan pada tanggal ini."
                labelledBy="work-month-panel-title"
                {...interactions}
              />

              <Button
                type="button"
                size="sm"
                className="rounded-sm"
                data-testid="work-month-panel-add"
                onClick={handleAddToMonthPanelDate}
              >
                <Plus aria-hidden="true" />
                Tambahkan pekerjaan ke tanggal ini
              </Button>
            </section>
          )}
        </>
      )}

      {!calendar.isLoading && !calendar.error && calendar.view === "team" && (
        teamOverviewRepository !== undefined ? (
          <TeamOverviewView
            overview={teamOverview}
            interactions={interactions}
            workDate={calendar.anchorDate}
            departmentOptions={teamDepartmentOptions}
          />
        ) : (
          <TeamProgressView
            groups={derived.ownerGroups}
            interactions={interactions}
            expandedOwnerId={expandedOwnerId}
            isOwnerFiltered={derived.ownerFilter.isOwnerFiltered}
            selectedOwner={derived.ownerFilter.selectedOwner}
            onToggleOwner={(ownerId) =>
              setExpandedOwnerId((current) => (current === ownerId ? null : ownerId))
            }
          />
        )
      )}

      {/* Editor pembuatan lengkap dari "Tambah detail". Quick Add sudah ditutup
          sebelum ini dirender, jadi keduanya tidak pernah hidup bersamaan. */}
      <AnimatePresence>
        {createEditor && (
          <WorkEntryCreateDialog
            key={`work-entry-create-${createEditor.date}`}
            workDate={createEditor.date}
            initialTitle={createEditor.title}
            isSaving={createSaving}
            error={createError}
            onSubmit={handleCreateSubmit}
            onClose={closeCreateEditor}
            onDismissError={() => setCreateError(null)}
          />
        )}
      </AnimatePresence>

      {/* Quick Add kontekstual Minggu/Bulan: satu permukaan per tanggal. */}
      {quickAddTarget && (
        <QuickAddSurface
          workDate={quickAddTarget.date}
          isCompact={isCompact}
          anchor={quickAddTarget.anchor}
          isSaving={quickAddSaving}
          error={quickAddError}
          onSubmit={(title) => handleQuickAddSubmit(quickAddTarget.date, title)}
          onCancel={closeQuickAdd}
          onOpenFullEditor={handleQuickAddOpenFullEditor}
          onDismissError={() => setQuickAddError(null)}
        />
      )}

      {derived.ownerFilter.isOwnerFiltered && calendar.view === "team" && (
        <p className="sr-only" data-testid="work-calendar-owner-filter-state">
          Filter pemilik aktif: {derived.ownerFilter.selectedOwner?.name ?? ""}
        </p>
      )}

      {/*
        Konfirmasi hapus. Dialog dikendalikan lewat state sehingga:
        - tidak ada `deleteEntry` sebelum pengguna menekan `Hapus pekerjaan`;
        - `Batal` mengembalikan fokus ke tombol menu pemicu (perilaku Radix).
        Tidak ada undo palsu: repository benar-benar menghapus data.
      */}
      <AlertDialog
        open={pendingDeleteEntry !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setPendingDeleteEntryId(null);
        }}
      >
        <AlertDialogContent
          className="work-calendar-scope"
          onCloseAutoFocus={(event) => {
            // Pastikan fokus tidak hilang setelah Batal/Esc.
            event.preventDefault();
            const triggerId = deleteTriggerIdRef.current;
            const trigger = triggerId
              ? document.querySelector<HTMLElement>(`[data-work-entry-menu="${triggerId}"]`)
              : null;
            (trigger ?? quickEntryInputRef.current)?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus pekerjaan ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Pekerjaan{" "}
              <span className="font-medium text-foreground">
                &ldquo;{pendingDeleteEntry?.title ?? ""}&rdquo;
              </span>{" "}
              akan dihapus dan tidak dapat dikembalikan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                if (pendingDeleteEntry) void handleDelete(pendingDeleteEntry);
              }}
            >
              <Trash2 aria-hidden="true" />
              Hapus pekerjaan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
