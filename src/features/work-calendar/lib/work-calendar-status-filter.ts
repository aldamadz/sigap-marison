/**
 * Filter status pribadi pada command surface Kalender Kerja (CAL-03 redesign).
 *
 * Prinsip:
 * - filter hanya menyaring, TIDAK mengurutkan ulang; urutan waktu kerja
 *   (jam lebih dulu, lalu sepanjang hari) tetap dipegang `compareWorkEntries`
 *   sehingga pekerjaan berjam tetap bermakna setelah difilter;
 * - "Perlu perhatian" adalah irisan lintas-status: overdue (diturunkan dari
 *   tenggat/tanggal) atau `blocked`. Keduanya adalah sinyal tindakan, bukan
 *   status tersendiri, sehingga tidak menggeser penjumlahan status.
 * - filter bersifat pribadi: hanya dipakai pada mode Hari/Minggu/Bulan dan
 *   tidak pernah menyentuh mode Tim (read-only terhadap entry bawahan).
 */

import type { WorkDate, WorkEntry, WorkEntryStatus } from "../types/work-calendar";
import { isWorkEntryOverdue, type WorkEntryDeadlineInput } from "./work-entry-status";

export type WorkCalendarStatusFilter =
  | "all"
  | "attention"
  | "in_progress"
  | "blocked"
  | "completed";

export interface WorkCalendarStatusFilterOption {
  value: WorkCalendarStatusFilter;
  label: string;
}

/**
 * Opsi filter sesuai urutan pemindaian operasional: totals dulu, lalu
 * sinyal tindakan, lalu status sisanya.
 */
export const WORK_CALENDAR_STATUS_FILTERS: readonly WorkCalendarStatusFilterOption[] = [
  { value: "all", label: "Semua" },
  { value: "attention", label: "Perlu perhatian" },
  { value: "in_progress", label: "Berjalan" },
  { value: "blocked", label: "Terhambat" },
  { value: "completed", label: "Selesai" },
] as const;

export const DEFAULT_WORK_CALENDAR_STATUS_FILTER: WorkCalendarStatusFilter = "all";

/**
 * Label filter untuk pembaca layar dan kontrol toolbar.
 */
export function getWorkCalendarStatusFilterLabel(
  filter: WorkCalendarStatusFilter,
): string {
  const option = WORK_CALENDAR_STATUS_FILTERS.find((item) => item.value === filter);
  return option?.label ?? "Semua";
}

/**
 * Predikat murni satu entry terhadap filter. `attention` menggabungkan
 * overdue dan blocked: bagian `overdue` memakai logika turunan yang sama
 * dengan indikator baris agar filter dan tampilan tidak pernah bertentangan.
 */
export function matchesWorkCalendarStatusFilter(
  entry: WorkEntry,
  filter: WorkCalendarStatusFilter,
  today: WorkDate,
): boolean {
  if (filter === "all") return true;
  if (filter === "attention") {
    return entry.status === "blocked" || isWorkEntryOverdue(entry as WorkEntryDeadlineInput, today);
  }
  return entry.status === (filter as WorkEntryStatus);
}

/**
 * Menyaring daftar entry tanpa mengubah urutan (stabil, preserve order).
 */
export function filterWorkEntriesByStatus(
  entries: readonly WorkEntry[],
  filter: WorkCalendarStatusFilter,
  today: WorkDate,
): readonly WorkEntry[] {
  if (filter === "all") return entries;
  return entries.filter((entry) => matchesWorkCalendarStatusFilter(entry, filter, today));
}

/**
 * Jumlah entry yang cocok dengan filter, untuk affordance ringkas pada
 * kontrol toolbar (mis. badge) tanpa memasang label jumlah pada setiap opsi.
 */
export function countWorkEntriesByStatusFilter(
  entries: readonly WorkEntry[],
  filter: WorkCalendarStatusFilter,
  today: WorkDate,
): number {
  if (filter === "all") return entries.length;
  return entries.reduce(
    (total, entry) => (matchesWorkCalendarStatusFilter(entry, filter, today) ? total + 1 : total),
    0,
  );
}
