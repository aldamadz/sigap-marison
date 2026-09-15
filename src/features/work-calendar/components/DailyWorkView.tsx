/**
 * Tampilan Hari (default). Fokus pada pekerjaan satu tanggal:
 * ringkasan progres lalu daftar entry.
 *
 * Panel detail dirender oleh workspace supaya tampilan Hari dan Minggu
 * memakai panel yang sama.
 */

import type { WorkCalendarDaySummary } from "../types/work-calendar";
import { WorkEntryList, type WorkCalendarViewInteractionProps } from "./WorkEntryList";
import { DailyProgressSummary } from "./DailyProgressSummary";

export interface DailyWorkViewProps {
  summary: WorkCalendarDaySummary;
  heading: string;
  interactions: WorkCalendarViewInteractionProps;
}

export function DailyWorkView({ summary, heading, interactions }: DailyWorkViewProps) {
  const headingId = `work-day-heading-${summary.date}`;

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="sr-only">
        Pekerjaan {heading}
      </h2>

      <DailyProgressSummary title={heading} counts={summary.progress} />

      <WorkEntryList
        entries={summary.entries}
        emptyLabel="Belum ada pekerjaan pada tanggal ini. Tambahkan lewat kolom di atas."
        labelledBy={headingId}
        {...interactions}
      />
    </section>
  );
}
