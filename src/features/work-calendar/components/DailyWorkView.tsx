/**
 * Tampilan Hari (default). Fokus pada pekerjaan satu tanggal.
 *
 * CAL-03 redesign tahap 1: ringkasan progres dan quick entry sudah menjadi
 * bagian command surface (sticky), sehingga tampilan ini sekarang hanya
 * kanvas daftar kerja + catatan hari. Panel detail tetap dirender workspace.
 *
 * CAL-03 F6: bila tanggal acuan adalah hari libur atau hari nonkerja, sebuah
 * catatan kontekstual ditampilkan. Catatan ini informatif — tidak pernah
 * menghalangi penambahan pekerjaan pada tanggal tersebut.
 */

import { CalendarOff, PartyPopper } from "lucide-react";

import type { WorkCalendarDayMeta, WorkCalendarDaySummary } from "../types/work-calendar";
import { WorkEntryList, type WorkCalendarViewInteractionProps } from "./WorkEntryList";

export interface DailyWorkViewProps {
  summary: WorkCalendarDaySummary;
  heading: string;
  interactions: WorkCalendarViewInteractionProps;
  /** Klasifikasi hari untuk tanggal ini (CAL-03 F6). */
  dayMeta?: WorkCalendarDayMeta;
}

export function DailyWorkView({ summary, heading, interactions, dayMeta }: DailyWorkViewProps) {
  const headingId = `work-day-heading-${summary.date}`;
  const showDayNote = dayMeta !== undefined && dayMeta.kind !== "work_day";
  const DayNoteIcon = dayMeta?.isCutiBersama ? PartyPopper : CalendarOff;

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h2 id={headingId} className="sr-only">
        Pekerjaan {heading}
      </h2>

      {showDayNote && dayMeta && (
        <p
          data-testid={`work-day-note-${summary.date}`}
          data-day-kind={dayMeta.kind}
          className="flex items-center gap-1.5 rounded-sm border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
        >
          <DayNoteIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{dayMeta.label ?? "Hari nonkerja"}.</span>
          <span className="text-foreground/80">
            Pekerjaan tetap dapat ditambahkan pada tanggal ini.
          </span>
        </p>
      )}

      <WorkEntryList
        entries={summary.entries}
        emptyLabel="Belum ada pekerjaan pada tanggal ini. Tambahkan lewat kolom di atas."
        labelledBy={headingId}
        {...interactions}
      />
    </section>
  );
}
