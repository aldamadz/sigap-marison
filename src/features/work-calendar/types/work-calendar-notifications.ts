/**
 * Tipe CAL-03 F7: ringkasan dashboard dan notifikasi Unified Work Calendar.
 *
 * Notifikasi memakai tabel `notifications` bersama, sehingga `category` disimpan
 * pada kolom `data` dan diurai secara defensif. Nilai `type` notifikasi tetap
 * memakai tipe yang sudah dikenal modul notifikasi SIGAP.
 */

import type {
  WorkDate,
  WorkEntry,
  WorkEntryEventType,
  WorkEntryId,
  WorkEntryOwnerId,
  WorkEntryStatus,
  WorkTimestamp,
} from "./work-calendar";

export const WORK_CALENDAR_NOTIFICATION_CATEGORIES = [
  "deadline_overdue",
  "follow_up_reminder",
  "blocked_escalation",
] as const;

export type WorkCalendarNotificationCategory =
  (typeof WORK_CALENDAR_NOTIFICATION_CATEGORIES)[number];

export const WORK_CALENDAR_NOTIFICATION_TYPES = [
  "info",
  "warning",
  "error",
  "success",
] as const;

export type WorkCalendarNotificationType = (typeof WORK_CALENDAR_NOTIFICATION_TYPES)[number];

/** Notifikasi Work Calendar yang sudah dipetakan dari baris `notifications`. */
export interface WorkCalendarNotification {
  id: string;
  category: WorkCalendarNotificationCategory;
  type: WorkCalendarNotificationType;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: WorkTimestamp;
  entryIds: readonly WorkEntryId[];
}

/** Peristiwa `work_calendar_events` untuk modul Aktivitas Terbaru. */
export interface WorkCalendarActivityItem {
  id: string;
  entryId: WorkEntryId;
  entryTitle: string;
  ownerId: WorkEntryOwnerId;
  ownerFullName: string | null;
  eventType: WorkEntryEventType;
  fromStatus: WorkEntryStatus | null;
  toStatus: WorkEntryStatus | null;
  detail: string | null;
  createdAt: WorkTimestamp;
}

/** Ringkasan pekerjaan hari ini dan pekerjaan tertunda untuk widget dashboard. */
export interface WorkCalendarDashboardSummary {
  todayEntries: readonly WorkEntry[];
  overdueEntries: readonly WorkEntry[];
  todayCount: number;
  overdueCount: number;
  plannedCount: number;
  inProgressCount: number;
  blockedCount: number;
}

export interface WorkCalendarNotificationGeneratorInput {
  /** Tanggal acuan; bila kosong server memakai tanggal Asia/Jakarta. */
  today?: WorkDate | null;
  /** Ambang hari kerja untuk eskalasi ke atasan. */
  escalationWorkDays?: number;
  /** Jendela debounce anti-spam dalam jam. */
  debounceHours?: number;
  signal?: AbortSignal;
}

export interface WorkCalendarDashboardEntriesInput {
  ownerId: WorkEntryOwnerId;
  today: WorkDate;
  signal?: AbortSignal;
}

export interface WorkCalendarActivityQueryInput {
  limit?: number;
  signal?: AbortSignal;
}

/** Kontrak repository F7 yang dipakai lapisan UI. */
export interface WorkCalendarDashboardRepository {
  generateNotifications(input?: WorkCalendarNotificationGeneratorInput): Promise<number>;
  listDashboardEntries(
    input: WorkCalendarDashboardEntriesInput,
  ): Promise<readonly WorkEntry[]>;
  listRecentActivity(
    input?: WorkCalendarActivityQueryInput,
  ): Promise<readonly WorkCalendarActivityItem[]>;
}
