/**
 * Ringkasan dashboard murni CAL-03 F7.
 *
 * Widget dashboard menampilkan dua kelompok:
 * 1. pekerjaan hari ini yang belum selesai (`workDate === today`), dan
 * 2. pekerjaan tertunda, yaitu entry belum selesai dengan tenggat efektif
 *    (`dueDate ?? workDate`) sudah lewat dibanding `today`.
 *
 * Definisi ini identik dengan RPC `get_work_calendar_dashboard_entries` supaya
 * tampilan tetap benar walau data berasal dari repository maupun fixture.
 */

import type { WorkCalendarDashboardSummary } from "../types/work-calendar-notifications";
import type { WorkDate, WorkEntry } from "../types/work-calendar";
import { compareWorkEntries, isUnfinishedWorkEntryStatus, isWorkEntryOverdue } from "./work-entry-status";

export const EMPTY_WORK_CALENDAR_DASHBOARD_SUMMARY: WorkCalendarDashboardSummary = Object.freeze({
  todayEntries: Object.freeze([]) as readonly WorkEntry[],
  overdueEntries: Object.freeze([]) as readonly WorkEntry[],
  todayCount: 0,
  overdueCount: 0,
  plannedCount: 0,
  inProgressCount: 0,
  blockedCount: 0,
});

export function buildWorkCalendarDashboardSummary(
  entries: readonly WorkEntry[],
  today: WorkDate,
): WorkCalendarDashboardSummary {
  const todayEntries: WorkEntry[] = [];
  const overdueEntries: WorkEntry[] = [];
  let plannedCount = 0;
  let inProgressCount = 0;
  let blockedCount = 0;

  for (const entry of entries) {
    if (!isUnfinishedWorkEntryStatus(entry.status)) continue;

    if (isWorkEntryOverdue(entry, today)) overdueEntries.push(entry);

    if (entry.workDate === today) {
      todayEntries.push(entry);
      if (entry.status === "planned") plannedCount += 1;
      if (entry.status === "in_progress") inProgressCount += 1;
      if (entry.status === "blocked") blockedCount += 1;
    }
  }

  todayEntries.sort(compareWorkEntries);
  overdueEntries.sort(compareWorkEntries);

  return {
    todayEntries,
    overdueEntries,
    todayCount: todayEntries.length,
    overdueCount: overdueEntries.length,
    plannedCount,
    inProgressCount,
    blockedCount,
  };
}
