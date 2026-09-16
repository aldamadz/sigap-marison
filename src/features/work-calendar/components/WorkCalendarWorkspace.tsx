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

import { useCallback, useMemo, useRef, useState } from "react";
import { AlertCircle, CalendarDays, LoaderCircle, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  WorkCalendarViewMode,
  WorkCalendarWorkspaceProps,
  WorkDate,
  WorkEntry,
  WorkEntryDraft,
  WorkEntryPatch,
  WorkEntryStatus,
  WorkProgressCounts,
} from "../types/work-calendar";
import { isWorkEntryConflictError } from "../lib/work-entry-conflict";
import { formatWorkDateFull } from "../lib/work-calendar-date";
import { getWorkEntryStatusFollowUp } from "../lib/work-entry-status";
import {
  computeWorkProgress,
  createWorkCalendarPermissions,
} from "../lib/work-progress";
import { normalizeWorkEntryText, validateWorkEntryInput } from "../lib/work-entry-validation";
import { getWorkCalendarAddAction } from "../lib/work-calendar-add-action";
import { useWorkCalendarDerivedView, useWorkCalendarView } from "../hooks/use-work-calendar-view";
import { WorkCalendarToolbar } from "./WorkCalendarToolbar";
import { QuickWorkEntry } from "./QuickWorkEntry";
import { DailyWorkView } from "./DailyWorkView";
import { WeeklyWorkView } from "./WeeklyWorkView";
import { MonthlyWorkView } from "./MonthlyWorkView";
import { TeamProgressView } from "./TeamProgressView";
import { WorkEntryList, type WorkCalendarViewInteractionProps } from "./WorkEntryList";
import { WorkEntryDetail } from "./WorkEntryDetail";

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
}: WorkCalendarWorkspaceProps) {
  const calendar = useWorkCalendarView({
    repository,
    currentUserId: currentUser.id,
    teamMembers,
    initialView: initialView ?? "day",
    initialAnchorDate,
    now,
  });

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

  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<StatusPrompt | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);
  /** Panel hari pada tampilan Bulan: tanggal yang sedang terbuka. */
  const [monthPanelDate, setMonthPanelDate] = useState<WorkDate | null>(null);
  const [expandedOwnerId, setExpandedOwnerId] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
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

  const selectedEntry = useMemo(
    () => calendar.entries.find((entry) => entry.id === selectedEntryId) ?? null,
    [calendar.entries, selectedEntryId],
  );

  const monthPanelEntries = useMemo(() => {
    if (!monthPanelDate) return [] as WorkEntry[];
    return calendar.entries.filter((entry) => entry.workDate === monthPanelDate);
  }, [calendar.entries, monthPanelDate]);

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
        if (selectedEntryId === entry.id) setSelectedEntryId(null);
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
    [calendar, prompt, repository, selectedEntryId],
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
      if (ok) setSelectedEntryId(null);
    },
    [patchEntry],
  );

  // ==== Navigasi tampilan ====

  const handleSelectView = useCallback(
    (next: WorkCalendarViewMode) => {
      calendar.setView(next);
      setMonthPanelDate(null);
      setSelectedEntryId(null);
      setPrompt(null);
    },
    [calendar],
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

  const openMonthDay = useCallback((date: WorkDate) => {
    setMonthPanelDate(date);
    setSelectedEntryId(null);
    setPrompt(null);
  }, []);

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
    onUpdateTitle: handleUpdateTitle,
    onRequestStatus: handleRequestStatus,
    onSubmitFollowUp: (entry, value) => {
      void handleSubmitFollowUp(entry, value);
    },
    onCancelFollowUp: handleCancelFollowUp,
    onOpenDetail: (entry) => setSelectedEntryId(entry.id),
    onMoveToDate: handleMoveToDate,
    onDelete: (entry) => {
      // Tidak ada penghapusan sebelum konfirmasi: hanya menyimpan target.
      deleteTriggerIdRef.current = entry.id;
      setPendingDeleteEntryId(entry.id);
    },
  };

  const toolbarHeading =
    calendar.view === "week"
      ? `Minggu ${derived.weekDates[0]}`
      : calendar.view === "month"
        ? `Bulan ${calendar.anchorDate.slice(0, 7)}`
        : viewDate;

  const addAction = getWorkCalendarAddAction({
    view: calendar.view,
    anchorDate: calendar.anchorDate,
    today: calendar.today,
  });

  return (
    <div className="sigap-page work-calendar-scope">
      <WorkCalendarToolbar
        view={calendar.view}
        anchorDate={calendar.anchorDate}
        today={calendar.today}
        heading={toolbarHeading}
        isTeamViewAvailable={calendar.isTeamViewAvailable}
        ownerFilterId={calendar.ownerFilterId}
        teamMembers={teamMembers ?? []}
        addLabel={addAction.label}
        onSelectView={handleSelectView}
        onPrevious={calendar.goToPreviousRange}
        onNext={calendar.goToNextRange}
        onToday={calendar.goToToday}
        onSelectOwner={(ownerId) => calendar.setOwnerFilterId(ownerId)}
        onAdd={handleAdd}
      />

      {calendar.view === "day" && (
        <QuickWorkEntry
          value={quickTitle}
          isSaving={quickSaving}
          error={quickError}
          onChange={setQuickTitle}
          onSubmit={handleQuickSubmit}
          onDismissError={() => setQuickError(null)}
          inputRef={quickEntryInputRef}
        />
      )}

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
          summary={daySummary}
          heading={formatWorkDateFull(viewDate)}
          interactions={interactions}
        />
      )}

      {!calendar.isLoading &&
        !calendar.error &&
        (calendar.view === "day" || calendar.view === "week") &&
        selectedEntry && (
          <WorkEntryDetail
            entry={selectedEntry}
            owner={(teamMembers ?? []).find((member) => member.id === selectedEntry.ownerId)}
            today={calendar.today}
            readOnly={!effectivePermissions.canEditEntry(selectedEntry)}
            isSaving={detailSaving}
            onSave={(patch) => {
              void handleSaveDetail(selectedEntry, patch);
            }}
            onClose={() => setSelectedEntryId(null)}
          />
        )}

      {!calendar.isLoading && !calendar.error && calendar.view === "week" && (
        <WeeklyWorkView
          summaries={derived.daySummaries}
          interactions={interactions}
          onSelectDate={openDayFromWeek}
        />
      )}

      {!calendar.isLoading && !calendar.error && calendar.view === "month" && (
        <>
          <MonthlyWorkView
            cells={derived.monthCells}
            today={calendar.today}
            onOpenDay={openMonthDay}
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
                entries={monthPanelEntries}
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
        <TeamProgressView
          groups={derived.ownerGroups}
          interactions={interactions}
          expandedOwnerId={expandedOwnerId}
          onToggleOwner={(ownerId) =>
            setExpandedOwnerId((current) => (current === ownerId ? null : ownerId))
          }
        />
      )}

      {selectedEntry && calendar.view === "team" && (
        <WorkEntryDetail
          entry={selectedEntry}
          owner={(teamMembers ?? []).find((member) => member.id === selectedEntry.ownerId)}
          today={calendar.today}
          readOnly
          isSaving={false}
          onSave={() => undefined}
          onClose={() => setSelectedEntryId(null)}
        />
      )}

      {calendar.ownerFilterId !== "all" && calendar.view === "team" && (
        <p className="sr-only" data-testid="work-calendar-owner-filter-state">
          Filter pemilik aktif:{" "}
          {(teamMembers ?? []).find((member) => member.id === calendar.ownerFilterId)?.name ?? ""}
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
