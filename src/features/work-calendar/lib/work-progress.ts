/**
 * Progres pekerjaan dan pengelompokan murni untuk Unified Work Calendar.
 *
 * Progres selalu dihitung otomatis dari status entry; tidak ada input persen
 * manual dari pengguna.
 */

import type {
  WorkCalendarDayCell,
  WorkCalendarDaySummary,
  WorkCalendarPermissions,
  WorkDate,
  WorkEntry,
  WorkEntryOwner,
  WorkEntryOwnerGroup,
  WorkEntryOwnerId,
  WorkEntryState,
  WorkProgressCounts,
} from "../types/work-calendar";
import { compareWorkEntries, isWorkEntryOverdue } from "./work-entry-status";

export const EMPTY_WORK_PROGRESS: WorkProgressCounts = Object.freeze({
  total: 0,
  planned: 0,
  inProgress: 0,
  completed: 0,
  blocked: 0,
  overdue: 0,
});

/** Hitung progres dari entry pada satu tanggal acuan. */
export function computeWorkProgress(
  entries: readonly WorkEntry[],
  today: WorkDate,
): WorkProgressCounts {
  let planned = 0;
  let inProgress = 0;
  let completed = 0;
  let blocked = 0;
  let overdue = 0;

  for (const entry of entries) {
    switch (entry.status) {
      case "planned":
        planned += 1;
        break;
      case "in_progress":
        inProgress += 1;
        break;
      case "completed":
        completed += 1;
        break;
      case "blocked":
        blocked += 1;
        break;
      default:
        break;
    }

    if (isWorkEntryOverdue(entry, today)) overdue += 1;
  }

  return {
    total: entries.length,
    planned,
    inProgress,
    completed,
    blocked,
    overdue,
  };
}

/** Persentase selesai 0-100; 0 bila tidak ada entry. */
export function computeWorkCompletionPercent(counts: WorkProgressCounts): number {
  if (counts.total <= 0) return 0;
  return Math.round((counts.completed / counts.total) * 100);
}

/** Entry yang belum final (untuk panel "belum selesai"). */
export function selectUnfinishedWorkEntries(entries: readonly WorkEntry[]): WorkEntry[] {
  return entries.filter((entry) => entry.status !== "completed" && entry.status !== "blocked");
}

export function groupWorkEntriesByDate(entries: readonly WorkEntry[]): Map<WorkDate, WorkEntry[]> {
  const grouped = new Map<WorkDate, WorkEntry[]>();
  for (const entry of entries) {
    const bucket = grouped.get(entry.workDate);
    if (bucket) {
      bucket.push(entry);
    } else {
      grouped.set(entry.workDate, [entry]);
    }
  }
  for (const bucket of grouped.values()) bucket.sort(compareWorkEntries);
  return grouped;
}

export function buildWorkCalendarDaySummaries(
  entries: readonly WorkEntry[],
  dates: readonly WorkDate[],
  today: WorkDate,
): WorkCalendarDaySummary[] {
  const grouped = groupWorkEntriesByDate(entries);
  return dates.map((date) => {
    const dayEntries = grouped.get(date) ?? [];
    return { date, entries: dayEntries, progress: computeWorkProgress(dayEntries, today) };
  });
}

export function buildWorkCalendarDayCells(
  entries: readonly WorkEntry[],
  dates: readonly WorkDate[],
  today: WorkDate,
  currentMonth: number,
): WorkCalendarDayCell[] {
  return buildWorkCalendarDaySummaries(entries, dates, today).map((summary) => ({
    ...summary,
    isCurrentMonth: Number(summary.date.slice(5, 7)) === currentMonth,
    isToday: summary.date === today,
  }));
}

/** Jumlah entry yang disembunyikan dari preview sel bulan. */
export const WORK_MONTH_CELL_PREVIEW_LIMIT = 2;

export function getWorkMonthCellPreview(
  entries: readonly WorkEntry[],
  limit: number = WORK_MONTH_CELL_PREVIEW_LIMIT,
): { preview: WorkEntry[]; hiddenCount: number } {
  const safeLimit = Math.max(0, limit);
  return {
    preview: entries.slice(0, safeLimit),
    hiddenCount: Math.max(0, entries.length - safeLimit),
  };
}

export function buildWorkEntryStates(
  entries: readonly WorkEntry[],
  today: WorkDate,
): WorkEntryState[] {
  return entries.map((entry) => ({ entry, isOverdue: isWorkEntryOverdue(entry, today) }));
}

/**
 * Kelompokkan entry milik tim per anggota. Anggota tanpa entry tetap muncul
 * dengan daftar kosong agar baris progress stabil.
 */
export function buildWorkEntryOwnerGroups(
  entries: readonly WorkEntry[],
  owners: readonly WorkEntryOwner[],
  currentUserId: WorkEntryOwnerId,
): WorkEntryOwnerGroup[] {
  const byOwner = new Map<WorkEntryOwnerId, WorkEntry[]>();
  for (const owner of owners) byOwner.set(owner.id, []);
  for (const entry of entries) {
    const bucket = byOwner.get(entry.ownerId);
    if (bucket) {
      bucket.push(entry);
    } else {
      byOwner.set(entry.ownerId, [entry]);
    }
  }

  const known = owners.map((owner) => owner.id);
  const unknownOwners = [...byOwner.keys()].filter((ownerId) => !known.includes(ownerId));
  const allOwners: WorkEntryOwner[] = [
    ...owners,
    ...unknownOwners.map((ownerId) => ({ id: ownerId, name: ownerId, jobTitle: null })),
  ];

  return allOwners.map((owner) => {
    const ownerEntries = (byOwner.get(owner.id) ?? []).slice().sort(compareWorkEntries);
    return {
      owner,
      entries: ownerEntries,
      isCurrentUser: owner.id === currentUserId,
      isTeamMember: owner.id !== currentUserId,
    };
  });
}

/** Filter pemilik untuk mode Tim dan mode pribadi. */
export function filterWorkEntriesByOwner(
  entries: readonly WorkEntry[],
  ownerId: WorkEntryOwnerId | "all",
): WorkEntry[] {
  if (ownerId === "all") return entries.slice();
  return entries.filter((entry) => entry.ownerId === ownerId);
}

export function isWorkCalendarTeamViewAvailable(
  teamMembers: readonly WorkEntryOwner[] | undefined,
): boolean {
  return Array.isArray(teamMembers) && teamMembers.length > 0;
}

/**
 * Izin default mengikuti RLS produksi: pengguna hanya boleh menulis entry
 * miliknya sendiri, sedangkan entry bawahan bersifat baca saja.
 */
export function createWorkCalendarPermissions(
  currentUserId: WorkEntryOwnerId,
): WorkCalendarPermissions {
  return {
    canEditEntry: (entry) => entry.ownerId === currentUserId,
    canDeleteEntry: (entry) => entry.ownerId === currentUserId,
  };
}
