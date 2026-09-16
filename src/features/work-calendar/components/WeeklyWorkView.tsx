/**
 * Tampilan Minggu: tujuh hari.
 *
 * Desktop memakai kolom yang stabil; mobile memakai daftar hari vertikal.
 * Perpindahan entry tidak selesai ke tanggal lain dilakukan lewat menu
 * tindakan pada baris, jadi drag-and-drop bukan satu-satunya cara.
 */

import { CalendarDays } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WorkCalendarDaySummary, WorkDate } from "../types/work-calendar";
import { formatWorkDateShort, getDayName } from "../lib/work-calendar-date";
import { getWorkWeekDayPreview } from "../lib/work-progress";
import { useWorkWeekPreviewLimit } from "../hooks/use-work-week-preview-limit";
import { WorkEntryList, type WorkCalendarViewInteractionProps } from "./WorkEntryList";

export interface WeeklyWorkViewProps {
  summaries: readonly WorkCalendarDaySummary[];
  interactions: WorkCalendarViewInteractionProps;
  onSelectDate: (date: WorkDate) => void;
}

export function WeeklyWorkView({ summaries, interactions, onSelectDate }: WeeklyWorkViewProps) {
  // Satu daftar preview untuk mobile dan desktop: batasnya dihitung di JS
  // supaya tidak ada DOM aksesibel ganda antar layout.
  const previewLimit = useWorkWeekPreviewLimit();

  return (
    <section aria-label="Tampilan minggu" className="space-y-2">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
        {summaries.map((summary) => {
          const isToday = summary.date === interactions.today;
          const headingId = `work-week-heading-${summary.date}`;
          const { preview, hiddenCount } = getWorkWeekDayPreview(
            summary.entries,
            interactions.today,
            previewLimit,
          );
          return (
            <div
              key={summary.date}
              data-testid={`work-week-column-${summary.date}`}
              className={cn(
                "flex min-w-0 flex-col rounded-sm border bg-card p-2",
                isToday ? "border-primary/50" : "border-border",
              )}
            >
              <button
                type="button"
                onClick={() => onSelectDate(summary.date)}
                className="flex min-h-touch flex-col justify-center rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Buka tampilan hari ${formatWorkDateShort(summary.date)}`}
              >
                <span className="flex items-baseline justify-between gap-1">
                  <span className="text-xs font-semibold text-foreground">
                    {getDayName(summary.date, { short: true })}
                  </span>
                  <span className={cn("text-xs", isToday ? "font-semibold text-primary" : "text-muted-foreground")}>
                    {summary.date.slice(8)}
                  </span>
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {summary.progress.completed}/{summary.progress.total} selesai
                  {summary.progress.overdue > 0 ? `, ${summary.progress.overdue} terlambat` : ""}
                </span>
              </button>

              <h3 id={headingId} className="sr-only">
                Pekerjaan {formatWorkDateShort(summary.date)}
              </h3>

              <div className="mt-2 min-w-0">
                {summary.entries.length === 0 ? (
                  <p className="rounded-sm border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground">
                    <CalendarDays className="mx-auto mb-1 h-3.5 w-3.5" aria-hidden="true" />
                    Kosong
                  </p>
                ) : (
                  <>
                    {/* Preview dibatasi (4 desktop/tablet, 3 mobile) supaya
                        kolom tidak tumbuh tanpa batas; tidak ada scroll
                        internal. Seluruh entry tetap dihitung pada agregat
                        progres di atas. */}
                    <WorkEntryList
                      entries={preview}
                      emptyLabel="Kosong"
                      labelledBy={headingId}
                      variant="compact"
                      {...interactions}
                    />
                    {hiddenCount > 0 && (
                      <button
                        type="button"
                        data-testid={`work-week-more-${summary.date}`}
                        onClick={() => onSelectDate(summary.date)}
                        aria-label={`Buka tampilan hari ${formatWorkDateShort(summary.date)} untuk ${hiddenCount} pekerjaan lainnya`}
                        className="mt-1.5 flex min-h-touch w-full items-center justify-center rounded-sm px-2 text-[11px] font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        +{hiddenCount} pekerjaan lainnya
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
