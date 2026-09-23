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

import { Ban, CircleCheck, CircleDashed, Hourglass, ListChecks, LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WorkProgressCounts } from "../types/work-calendar";
import { computeWorkCompletionPercent } from "../lib/work-progress";

export interface DailyProgressSummaryProps {
  /** Label untuk pembaca layar saja; tidak dirender sebagai heading. */
  title?: string;
  counts: WorkProgressCounts;
  /**
   * Strip penuh (bar + semua status) pada layar lebar; pada mobile hanya
   * bar + ringkasan jumlah. Selalu diberi `compact` saat ditanam di command
   * bar; responsivitas dipegang oleh kelas Tailwind.
   */
  compact?: boolean;
}

export function DailyProgressSummary({
  title,
  counts,
  compact = false,
}: DailyProgressSummaryProps) {
  const percent = computeWorkCompletionPercent(counts);
  const ariaLabel = title ? `Ringkasan progres ${title}` : "Ringkasan progres pekerjaan";

  const statusItems = [
    {
      key: "planned",
      label: "Direncanakan",
      value: counts.planned,
      icon: CircleDashed,
      tone: "text-muted-foreground",
    },
    {
      key: "inProgress",
      label: "Berjalan",
      value: counts.inProgress,
      icon: LoaderCircle,
      tone: "text-pending",
    },
    {
      key: "completed",
      label: "Selesai",
      value: counts.completed,
      icon: CircleCheck,
      tone: "text-success",
    },
    {
      key: "blocked",
      label: "Terhambat",
      value: counts.blocked,
      icon: Ban,
      tone: "text-destructive",
    },
  ] as const;

  return (
    <section
      aria-label={ariaLabel}
      data-testid="daily-progress-summary"
      className="min-w-0"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
          <ListChecks className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="font-semibold text-foreground" data-testid="progress-completed-total">
            {counts.completed}
          </span>{" "}
          selesai dari{" "}
          <span className="font-semibold text-foreground" data-testid="progress-total">
            {counts.total}
          </span>{" "}
          pekerjaan
        </p>

        <div
          className="inline-flex items-center gap-1.5"
          data-testid="progress-overdue-group"
        >
          <Hourglass
            className={cn(
              "h-3.5 w-3.5",
              counts.overdue > 0 ? "text-overdue" : "text-muted-foreground",
            )}
            aria-hidden="true"
          />
          <span className="text-muted-foreground">Terlambat</span>
          <span
            className={cn(
              "font-semibold",
              counts.overdue > 0 ? "text-overdue" : "text-foreground",
            )}
            data-testid="progress-overdue"
          >
            {counts.overdue}
          </span>
        </div>

        {!compact ? (
          <dl
            className="hidden sm:contents sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1 sm:text-xs"
            aria-label={`Jumlah status ${title ?? "pekerjaan"}`}
            data-testid="progress-status-items"
          >
            {statusItems.map((item) => (
              <div key={item.key} className="inline-flex items-center gap-1.5">
                <item.icon className={cn("h-3.5 w-3.5", item.tone)} aria-hidden="true" />
                <dt className="text-muted-foreground">{item.label}</dt>
                <dd className="font-semibold text-foreground" data-testid={`progress-${item.key}`}>
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      <div
        role="progressbar"
        aria-label={`Progres ${title ?? "pekerjaan"}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent} persen selesai`}
        aria-readonly="true"
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <span
          className="block h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
    </section>
  );
}
