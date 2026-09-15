/**
 * Validasi murni untuk Unified Work Calendar.
 *
 * Tidak memakai zod dan tidak memakai schema form lama. Aturan produk:
 * quick entry hanya membutuhkan judul; status `completed` membutuhkan
 * realisasi; status `blocked` membutuhkan alasan.
 */

import type { WorkEntry, WorkEntryKind, WorkEntryStatus } from "../types/work-calendar";
import { WORK_ENTRY_KINDS, WORK_ENTRY_STATUSES } from "../types/work-calendar";

export const WORK_ENTRY_TITLE_MAX_LENGTH = 180;
export const WORK_ENTRY_REALIZATION_MAX_LENGTH = 500;
export const WORK_ENTRY_BLOCKED_REASON_MAX_LENGTH = 300;
export const WORK_ENTRY_NOTES_MAX_LENGTH = 1000;
export const WORK_ENTRY_LOCATION_MAX_LENGTH = 120;

export interface WorkEntryFieldErrors {
  title?: string;
  realization?: string;
  blockedReason?: string;
  notes?: string;
  location?: string;
  workDate?: string;
  timeRange?: string;
}

export type WorkEntryValidationResult =
  | { ok: true; errors: WorkEntryFieldErrors }
  | { ok: false; errors: WorkEntryFieldErrors };

export function normalizeWorkEntryTitle(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function normalizeWorkEntryText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isKnownStatus(value: unknown): value is WorkEntryStatus {
  return typeof value === "string" && (WORK_ENTRY_STATUSES as readonly string[]).includes(value);
}

function isKnownKind(value: unknown): value is WorkEntryKind {
  return typeof value === "string" && (WORK_ENTRY_KINDS as readonly string[]).includes(value);
}

function isIsoTimestamp(value: unknown): boolean {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(new Date(value).getTime());
}

export interface WorkEntryValidationInput {
  title: string;
  status: WorkEntryStatus;
  kind: WorkEntryKind;
  isAllDay?: boolean;
  realization?: string | null;
  blockedReason?: string | null;
  notes?: string | null;
  location?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  workDate?: string;
}

export function validateWorkEntryInput(input: WorkEntryValidationInput): WorkEntryValidationResult {
  const errors: WorkEntryFieldErrors = {};

  const title = normalizeWorkEntryTitle(input.title);
  if (title.length === 0) {
    errors.title = "Judul pekerjaan wajib diisi.";
  } else if (title.length > WORK_ENTRY_TITLE_MAX_LENGTH) {
    errors.title = `Judul maksimal ${WORK_ENTRY_TITLE_MAX_LENGTH} karakter.`;
  }

  if (!isKnownStatus(input.status)) {
    errors.title = errors.title ?? "Status pekerjaan tidak dikenali.";
  }
  if (!isKnownKind(input.kind)) {
    errors.title = errors.title ?? "Jenis pekerjaan tidak dikenali.";
  }

  const realization = normalizeWorkEntryText(input.realization);
  if (input.status === "completed" && !realization) {
    errors.realization = "Isi hasil pekerjaan sebelum menandai selesai.";
  } else if (realization && realization.length > WORK_ENTRY_REALIZATION_MAX_LENGTH) {
    errors.realization = `Hasil maksimal ${WORK_ENTRY_REALIZATION_MAX_LENGTH} karakter.`;
  }

  const blockedReason = normalizeWorkEntryText(input.blockedReason);
  if (input.status === "blocked" && !blockedReason) {
    errors.blockedReason = "Isi alasan terhambat sebelum menyimpan.";
  } else if (blockedReason && blockedReason.length > WORK_ENTRY_BLOCKED_REASON_MAX_LENGTH) {
    errors.blockedReason = `Alasan maksimal ${WORK_ENTRY_BLOCKED_REASON_MAX_LENGTH} karakter.`;
  }

  const notes = normalizeWorkEntryText(input.notes);
  if (notes && notes.length > WORK_ENTRY_NOTES_MAX_LENGTH) {
    errors.notes = `Catatan maksimal ${WORK_ENTRY_NOTES_MAX_LENGTH} karakter.`;
  }

  const location = normalizeWorkEntryText(input.location);
  if (location && location.length > WORK_ENTRY_LOCATION_MAX_LENGTH) {
    errors.location = `Lokasi maksimal ${WORK_ENTRY_LOCATION_MAX_LENGTH} karakter.`;
  }

  if (input.workDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(input.workDate)) {
    errors.workDate = "Tanggal kerja tidak valid.";
  }

  const hasStart = isIsoTimestamp(input.startsAt);
  const hasEnd = isIsoTimestamp(input.endsAt);
  const wantsTime = Boolean(input.startsAt) || Boolean(input.endsAt);

  if (input.isAllDay === true && (input.startsAt || input.endsAt)) {
    errors.timeRange = "Pekerjaan sepanjang hari tidak boleh memiliki jam mulai atau jam selesai.";
  } else if (input.isAllDay === false && (!hasStart || !hasEnd)) {
    errors.timeRange = "Isi jam mulai dan jam selesai bersama-sama.";
  } else if (wantsTime && (!hasStart || !hasEnd)) {
    errors.timeRange = "Isi jam mulai dan jam selesai bersama-sama.";
  } else if (hasStart && hasEnd && (input.startsAt as string) >= (input.endsAt as string)) {
    errors.timeRange = "Jam selesai harus setelah jam mulai.";
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/** Validasi cepat entry yang sudah tersimpan (dipakai test kontrak). */
export function validateStoredWorkEntry(entry: WorkEntry): WorkEntryValidationResult {
  return validateWorkEntryInput({
    title: entry.title,
    status: entry.status,
    kind: entry.kind,
    isAllDay: entry.isAllDay,
    realization: entry.realization,
    blockedReason: entry.blockedReason,
    notes: entry.notes,
    location: entry.location,
    startsAt: entry.startsAt,
    endsAt: entry.endsAt,
    workDate: entry.workDate,
  });
}

/** Apakah entry dapat dibuat hanya dengan judul (default quick entry). */
export function canQuickCreateWorkEntry(title: string): boolean {
  const normalized = normalizeWorkEntryTitle(title);
  return normalized.length > 0 && normalized.length <= WORK_ENTRY_TITLE_MAX_LENGTH;
}
