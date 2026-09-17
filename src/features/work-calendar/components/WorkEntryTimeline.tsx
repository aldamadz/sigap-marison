/**
 * Timeline riwayat pekerjaan (CAL-03 F5).
 *
 * Menampilkan peristiwa lifecycle yang dicatat database secara berurutan.
 * Selalu teks + ikon: warna tidak pernah menjadi satu-satunya pembawa makna.
 * Komponen ini murni presentasi; data dimuat workspace.
 */

import {
  CalendarClock,
  CalendarPlus,
  CircleCheck,
  CircleSlash,
  Hourglass,
  LoaderCircle,
} from "lucide-react";

import type { WorkEntryEvent } from "../types/work-calendar";
import {
  describeWorkEntryEvent,
} from "../lib/work-entry-lifecycle";
import {
  formatWorkDateFull,
  formatWorkDateKey,
  formatWorkTimeLabelFromIso,
} from "../lib/work-calendar-date";

export interface WorkEntryTimelineProps {
  events: readonly WorkEntryEvent[];
  status: "idle" | "loading" | "ready";
}

function iconForEvent(event: WorkEntryEvent) {
  switch (event.type) {
    case "created":
      return CalendarPlus;
    case "schedule_changed":
      return CalendarClock;
    case "due_date_changed":
      return Hourglass;
    case "status_changed":
      if (event.toStatus === "completed") return CircleCheck;
      if (event.toStatus === "blocked") return CircleSlash;
      return LoaderCircle;
    default:
      return CalendarClock;
  }
}

export function WorkEntryTimeline({ events, status }: WorkEntryTimelineProps) {
  return (
    <section
      aria-labelledby="work-entry-timeline-heading"
      data-testid="work-entry-timeline"
      className="mt-4 space-y-2 border-t border-border pt-3"
    >
      <h4
        id="work-entry-timeline-heading"
        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Riwayat pekerjaan
      </h4>

      {status === "loading" && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Memuat riwayat...
        </p>
      )}

      {status !== "loading" && events.length === 0 && (
        <p className="text-xs text-muted-foreground">Belum ada riwayat perubahan.</p>
      )}

      {events.length > 0 && (
        <ol className="space-y-2" data-testid="work-entry-timeline-list">
          {events.map((event) => {
            const Icon = iconForEvent(event);
            const description = describeWorkEntryEvent(event);
            return (
              <li
                key={event.id}
                data-testid={`work-entry-timeline-item-${event.type}`}
                className="flex items-start gap-2 text-xs"
              >
                <Icon
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{description.title}</p>
                  {description.detail && (
                    <p className="text-muted-foreground">{description.detail}</p>
                  )}
                  <p className="text-muted-foreground">
                    {formatWorkDateFull(formatWorkDateKey(new Date(event.createdAt)))}
                    {formatWorkTimeLabelFromIso(event.createdAt)
                      ? `, ${formatWorkTimeLabelFromIso(event.createdAt)}`
                      : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
