/**
 * Mapper baris `public.holidays` ke model domain `WorkCalendarHoliday`
 * (CAL-03 F6). Validasi ketat: tanggal harus `YYYY-MM-DD` yang valid dan nama
 * tidak boleh kosong, sehingga data rusak tidak pernah menjadi label palsu.
 */

import type { WorkCalendarHoliday, WorkDate } from "../types/work-calendar";
import { isValidWorkDate } from "../lib/work-calendar-date";

/** Baris mentah `public.holidays` (snake_case). */
export interface WorkCalendarHolidayRow {
  holiday_date: string | null;
  name: string | null;
  is_cuti_bersama: boolean | null;
}

export const WORK_CALENDAR_HOLIDAY_DB_COLUMNS =
  "holiday_date, name, is_cuti_bersama";

export function mapWorkCalendarHolidayRow(row: WorkCalendarHolidayRow): WorkCalendarHoliday {
  const date = typeof row.holiday_date === "string" ? row.holiday_date : "";
  if (!isValidWorkDate(date)) {
    throw new Error("Data hari libur tidak valid: tanggal libur bukan format YYYY-MM-DD.");
  }

  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (name.length === 0) {
    throw new Error("Data hari libur tidak valid: nama libur kosong.");
  }

  return {
    date: date as WorkDate,
    name,
    isCutiBersama: row.is_cuti_bersama === true,
  };
}
