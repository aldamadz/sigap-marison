/**
 * Toolbar Unified Work Calendar.
 *
 * Prinsip produk:
 * - header ringkas: navigasi tanggal, tombol Hari Ini, segmented control
 *   Hari | Minggu | Bulan | Tim, filter pemilik hanya pada mode Tim,
 *   dan tombol Tambah dengan ikon Plus;
 * - seluruh target sentuh minimal 44px;
 * - tidak ada horizontal overflow pada mobile.
 */

import { ChevronLeft, ChevronRight, Plus, Users } from "lucide-react";

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
  heading: string;
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
  onSelectView: (view: WorkCalendarViewMode) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onSelectOwner: (ownerId: WorkEntryOwnerId | "all") => void;
  onAdd: () => void;
}

export function WorkCalendarToolbar({
  view,
  anchorDate,
  today,
  heading,
  isTeamViewAvailable,
  ownerFilterId,
  teamMembers,
  showOwnerFilter = true,
  addLabel,
  onSelectView,
  onPrevious,
  onNext,
  onToday,
  onSelectOwner,
  onAdd,
}: WorkCalendarToolbarProps) {
  const rangeLabel =
    view === "week"
      ? formatWorkWeekRangeLabel(anchorDate)
      : view === "month"
        ? formatWorkMonthLabel(anchorDate)
        : formatWorkDateHeading(anchorDate, today);
  const showAdd = shouldShowToolbarAdd(view);

  return (
    <div className="sigap-toolbar">
      <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="w-11 shrink-0 rounded-sm"
            onClick={onPrevious}
            aria-label="Rentang sebelumnya"
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="w-11 shrink-0 rounded-sm"
            onClick={onNext}
            aria-label="Rentang berikutnya"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
          <Button type="button" variant="outline" className="shrink-0 rounded-sm" onClick={onToday}>
            Hari Ini
          </Button>

          <div className="ml-1 min-w-0">
            <p className="truncate text-sm font-semibold text-foreground" data-testid="work-calendar-range-label">
              {rangeLabel}
            </p>
            {view !== "month" && heading !== rangeLabel && (
              <p className="truncate text-xs text-muted-foreground">{formatWorkMonthLabel(anchorDate)}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Pilih rentang tampilan"
            className="flex items-center gap-1 rounded-sm border border-border bg-card p-0.5"
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
                      "inline-flex min-h-touch items-center gap-1.5 rounded-sm px-3 text-xs font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    {isTeam && <Users className="h-3.5 w-3.5" aria-hidden="true" />}
                    {option.label}
                  </button>
                );
              },
            )}
          </div>

          {view === "team" && isTeamViewAvailable && showOwnerFilter && (
            <div className="w-full sm:w-56">
              <label htmlFor="work-calendar-owner-filter" className="sr-only">
                Filter pemilik pekerjaan
              </label>
              <Select value={ownerFilterId} onValueChange={(value) => onSelectOwner(value)}>
                <SelectTrigger id="work-calendar-owner-filter" className="h-11 rounded-sm" aria-label="Filter pemilik pekerjaan">
                  <SelectValue placeholder="Semua anggota" />
                </SelectTrigger>
                <SelectContent className="work-calendar-scope">
                  <SelectItem value="all">Semua anggota</SelectItem>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showAdd && (
            <Button
              type="button"
              data-testid="work-calendar-toolbar-add"
              className="shrink-0 rounded-sm"
              onClick={onAdd}
              aria-label={addLabel}
            >
              <Plus aria-hidden="true" />
              {addLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
