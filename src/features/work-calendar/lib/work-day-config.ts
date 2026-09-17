/**
 * Hari kerja, jam kerja, dan hari libur untuk Unified Work Calendar (CAL-03 F6).
 *
 * Modul ini murni: tidak mengimpor Supabase, React, maupun repository. Seluruh
 * keputusan visual (hari kerja, hari nonkerja, libur) diturunkan dari
 * `WorkCalendarWorkSettings` dan daftar `WorkCalendarHoliday`.
 *
 * Konvensi hari kerja mengikuti konfigurasi KPI existing: ISO weekday,
 * Senin = 1 sampai Minggu = 7 (`extract(isodow ...)` di database). Default
 * yang dipakai bila konfigurasi kosong tetap Senin-Jumat.
 */

import type {
  WorkCalendarDayKind,
  WorkCalendarDayMeta,
  WorkCalendarHoliday,
  WorkCalendarWorkSettings,
  WorkDate,
} from "../types/work-calendar";
import { getWorkDateWeekday, parseWorkDateParts } from "./work-calendar-date";

/** Default Senin-Jumat 08:00-17:00, istirahat 12:00-13:00 (sama dengan KPI). */
export const DEFAULT_WORK_CALENDAR_WORK_SETTINGS: WorkCalendarWorkSettings = Object.freeze({
  workDays: Object.freeze([1, 2, 3, 4, 5]),
  workStart: "08:00",
  workEnd: "17:00",
  breakStart: "12:00",
  breakEnd: "13:00",
  timezone: "Asia/Jakarta",
});

const TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

function normalizeTime(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const match = TIME_PATTERN.exec(value.trim());
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return fallback;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Normalisasi array hari kerja menjadi ISO weekday unik yang valid dan
 * terurut. Nilai di luar 1-7 dibuang; daftar kosong jatuh ke default
 * Senin-Jumat supaya kalender tidak pernah kehilangan hari kerja.
 */
export function normalizeWorkDays(value: unknown): readonly number[] {
  const source = Array.isArray(value) ? value : [];
  const days = new Set<number>();
  for (const entry of source) {
    const numeric = typeof entry === "number" ? entry : Number(entry);
    if (!Number.isInteger(numeric)) continue;
    if (numeric < 1 || numeric > 7) continue;
    days.add(numeric);
  }
  if (days.size === 0) return DEFAULT_WORK_CALENDAR_WORK_SETTINGS.workDays;
  return Object.freeze([...days].sort((left, right) => left - right));
}

/**
 * Normalkan pengaturan mentah (mis. hasil RPC) menjadi bentuk domain yang
 * aman. Field yang hilang/tidak valid memakai default; array hari kerja yang
 * kosong juga jatuh ke default Senin-Jumat.
 */
export function normalizeWorkSettings(value: unknown): WorkCalendarWorkSettings {
  const source =
    value !== null && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    workDays: normalizeWorkDays(source.workDays ?? source.work_days),
    workStart: normalizeTime(
      source.workStart ?? source.work_start,
      DEFAULT_WORK_CALENDAR_WORK_SETTINGS.workStart,
    ),
    workEnd: normalizeTime(
      source.workEnd ?? source.work_end,
      DEFAULT_WORK_CALENDAR_WORK_SETTINGS.workEnd,
    ),
    breakStart: normalizeTime(
      source.breakStart ?? source.break_start,
      DEFAULT_WORK_CALENDAR_WORK_SETTINGS.breakStart,
    ),
    breakEnd: normalizeTime(
      source.breakEnd ?? source.break_end,
      DEFAULT_WORK_CALENDAR_WORK_SETTINGS.breakEnd,
    ),
    timezone:
      typeof source.timezone === "string" && source.timezone.trim().length > 0
        ? source.timezone.trim()
        : DEFAULT_WORK_CALENDAR_WORK_SETTINGS.timezone,
  };
}

