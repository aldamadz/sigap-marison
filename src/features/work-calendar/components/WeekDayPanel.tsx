/**
 * Panel hari kontekstual pada tampilan Minggu (CAL-03 tahap 2).
 *
 * Tombol `+N pekerjaan lainnya` membuka panel ini alih-alih memindahkan
 * pengguna ke tampilan Hari, sehingga konteks minggu tetap terlihat dan
 * perbandingan antar hari tidak hilang. Pekerjaan tetap dapat dibuka penuh
 * lewat aksi sekunder "Buka tampilan hari".
 *
 * Pola presentasi mengikuti `QuickAddSurface`:
 * - desktop/tablet: popover yang menempel pada tombol `+N` (`PopoverAnchor`
 *   dengan `virtualRef`);
 * - mobile: bottom sheet yang menempel ke bawah (Radix Dialog via
 *   `WorkCalendarModal`) sehingga tahan viewport sempit.
 */

import { useRef } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { WorkDate, WorkEntry, WorkProgressCounts } from "../types/work-calendar";
import { formatWorkDateFull } from "../lib/work-calendar-date";
import { WorkCalendarModal } from "./WorkCalendarModal";
import { WorkEntryList, type WorkCalendarViewInteractionProps } from "./WorkEntryList";

export interface WeekDayPanelProps {
  date: WorkDate;
  /** Seluruh entry tanggal tersebut (tidak dipotong preview limit). */
  entries: readonly WorkEntry[];
  progress: WorkProgressCounts;
  interactions: WorkCalendarViewInteractionProps;
  /** `true` = bottom sheet (mobile), `false` = popover (desktop/tablet). */
  isCompact: boolean;
  /** Elemen tombol `+N` sebagai anchor popover. */
  anchor: HTMLElement | null;
  onClose: () => void;
  /** Aksi sekunder ke tampilan Hari penuh. */
  onOpenDay: (date: WorkDate) => void;
}

export function WeekDayPanel({
  date,
  entries,
  progress,
  interactions,
  isCompact,
  anchor,
  onClose,
  onOpenDay,
}: WeekDayPanelProps) {
  const titleId = `work-week-day-panel-title-${date}`;

  // `virtualRef` popover membutuhkan `RefObject`; `anchor` adalah elemen tombol
  // `+N` yang disimpan pemanggil (pola yang sama dengan `QuickAddSurface`).
  const anchorRef = useRef<HTMLElement | null>(null);
  anchorRef.current = anchor;

  const content = (
    <div
      data-testid={`work-week-day-panel-${date}`}
      className="flex w-full flex-col gap-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={titleId} className="text-sm font-semibold text-foreground">
            Pekerjaan {formatWorkDateFull(date)}
          </h2>
          <p className="text-xs text-muted-foreground">
            {progress.completed}/{progress.total} selesai
            {progress.blocked > 0 ? `, ${progress.blocked} terhambat` : ""}
            {progress.overdue > 0 ? `, ${progress.overdue} terlambat` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup daftar pekerjaan"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="max-h-[min(22rem,60dvh)] overflow-y-auto">
        <WorkEntryList
          entries={entries}
          emptyLabel="Tidak ada pekerjaan pada tanggal ini."
          labelledBy={titleId}
          variant="full"
          {...interactions}
        />
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-11 shrink-0 rounded-sm"
        data-testid={`work-week-day-panel-open-day-${date}`}
        onClick={() => onOpenDay(date)}
      >
        Buka tampilan hari
      </Button>
    </div>
  );

  if (isCompact) {
    return (
      <WorkCalendarModal
        variant="bottom-sheet"
        onRequestClose={onClose}
        labelledBy={titleId}
        panelClassName="work-calendar-scope fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] w-full max-w-md flex-col gap-2 overflow-y-auto rounded-t-lg border border-border bg-popover p-3 pb-6 shadow-lg"
        panelTestId={`work-week-day-panel-surface-${date}`}
        overlayTestId={`work-week-day-panel-overlay-${date}`}
      >
        {content}
      </WorkCalendarModal>
    );
  }

  return (
    <Popover open onOpenChange={(next) => { if (!next) onClose(); }}>
      <PopoverAnchor virtualRef={anchorRef} />
      <PopoverContent
        align="start"
        // Jangan pindahkan fokus masuk secara otomatis; biarkan Radix
        // memulihkannya ke tombol `+N` saat ditutup.
        onOpenAutoFocus={(event) => event.preventDefault()}
        data-testid={`work-week-day-panel-surface-${date}`}
        className="work-calendar-scope flex max-h-[min(28rem,85dvh)] w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col gap-2 overflow-hidden p-3"
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}
