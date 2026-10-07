/**
 * Command surface Unified Work Calendar (CAL-03 redesign tahap 1).
 *
 * Prinsip produk:
 * - satu permukaan sticky yang memuat navigasi tanggal, segmented control
 *   Hari | Minggu | Bulan | Tim, filter status ringkas (Hari/Minggu/Bulan),
 *   filter pemilik hanya pada mode Tim, dan tombol Tambah;
 * - slot `children` dipakai workspace untuk menanamkan baris quick entry dan
 *   strip ringkasan progres HANYA pada mode Hari, sehingga tidak ada tumpukan
 *   kartu di luar command bar;
 * - tanggal hanya tampil sekali secara dominan (heading utama);
 * - seluruh target sentuh minimal 44px;
 * - tidak ada horizontal overflow pada mobile;
 * - filter status tidak pernah ditampilkan bersamaan dengan filter pemilik
 *   Tim (tidak ada dua kontrol filter yang saling bertentangan).
 */

import { type ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Download, LoaderCircle, Plus, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  WorkCalendarViewMode,
  WorkDate,
  WorkEntryOwner,
  WorkEntryOwnerId,
} from "../types/work-calendar";
import {
  formatWorkDateHeading,
  formatWorkMonthLabel,
  formatWorkWeekRangeLabel,
} from "../lib/work-calendar-date";
import { shouldShowToolbarAdd } from "../lib/work-calendar-add-action";
import {
  WORK_CALENDAR_STATUS_FILTERS,
  type WorkCalendarStatusFilter,
  type WorkCalendarStatusFilterOption,
} from "../lib/work-calendar-status-filter";

const VIEW_OPTIONS: ReadonlyArray<{ view: WorkCalendarViewMode; label: string }> = [
  { view: "day", label: "Hari" },
  { view: "week", label: "Minggu" },
  { view: "month", label: "Bulan" },
  { view: "team", label: "Tim" },
];

export interface WorkCalendarToolbarProps {
  view: WorkCalendarViewMode;
  anchorDate: WorkDate;
  today: WorkDate;
  isTeamViewAvailable: boolean;
  ownerFilterId: WorkEntryOwnerId | "all";
  teamMembers: readonly WorkEntryOwner[];
  /**
   * Mode Tim server-side mengelola filter anggota sendiri, sehingga filter
   * pemilik pada toolbar disembunyikan agar tidak ada dua kontrol filter
   * anggota yang saling bertentangan.
   */
  showOwnerFilter?: boolean;
  /** Label aksi tambah kontekstual untuk view aktif. */
  addLabel: string;
  /**
   * Filter status pribadi. Hanya dipasang pada mode Hari/Minggu/Bulan;
   * `undefined` berarti kontrol tidak ditampilkan (mode Tim).
   */
  statusFilter?: WorkCalendarStatusFilter;
  onSelectStatusFilter?: (filter: WorkCalendarStatusFilter) => void;
  onSelectView: (view: WorkCalendarViewMode) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onSelectOwner: (ownerId: WorkEntryOwnerId | "all") => void;
  onAdd: () => void;
  onExportPdf?: () => void;
  exportDisabled?: boolean;
  isExporting?: boolean;
  /** Slot quick entry + strip ringkasan progres (mode Hari). */
  children?: ReactNode;
}

