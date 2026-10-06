/**
 * Widget ringkasan CAL-03 F7: pekerjaan hari ini dan pekerjaan tertunda.
 *
 * Komponen ini murni presentasional: seluruh perhitungan berasal dari
 * `WorkCalendarDashboardSummary` sehingga bisa diuji tanpa jaringan.
 */

import { Link } from "react-router";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkEntry, WorkDate } from "../types/work-calendar";
import type { WorkCalendarDashboardSummary } from "../types/work-calendar-notifications";
import { getWorkEntryStatusMeta } from "../lib/work-entry-status";
import { formatWorkDateFull } from "../lib/work-calendar-date";

export interface WorkCalendarDashboardWidgetProps {
  summary: WorkCalendarDashboardSummary;
  today: WorkDate;
  loading?: boolean;
  error?: string | null;
  /** Tautan menuju kalender kerja; `null` menyembunyikan tombol. */
  calendarHref?: string | null;
}

interface WorkCalendarDashboardEntryRowProps {
  entry: WorkEntry;
  overdue: boolean;
}

const WorkCalendarDashboardEntryRow = ({
  entry,
  overdue,
}: WorkCalendarDashboardEntryRowProps) => {
  const meta = getWorkEntryStatusMeta(entry.status);
  return (
    <li
      data-work-calendar-dashboard-entry={entry.id}
      className="flex items-start gap-2 rounded-lg border border-border/60 bg-card px-3 py-2"
    >
      <meta.icon aria-hidden="true" className={cn("mt-0.5 h-4 w-4 shrink-0", meta.iconClassName)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{entry.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{meta.label}</span>
          {overdue ? (
            <span className="font-medium text-overdue" data-work-calendar-dashboard-overdue-flag>
              Lewat tenggat
            </span>
          ) : null}
        </p>
      </div>
    </li>
  );
};

export function WorkCalendarDashboardWidget({
  summary,
  today,
  loading = false,
  error = null,
  calendarHref = "/calendar",
}: WorkCalendarDashboardWidgetProps) {
  return (
    <section
      data-testid="work-calendar-dashboard-widget"
      aria-label="Ringkasan Kalender Kerja"
      className="sigap-panel flex flex-col gap-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Kalender Kerja</h3>
          <p className="text-xs text-muted-foreground">
            {formatWorkDateFull(today)} · Ringkasan pekerjaan hari ini dan tertunda.
          </p>
        </div>
        {calendarHref ? (
          <Link
            to={calendarHref}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 shrink-0")}
          >
            Buka kalender
          </Link>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-xs text-muted-foreground" data-testid="work-calendar-dashboard-loading">
          Memuat ringkasan…
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div
            data-testid="work-calendar-dashboard-today"
            className="rounded-xl border border-border bg-muted/30 p-3"
          >
            <p className="text-xs font-medium text-muted-foreground">Pekerjaan hari ini</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{summary.todayCount}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {summary.plannedCount} direncanakan · {summary.inProgressCount} berjalan
              {summary.blockedCount > 0 ? ` · ${summary.blockedCount} terhambat` : ""}
            </p>
          </div>

          <div
            data-testid="work-calendar-dashboard-overdue"
            className="rounded-xl border border-border bg-muted/30 p-3"
          >
            <p className="text-xs font-medium text-muted-foreground">Tertunda (lewat tenggat)</p>
            <p className={cn("mt-1 text-2xl font-bold", summary.overdueCount > 0 ? "text-overdue" : "text-foreground")}>
              {summary.overdueCount}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Belum selesai dan tenggat sudah lewat
            </p>
          </div>
        </div>
      )}

      {!loading && summary.todayEntries.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Hari ini
          </p>
          <ul className="space-y-2">
            {summary.todayEntries.slice(0, 5).map((entry) => (
              <WorkCalendarDashboardEntryRow key={entry.id} entry={entry} overdue={false} />
            ))}
          </ul>
        </div>
      ) : null}

      {!loading && summary.overdueEntries.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Tertunda
          </p>
          <ul className="space-y-2">
            {summary.overdueEntries.slice(0, 5).map((entry) => (
              <WorkCalendarDashboardEntryRow key={entry.id} entry={entry} overdue />
            ))}
          </ul>
        </div>
      ) : null}

      {!loading && !error && summary.todayCount === 0 && summary.overdueCount === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="work-calendar-dashboard-empty">
          Tidak ada pekerjaan hari ini dan tidak ada pekerjaan tertunda.
        </p>
      ) : null}
    </section>
  );
}
