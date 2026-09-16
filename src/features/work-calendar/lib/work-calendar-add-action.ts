/**
 * Kontrak aksi tambah Unified Work Calendar (CAL-03 F4A).
 *
 * Sebelum F4A setiap tampilan memakai tombol "Tambah" yang sama sehingga
 * pengguna tidak tahu tanggal mana yang akan dipakai dan, pada mode Tim,
 * label tersebut terkesan membuat pekerjaan milik bawahan. Modul ini menjadi
 * satu-satunya sumber kebenaran untuk:
 * - label tombol per tampilan;
 * - tanggal target quick entry;
 * - tanggal yang benar-benar dipakai `WorkEntryDraft`.
 */

import type { WorkCalendarViewMode, WorkDate } from "../types/work-calendar";

export interface WorkCalendarAddActionInput {
  view: WorkCalendarViewMode;
  anchorDate: WorkDate;
  today: WorkDate;
}

export interface WorkCalendarAddAction {
  /** Label yang harus dipakai tombol aksi tambah. */
  label: string;
  /** Tanggal pekerjaan baru; selalu sama dengan tanggal yang dipakai draft. */
  targetDate: WorkDate;
  /** View yang dituju setelah aksi dijalankan. */
  targetView: WorkCalendarViewMode;
}

/**
 * Tampilan Hari sudah memiliki quick entry dengan tombol tambah sendiri,
 * sehingga aksi tambah toolbar tidak ditampilkan agar tidak ada aksi
 * duplikat yang tidak menambah kemampuan.
 */
export function shouldShowToolbarAdd(view: WorkCalendarViewMode): boolean {
  return view !== "day";
}

export function getWorkCalendarAddAction(
  input: WorkCalendarAddActionInput,
): WorkCalendarAddAction {
  const { view, anchorDate, today } = input;

  switch (view) {
    case "day":
      // Tanggal ikut tampilan Hari supaya pekerjaan masuk ke tanggal yang
      // sedang dilihat, bukan selalu hari ini.
      return { label: "Tambah pekerjaan", targetDate: anchorDate, targetView: "day" };
    case "week":
    case "month":
      return { label: "Tambah hari ini", targetDate: today, targetView: "day" };
    case "team":
      return { label: "Tambah pekerjaan saya", targetDate: today, targetView: "day" };
    default:
      return { label: "Tambah hari ini", targetDate: today, targetView: "day" };
  }
}
