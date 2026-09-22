/**
 * Tampilan Minggu: tujuh hari.
 *
 * Desktop memakai kolom yang stabil; mobile memakai daftar hari vertikal.
 * Perpindahan entry tidak selesai ke tanggal lain dilakukan lewat menu
 * tindakan pada baris, jadi drag-and-drop bukan satu-satunya cara.
 */

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  WorkCalendarDayMeta,
  WorkCalendarDaySummary,
  WorkDate,
} from "../types/work-calendar";
import { formatWorkDateShort, getDayName } from "../lib/work-calendar-date";
import { EMPTY_WORK_PROGRESS, getWorkWeekDayPreview } from "../lib/work-progress";
import {
  useWorkWeekIsCompact,
  useWorkWeekPreviewLimit,
} from "../hooks/use-work-week-preview-limit";
import {
  WorkEntryList,
  type WorkCalendarViewInteractionProps,
} from "./WorkEntryList";
import { AnimatePresence } from "./WorkCalendarMotion";
import { WeekDayPanel } from "./WeekDayPanel";
import { WorkCalendarDayBadge, getWorkCalendarDaySurfaceClassName } from "./WorkCalendarDayBadge";

export interface WeeklyWorkViewProps {
  summaries: readonly WorkCalendarDaySummary[];
  interactions: WorkCalendarViewInteractionProps;
  /**
   * Klasifikasi hari (kerja/nonkerja/libur) per tanggal (CAL-03 F6). Peta ini
   * datang dari `buildWorkCalendarDayMetaMap`; tanggal yang tidak ada dianggap
   * hari kerja.
   */
  dayMeta?: ReadonlyMap<WorkDate, WorkCalendarDayMeta>;
  onSelectDate: (date: WorkDate) => void;
  /**
   * Klik area kosong tanggal membuka Quick Add untuk tanggal itu (CAL-03
   * F4B). `anchor` adalah elemen yang diklik supaya popover desktop menempel
   * pada tanggal; tidak pernah dipicu oleh klik pekerjaan yang sudah ada
   * maupun oleh `+N pekerjaan lainnya`.
   */
  onQuickAdd: (date: WorkDate, anchor: HTMLElement) => void;
}

