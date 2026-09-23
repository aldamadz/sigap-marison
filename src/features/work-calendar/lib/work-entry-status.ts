/**
 * Status domain untuk Unified Work Calendar.
 *
 * Empat status tersimpan (`planned`, `in_progress`, `completed`, `blocked`).
 * Overdue **bukan** status tersimpan; overdue adalah derived state supaya
 * status tidak pernah bertabrakan dengan hasil penjadwalan.
 *
 * Kontrak finalitas (dibuat eksplisit sejak CAL-03 F1 review):
 * - hanya `completed` yang final;
 * - `blocked` adalah pekerjaan aktif yang belum selesai, sehingga tetap
 *   dihitung sebagai belum selesai dan tetap bisa menjadi overdue;
 * - `planned` dan `in_progress` juga belum selesai.
 */

import {
  CircleCheck,
  CircleDashed,
  CircleSlash,
  Hourglass,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";

import type { WorkDate, WorkEntry, WorkEntryStatus } from "../types/work-calendar";
import { formatWorkDateKey } from "./work-calendar-date";

export interface WorkEntryStatusMeta {
  status: WorkEntryStatus;
  /** Label Indonesia yang selalu tampil bersama ikon. */
  label: string;
  /** Deskripsi singkat untuk aksesibilitas dan tooltip. */
  description: string;
  icon: LucideIcon;
  /** Kelas Tailwind untuk badge, memakai token SIGAP. */
  badgeClassName: string;
  /** Kelas ikon pada kontrol status di dalam row. */
  iconClassName: string;
  /** Urutan tampil pada kontrol status dan ringkasan progres. */
  order: number;
  /**
   * Hanya `completed` yang final. Status final tidak pernah menjadi overdue
   * dan tidak dihitung sebagai pekerjaan yang belum selesai.
   */
  isFinal: boolean;
}

export const WORK_ENTRY_STATUS_META: Record<WorkEntryStatus, WorkEntryStatusMeta> = {
  planned: {
    status: "planned",
    label: "Direncanakan",
    description: "Belum dikerjakan",
    icon: CircleDashed,
    badgeClassName: "border-border bg-muted text-foreground",
    iconClassName: "text-muted-foreground",
    order: 0,
    isFinal: false,
  },
  in_progress: {
    status: "in_progress",
    label: "Sedang Dikerjakan",
    description: "Sedang berjalan, belum selesai",
    icon: LoaderCircle,
    badgeClassName: "border-pending/30 bg-pending/10 text-pending",
    iconClassName: "text-pending",
    order: 1,
    isFinal: false,
  },
  completed: {
    status: "completed",
    label: "Selesai",
    description: "Sudah selesai",
    icon: CircleCheck,
    badgeClassName: "border-success/30 bg-success/10 text-success",
    iconClassName: "text-success",
    order: 2,
    isFinal: true,
  },
  blocked: {
    status: "blocked",
    label: "Terhambat",
    description: "Terhambat dan butuh tindak lanjut, belum selesai",
    icon: CircleSlash,
    badgeClassName: "border-destructive/30 bg-destructive/10 text-destructive",
    iconClassName: "text-destructive",
    order: 3,
    isFinal: false,
  },
};

export const WORK_ENTRY_STATUS_ORDER: readonly WorkEntryStatus[] = Object.freeze(
  (Object.keys(WORK_ENTRY_STATUS_META) as WorkEntryStatus[]).sort(
    (left, right) => WORK_ENTRY_STATUS_META[left].order - WORK_ENTRY_STATUS_META[right].order,
  ),
);

export function getWorkEntryStatusMeta(status: WorkEntryStatus): WorkEntryStatusMeta {
  return WORK_ENTRY_STATUS_META[status];
}

export function getWorkEntryStatusLabel(status: WorkEntryStatus): string {
  return WORK_ENTRY_STATUS_META[status].label;
}

/**
 * `completed` adalah satu-satunya status final. `blocked` bukan final karena
 * pekerjaannya masih aktif dan belum selesai.
 */
export function isFinalWorkEntryStatus(status: WorkEntryStatus): boolean {
  return WORK_ENTRY_STATUS_META[status].isFinal;
}

/** Status pekerjaan yang masih aktif: planned, in_progress, dan blocked. */
export function isUnfinishedWorkEntryStatus(status: WorkEntryStatus): boolean {
  return !isFinalWorkEntryStatus(status);
}

/**
 * Tenggat efektif sebuah pekerjaan (CAL-03 F5): `dueDate` bila diisi,
 * jika tidak `workDate` (tenggat default = tanggal kerja).
 */
export function getWorkEntryEffectiveDueDate(
  entry: Pick<WorkEntry, "workDate"> & { dueDate?: WorkDate | null },
): WorkDate {
  return entry.dueDate ?? entry.workDate;
}

/** Status pekerjaan + tanggal yang dibutuhkan indikator terlambat. */
export type WorkEntryDeadlineInput = Pick<WorkEntry, "status" | "workDate"> & {
  dueDate?: WorkDate | null;
};

/**
 * Overdue diturunkan: status belum selesai dan tenggat efektif
 * (`dueDate ?? workDate`) sudah lewat dibanding `today`. Entry `blocked`
 * pada tanggal lampau tetap overdue.
 *
 * `dueDate` bersifat opsional agar pemanggil lama yang hanya memiliki
 * `workDate` tetap kompatibel: tanpa tenggat, overdue mengikuti tanggal kerja.
 */
export function isWorkEntryOverdue(entry: WorkEntryDeadlineInput, today: string): boolean {
  if (isFinalWorkEntryStatus(entry.status)) return false;
  return getWorkEntryEffectiveDueDate(entry) < today;
}

/**
 * Indikator "selesai terlambat" (CAL-03 F5): membandingkan tanggal
 * penyelesaian dengan `due_date`. Pekerjaan yang selesai pada atau sebelum
 * tenggat tidak pernah terlambat, dan pekerjaan tanpa tenggat eksplisit
 * (atau tanpa `completedAt`) tidak dinilai terlambat.
 */
export function isWorkEntryCompletedLate(
  entry: Pick<WorkEntry, "status" | "completedAt"> & { dueDate?: WorkDate | null },
): boolean {
  if (entry.status !== "completed" || !entry.dueDate || !entry.completedAt) return false;
  const completedDate = formatWorkDateKey(new Date(entry.completedAt));
  return completedDate > entry.dueDate;
}

/**
 * Indikator overdue bersifat lintas status: overdue bukan status tersimpan
 * dan tidak pernah masuk penjumlahan status.
 */
export const WORK_ENTRY_OVERDUE_META = {
  key: "overdue",
  label: "Terlambat",
  description: "Belum selesai dan tanggal kerja sudah lewat",
  icon: Hourglass,
  toneClassName: "text-overdue",
} as const;

export function compareWorkEntries(
  left: Pick<WorkEntry, "workDate" | "status" | "isAllDay" | "startsAt" | "createdAt" | "id">,
  right: Pick<WorkEntry, "workDate" | "status" | "isAllDay" | "startsAt" | "createdAt" | "id">,
): number {
  if (left.workDate !== right.workDate) return left.workDate < right.workDate ? -1 : 1;

  // Entry dengan jam tampil lebih dahulu daripada entry sepanjang hari.
  if (left.isAllDay !== right.isAllDay) return left.isAllDay ? 1 : -1;

  if (left.startsAt && right.startsAt && left.startsAt !== right.startsAt) {
    return left.startsAt < right.startsAt ? -1 : 1;
  }
  if (left.startsAt !== right.startsAt) return left.startsAt ? -1 : 1;

  if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

/**
 * Perubahan status yang membutuhkan input inline lanjutan sebelum disimpan.
 */
export type WorkEntryStatusFollowUp = "realization" | "blocked_reason" | null;

export function getWorkEntryStatusFollowUp(status: WorkEntryStatus): WorkEntryStatusFollowUp {
  if (status === "completed") return "realization";
  if (status === "blocked") return "blocked_reason";
  return null;
}
