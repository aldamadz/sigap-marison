/**
 * Helper tanggal murni untuk Unified Work Calendar.
 *
 * Semua perhitungan kalender memakai zona waktu Asia/Jakarta (UTC+7, tanpa DST)
 * dan tanggal murni `YYYY-MM-DD` supaya tidak bergantung pada zona waktu
 * perangkat maupun efek DST.
 */

import type { WorkDate } from "../types/work-calendar";

export const WORK_CALENDAR_TIME_ZONE = "Asia/Jakarta";

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_INPUT_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

const MONTH_NAMES_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

const MONTH_NAMES_ID_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
] as const;

const DAY_NAMES_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;
const DAY_NAMES_ID_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"] as const;

/** Label hari singkat Indonesia, indeks mengikuti `getWorkDateWeekday`. */
export const WORK_WEEKDAY_LABELS_ID: readonly string[] = Object.freeze([...DAY_NAMES_ID_SHORT]);

interface WorkDateParts {
  year: number;
  month: number;
  day: number;
}

/** Uji format dan validitas kalender (`2026-02-30` ditolak). */
export function isValidWorkDate(value: unknown): value is WorkDate {
  return parseWorkDateParts(value) !== null;
}

export function parseWorkDateParts(value: unknown): WorkDateParts | null {
  if (typeof value !== "string") return null;
  const match = DATE_KEY_PATTERN.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

/** Tanggal kerja dari sebuah instant, mengikuti jam dinding Asia/Jakarta. */
export function formatWorkDateKey(instant: Date): WorkDate {
  const shifted = new Date(instant.getTime() + WIB_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Jam dinding Asia/Jakarta `HH:mm` dari sebuah instant. */
export function formatWorkTimeLabel(instant: Date | null | undefined): string | null {
  if (!instant) return null;
  const shifted = new Date(instant.getTime() + WIB_OFFSET_MS);
  const hours = String(shifted.getUTCHours()).padStart(2, "0");
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** Jam dinding Asia/Jakarta `HH:mm` dari timestamp ISO; `null` bila tidak valid. */
export function formatWorkTimeLabelFromIso(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  return formatWorkTimeLabel(instant);
}

export function todayWorkDate(now: Date = new Date()): WorkDate {
  return formatWorkDateKey(now);
}

/** Rentang UTC untuk satu tanggal kerja; `endUtc` bersifat eksklusif. */
export function workDateToUtcRange(date: WorkDate): { startUtc: string; endUtc: string } {
  const parts = parseWorkDateParts(date);
  if (!parts) throw new Error(`Tanggal kerja tidak valid: ${String(date)}`);
  const startMs = Date.UTC(parts.year, parts.month - 1, parts.day) - WIB_OFFSET_MS;
  return {
    startUtc: new Date(startMs).toISOString(),
    endUtc: new Date(startMs + MS_PER_DAY).toISOString(),
  };
}

/** Rentang UTC yang mencakup beberapa tanggal kerja. */
export function workDateRangeToUtcRange(
  fromDate: WorkDate,
  toDate: WorkDate,
): { startUtc: string; endUtc: string } {
  const start = workDateToUtcRange(fromDate);
  const end = workDateToUtcRange(toDate);
  return { startUtc: start.startUtc, endUtc: end.endUtc };
}

function toDateKey(parts: WorkDateParts): WorkDate {
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

/** Geser tanggal kerja sejumlah hari (dapat negatif). */
export function shiftWorkDate(date: WorkDate, amount: number): WorkDate {
  const parts = parseWorkDateParts(date);
  if (!parts) throw new Error(`Tanggal kerja tidak valid: ${String(date)}`);
  const baseMs = Date.UTC(parts.year, parts.month - 1, parts.day) + amount * MS_PER_DAY;
  const shifted = new Date(baseMs);
  return toDateKey({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

export function addWorkDays(date: WorkDate, amount: number): WorkDate {
  return shiftWorkDate(date, amount);
}

/** Urutan hari dalam kalender Indonesia; Minggu = 0. */
export function getWorkDateWeekday(date: WorkDate): number {
  const parts = parseWorkDateParts(date);
  if (!parts) throw new Error(`Tanggal kerja tidak valid: ${String(date)}`);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

/** Senin sebagai awal minggu kerja. */
export function startOfWorkWeek(date: WorkDate): WorkDate {
  const weekday = getWorkDateWeekday(date);
  const offset = (weekday + 6) % 7;
  return shiftWorkDate(date, -offset);
}

export function workWeekDates(date: WorkDate): WorkDate[] {
  const start = startOfWorkWeek(date);
  return Array.from({ length: 7 }, (_, index) => shiftWorkDate(start, index));
}

export function getDaysInWorkMonth(date: WorkDate): number {
  const parts = parseWorkDateParts(date);
  if (!parts) throw new Error(`Tanggal kerja tidak valid: ${String(date)}`);
  return new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
}

export function startOfWorkMonth(date: WorkDate): WorkDate {
  const parts = parseWorkDateParts(date);
  if (!parts) throw new Error(`Tanggal kerja tidak valid: ${String(date)}`);
  return toDateKey({ year: parts.year, month: parts.month, day: 1 });
}

export function endOfWorkMonth(date: WorkDate): WorkDate {
  const parts = parseWorkDateParts(date);
  if (!parts) throw new Error(`Tanggal kerja tidak valid: ${String(date)}`);
  const days = getDaysInWorkMonth(date);
  return toDateKey({ year: parts.year, month: parts.month, day: days });
}

/** Grid bulan lengkap dengan hari pengisi awal/akhir agar stabil 5-6 baris. */
export function workMonthDates(anchor: WorkDate): WorkDate[] {
  const monthStart = startOfWorkMonth(anchor);
  const leading = (getWorkDateWeekday(monthStart) + 6) % 7;
  const gridStart = shiftWorkDate(monthStart, -leading);
  const totalDays = getDaysInWorkMonth(anchor);
  const cells = Math.ceil((leading + totalDays) / 7) * 7;
  return Array.from({ length: cells }, (_, index) => shiftWorkDate(gridStart, index));
}

function isValidWallClock(hours: number, minutes: number): boolean {
  return Number.isInteger(hours) && Number.isInteger(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

/** Gabungkan tanggal kerja dan jam `HH:mm` menjadi timestamp ISO Asia/Jakarta. */
export function parseWorkDateTimeInput(
  date: WorkDate,
  time: string | null | undefined,
): string | null {
  const parts = parseWorkDateParts(date);
  if (!parts) return null;
  if (time === null || time === undefined) return null;

  const match = TIME_INPUT_PATTERN.exec(String(time).trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!isValidWallClock(hours, minutes)) return null;

  const utcMs = Date.UTC(parts.year, parts.month - 1, parts.day, hours, minutes) - WIB_OFFSET_MS;
  return new Date(utcMs).toISOString();
}

// Comparison over `YYYY-MM-DD` is lexicographic and therefore exact.
export function compareWorkDates(left: WorkDate, right: WorkDate): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isWorkDateBefore(left: WorkDate, right: WorkDate): boolean {
  return left < right;
}

export function isWorkDateAfter(left: WorkDate, right: WorkDate): boolean {
  return left > right;
}

export function isWorkDateWithin(date: WorkDate, fromDate: WorkDate, toDate: WorkDate): boolean {
  return date >= fromDate && date <= toDate;
}

export interface WorkCalendarDateRange {
  fromDate: WorkDate;
  toDate: WorkDate;
}

/** Rentang tanggal untuk query repository menurut mode tampilan. */
export function getWorkCalendarDateRange(
  view: "day" | "week" | "month",
  anchorDate: WorkDate,
): WorkCalendarDateRange {
  if (view === "day") return { fromDate: anchorDate, toDate: anchorDate };
  if (view === "week") {
    const dates = workWeekDates(anchorDate);
    return { fromDate: dates[0], toDate: dates[dates.length - 1] };
  }
  const dates = workMonthDates(anchorDate);
  return { fromDate: dates[0], toDate: dates[dates.length - 1] };
}

export function getMonthName(date: WorkDate, options: { short?: boolean } = {}): string {
  const parts = parseWorkDateParts(date);
  if (!parts) throw new Error(`Tanggal kerja tidak valid: ${String(date)}`);
  return options.short ? MONTH_NAMES_ID_SHORT[parts.month - 1] : MONTH_NAMES_ID[parts.month - 1];
}

export function getDayName(date: WorkDate, options: { short?: boolean } = {}): string {
  const weekday = getWorkDateWeekday(date);
  return options.short ? DAY_NAMES_ID_SHORT[weekday] : DAY_NAMES_ID[weekday];
}

/** `Senin, 9 Maret 2026`. */
export function formatWorkDateFull(date: WorkDate): string {
  const parts = parseWorkDateParts(date);
  if (!parts) return "";
  return `${getDayName(date)}, ${parts.day} ${getMonthName(date)} ${parts.year}`;
}

/** `9 Mar 2026`. */
export function formatWorkDateShort(date: WorkDate): string {
  const parts = parseWorkDateParts(date);
  if (!parts) return "";
  return `${parts.day} ${getMonthName(date, { short: true })} ${parts.year}`;
}

/** `Maret 2026`. */
export function formatWorkMonthLabel(date: WorkDate): string {
  const parts = parseWorkDateParts(date);
  if (!parts) return "";
  return `${getMonthName(date)} ${parts.year}`;
}

/** Label ringkas rentang minggu: `9 - 15 Mar 2026`, melewati batas bulan bila perlu. */
export function formatWorkWeekRangeLabel(date: WorkDate): string {
  const dates = workWeekDates(date);
  const start = dates[0];
  const end = dates[dates.length - 1];
  const startParts = parseWorkDateParts(start);
  const endParts = parseWorkDateParts(end);
  if (!startParts || !endParts) return "";

  if (startParts.month === endParts.month) {
    if (startParts.year === endParts.year) {
      return `${startParts.day} - ${endParts.day} ${getMonthName(end, { short: true })} ${endParts.year}`;
    }
    return `${startParts.day} ${getMonthName(start, { short: true })} ${startParts.year} - ${endParts.day} ${getMonthName(end, { short: true })} ${endParts.year}`;
  }
  return `${startParts.day} ${getMonthName(start, { short: true })} - ${endParts.day} ${getMonthName(end, { short: true })} ${endParts.year}`;
}

/** Label relatif sederhana untuk header Hari Ini. */
export function formatWorkDateHeading(date: WorkDate, today: WorkDate): string {
  if (date === today) return `Hari Ini, ${formatWorkDateFull(date)}`;
  if (date === shiftWorkDate(today, 1)) return `Besok, ${formatWorkDateFull(date)}`;
  if (date === shiftWorkDate(today, -1)) return `Kemarin, ${formatWorkDateFull(date)}`;
  return formatWorkDateFull(date);
}
