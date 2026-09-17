/**
 * Aturan siklus hidup pekerjaan Unified Work Calendar (CAL-03 F5).
 *
 * Modul ini murni: tidak memanggil repository/jaringan. Semua aksi siklus
 * hidup adalah PATCH pada baris yang sama (tidak pernah INSERT baru), dan
 * riwayat peristiwa mengikuti aturan yang sama dengan trigger database
 * `work_calendar_entries_log_event`.
 */

import type {
  WorkDate,
  WorkEntryColorSwatch,
  WorkEntryEvent,
  WorkEntryEventType,
  WorkEntryPatch,
  WorkEntryStatus,
} from "../types/work-calendar";
import { WORK_ENTRY_COLOR_SWATCHES } from "../types/work-calendar";
import { formatWorkDateFull } from "./work-calendar-date";
import { getWorkEntryStatusLabel } from "./work-entry-status";

export interface WorkEntryColorMeta {
  swatch: WorkEntryColorSwatch;
  label: string;
  description: string;
  /** Hex statis, dipakai langsung sebagai `backgroundColor` supaya aman dari purge. */
  hex: string;
}

/**
 * Palet warna statis (CAL-03 F5). Setiap warna punya label teks sehingga
 * makna tidak pernah bergantung pada warna saja (WCAG 1.4.1).
 */
export const WORK_ENTRY_COLOR_META: readonly WorkEntryColorMeta[] = Object.freeze([
  {
    swatch: "slate",
    label: "Abu-abu netral",
    description: "Netral",
    hex: "#64748b",
  },
  {
    swatch: "blue",
    label: "Biru",
    description: "Pekerjaan rutin",
    hex: "#2563eb",
  },
  {
    swatch: "teal",
    label: "Teal",
    description: "Koordinasi",
    hex: "#0d9488",
  },
  {
    swatch: "amber",
    label: "Kuning",
    description: "Perlu perhatian",
    hex: "#d97706",
  },
  {
    swatch: "rose",
    label: "Merah muda",
    description: "Prioritas",
    hex: "#e11d48",
  },
  {
    swatch: "violet",
    label: "Ungu",
    description: "Proyek khusus",
    hex: "#7c3aed",
  },
]);

export function getWorkEntryColorMeta(swatch: WorkEntryColorSwatch): WorkEntryColorMeta {
  const meta = WORK_ENTRY_COLOR_META.find((candidate) => candidate.swatch === swatch);
  if (meta) return meta;
  return WORK_ENTRY_COLOR_META[0];
}

export function isWorkEntryColorSwatch(value: unknown): value is WorkEntryColorSwatch {
  return (
    typeof value === "string" && (WORK_ENTRY_COLOR_SWATCHES as readonly string[]).includes(value)
  );
}

/**
 * Aksi "Lanjutkan hari ini": pindahkan tanggal kerja ke hari ini pada baris
 * yang sama. Bila sudah hari ini, tidak ada perubahan (mengembalikan `null`)
 * supaya tidak ada peristiwa jadwal kosong.
 */
export function buildContinueTodayPatch(
  entry: { workDate: WorkDate },
  today: WorkDate,
): WorkEntryPatch | null {
  if (entry.workDate === today) return null;
  return { workDate: today };
}

/** Aksi "Ubah jadwal": pindahkan tanggal kerja ke tanggal pilihan. */
export function buildReschedulePatch(
  entry: { workDate: WorkDate },
  date: WorkDate,
): WorkEntryPatch | null {
  if (entry.workDate === date) return null;
  return { workDate: date };
}

/** Patch status tanpa input lanjutan (planned/in_progress). */
export function buildStatusPatch(status: WorkEntryStatus): WorkEntryPatch {
  return { status };
}

/** Patch transisi ke `completed`, lengkap dengan hasil pekerjaan. */
export function buildCompletePatch(realization: string): WorkEntryPatch {
  return { status: "completed", realization, blockedReason: null };
}

/** Patch transisi ke `blocked`, lengkap dengan alasan. */
export function buildBlockedPatch(reason: string): WorkEntryPatch {
  return { status: "blocked", blockedReason: reason };
}

