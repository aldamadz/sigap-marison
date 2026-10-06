import type {
  WorkCalendarHoliday,
  WorkCalendarWorkSettings,
  WorkDate,
  WorkEntry,
  WorkEntryEvent,
  WorkEntryStatus,
} from "../types/work-calendar";
import { formatWorkDateKey, workDateToUtcRange } from "./work-calendar-date";

export interface WorkEntryTimingInput {
  entry: WorkEntry;
  events: readonly WorkEntryEvent[];
  settings: WorkCalendarWorkSettings;
  holidays: readonly WorkCalendarHoliday[];
  /** Inclusive Jakarta calendar dates; segments are clipped, not entry workDate. */
  fromDate: WorkDate;
  toDate: WorkDate;
  now: Date;
}

export interface WorkEntryTimingSegment {
  startsAt: string;
  endsAt: string;
}

export interface WorkEntryTiming {
  /** Actual boundaries, not the clipped duration boundaries. */
  startsAt: string | null;
  /** Always null for an unfinished entry, including one reopened after completion. */
  endsAt: string | null;
  durationMs: number | null;
  durationMinutes: number | null;
  source: "explicit" | "automatic" | "mixed" | "unknown";
  reason: "missing_history" | "incomplete_history" | "snapshot_mismatch" | "invalid_timestamp" | null;
  /** Counted intervals after range/office clipping. These are not completion times. */
  segments: readonly WorkEntryTimingSegment[];
}

interface Interval { start: number; end: number }
interface Transition { event: WorkEntryEvent; at: number }
interface History {
  start: number | null;
  end: number | null;
  active: Interval[];
  pauses: Interval[];
  reason: WorkEntryTiming["reason"];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const WIB_MS = 7 * 60 * MINUTE_MS;

function timestamp(value: string | null): number | null {
  // Never let device-local timestamps change a Jakarta export.
  if (value === null || !/T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : null;
}

function timeMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})(?::00)?$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new RangeError("Jam kerja tidak valid.");
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Shared validation also runs before the exporter starts any repository reads. */
export function validateWorkEntryTimingScope(input: Pick<WorkEntryTimingInput,
  "fromDate" | "toDate" | "now" | "settings"
>): void {
  const start = Date.parse(workDateToUtcRange(input.fromDate).startUtc);
  const end = Date.parse(workDateToUtcRange(input.toDate).endUtc);
  if (start >= end || !Number.isFinite(input.now.getTime())) throw new RangeError("Rentang ekspor tidak valid.");
  const { settings } = input;
  if (settings.timezone !== "Asia/Jakarta") throw new RangeError("Zona waktu ekspor harus Asia/Jakarta.");
  if (timeMinutes(settings.workStart) >= timeMinutes(settings.workEnd)
    || timeMinutes(settings.breakStart) > timeMinutes(settings.breakEnd)
    || settings.workDays.some(day => !Number.isInteger(day) || day < 1 || day > 7)) {
    throw new RangeError("Pengaturan jam kerja tidak valid.");
  }
}

function readHistory(entry: WorkEntry, events: readonly WorkEntryEvent[], now: number): History {
  const history: History = { start: null, end: null, active: [], pauses: [], reason: null };
  const transitions: Transition[] = [];
  for (const event of events) {
    if (event.entryId !== entry.id || event.ownerId !== entry.ownerId
      || (event.type !== "created" && event.type !== "status_changed")) continue;
    const at = timestamp(event.createdAt);
    if (at === null || event.toStatus === null) {
      history.reason = "invalid_timestamp";
      continue;
    }
    if (at <= now) transitions.push({ event, at });
  }
  if (!transitions.length) return { ...history, reason: history.reason ?? "missing_history" };
  transitions.sort((a, b) => a.at - b.at || a.event.id.localeCompare(b.event.id));
  let state: WorkEntryStatus | null = null;
  let activeStart: number | null = null;
  let pauseStart: number | null = null;
  let completedStart: number | null = null;
  const seen = new Set<string>();

  // Server timestamps can tie. Follow fromStatus within each tied group, not UUID order.
  for (let index = 0; index < transitions.length;) {
    const at = transitions[index].at;
    const group: Transition[] = [];
    while (index < transitions.length && transitions[index].at === at) group.push(transitions[index++]);
    while (group.length) {
      let nextIndex = group.findIndex(({ event }) => event.type === "created" && state === null);
      if (nextIndex < 0) nextIndex = group.findIndex(({ event }) => event.fromStatus === state);
      const next = group.splice(nextIndex < 0 ? 0 : nextIndex, 1)[0];
      const { event } = next;
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      if (state === null && event.type === "status_changed") {
        // A recorded planned -> in_progress transition is a real start even for legacy entries.
        if (event.fromStatus !== "planned") history.reason ??= "incomplete_history";
      } else if ((event.type === "created" && state !== null)
        || (event.type === "status_changed" && event.fromStatus !== state)) {
        history.reason ??= "incomplete_history";
      }
      const nextState = event.toStatus;
      if (completedStart !== null && nextState !== "completed") {
        history.pauses.push({ start: completedStart, end: at });
        completedStart = null;
      }
      if (activeStart !== null && nextState !== "in_progress") {
        history.active.push({ start: activeStart, end: at });
        activeStart = null;
      }
      if (pauseStart !== null && nextState !== "blocked" && nextState !== "planned") {
        history.pauses.push({ start: pauseStart, end: at });
        pauseStart = null;
      }
      if (nextState === "in_progress" && activeStart === null) {
        activeStart = at;
        history.start ??= at;
      }
      if ((nextState === "blocked" || (nextState === "planned" && history.start !== null))
        && pauseStart === null) pauseStart = at;
      // Deduct closed completion gaps; a final explicit endsAt remains authoritative.
      if (nextState === "completed" && completedStart === null) completedStart = at;
      history.end = nextState === "completed" ? at : null;
      state = nextState;
    }
  }
  if (state !== entry.status) history.reason ??= "snapshot_mismatch";
  if (activeStart !== null) history.active.push({ start: activeStart, end: now });
  if (pauseStart !== null) history.pauses.push({ start: pauseStart, end: now });
  return history;
}

