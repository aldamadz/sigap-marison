import type { WorkEntry } from "../types/work-calendar";
import { formatWorkDateKey, shiftWorkDate, workDateToUtcRange } from "./work-calendar-date";
import { isWorkEntryVisibleOnDate } from "./work-entry-carryover";
import { calculateWorkEntryTiming, getWorkEntryHistorySnapshot, type WorkEntryTimingInput } from "./work-entry-timing";

/** One immutable, daily projection; no task or lifecycle event is written. */
export function buildWorkEntryDailyReports(input: WorkEntryTimingInput) {
  const rows = [];
  const today = formatWorkDateKey(input.now);
  for (let date = input.fromDate; date <= input.toDate; date = shiftWorkDate(date, 1)) {
    const end = Date.parse(workDateToUtcRange(date).endUtc);
    const cutoff = new Date(Math.min(input.now.getTime(), end));
    // Midnight belongs to the next report; duration still uses the full closed day.
    const events = input.events.filter(event => !Number.isFinite(Date.parse(event.createdAt)) || Date.parse(event.createdAt) < end);
    if (Date.parse(input.entry.createdAt) > cutoff.getTime()) continue;
    const history = getWorkEntryHistorySnapshot(input.entry, events, cutoff);
    const entry: WorkEntry = {
      ...input.entry,
      status: history.status ?? input.entry.status,
      completedAt: history.completedAt,
      realization: history.realization,
      blockedReason: history.blockedReason,
    };
    if (!isWorkEntryVisibleOnDate(history.status === null ? input.entry : entry, date, today)) continue;
    const timing = calculateWorkEntryTiming({ ...input, entry, events, fromDate: date, toDate: date, now: cutoff });
    rows.push({
      entry,
      reportDate: date,
      statusKnown: history.status !== null,
      timing: {
        ...timing,
        startsAt: timing.segments[0]?.startsAt ?? null,
        endsAt: history.status === "completed" && timing.endsAt !== null
          && formatWorkDateKey(new Date(timing.endsAt)) === date && Date.parse(timing.endsAt) <= cutoff.getTime()
          ? timing.endsAt : null,
      },
    });
  }
  return rows;
}
