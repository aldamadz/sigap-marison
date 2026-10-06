import type { WorkDate, WorkEntry } from "../types/work-calendar";
import { formatWorkDateKey } from "./work-calendar-date";
import { compareWorkEntries } from "./work-entry-status";

/** Last projected day; the original schedule is never changed. */
function carryoverEndDate(entry: WorkEntry, today: WorkDate): WorkDate | null {
  if (entry.kind !== "work") return null;
  if (entry.status !== "completed") return today;
  if (!entry.completedAt) return null;
  const completedAt = new Date(entry.completedAt);
  if (Number.isNaN(completedAt.getTime())) return null;
  const completedDate = formatWorkDateKey(completedAt);
  return completedDate < today ? completedDate : today;
}

export function isWorkEntryVisibleOnDate(
  entry: WorkEntry,
  date: WorkDate,
  today: WorkDate,
): boolean {
  if (entry.deletedAt !== null) return false;
  if (entry.workDate === date) return true;
  if (entry.workDate > date) return false;
  const endDate = carryoverEndDate(entry, today);
  return endDate !== null && date <= endDate;
}

export function isWorkEntryVisibleInRange(
  entry: WorkEntry,
  fromDate: WorkDate,
  toDate: WorkDate,
  today: WorkDate,
): boolean {
  if (entry.deletedAt !== null || fromDate > toDate || entry.workDate > toDate) return false;
  if (entry.workDate >= fromDate) return true;
  const endDate = carryoverEndDate(entry, today);
  return endDate !== null && endDate >= fromDate;
}

/** Each daily bucket contains the canonical object once, never a cloned task. */
export function selectWorkEntriesForDate(
  entries: readonly WorkEntry[],
  date: WorkDate,
  today: WorkDate,
): WorkEntry[] {
  const byId = new Map<string, WorkEntry>();
  for (const entry of entries) {
    if (isWorkEntryVisibleOnDate(entry, date, today)) byId.set(entry.id, entry);
  }
  return [...byId.values()].sort(compareWorkEntries);
}
