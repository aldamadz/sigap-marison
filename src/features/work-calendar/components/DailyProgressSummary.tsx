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
 */

import { Ban, CircleCheck, CircleDashed, Hourglass, ListChecks, LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WorkProgressCounts } from "../types/work-calendar";
import { computeWorkCompletionPercent } from "../lib/work-progress";

export interface DailyProgressSummaryProps {
  title: string;
  counts: WorkProgressCounts;
  compact?: boolean;
}

export function DailyProgressSummary({ title, counts, compact = false }: DailyProgressSummaryProps) {
  const percent = computeWorkCompletionPercent(counts);

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
      aria-label={`Ringkasan progres ${title}`}
      data-testid="daily-progress-summary"
      className="rounded-sm border border-border bg-card px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
          <ListChecks className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          {title}
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground" data-testid="progress-completed-total">
            {counts.completed}
          </span>{" "}
          selesai dari <span className="font-semibold text-foreground" data-testid="progress-total">{counts.total}</span> pekerjaan
        </p>
      </div>

      <div
        role="progressbar"
        aria-label={`Progres ${title}`}
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

      {!compact && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <dl className="contents" aria-label={`Jumlah status ${title}`}>
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

          {/* Indikator lintas status: tidak pernah dijumlahkan ke total status. */}
          <div
            className="inline-flex items-center gap-1.5 border-l border-border pl-4 text-overdue"
            data-testid="progress-overdue-group"
          >
            <Hourglass className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="text-muted-foreground">Terlambat</span>
            <span className="font-semibold" data-testid="progress-overdue">
              {counts.overdue}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
