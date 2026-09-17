/**
 * Pembungkus presentasi Quick Add (CAL-03 F4B).
 *
 * Satu komponen memilih pola berdasarkan lebar viewport sehingga tidak pernah
 * ada dua panel aksesibel untuk satu tanggal:
 * - desktop/tablet: popover yang menempel pada area tanggal (`PopoverAnchor`
 *   dengan `virtualRef`), sehingga posisinya selalu terkait tanggal target;
 * - mobile: bottom sheet yang menempel ke bawah dan tahan virtual keyboard
 *   (input berada di atas, panel tidak melampaui `85dvh`).
 *
 * Motion dibatasi pada fade overlay + slide ringan dan memakai
 * `prefers-reduced-motion`; tidak ada animasi dekoratif maupun layout besar.
 */

import { useEffect, useRef } from "react";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { WorkDate } from "../types/work-calendar";
import { QuickAddPanel } from "./QuickAddPanel";
import { WorkCalendarModal } from "./WorkCalendarModal";

export interface QuickAddSurfaceProps {
  workDate: WorkDate;
  /** true = bottom sheet (mobile), false = popover (desktop/tablet). */
  isCompact: boolean;
  /** Elemen tanggal yang diklik; dipakai sebagai anchor popover. */
  anchor: HTMLElement | null;
  isSaving: boolean;
  error: string | null;
  onSubmit: (title: string) => Promise<boolean>;
  onCancel: () => void;
  /** Membuka editor pembuatan lengkap dengan tanggal + judul yang diketik. */
  onOpenFullEditor: (date: WorkDate, title: string) => void;
  onDismissError: () => void;
}

export function QuickAddSurface({
  workDate,
  isCompact,
  anchor,
  isSaving,
  error,
  onSubmit,
  onCancel,
  onOpenFullEditor,
  onDismissError,
}: QuickAddSurfaceProps) {
  const titleId = `work-calendar-quick-add-title-${workDate}`;

  /**
   * Anchor Radix membutuhkan `Measurable` dan membaca `.current` setiap render.
   * Elemen DOM memenuhi kontrak `Measurable`, jadi cukup satu ref stabil.
   */
  const anchorRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    anchorRef.current = anchor;
  }, [anchor]);

  const panel = (
    <QuickAddPanel
      workDate={workDate}
      titleId={titleId}
      isCompact={isCompact}
      isSaving={isSaving}
      error={error}
      onSubmit={onSubmit}
      onCancel={onCancel}
      onOpenFullEditor={onOpenFullEditor}
      onDismissError={onDismissError}
    />
  );

  if (isCompact) {
    return (
      <WorkCalendarModal
        onRequestClose={onCancel}
        labelledBy={titleId}
        variant="bottom-sheet"
        panelTestId={`work-calendar-quick-add-surface-${workDate}`}
        overlayTestId={`work-calendar-quick-add-overlay-${workDate}`}
        overlayClassName="fixed inset-0 bg-black/45"
        panelClassName="work-calendar-scope fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-lg border border-border bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-elevated)]"
      >
        {panel}
      </WorkCalendarModal>
    );
  }

  return (
    <Popover
      open
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <PopoverAnchor virtualRef={anchorRef} />
      <PopoverContent
        data-testid={`work-calendar-quick-add-surface-${workDate}`}
        align="start"
        side="bottom"
        sideOffset={6}
        collisionPadding={12}
        className="work-calendar-scope w-80 rounded-sm p-3"
        // Fokus awal diatur QuickAddPanel (langsung ke input judul); biarkan
        // Radix tidak memindahkan fokus ke container agar tidak berkedip.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {panel}
      </PopoverContent>
    </Popover>
  );
}
