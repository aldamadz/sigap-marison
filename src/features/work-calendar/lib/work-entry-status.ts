/**
 * Status domain untuk Unified Work Calendar.
 *
 * Empat status tersimpan (`planned`, `in_progress`, `completed`, `blocked`).
 * Overdue **bukan** status tersimpan; overdue adalah derived state supaya
 * status tidak pernah bertabrakan dengan hasil penjadwalan.
 */

import { CircleCheck, CircleDashed, CircleSlash, LoaderCircle, type LucideIcon } from "lucide-react";

import type { WorkEntry, WorkEntryStatus } from "../types/work-calendar";

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
  /** Status final tidak dihitung sebagai pekerjaan tertunda. */
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
    isFinal: false,
  },
  in_progress: {
    status: "in_progress",
    label: "Sedang Dikerjakan",
    description: "Sedang berjalan",
    icon: LoaderCircle,
    badgeClassName: "border-pending/30 bg-pending/10 text-pending",
    iconClassName: "text-pending",
    isFinal: false,
  },
  completed: {
    status: "completed",
    label: "Selesai",
    description: "Sudah selesai",
    icon: CircleCheck,
    badgeClassName: "border-success/30 bg-success/10 text-success",
    iconClassName: "text-success",
    isFinal: true,
  },
  blocked: {
    status: "blocked",
    label: "Terhambat",
    description: "Terhambat dan butuh tindak lanjut",
    icon: CircleSlash,
    badgeClassName: "border-destructive/30 bg-destructive/10 text-destructive",
    iconClassName: "text-destructive",
    isFinal: true,
  },
};

export const WORK_ENTRY_STATUS_ORDER: readonly WorkEntryStatus[] = Object.freeze(
  Object.keys(WORK_ENTRY_STATUS_META) as WorkEntryStatus[],
);

export function getWorkEntryStatusMeta(status: WorkEntryStatus): WorkEntryStatusMeta {
  return WORK_ENTRY_STATUS_META[status];
}

export function getWorkEntryStatusLabel(status: WorkEntryStatus): string {
  return WORK_ENTRY_STATUS_META[status].label;
}

export function isFinalWorkEntryStatus(status: WorkEntryStatus): boolean {
  return WORK_ENTRY_STATUS_META[status].isFinal;
}

/**
 * Overdue diturunkan: status belum final dan tanggal kerja sudah lewat
 * dibanding `today`.
 */
export function isWorkEntryOverdue(
  entry: Pick<WorkEntry, "status" | "workDate">,
  today: string,
): boolean {
  if (isFinalWorkEntryStatus(entry.status)) return false;
  return entry.workDate < today;
}

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