export function WeeklyWorkView({
  summaries,
  interactions,
  dayMeta,
  onSelectDate,
  onQuickAdd,
}: WeeklyWorkViewProps) {
  // Satu daftar preview untuk mobile dan desktop: batasnya dihitung di JS
  // supaya tidak ada DOM aksesibel ganda antar layout.
  const previewLimit = useWorkWeekPreviewLimit();
  const isCompact = useWorkWeekIsCompact();

  // `+N pekerjaan lainnya` membuka panel hari dalam konteks Minggu (CAL-03
  // tahap 2) alih-alih memindahkan pengguna ke tampilan Hari.
  const [panel, setPanel] = useState<{ date: WorkDate; anchor: HTMLElement } | null>(null);

  // Panel ditutup bila tanggalnya tidak lagi ada dalam minggu yang tampil
  // (mis. pengguna pindah minggu) supaya tidak menampilkan data basi.
  useEffect(() => {
    if (!panel) return;
    if (!summaries.some((summary) => summary.date === panel.date)) setPanel(null);
  }, [panel, summaries]);

  const panelSummary = panel ? summaries.find((summary) => summary.date === panel.date) : null;

  // Detail pekerjaan dan konfirmasi hapus merupakan lapisan di atas panel;
  // panel ditutup lebih dulu supaya tidak ada dua permukaan bertumpuk.
  const panelInteractions: WorkCalendarViewInteractionProps = {
    ...interactions,
    onOpenDetail: (entry) => {
      setPanel(null);
      interactions.onOpenDetail(entry);
    },
    onDelete: (entry) => {
      setPanel(null);
      interactions.onDelete(entry);
    },
  };

  return (
    <section aria-label="Tampilan minggu" className="space-y-2">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
        {summaries.map((summary) => {
          const isToday = summary.date === interactions.today;
          const headingId = `work-week-heading-${summary.date}`;
          const meta = dayMeta?.get(summary.date);
          const { preview, hiddenCount } = getWorkWeekDayPreview(
            summary.entries,
            interactions.today,
            previewLimit,
          );
          return (
            <div
              key={summary.date}
              data-testid={`work-week-column-${summary.date}`}
              data-day-kind={meta?.kind ?? "work_day"}
              onClick={(event) => {
                // Hanya klik pada area kosong kolom yang membuka Quick Add.
                // Klik entry/`+N`/header sudah ditangani tombolnya sendiri dan
                // tidak boleh menghasilkan entry ganda (event bubbling).
                if (event.defaultPrevented) return;
                if (event.target !== event.currentTarget) return;
                onQuickAdd(summary.date, event.currentTarget);
              }}
              className={cn(
                "flex min-w-0 flex-col rounded-sm border p-2",
                getWorkCalendarDaySurfaceClassName(meta),
                isToday ? "border-primary/50" : "border-border",
              )}
            >
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectDate(summary.date);
                  }}
                  className="flex min-h-touch min-w-0 flex-1 flex-col justify-center rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Buka tampilan hari ${formatWorkDateShort(summary.date)}`}
                >
                  <span className="flex items-baseline justify-between gap-1">
                    <span className="text-xs font-semibold text-foreground">
                      {getDayName(summary.date, { short: true })}
                    </span>
                    <span
                      className={cn(
                        "text-xs",
                        isToday ? "font-semibold text-primary" : "text-muted-foreground",
                      )}
                    >
                      {summary.date.slice(8)}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {summary.progress.completed}/{summary.progress.total} selesai
                    {summary.progress.overdue > 0 ? `, ${summary.progress.overdue} terlambat` : ""}
                  </span>
                </button>
                {/*
                  Affordance tambah per tanggal. Selalu tersedia (termasuk
                  hari nonkerja) dan menjadi satu-satunya jalur keyboard ke
                  Quick Add dari Minggu.
                */}
                <button
                  type="button"
                  data-testid={`work-week-quick-add-${summary.date}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onQuickAdd(summary.date, event.currentTarget);
                  }}
                  aria-label={`Tambah pekerjaan pada ${formatWorkDateShort(summary.date)}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <h3 id={headingId} className="sr-only">
                Pekerjaan {formatWorkDateShort(summary.date)}
              </h3>

              {meta && meta.kind !== "work_day" && (
                <WorkCalendarDayBadge meta={meta} className="mt-1.5 self-start" />
              )}

              <div
                className="mt-2 min-w-0"
                onClick={(event) => {
                  // Klik pada ruang kosong di dalam daftar (mis. padding list,
                  // jarak antar baris, empty state) tetap milik tanggal ini.
                  // Klik entry/`+N` tidak sampai ke sini karena anak-anaknya
                  // menghentikan propagasi.
                  if (event.target !== event.currentTarget) return;
                  onQuickAdd(summary.date, event.currentTarget);
                }}
              >
                {summary.entries.length === 0 ? (
                  <button
                    type="button"
                    data-testid={`work-week-empty-${summary.date}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onQuickAdd(summary.date, event.currentTarget);
                    }}
                    aria-label={`Tambah pekerjaan pada ${formatWorkDateShort(summary.date)}`}
                    className="flex min-h-touch w-full flex-col items-center justify-center rounded-sm border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Plus className="mx-auto mb-1 h-3.5 w-3.5" aria-hidden="true" />
                    Tambah pekerjaan
                  </button>
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
                        onClick={(event) => {
                          event.stopPropagation();
                          setPanel({ date: summary.date, anchor: event.currentTarget });
                        }}
                        aria-label={`Buka ${hiddenCount} pekerjaan lainnya pada ${formatWorkDateShort(summary.date)}`}
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

      <AnimatePresence>
        {panel && (
          <WeekDayPanel
            key={panel.date}
            date={panel.date}
            entries={panelSummary?.entries ?? []}
            progress={panelSummary?.progress ?? EMPTY_WORK_PROGRESS}
            interactions={panelInteractions}
            isCompact={isCompact}
            anchor={panel.anchor}
            onClose={() => setPanel(null)}
            onOpenDay={(date) => {
              setPanel(null);
              onSelectDate(date);
            }}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