export function WorkCalendarToolbar({
  view,
  anchorDate,
  today,
  isTeamViewAvailable,
  ownerFilterId,
  teamMembers,
  showOwnerFilter = true,
  addLabel,
  statusFilter,
  onSelectStatusFilter,
  onSelectView,
  onPrevious,
  onNext,
  onToday,
  onSelectOwner,
  onAdd,
  onExportPdf,
  exportDisabled = false,
  isExporting = false,
  children,
}: WorkCalendarToolbarProps) {
  const rangeLabel =
    view === "week"
      ? formatWorkWeekRangeLabel(anchorDate)
      : view === "month"
        ? formatWorkMonthLabel(anchorDate)
        : formatWorkDateHeading(anchorDate, today);
  const showAdd = shouldShowToolbarAdd(view);
  const showStatusFilter = statusFilter !== undefined && view !== "team";
  const statusFilterValue = statusFilter ?? "all";

  return (
    <div
      data-testid="work-calendar-command-bar"
      className="work-calendar-command-bar sticky top-0 z-30 bg-background/95 pb-4 pt-2 backdrop-blur-sm"
    >
      <div className="flex flex-col gap-4">
        {/* Header Row */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <CalendarDays className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Kalender Kerja</h1>
              <p className="text-sm text-muted-foreground">
                Kelola dan pantau seluruh aktivitas kerja harian dengan lebih mudah dan terstruktur.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Date Navigator */}
            <div className="flex h-11 items-center rounded-lg border border-border bg-card p-1 shadow-sm">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-md text-muted-foreground hover:text-foreground"
                onClick={onPrevious}
                aria-label="Rentang sebelumnya"
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-9 rounded-md px-3 text-sm font-medium text-foreground hover:bg-accent"
                onClick={onToday}
              >
                <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span data-testid="work-calendar-range-label">{rangeLabel}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-md text-muted-foreground hover:text-foreground"
                onClick={onNext}
                aria-label="Rentang berikutnya"
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>

            {/* View Switcher */}
            <div
              role="group"
              aria-label="Pilih rentang tampilan"
              className="flex h-11 items-center rounded-lg border border-border bg-card p-1 shadow-sm"
            >
              {VIEW_OPTIONS.filter((option) => option.view !== "team" || isTeamViewAvailable).map(
                (option) => {
                  const isTeam = option.view === "team";
                  const isActive = view === option.view;
                  return (
                    <button
                      key={option.view}
                      type="button"
                      aria-pressed={isActive}
                      data-view-option={option.view}
                      onClick={() => onSelectView(option.view)}
                      className={cn(
                        "inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isActive
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      {isTeam && <Users className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                      {option.label}
                    </button>
                  );
                },
              )}
            </div>

            {showStatusFilter && onSelectStatusFilter !== undefined ? (
              <div className="w-full sm:w-40">
                <label htmlFor="work-calendar-status-filter" className="sr-only">
                  Filter status pekerjaan
                </label>
                <Select
                  value={statusFilterValue}
                  onValueChange={(value) =>
                    onSelectStatusFilter(value as WorkCalendarStatusFilter)
                  }
                >
                  <SelectTrigger
                    id="work-calendar-status-filter"
                    className="h-11 rounded-lg border-border bg-card font-medium shadow-sm"
                    aria-label="Filter status pekerjaan"
                    data-testid="work-calendar-status-filter-trigger"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="work-calendar-scope rounded-lg">
                    {WORK_CALENDAR_STATUS_FILTERS.map((option: WorkCalendarStatusFilterOption) => (
                      <SelectItem key={option.value} value={option.value} className="rounded-md">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {view === "team" && isTeamViewAvailable && showOwnerFilter ? (
              <div className="w-full sm:w-56">
                <label htmlFor="work-calendar-owner-filter" className="sr-only">
                  Filter pemilik pekerjaan
                </label>
                <Select value={ownerFilterId} onValueChange={(value) => onSelectOwner(value)}>
                  <SelectTrigger
                    id="work-calendar-owner-filter"
                    className="h-11 rounded-lg border-border bg-card font-medium shadow-sm"
                    aria-label="Filter pemilik pekerjaan"
                  >
                    <SelectValue placeholder="Semua anggota" />
                  </SelectTrigger>
                  <SelectContent className="work-calendar-scope rounded-lg">
                    <SelectItem value="all" className="rounded-md">Semua anggota</SelectItem>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id} className="rounded-md">
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {onExportPdf && view !== "team" ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0 rounded-lg border-border bg-card shadow-sm text-muted-foreground hover:text-foreground"
                aria-label="Export kalender ke PDF"
                title="Export kalender ke PDF"
                disabled={exportDisabled || isExporting}
                onClick={onExportPdf}
              >
                {isExporting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
              </Button>
            ) : null}
          </div>
        </div>

        {children ? <div className="min-w-0">{children}</div> : null}
      </div>
    </div>
  );
}