/** Urutan ISO weekday dari `getWorkDateWeekday` (Minggu = 0) ke 1-7. */
function toIsoWeekday(date: WorkDate): number {
  const weekday = getWorkDateWeekday(date);
  return weekday === 0 ? 7 : weekday;
}

/** `true` bila tanggal termasuk hari kerja pada pengaturan. */
export function isWorkCalendarWorkDay(
  date: WorkDate,
  settings: WorkCalendarWorkSettings = DEFAULT_WORK_CALENDAR_WORK_SETTINGS,
): boolean {
  if (!parseWorkDateParts(date)) return false;
  return settings.workDays.includes(toIsoWeekday(date));
}

/**
 * Indeks hari libur menurut tanggal. Bila ada duplikat (tidak mungkin di
 * database karena unique), entri pertama dipertahankan.
 */
export function indexWorkCalendarHolidays(
  holidays: readonly WorkCalendarHoliday[],
): ReadonlyMap<WorkDate, WorkCalendarHoliday> {
  const map = new Map<WorkDate, WorkCalendarHoliday>();
  for (const holiday of holidays) {
    if (!map.has(holiday.date)) map.set(holiday.date, holiday);
  }
  return map;
}

/**
 * Klasifikasi satu tanggal:
 * - `holiday` bila terdaftar sebagai libur (nasional maupun cuti bersama);
 * - `non_work_day` bila di luar hari kerja konfigurasi (mis. Sabtu/Minggu);
 * - `work_day` selainnya.
 *
 * Libur diperiksa lebih dulu supaya hari kerja yang jatuh pada tanggal libur
 * tetap ditandai libur.
 */
export function getWorkCalendarDayMeta(
  date: WorkDate,
  settings: WorkCalendarWorkSettings = DEFAULT_WORK_CALENDAR_WORK_SETTINGS,
  holidays: ReadonlyMap<WorkDate, WorkCalendarHoliday> = new Map(),
): WorkCalendarDayMeta {
  const holiday = holidays.get(date) ?? null;
  let kind: WorkCalendarDayKind;
  if (holiday) {
    kind = "holiday";
  } else if (isWorkCalendarWorkDay(date, settings)) {
    kind = "work_day";
  } else {
    kind = "non_work_day";
  }

  return {
    date,
    kind,
    holiday,
    isCutiBersama: holiday?.isCutiBersama ?? false,
    label: buildWorkCalendarDayLabel(kind, holiday),
  };
}

function buildWorkCalendarDayLabel(
  kind: WorkCalendarDayKind,
  holiday: WorkCalendarHoliday | null,
): string | null {
  if (kind === "holiday") {
    if (!holiday) return "Libur";
    return holiday.isCutiBersama ? `Cuti bersama: ${holiday.name}` : holiday.name;
  }
  if (kind === "non_work_day") return "Hari nonkerja";
  return null;
}

/**
 * Bangun peta klasifikasi untuk sekumpulan tanggal sekaligus. Dipakai
 * tampilan Minggu/Bulan supaya setiap sel memakai sumber kebenaran yang sama.
 */
export function buildWorkCalendarDayMetaMap(
  dates: readonly WorkDate[],
  settings: WorkCalendarWorkSettings = DEFAULT_WORK_CALENDAR_WORK_SETTINGS,
  holidays: readonly WorkCalendarHoliday[] = [],
): ReadonlyMap<WorkDate, WorkCalendarDayMeta> {
  const holidayIndex = indexWorkCalendarHolidays(holidays);
  const map = new Map<WorkDate, WorkCalendarDayMeta>();
  for (const date of dates) {
    map.set(date, getWorkCalendarDayMeta(date, settings, holidayIndex));
  }
  return map;
}

/** Rentetan jam kerja ringkas untuk header, mis. `08:00-17:00`. */
export function formatWorkCalendarWorkHours(
  settings: WorkCalendarWorkSettings = DEFAULT_WORK_CALENDAR_WORK_SETTINGS,
): string {
  return `${settings.workStart}-${settings.workEnd}`;
}
