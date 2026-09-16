/**
 * Tampilan Bulan.
 *
 * Komposisi responsif:
 * - Mobile (< md): sel hanya memuat tanggal, jumlah selesai/total, dan
 *   indikator status/overdue yang ringkas. Tidak ada potongan judul satu
 *   huruf di dalam grid. Menekan sel membuka daftar hari yang terbaca penuh.
 * - Desktop/tablet (>= md): sel boleh menampilkan maksimal dua preview judul
 *   beserta tombol "+N lainnya".
 *
 * Tidak ada scrollbar horizontal maupun scrollbar di dalam sel tanggal.
 */

import { Hourglass } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WorkCalendarDayCell, WorkDate, WorkEntryStatus } from "../types/work-calendar";
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
          const progress = cell.progress;
          const compactItems = (
            [
              { key: "planned", value: progress.planned },
              { key: "in_progress", value: progress.inProgress },
              { key: "completed", value: progress.completed },
              { key: "blocked", value: progress.blocked },
            ] satisfies ReadonlyArray<{ key: WorkEntryStatus; value: number }>
          ).filter((item) => item.value > 0);

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
              <button
                type="button"
                data-testid={`work-month-open-${cell.date}`}
                onClick={() => onOpenDay(cell.date)}
                aria-label={`Buka daftar pekerjaan ${cell.date}`}
                // `-mx-1.5 px-1.5` memperluas area sentuh sampai tepi sel
                // supaya target >= 44px pada grid 7 kolom di layar sempit,
                // tanpa menggeser satu pun teks di dalamnya.
                className="-mx-1.5 flex min-h-touch min-w-0 items-center justify-between gap-1 rounded-sm px-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "text-xs font-semibold",
                    cell.isCurrentMonth ? "text-foreground" : "text-muted-foreground",
                    isToday && "text-primary",
                  )}
                >
                  {Number(cell.date.slice(8))}
                </span>
                {progress.total > 0 && (
                  <span
                    data-testid={`work-month-count-${cell.date}`}
                    className="rounded-sm bg-muted px-1 text-[10px] font-medium text-muted-foreground"
                  >
                    {progress.completed}/{progress.total}
                  </span>
                )}
              </button>

              {/* Indikator ringkas mobile: status dan overdue tanpa judul. */}
              {(compactItems.length > 0 || progress.overdue > 0) && (
                <div
                  data-testid={`work-month-compact-${cell.date}`}
                  className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 md:hidden"
                >
                  {compactItems.map((item) => (
                    <span key={item.key} className="inline-flex items-center text-[10px] text-muted-foreground">
                      <WorkEntryStatusGlyph status={item.key} className="h-3 w-3" />
                      <span className="ml-0.5 font-semibold text-foreground">{item.value}</span>
                    </span>
                  ))}
                  {progress.overdue > 0 && (
                    <span className="inline-flex items-center text-[10px] font-medium text-overdue">
                      <Hourglass className="h-3 w-3" aria-hidden="true" />
                      <span className="ml-0.5">{progress.overdue}</span>
                    </span>
                  )}
                </div>
              )}

              {/* Teks lengkap untuk pembaca layar, bukan warna saja. */}
              <span className="sr-only">
                {progress.total === 0
                  ? "Belum ada pekerjaan"
                  : `${progress.completed} dari ${progress.total} pekerjaan selesai, ${progress.planned} direncanakan, ${progress.inProgress} berjalan, ${progress.blocked} terhambat${
                      progress.overdue > 0 ? `, ${progress.overdue} terlambat` : ""
                    }`}
              </span>

              <div className="mt-1 hidden space-y-0.5 md:block">
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
                  className="mt-1 hidden min-h-touch items-center self-start rounded-sm px-1 text-[11px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:inline-flex"
                >
                  +{hiddenCount} lainnya
                </button>
              )}

              {progress.overdue > 0 && (
                <span className="mt-1 hidden text-[10px] font-medium text-overdue md:block">
                  {progress.overdue} terlambat
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
