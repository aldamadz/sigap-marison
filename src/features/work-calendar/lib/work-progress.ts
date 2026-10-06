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
import {
  compareWorkEntries,
  isUnfinishedWorkEntryStatus,
  isWorkEntryOverdue,
} from "./work-entry-status";
import { selectWorkEntriesForDate } from "./work-entry-carryover";

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

/**
 * Persentase selesai 0-100; selalu `completed / total`. Overdue tidak pernah
 * menambah atau mengurangi angka ini. 0 bila tidak ada entry.
 */
export function computeWorkCompletionPercent(counts: WorkProgressCounts): number {
  if (counts.total <= 0) return 0;
  return Math.round((counts.completed / counts.total) * 100);
}

/**
 * Entry yang belum selesai (untuk panel "belum selesai").
 *
 * Hanya `completed` yang final, sehingga `blocked` tetap termasuk di sini.
 */
export function selectUnfinishedWorkEntries(entries: readonly WorkEntry[]): WorkEntry[] {
  return entries.filter((entry) => isUnfinishedWorkEntryStatus(entry.status));
}

/**
 * Baris ringkasan progres: seluruh status tersimpan ditambah indikator
 * overdue lintas status. planned + inProgress + completed + blocked selalu
 * sama dengan total; overdue tidak ikut dijumlahkan.
 */