/** Peristiwa yang akan dicatat untuk sebuah perubahan entry. */
export interface WorkEntryEventDraft {
  type: WorkEntryEventType;
  fromStatus: WorkEntryStatus | null;
  toStatus: WorkEntryStatus | null;
  fromWorkDate: WorkDate | null;
  toWorkDate: WorkDate | null;
  fromDueDate: WorkDate | null;
  toDueDate: WorkDate | null;
  detail: string | null;
}

/**
 * Menurunkan peristiwa dari perubahan entry. Fungsi ini adalah cermin murni
 * dari trigger `work_calendar_entries_log_event` sehingga fixture test dan
 * database mencatat riwayat yang sama.
 *
 * `previous` bernilai `null` saat entry baru dibuat.
 */
export function buildWorkEntryEventDrafts(
  previous: WorkEntryEventDraftSource | null,
  next: WorkEntryEventDraftSource,
): WorkEntryEventDraft[] {
  if (previous === null) {
    return [
      {
        type: "created",
        fromStatus: null,
        toStatus: next.status,
        fromWorkDate: null,
        toWorkDate: next.workDate,
        fromDueDate: null,
        toDueDate: null,
        detail: null,
      },
    ];
  }

  // Soft delete bukan perubahan siklus hidup.
  if (next.deletedAt !== null && previous.deletedAt === null) return [];

  const events: WorkEntryEventDraft[] = [];

  if (next.status !== previous.status) {
    events.push({
      type: "status_changed",
      fromStatus: previous.status,
      toStatus: next.status,
      fromWorkDate: null,
      toWorkDate: null,
      fromDueDate: null,
      toDueDate: null,
      detail:
        next.status === "completed"
          ? next.realization
          : next.status === "blocked"
            ? next.blockedReason
            : null,
    });
  }

  if (next.workDate !== previous.workDate) {
    events.push({
      type: "schedule_changed",
      fromStatus: null,
      toStatus: null,
      fromWorkDate: previous.workDate,
      toWorkDate: next.workDate,
      fromDueDate: null,
      toDueDate: null,
      detail: null,
    });
  }

  if (next.dueDate !== previous.dueDate) {
    events.push({
      type: "due_date_changed",
      fromStatus: null,
      toStatus: null,
      fromWorkDate: null,
      toWorkDate: null,
      fromDueDate: previous.dueDate,
      toDueDate: next.dueDate,
      detail: null,
    });
  }

  return events;
}

/** Bagian entry yang dibutuhkan untuk menurunkan peristiwa. */
export interface WorkEntryEventDraftSource {
  status: WorkEntryStatus;
  workDate: WorkDate;
  dueDate: WorkDate | null;
  realization: string | null;
  blockedReason: string | null;
  deletedAt: string | null;
}

/** Deskripsi timeline yang siap tampil (label + kalimat penjelas). */
export interface WorkEntryEventDescription {
  title: string;
  detail: string | null;
}

function describeStatusChange(event: WorkEntryEvent): string {
  if (event.toStatus) {
    const label = getWorkEntryStatusLabel(event.toStatus);
    return `Status menjadi ${label}.`;
  }
  return "Status diperbarui.";
}

function describeScheduleChange(event: WorkEntryEvent): string {
  if (event.fromWorkDate && event.toWorkDate) {
    return `Jadwal dipindahkan dari ${formatWorkDateFull(event.fromWorkDate)} ke ${formatWorkDateFull(event.toWorkDate)}.`;
  }
  return "Jadwal diperbarui.";
}

function describeDueDateChange(event: WorkEntryEvent): string {
  if (event.toDueDate) {
    return `Tenggat ditetapkan ${formatWorkDateFull(event.toDueDate)}.`;
  }
  if (event.fromDueDate) {
    return `Tenggat ${formatWorkDateFull(event.fromDueDate)} dihapus.`;
  }
  return "Tenggat diperbarui.";
}

export function describeWorkEntryEvent(event: WorkEntryEvent): WorkEntryEventDescription {
  switch (event.type) {
    case "created":
      return { title: "Pekerjaan dibuat", detail: describeScheduleChange(event) };
    case "status_changed":
      return { title: describeStatusChange(event), detail: event.detail };
    case "schedule_changed":
      return { title: "Jadwal diubah", detail: describeScheduleChange(event) };
    case "due_date_changed":
      return { title: "Tenggat diubah", detail: describeDueDateChange(event) };
    default:
      return { title: "Peristiwa diperbarui", detail: null };
  }
}
