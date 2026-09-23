/**
 * Repository Supabase CAL-03 F7.
 *
 * Semua akses jaringan F7 (generator notifikasi, widget dashboard, dan
 * aktivitas terbaru) melewati berkas ini supaya komponen tetap murni dan mudah
 * diuji. Hanya RPC publik yang sudah diberi hak ke `authenticated` yang
 * dipanggil; helper internal generator tidak pernah dipanggil dari klien.
 */

import type {
  WorkCalendarActivityItem,
  WorkCalendarActivityQueryInput,
  WorkCalendarDashboardEntriesInput,
  WorkCalendarDashboardRepository,
  WorkCalendarNotificationGeneratorInput,
} from "../types/work-calendar-notifications";
import { isWorkCalendarNotificationCategory } from "../lib/work-calendar-notifications";
import type { WorkEntry, WorkEntryEventType, WorkEntryStatus } from "../types/work-calendar";
import { WORK_ENTRY_EVENT_TYPES, WORK_ENTRY_STATUSES } from "../types/work-calendar";
import type { WorkCalendarEntryRow } from "./work-entry-row-mapper";
import { mapWorkEntryRow } from "./work-entry-row-mapper";

export interface WorkCalendarDashboardRpcQuery<TResult = unknown>
  extends PromiseLike<{ data: TResult; error: { message: string } | null }> {
  abortSignal?(signal: AbortSignal): WorkCalendarDashboardRpcQuery<TResult>;
}

export interface SupabaseWorkCalendarDashboardClient {
  rpc<TResult = unknown>(
    fn: string,
    args?: Record<string, unknown>,
  ): WorkCalendarDashboardRpcQuery<TResult>;
}

/** Baris RPC `get_my_recent_work_calendar_events`. */
export interface WorkCalendarActivityRow {
  id: string;
  entry_id: string;
  owner_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  detail: string | null;
  created_at: string;
  entry_title: string | null;
  owner_full_name: string | null;
}

export const WORK_CALENDAR_DASHBOARD_ERROR_MESSAGE = "Gagal memuat ringkasan Kalender Kerja.";
export const WORK_CALENDAR_NOTIFICATION_GENERATE_ERROR_MESSAGE =
  "Gagal menyiapkan notifikasi Kalender Kerja.";
export const WORK_CALENDAR_ACTIVITY_ERROR_MESSAGE = "Gagal memuat aktivitas Kalender Kerja.";

/** Batas atas peristiwa yang diminta agar feed aktivitas tetap ringan. */
export const WORK_CALENDAR_ACTIVITY_MAX_ROWS = 50;

const DASHBOARD_ENTRIES_RPC = "get_work_calendar_dashboard_entries";
const RECENT_ACTIVITY_RPC = "get_my_recent_work_calendar_events";
const GENERATE_NOTIFICATIONS_RPC = "generate_work_calendar_notifications";

function isWorkEntryEventType(value: unknown): value is WorkEntryEventType {
  return typeof value === "string" && (WORK_ENTRY_EVENT_TYPES as readonly string[]).includes(value);
}

function toWorkEntryStatus(value: unknown): WorkEntryStatus | null {
  return typeof value === "string" && (WORK_ENTRY_STATUSES as readonly string[]).includes(value)
    ? (value as WorkEntryStatus)
    : null;
}

function normalizeLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return 20;
  return Math.min(Math.max(Math.trunc(limit), 1), WORK_CALENDAR_ACTIVITY_MAX_ROWS);
}

async function runRpc<TResult>(
  client: SupabaseWorkCalendarDashboardClient,
  fn: string,
  args: Record<string, unknown>,
  signal: AbortSignal | undefined,
  errorMessage: string,
): Promise<TResult> {
  const query = client.rpc<TResult>(fn, args);
  const abortable = signal ? query.abortSignal?.(signal) ?? query : query;
  const { data, error } = await abortable;
  if (error) throw new Error(`${errorMessage} ${error.message}`);
  return data;
}

export function createSupabaseWorkCalendarDashboardRepository(
  client: SupabaseWorkCalendarDashboardClient,
): WorkCalendarDashboardRepository {
  return {
    async generateNotifications(
      input: WorkCalendarNotificationGeneratorInput = {},
    ): Promise<number> {
      const args: Record<string, unknown> = {};
      if (input.today) args.p_today = input.today;
      if (typeof input.escalationWorkDays === "number") {
        args.p_escalation_work_days = input.escalationWorkDays;
      }
      if (typeof input.debounceHours === "number") {
        args.p_debounce_hours = input.debounceHours;
      }

      const data = await runRpc<unknown>(
        client,
        GENERATE_NOTIFICATIONS_RPC,
        args,
        input.signal,
        WORK_CALENDAR_NOTIFICATION_GENERATE_ERROR_MESSAGE,
      );

      return typeof data === "number" ? data : 0;
    },

    async listDashboardEntries(
      input: WorkCalendarDashboardEntriesInput,
    ): Promise<readonly WorkEntry[]> {
      const data = await runRpc<unknown>(
        client,
        DASHBOARD_ENTRIES_RPC,
        { p_owner_id: input.ownerId, p_today: input.today },
        input.signal,
        WORK_CALENDAR_DASHBOARD_ERROR_MESSAGE,
      );

      if (!Array.isArray(data)) return [];
      return data.map((row) => mapWorkEntryRow(row as WorkCalendarEntryRow));
    },

    async listRecentActivity(
      input: WorkCalendarActivityQueryInput = {},
    ): Promise<readonly WorkCalendarActivityItem[]> {
      const data = await runRpc<unknown>(
        client,
        RECENT_ACTIVITY_RPC,
        { p_limit: normalizeLimit(input.limit) },
        input.signal,
        WORK_CALENDAR_ACTIVITY_ERROR_MESSAGE,
      );

      if (!Array.isArray(data)) return [];

      const rows = data as WorkCalendarActivityRow[];
      const items: WorkCalendarActivityItem[] = [];
      for (const row of rows) {
        if (!isWorkEntryEventType(row.event_type)) continue;
        if (typeof row.id !== "string" || typeof row.entry_id !== "string") continue;
        items.push({
          id: row.id,
          entryId: row.entry_id,
          entryTitle: row.entry_title ?? "",
          ownerId: row.owner_id,
          ownerFullName: row.owner_full_name ?? null,
          eventType: row.event_type,
          fromStatus: toWorkEntryStatus(row.from_status),
          toStatus: toWorkEntryStatus(row.to_status),
          detail: row.detail ?? null,
          createdAt: row.created_at,
        });
      }
      return items;
    },
  };
}

/** Dipakai test untuk memastikan parser kategori tetap sinkron dengan SQL. */
export { isWorkCalendarNotificationCategory };
