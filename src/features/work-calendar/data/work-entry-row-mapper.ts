import type {
  WorkEntry,
  WorkEntryColorSwatch,
  WorkEntryKind,
  WorkEntryStatus,
} from "../types/work-calendar";
import { WORK_ENTRY_COLOR_SWATCHES, WORK_ENTRY_KINDS, WORK_ENTRY_STATUSES } from "../types/work-calendar";

export interface WorkCalendarEntryRow {
  id: string;
  owner_id: string;
  work_date: string;
  title: string;
  realization: string | null;
  notes: string | null;
  location: string | null;
  status: string;
  kind: string;
  is_all_day: boolean;
  starts_at: string | null;
  ends_at: string | null;
  blocked_reason: string | null;
  completed_at: string | null;
  due_date: string | null;
  color_swatch: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

function isValidStatus(value: unknown): value is WorkEntryStatus {
  return typeof value === "string" && (WORK_ENTRY_STATUSES as readonly string[]).includes(value);
}

function isValidKind(value: unknown): value is WorkEntryKind {
  return typeof value === "string" && (WORK_ENTRY_KINDS as readonly string[]).includes(value);
}

/**
 * Warna dari database dipetakan secara toleran: nilai di luar palet aplikasi
 * (mis. palet ditambah di server lebih dulu) tidak boleh menggagalkan seluruh
 * pemuatan kalender, cukup dianggap tanpa penanda.
 */
function mapColorSwatch(value: unknown): WorkEntryColorSwatch | null {
  return typeof value === "string" && (WORK_ENTRY_COLOR_SWATCHES as readonly string[]).includes(value)
    ? (value as WorkEntryColorSwatch)
    : null;
}

export function mapWorkEntryRow(row: WorkCalendarEntryRow): WorkEntry {
  if (!isValidStatus(row.status)) {
    throw new Error(`Data pekerjaan tidak valid: status "${row.status}" tidak dikenali.`);
  }

  if (!isValidKind(row.kind)) {
    throw new Error(`Data pekerjaan tidak valid: jenis "${row.kind}" tidak dikenali.`);
  }

  return {
    id: row.id,
    ownerId: row.owner_id,
    workDate: row.work_date,
    title: row.title,
    realization: row.realization,
    notes: row.notes,
    location: row.location,
    status: row.status,
    kind: row.kind,
    isAllDay: row.is_all_day,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    blockedReason: row.blocked_reason,
    completedAt: row.completed_at,
    dueDate: row.due_date,
    colorSwatch: mapColorSwatch(row.color_swatch),
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
