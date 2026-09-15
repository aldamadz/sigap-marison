/**
 * Tampilan Bulan.
 *
 * Sel tanggal hanya memuat ringkasan: jumlah selesai/total, maksimal dua
 * entry preview, dan tombol "+N lainnya" untuk membuka panel hari.
 * Tidak ada internal scrollbar pada sel tanggal.
 */

import { cn } from "@/lib/utils";
import type { WorkCalendarDayCell, WorkDate } from "../types/work-calendar";
import { WORK_WEEKDAY_LABELS_ID } from "../lib/work-calendar-date";
import { getWorkMonthCellPreview } from "../lib/work-progress";
import { WorkEntryStatusGlyph } from "./WorkEntryStatusGlyph";

export interface MonthlyWorkViewProps {
  cells: readonly WorkCalendarDayCell[];
  today: WorkDate;
  onOpenDay: (date: WorkDate) => void;
}

export function MonthlyWorkView({ cells, today, onOpenDay }: MonthlyWorkViewProps) {
  return (
    <section aria-label="Tampilan bulan" className="space-y-2">
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
        {[1, 2, 3, 4, 5, 6, 0].map((weekday) => (
          <span key={weekday}>{WORK_WEEKDAY_LABELS_ID[weekday]}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const { preview, hiddenCount } = getWorkMonthCellPreview(cell.entries);
          const isToday = cell.date === today;
          return (
            <div
              key={cell.date}
              data-testid={`work-month-cell-${cell.date}`}
              data-current-month={cell.isCurrentMonth ? "true" : "false"}
              className={cn(
                "flex min-w-0 flex-col rounded-sm border p-1.5",
                cell.isCurrentMonth ? "bg-card" : "bg-muted/40",
                isToday ? "border-primary/60" : "border-border",
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={cn(
                    "text-xs font-semibold",
                    cell.isCurrentMonth ? "text-foreground" : "text-muted-foreground",
                    isToday && "text-primary",
                  )}
                >
                  {Number(cell.date.slice(8))}
                </span>
                {cell.progress.total > 0 && (
                  <span
                    data-testid={`work-month-count-${cell.date}`}
                    className="rounded-sm bg-muted px-1 text-[10px] font-medium text-muted-foreground"
                  >
                    {cell.progress.completed}/{cell.progress.total}
                  </span>
                )}
              </div>

              <div className="mt-1 space-y-0.5">
                {preview.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    data-testid={`work-month-preview-${entry.id}`}
                    onClick={() => onOpenDay(cell.date)}
                    title={entry.title}
                    aria-label={`Buka ${entry.title} pada ${cell.date}`}
                    className="flex min-h-touch w-full min-w-0 items-center gap-1 rounded-sm px-1 py-0.5 text-left text-[11px] text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <WorkEntryStatusGlyph status={entry.status} className="h-3 w-3" />
                    <span className="truncate">{entry.title}</span>
                  </button>
                ))}
              </div>

              {hiddenCount > 0 && (
                <button
                  type="button"
                  data-testid={`work-month-more-${cell.date}`}
                  onClick={() => onOpenDay(cell.date)}
                  className="mt-1 inline-flex min-h-touch items-center self-start rounded-sm px-1 text-[11px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  +{hiddenCount} lainnya
                </button>
              )}

              {cell.progress.overdue > 0 && (
                <span className="mt-1 text-[10px] font-medium text-overdue">
                  {cell.progress.overdue} terlambat
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