export function buildWorkProgressStatusRows(
  counts: WorkProgressCounts,
): ReadonlyArray<{ key: string; label: string; value: number }> {
  return [
    { key: "planned", label: "Direncanakan", value: counts.planned },
    { key: "inProgress", label: "Berjalan", value: counts.inProgress },
    { key: "completed", label: "Selesai", value: counts.completed },
    { key: "blocked", label: "Terhambat", value: counts.blocked },
    { key: "overdue", label: "Terlambat", value: counts.overdue },
  ];
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
  return dates.map((date) => {
    const dayEntries = selectWorkEntriesForDate(entries, date, today);
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

/** Jumlah entry yang disembunyikan dari preview sel bulan versi desktop. */
export const WORK_MONTH_CELL_PREVIEW_LIMIT = 2;

/** Sel bulan versi mobile tidak menampilkan preview judul sama sekali. */
export const WORK_MONTH_MOBILE_CELL_PREVIEW_LIMIT = 0;

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
 * Batas preview pekerjaan per hari pada tampilan Minggu.
 *
 * Desktop/tablet memuat empat preview, mobile tiga preview. Kontrak ini
 * menggantikan scroll internal per kolom: kolom Minggu selalu punya tinggi
 * terbatas dan sisa pekerjaan dibuka lewat tombol "+N pekerjaan lainnya".
 */
export const WORK_WEEK_PREVIEW_LIMIT_DESKTOP = 4;
export const WORK_WEEK_PREVIEW_LIMIT_MOBILE = 3;

export function getWorkWeekPreviewLimit(isMobile: boolean): number {
  return isMobile ? WORK_WEEK_PREVIEW_LIMIT_MOBILE : WORK_WEEK_PREVIEW_LIMIT_DESKTOP;
}

/**
 * Prioritas preview Minggu: terhambat/terlambat, berjalan, direncanakan,
 * lalu selesai. `overdue` adalah derived state sehingga status tersimpan
 * tetap menjadi penentu utama.
 */
export function getWorkWeekEntryPriority(
  entry: WorkEntry,
  today: WorkDate,
): 0 | 1 | 2 | 3 {
  if (entry.status === "blocked" || isWorkEntryOverdue(entry, today)) return 0;
  if (entry.status === "in_progress") return 1;
  if (entry.status === "planned") return 2;
  return 3;
}

/**
 * Urutkan preview Minggu menurut prioritas status, lalu urutan kanonik
 * (`compareWorkEntries`) di dalam kategori yang sama.
 *
 * Implementasi: urutkan kanonik lebih dulu, lalu stable-sort menurut
 * prioritas. Karena `Array.prototype.sort` stabil, urutan kanonik tetap
 * terjaga di dalam satu kategori dan hasilnya deterministik.
 */
export function sortWorkWeekPreviewEntries(
  entries: readonly WorkEntry[],
  today: WorkDate,
): WorkEntry[] {
  return entries
    .slice()
    .sort(compareWorkEntries)
    .sort(
      (left, right) =>
        getWorkWeekEntryPriority(left, today) - getWorkWeekEntryPriority(right, today),
    );
}

/**
 * Potong daftar entry satu hari menjadi preview + jumlah yang disembunyikan.
 * `total` selalu dihitung dari seluruh entry supaya agregat progres tetap
 * memakai total yang benar meski preview dibatasi.
 */
export function getWorkWeekDayPreview(
  entries: readonly WorkEntry[],
  today: WorkDate,
  limit: number,
): { preview: WorkEntry[]; hiddenCount: number; total: number } {
  const safeLimit = Math.max(0, limit);
  const sorted = sortWorkWeekPreviewEntries(entries, today);
  return {
    preview: sorted.slice(0, safeLimit),
    hiddenCount: Math.max(0, sorted.length - safeLimit),
    total: entries.length,
  };
}

export interface WorkEntryOwnerFilterState {
  /** Filter efektif setelah fallback; `"all"` berarti seluruh anggota. */
  effectiveOwnerFilterId: WorkEntryOwnerId | "all";
  /** `true` hanya bila filter menunjuk anggota yang benar-benar tersedia. */
  isOwnerFiltered: boolean;
  /** Anggota yang sedang difilter, atau `null` saat "Semua anggota". */
  selectedOwner: WorkEntryOwner | null;
}

/**
 * Sumber kebenaran status filter pemilik mode Tim.
 *
 * Kontrak CAL-03 F4A (koreksi review):
 * - filter dianggap aktif **hanya** bila id menunjuk anggota yang tersedia,
 *   bukan karena jumlah kelompok hasil render;
 * - id yang tidak tersedia jatuh kembali ke "Semua anggota" sehingga nama
 *   mentah/UUID tidak pernah tampil;
 * - `isOwnerFiltered` dipakai komponen untuk memutuskan catatan filter, bukan
 *   `groups.length === 1`.
 */
export function resolveWorkEntryOwnerFilter(
  ownerFilterId: WorkEntryOwnerId | "all",
  owners: readonly WorkEntryOwner[],
): WorkEntryOwnerFilterState {
  const selectedOwner =
    ownerFilterId === "all"
      ? null
      : (owners.find((owner) => owner.id === ownerFilterId) ?? null);

  return {
    effectiveOwnerFilterId: selectedOwner ? selectedOwner.id : "all",
    isOwnerFiltered: selectedOwner !== null,
    selectedOwner,
  };
}

/**
 * Kelompokkan entry milik tim per anggota. Anggota tanpa entry tetap muncul
 * dengan daftar kosong agar baris progress stabil.
 *
 * Kontrak CAL-03 F4A:
 * - `ownerFilter` menyaring kelompok pada sumbernya, bukan setelah render,
 *   sehingga metrik, rasio, dan daftar pekerjaan hanya berasal dari anggota
 *   terpilih;
 * - hanya anggota pada `owners` yang pernah ditampilkan. Entry milik id yang
 *   tidak dikenal diabaikan supaya UUID mentah tidak pernah menjadi nama;
 * - bila `ownerFilter` menunjuk anggota yang tidak tersedia, seluruh anggota
 *   ditampilkan kembali (fallback aman ke "Semua anggota").
 */
export function buildWorkEntryOwnerGroups(
  entries: readonly WorkEntry[],
  owners: readonly WorkEntryOwner[],
  currentUserId: WorkEntryOwnerId,
  ownerFilter: WorkEntryOwnerId | "all" = "all",
): WorkEntryOwnerGroup[] {
  const selectedOwners =
    ownerFilter !== "all" && owners.some((owner) => owner.id === ownerFilter)
      ? owners.filter((owner) => owner.id === ownerFilter)
      : owners;

  const visibleOwnerIds = new Set(selectedOwners.map((owner) => owner.id));
  const byOwner = new Map<WorkEntryOwnerId, WorkEntry[]>();
  for (const owner of selectedOwners) byOwner.set(owner.id, []);
  for (const entry of entries) {
    if (!visibleOwnerIds.has(entry.ownerId)) continue;
    byOwner.get(entry.ownerId)?.push(entry);
  }

  return selectedOwners.map((owner) => {
    const ownerEntries = (byOwner.get(owner.id) ?? []).slice().sort(compareWorkEntries);
    return {
      owner,
      entries: ownerEntries,
      isCurrentUser: owner.id === currentUserId,
      isTeamMember: owner.id !== currentUserId,
    };
  });
}

/**
 * Progres gabungan untuk kelompok yang sedang tampil. Dipakai mode Tim agar
 * ringkasan tidak pernah memakai entry milik anggota yang tersaring keluar.
 */
export function computeWorkEntryOwnerGroupsProgress(
  groups: readonly WorkEntryOwnerGroup[],
  today: WorkDate,
): WorkProgressCounts {
  return computeWorkProgress(
    groups.flatMap((group) => group.entries),
    today,
  );
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
