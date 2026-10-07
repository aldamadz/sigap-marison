/**
 * Ringkasan progres harian. Progres dihitung otomatis dari status entry;
 * pengguna tidak pernah mengisi persentase secara manual.
 *
 * Seluruh status ditampilkan (Direncanakan, Berjalan, Selesai, Terhambat)
 * sehingga jumlahnya selalu dapat dijelaskan terhadap total:
 * planned + inProgress + completed + blocked = total.
 *
 * Terlambat adalah indikator lintas status, bukan bagian penjumlahan status,
 * sehingga ditampilkan terpisah dan tidak ikut menambah total.
 *
 * CAL-03 redesign tahap 1: komponen ini adalah strip ringkas di dalam command
 * surface, bukan kartu tersendiri. Tanggal tidak diulang di sini (sudah
 * dominan di toolbar); `title` hanya dipakai untuk labeling aksesibilitas.
 */

import { Ban, CalendarDays, CheckCircle2, CircleDashed, Clock, Hourglass, ListChecks, LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WorkProgressCounts } from "../types/work-calendar";
import { computeWorkCompletionPercent } from "../lib/work-progress";

export interface DailyProgressSummaryProps {
  title?: string;
  counts: WorkProgressCounts;
  compact?: boolean;
}

export function DailyProgressSummary({
  title,
  counts,
  compact = false,
}: DailyProgressSummaryProps) {
  const percent = computeWorkCompletionPercent(counts);
  const ariaLabel = title ? `Ringkasan progres ${title}` : "Ringkasan progres pekerjaan";

  return (
    <section
      aria-label={ariaLabel}
      data-testid="daily-progress-summary"
      className="flex flex-col gap-4 md:flex-row items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex flex-1 flex-wrap items-center gap-y-4 md:divide-x md:divide-border/60 w-full">
        {/* Total Kegiatan */}
        <div className="flex items-center gap-3 px-2 md:px-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CalendarDays className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Total Kegiatan</p>
            <p className="text-xl font-bold text-foreground">
              <span data-testid="progress-completed-total" className="hidden">{counts.completed}</span>
              <span data-testid="progress-total">{counts.total}</span> <span className="text-xs font-normal text-muted-foreground">kegiatan</span>
            </p>
          </div>
        </div>

        {/* Terlambat */}
        <div className="flex items-center gap-3 px-2 md:px-5" data-testid="progress-overdue-group">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Terlambat</p>
            <p className="text-lg font-bold text-foreground">
              <span data-testid="progress-overdue">{counts.overdue}</span> <span className="text-xs font-normal text-muted-foreground">0%</span>
            </p>
          </div>
        </div>

        {/* Direncanakan */}
        <div className="flex items-center gap-3 px-2 md:px-5" data-testid={compact ? undefined : "progress-status-items"}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
            <Clock className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Direncanakan</p>
            <p className="text-lg font-bold text-foreground">
              <span data-testid="progress-planned">{counts.planned}</span> <span className="text-xs font-normal text-muted-foreground">0%</span>
            </p>
          </div>
        </div>

        {/* Berjalan */}
        <div className="flex items-center gap-3 px-2 md:px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
            <LoaderCircle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Berjalan</p>
            <p className="text-lg font-bold text-foreground">
              <span data-testid="progress-inProgress">{counts.inProgress}</span> <span className="text-xs font-normal text-muted-foreground">0%</span>
            </p>
          </div>
        </div>

        {/* Selesai */}
        <div className="flex items-center gap-3 px-2 md:px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Selesai</p>
            <p className="text-lg font-bold text-foreground">
              <span data-testid="progress-completed">{counts.completed}</span> <span className="text-xs font-normal text-muted-foreground">{percent}%</span>
            </p>
          </div>
        </div>

        {/* Terhambat */}
        <div className="flex items-center gap-3 px-2 md:px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Hourglass className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Terhambat</p>
            <p className="text-lg font-bold text-foreground">
              <span data-testid="progress-blocked">{counts.blocked}</span> <span className="text-xs font-normal text-muted-foreground">0%</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
