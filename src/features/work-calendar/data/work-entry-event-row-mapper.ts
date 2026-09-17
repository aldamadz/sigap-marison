/**
 * Pemetaan baris `work_calendar_events` ke `WorkEntryEvent` (CAL-03 F5).
 *
 * Hanya memetakan; tidak ada akses jaringan. Nilai `type` yang tidak dikenali
 * ditolak tegas supaya peristiwa asing tidak pernah tampil sebagai timeline
 * yang menyesatkan.
 */

import type { WorkEntryEvent, WorkEntryEventType, WorkEntryStatus } from "../types/work-calendar";
import { WORK_ENTRY_EVENT_TYPES, WORK_ENTRY_STATUSES } from "../types/work-calendar";

export interface WorkCalendarEventRow {
  id: string;
  entry_id: string;
  owner_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  from_work_date: string | null;
  to_work_date: string | null;
  from_due_date: string | null;
  to_due_date: string | null;
  detail: string | null;
  actor_id: string | null;
  created_at: string;
}

function isKnownEventType(value: unknown): value is WorkEntryEventType {
  return (
    typeof value === "string" && (WORK_ENTRY_EVENT_TYPES as readonly string[]).includes(value)
  );
}

function mapStatus(value: string | null): WorkEntryStatus | null {
  return typeof value === "string" && (WORK_ENTRY_STATUSES as readonly string[]).includes(value)
    ? (value as WorkEntryStatus)
    : null;
}

export function mapWorkEntryEventRow(row: WorkCalendarEventRow): WorkEntryEvent {
  if (!isKnownEventType(row.event_type)) {
    throw new Error(
      `Riwayat pekerjaan tidak valid: jenis peristiwa "${row.event_type}" tidak dikenali.`,
    );
  }

  return {
    id: row.id,
    entryId: row.entry_id,
    ownerId: row.owner_id,
    type: row.event_type,
    fromStatus: mapStatus(row.from_status),
    toStatus: mapStatus(row.to_status),
    fromWorkDate: row.from_work_date,
    toWorkDate: row.to_work_date,
    fromDueDate: row.from_due_date,
    toDueDate: row.to_due_date,
    detail: row.detail,
    actorId: row.actor_id,
    createdAt: row.created_at,
  };
}