function subtractPauses(interval: Interval, pauses: readonly Interval[]): Interval[] {
  let cursor = interval.start;
  const result: Interval[] = [];
  for (const pause of pauses) {
    if (pause.end <= cursor || pause.start >= interval.end) continue;
    if (pause.start > cursor) result.push({ start: cursor, end: Math.min(pause.start, interval.end) });
    cursor = Math.max(cursor, pause.end);
    if (cursor >= interval.end) break;
  }
  if (cursor < interval.end) result.push({ start: cursor, end: interval.end });
  return result;
}

function clipIntervals(intervals: readonly Interval[], input: WorkEntryTimingInput, automatic: boolean): Interval[] {
  const rangeStart = Date.parse(workDateToUtcRange(input.fromDate).startUtc);
  const rangeEnd = Math.min(Date.parse(workDateToUtcRange(input.toDate).endUtc), input.now.getTime());
  const holidays = new Set(input.holidays.map(holiday => holiday.date));
  const workStart = timeMinutes(input.settings.workStart) * MINUTE_MS;
  const workEnd = timeMinutes(input.settings.workEnd) * MINUTE_MS;
  const breakStart = timeMinutes(input.settings.breakStart) * MINUTE_MS;
  const breakEnd = timeMinutes(input.settings.breakEnd) * MINUTE_MS;
  const result: Interval[] = [];
  for (const interval of intervals) {
    const start = Math.max(interval.start, rangeStart);
    const end = Math.min(interval.end, rangeEnd);
    if (start >= end) continue;
    const firstMidnight = Math.floor((start + WIB_MS) / DAY_MS) * DAY_MS - WIB_MS;
    for (let day = firstMidnight; day < end; day += DAY_MS) {
      const date = formatWorkDateKey(new Date(day));
      const weekday = new Date(day + WIB_MS).getUTCDay() || 7;
      if (automatic && (!input.settings.workDays.includes(weekday) || holidays.has(date))) continue;
      const officeStart = Math.max(start, day + (automatic ? workStart : 0));
      const officeEnd = Math.min(end, day + (automatic ? workEnd : DAY_MS));
      if (officeStart < officeEnd) {
        result.push(...subtractPauses({ start: officeStart, end: officeEnd },
          [{ start: day + breakStart, end: day + breakEnd }]));
      }
    }
  }
  return result;
}

/** Pure: never reads the wall clock, createdAt/updatedAt, or completedAt as a substitute for history. */
export function calculateWorkEntryTiming(input: WorkEntryTimingInput): WorkEntryTiming {
  validateWorkEntryTimingScope(input);
  const { entry } = input;
  const history = readHistory(entry, input.events, input.now.getTime());
  const explicitStart = timestamp(entry.startsAt);
  const explicitEnd = timestamp(entry.endsAt);
  const hasExplicit = entry.startsAt !== null || entry.endsAt !== null;
  const fullyExplicit = explicitStart !== null && explicitEnd !== null;
  let reason = (entry.startsAt !== null && explicitStart === null)
    || (entry.endsAt !== null && explicitEnd === null) ? "invalid_timestamp" : history.reason;
  // A complete manual interval needs no fabricated lifecycle for a legacy record.
  if (fullyExplicit && reason === "missing_history") reason = null;
  const start = explicitStart ?? history.start;
  const end = explicitEnd ?? history.end;
  if (start !== null && end !== null && end < start) reason = "invalid_timestamp";
  let intervals: Interval[] = history.active;
  if (hasExplicit && start !== null) {
    intervals = subtractPauses({ start, end: end ?? input.now.getTime() }, history.pauses);
  }
  const counted = reason === null ? clipIntervals(intervals, input, !fullyExplicit) : [];
  const durationMs = reason === null ? counted.reduce((total, interval) => total + interval.end - interval.start, 0) : null;
  return {
    startsAt: start === null ? null : new Date(start).toISOString(),
    endsAt: entry.status !== "completed" || end === null
      || (!fullyExplicit && history.reason !== null && explicitEnd === null) ? null : new Date(end).toISOString(),
    durationMs,
    durationMinutes: durationMs === null ? null : durationMs / MINUTE_MS,
    source: fullyExplicit ? "explicit" : hasExplicit ? "mixed" : history.reason === "missing_history" ? "unknown" : "automatic",
    reason,
    segments: counted.map(interval => ({ startsAt: new Date(interval.start).toISOString(), endsAt: new Date(interval.end).toISOString() })),
  };
}

export function formatWorkEntryDuration(durationMs: number | null): string {
  if (durationMs === null) return "Tidak diketahui";
  const minutes = Math.floor(Math.max(0, durationMs) / MINUTE_MS);
  return `${Math.floor(minutes / 60)} j ${minutes % 60} m`;
}
