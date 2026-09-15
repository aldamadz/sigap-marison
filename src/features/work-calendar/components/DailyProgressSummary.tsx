/**
 * Ringkasan progres harian. Progres dihitung otomatis dari status entry;
 * pengguna tidak pernah mengisi persentase secara manual.
 */

import { Ban, CircleCheck, Hourglass, ListChecks, LoaderCircle } from "lucide-react";

import type { WorkProgressCounts } from "../types/work-calendar";
import { computeWorkCompletionPercent } from "../lib/work-progress";

export interface DailyProgressSummaryProps {
  title: string;
  counts: WorkProgressCounts;
  compact?: boolean;
}

export function DailyProgressSummary({ title, counts, compact = false }: DailyProgressSummaryProps) {
  const percent = computeWorkCompletionPercent(counts);

  const items = [
    {
      key: "in_progress",
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
    {
      key: "overdue",
      label: "Terlambat",
      value: counts.overdue,
      icon: Hourglass,
      tone: "text-overdue",
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
          <span className="font-semibold text-foreground">{counts.completed}</span> selesai dari{" "}
          <span className="font-semibold text-foreground">{counts.total}</span> pekerjaan
        </p>
      </div>

      <div
        role="progressbar"
        aria-label={`Progres ${title}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent} persen selesai`}
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <span
          className="block h-full rounded-full bg-primary transition-[width] duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>

      {!compact && (
        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {items.map((item) => (
            <div key={item.key} className="inline-flex items-center gap-1.5">
              <item.icon className={`h-3.5 w-3.5 ${item.tone}`} aria-hidden="true" />
              <dt className="text-muted-foreground">{item.label}</dt>
              <dd className="font-semibold text-foreground" data-testid={`progress-${item.key}`}>
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
