/**
 * Helper murni CAL-03 F7 untuk notifikasi Unified Work Calendar.
 *
 * Kontrak penting yang sengaja dijaga selaras dengan migration
 * `20260918120000_work_calendar_notifications.sql`:
 * - kategori notifikasi (`deadline_overdue`, `follow_up_reminder`,
 *   `blocked_escalation`),
 * - bentuk kunci deduplikasi `work-calendar:<kategori>:<user>:<tanggal>`,
 * - debounce default 6 jam dan ambang eskalasi 2 hari kerja.
 *
 * Notifikasi disimpan pada tabel `notifications` bersama, sehingga `category`
 * dan `entry_ids` dibaca defensif dari kolom `data`.
 */

import { AlarmClock, CalendarClock, TriangleAlert, type LucideIcon } from "lucide-react";

import type { WorkCalendarNotificationCategory, WorkCalendarNotification } from "../types/work-calendar-notifications";
import { WORK_CALENDAR_NOTIFICATION_CATEGORIES } from "../types/work-calendar-notifications";

/** Debuoy anti-spam bawaan (jam) — selaras `p_debounce_hours` di migration. */
export const WORK_CALENDAR_NOTIFICATION_DEBOUNCE_HOURS = 6;

/** Ambang eskalasi ke atasan dalam hari kerja — selaras migration. */
export const WORK_CALENDAR_NOTIFICATION_ESCALATION_WORK_DAYS = 2;

export const WORK_CALENDAR_NOTIFICATION_DEDUPE_PREFIX = "work-calendar";

export interface WorkCalendarNotificationCategoryMeta {
  category: WorkCalendarNotificationCategory;
  label: string;
  description: string;
  /** Tipe notifikasi tersimpan yang dipakai generator SQL. */
  notificationType: "info" | "warning" | "error";
  icon: LucideIcon;
  /** Kelas Tailwind untuk ikon pada popover lonceng. */
  iconClassName: string;
}

export const WORK_CALENDAR_NOTIFICATION_META: Record<
  WorkCalendarNotificationCategory,
  WorkCalendarNotificationCategoryMeta
> = {
  deadline_overdue: {
    category: "deadline_overdue",
    label: "Tenggat terlewati",
    description: "Pekerjaan yang belum selesai dan sudah melewati tenggat.",
    notificationType: "warning",
    icon: AlarmClock,
    iconClassName: "bg-amber-500/10 text-amber-600",
  },
  follow_up_reminder: {
    category: "follow_up_reminder",
    label: "Pengingat tindak lanjut",
    description: "Pekerjaan terhambat yang perlu ditindaklanjuti.",
    notificationType: "info",
    icon: CalendarClock,
    iconClassName: "bg-blue-500/10 text-blue-600",
  },
  blocked_escalation: {
    category: "blocked_escalation",
    label: "Eskalasi pekerjaan bawahan",
    description: "Pekerjaan bawahan terhambat melewati ambang hari kerja.",
    notificationType: "error",
    icon: TriangleAlert,
    iconClassName: "bg-red-500/10 text-red-600",
  },
};

export function isWorkCalendarNotificationCategory(
  value: unknown,
): value is WorkCalendarNotificationCategory {
  return (
    typeof value === "string" &&
    (WORK_CALENDAR_NOTIFICATION_CATEGORIES as readonly string[]).includes(value)
  );
}

export function getWorkCalendarNotificationMeta(
  category: WorkCalendarNotificationCategory,
): WorkCalendarNotificationCategoryMeta {
  return WORK_CALENDAR_NOTIFICATION_META[category];
}

/**
 * Kunci deduplikasi/batching: satu notifikasi per kategori, pengguna, dan
 * tanggal bucket. Wajib identik dengan kunci yang ditulis generator SQL.
 */
export function buildWorkCalendarNotificationDedupeKey(
  category: WorkCalendarNotificationCategory,
  userId: string,
  bucketDate: string,
): string {
  return `${WORK_CALENDAR_NOTIFICATION_DEDUPE_PREFIX}:${category}:${userId}:${bucketDate}`;
}

/** Baris tabel `notifications` yang relevan untuk F7. */
export interface WorkCalendarNotificationRow {
  id: string;
  type: string | null;
  title: string | null;
  message: string | null;
  link: string | null;
  is_read: boolean | null;
  created_at: string;
  data: unknown;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Baca kategori dari kolom `data`; `null` bila bukan notifikasi Work Calendar. */
export function readWorkCalendarNotificationCategory(
  data: unknown,
): WorkCalendarNotificationCategory | null {
  const record = readRecord(data);
  const category = record?.category;
  return isWorkCalendarNotificationCategory(category) ? category : null;
}

function readEntryIds(data: unknown): readonly string[] {
  const record = readRecord(data);
  const raw = record?.entry_ids;
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === "string");
}

function normalizeNotificationType(value: string | null): WorkCalendarNotification["type"] {
  return value === "warning" || value === "error" || value === "success" ? value : "info";
}

/**
 * Petakan baris `notifications` menjadi notifikasi Work Calendar. Baris tanpa
 * kategori F7 dikembalikan `null` supaya notifikasi modul lain tidak ikut
 * ditandai sebagai notifikasi kalender.
 */
export function mapWorkCalendarNotificationRow(
  row: WorkCalendarNotificationRow,
): WorkCalendarNotification | null {
  const category = readWorkCalendarNotificationCategory(row.data);
  if (!category) return null;

  return {
    id: row.id,
    category,
    type: normalizeNotificationType(row.type),
    title: row.title ?? "",
    message: row.message ?? "",
    link: row.link ?? null,
    isRead: row.is_read === true,
    createdAt: row.created_at,
    entryIds: readEntryIds(row.data),
  };
}

/** Hanya notifikasi kalender yang belum dibaca. */
export function countUnreadWorkCalendarNotifications(
  notifications: readonly WorkCalendarNotification[],
): number {
  return notifications.filter((notification) => !notification.isRead).length;
}

export interface WorkCalendarNotificationBreakdown {
  total: number;
  unread: number;
  byCategory: Record<WorkCalendarNotificationCategory, number>;
}

export function summarizeWorkCalendarNotifications(
  notifications: readonly WorkCalendarNotification[],
): WorkCalendarNotificationBreakdown {
  const byCategory: Record<WorkCalendarNotificationCategory, number> = {
    deadline_overdue: 0,
    follow_up_reminder: 0,
    blocked_escalation: 0,
  };
  let unread = 0;

  for (const notification of notifications) {
    byCategory[notification.category] += 1;
    if (!notification.isRead) unread += 1;
  }

  return { total: notifications.length, unread, byCategory };
}
