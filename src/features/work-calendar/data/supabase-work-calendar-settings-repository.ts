/**
 * Repository Supabase untuk pengaturan hari/jam kerja dan hari libur
 * (CAL-03 F6).
 *
 * Prinsip:
 * - tidak ada `any`, `@ts-*`, atau double cast; setiap baris divalidasi ketat;
 * - AbortSignal diteruskan ke query supaya permintaan lama benar-benar batal;
 * - kegagalan selalu melempar error terkontrol, bukan mengembalikan nilai
 *   default yang menyesatkan (kecuali pengaturan kosong dari server, yang
 *   memang sah dan dipetakan ke default Senin-Jumat oleh pemanggil).
 */

import type {
  WorkCalendarHoliday,
  WorkCalendarSettingsRepository,
  WorkCalendarWorkSettings,
  WorkDate,
} from "../types/work-calendar";
import { normalizeWorkSettings } from "../lib/work-day-config";
import {
  WORK_CALENDAR_HOLIDAY_DB_COLUMNS,
  mapWorkCalendarHolidayRow,
  type WorkCalendarHolidayRow,
} from "./work-calendar-holiday-mapper";

export interface WorkCalendarSettingsDbQuery<TResult = unknown>
  extends PromiseLike<{ data: TResult; error: { message: string } | null }> {
  gte(column: string, value: unknown): WorkCalendarSettingsDbQuery<TResult>;
  lte(column: string, value: unknown): WorkCalendarSettingsDbQuery<TResult>;
  order(
    column: string,
    options?: { ascending: boolean; nullsFirst?: boolean },
  ): WorkCalendarSettingsDbQuery<TResult>;
  abortSignal?(signal: AbortSignal): WorkCalendarSettingsDbQuery<TResult>;
}

export interface WorkCalendarSettingsDbTable {
  select(columns?: string): WorkCalendarSettingsDbQuery<WorkCalendarHolidayRow[] | null>;
}

export interface WorkCalendarSettingsRpcQuery<TResult = unknown>
  extends PromiseLike<{ data: TResult; error: { message: string } | null }> {
  maybeSingle(): PromiseLike<{ data: TResult | null; error: { message: string } | null }>;
  abortSignal?(signal: AbortSignal): WorkCalendarSettingsRpcQuery<TResult>;
}

/** Baris RPC `get_work_calendar_work_settings` (snake_case). */
export interface WorkCalendarWorkSettingsRow {
  work_days: number[] | null;
  work_start: string | null;
  work_end: string | null;
  break_start: string | null;
  break_end: string | null;
  timezone: string | null;
}

export interface SupabaseWorkCalendarSettingsClient {
  from(table: string): WorkCalendarSettingsDbTable;
  rpc<TResult = unknown>(
    fn: string,
    args?: Record<string, unknown>,
  ): WorkCalendarSettingsRpcQuery<TResult>;
}

const WORK_SETTINGS_RPC = "get_work_calendar_work_settings";
const HOLIDAYS_TABLE = "holidays";

/**
 * Batas pengaman rentang hari libur. Rentang kalender terpanjang (grid bulan)
 * hanya 42 hari; batas ini mencegah rentang tak wajar dari pemanggil yang
 * keliru tanpa memotong data yang sah.
 */
export const WORK_CALENDAR_HOLIDAY_MAX_RANGE_DAYS = 366;

function normalizeBoundary(date: WorkDate, field: string): string {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Rentang hari libur tidak valid: ${field} bukan tanggal YYYY-MM-DD.`);
  }
  return date;
}

export function createSupabaseWorkCalendarSettingsRepository(
  client: SupabaseWorkCalendarSettingsClient,
): WorkCalendarSettingsRepository {
  return {
    async getWorkSettings(signal?: AbortSignal): Promise<WorkCalendarWorkSettings> {
      if (signal?.aborted) throw new Error("Pencarian dibatalkan.");

      let query = client.rpc<WorkCalendarWorkSettingsRow>(WORK_SETTINGS_RPC);
      if (signal && "abortSignal" in query && typeof query.abortSignal === "function") {
        query = query.abortSignal(signal);
      }

      const { data, error } = await query.maybeSingle();
      if (error) {
        throw new Error("Gagal memuat pengaturan hari dan jam kerja.");
      }

      // Tidak ada baris berarti belum ada konfigurasi KPI; default
      // Senin-Jumat tetap berlaku.
      return normalizeWorkSettings(data ?? {});
    },

    async listHolidays({ fromDate, toDate, signal }): Promise<readonly WorkCalendarHoliday[]> {
      if (signal?.aborted) throw new Error("Pencarian dibatalkan.");

      const from = normalizeBoundary(fromDate, "fromDate");
      const to = normalizeBoundary(toDate, "toDate");
      if (from > to) {
        throw new Error("Rentang hari libur tidak valid: tanggal awal melewati tanggal akhir.");
      }

      let query = client
        .from(HOLIDAYS_TABLE)
        .select(WORK_CALENDAR_HOLIDAY_DB_COLUMNS)
        .gte("holiday_date", from)
        .lte("holiday_date", to)
        .order("holiday_date", { ascending: true });

      if (signal && "abortSignal" in query && typeof query.abortSignal === "function") {
        query = query.abortSignal(signal);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error("Gagal memuat hari libur.");
      }

      return (data ?? []).map(mapWorkCalendarHolidayRow);
    },
  };
}
