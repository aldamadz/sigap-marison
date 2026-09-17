import { describe, expect, it, vi } from "vitest";

import {
  WORK_CALENDAR_HOLIDAY_MAX_RANGE_DAYS,
  createSupabaseWorkCalendarSettingsRepository,
  type SupabaseWorkCalendarSettingsClient,
  type WorkCalendarSettingsDbQuery,
  type WorkCalendarSettingsDbTable,
  type WorkCalendarSettingsRpcQuery,
  type WorkCalendarWorkSettingsRow,
} from "@/features/work-calendar/data/supabase-work-calendar-settings-repository";
import {
  mapWorkCalendarHolidayRow,
  type WorkCalendarHolidayRow,
} from "@/features/work-calendar/data/work-calendar-holiday-mapper";
import {
  DEFAULT_WORK_CALENDAR_WORK_SETTINGS,
  buildWorkCalendarDayMetaMap,
  formatWorkCalendarWorkHours,
  getWorkCalendarDayMeta,
  indexWorkCalendarHolidays,
  isWorkCalendarWorkDay,
  normalizeWorkDays,
  normalizeWorkSettings,
} from "@/features/work-calendar/lib/work-day-config";

type SettingsResult = {
  data: WorkCalendarWorkSettingsRow | null;
  error: { message: string } | null;
};

function createRpcQuery(result: SettingsResult): {
  query: WorkCalendarSettingsRpcQuery<WorkCalendarWorkSettingsRow>;
  abortSignal: ReturnType<typeof vi.fn>;
} {
  const abortSignal = vi.fn();
  const query: WorkCalendarSettingsRpcQuery<WorkCalendarWorkSettingsRow> = {
    abortSignal: (signal: AbortSignal) => {
      abortSignal(signal);
      return query;
    },
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected),
  };
  return { query, abortSignal };
}

function createHolidayClient(result: {
  data: WorkCalendarHolidayRow[] | null;
  error: { message: string } | null;
}): {
  client: SupabaseWorkCalendarSettingsClient;
  abortSignal: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
} {
  const abortSignal = vi.fn();
  const gte = vi.fn();
  const lte = vi.fn();
  const order = vi.fn();
  const select = vi.fn();

  const query: WorkCalendarSettingsDbQuery<WorkCalendarHolidayRow[] | null> = {
    gte: (column: string, value: unknown) => {
      gte(column, value);
      return query;
    },
    lte: (column: string, value: unknown) => {
      lte(column, value);
      return query;
    },
    order: (column: string, options?: { ascending: boolean; nullsFirst?: boolean }) => {
      order(column, options);
      return query;
    },
    abortSignal: (signal: AbortSignal) => {
      abortSignal(signal);
      return query;
    },
    then: (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected),
  };

  select.mockReturnValue(query);
  const table: WorkCalendarSettingsDbTable = { select };

  return {
    client: { from: vi.fn().mockReturnValue(table), rpc: vi.fn() },
    abortSignal,
    gte,
    lte,
    order,
    select,
  };
}

describe("Work day config (CAL-03 F6)", () => {
  it("normalisasi hari kerja membuang nilai tak valid dan mengurutkan", () => {
    expect(normalizeWorkDays([5, 1, 5, 0, 8, "3", 2.5, null])).toEqual([1, 3, 5]);
  });

  it("daftar hari kerja kosong jatuh ke default Senin-Jumat", () => {
    expect(normalizeWorkDays([])).toEqual(DEFAULT_WORK_CALENDAR_WORK_SETTINGS.workDays);
    expect(normalizeWorkDays("bukan array")).toEqual(DEFAULT_WORK_CALENDAR_WORK_SETTINGS.workDays);
  });

  it("normalisasi pengaturan memetakan snake_case dan memvalidasi jam", () => {
    const settings = normalizeWorkSettings({
      work_days: [1, 2, 3, 4, 5, 6],
      work_start: "7:30:00",
      work_end: "25:00",
      break_start: "11:30",
      break_end: null,
      timezone: "  Asia/Makassar ",
    });

    expect(settings.workDays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(settings.workStart).toBe("07:30");
    // Jam tidak valid jatuh ke default, bukan diteruskan apa adanya.
    expect(settings.workEnd).toBe(DEFAULT_WORK_CALENDAR_WORK_SETTINGS.workEnd);
    expect(settings.breakStart).toBe("11:30");
    expect(settings.breakEnd).toBe(DEFAULT_WORK_CALENDAR_WORK_SETTINGS.breakEnd);
    expect(settings.timezone).toBe("Asia/Makassar");
  });

  it("pengaturan kosong sepenuhnya memakai default Senin-Jumat 08:00-17:00", () => {
    expect(normalizeWorkSettings(null)).toEqual(DEFAULT_WORK_CALENDAR_WORK_SETTINGS);
    expect(formatWorkCalendarWorkHours(DEFAULT_WORK_CALENDAR_WORK_SETTINGS)).toBe("08:00-17:00");
  });

  it("klasifikasi libur menang atas hari nonkerja dan hari kerja", () => {
    const settings = DEFAULT_WORK_CALENDAR_WORK_SETTINGS;
    // 2026-03-10 Selasa (hari kerja), 2026-03-14 Sabtu (nonkerja).
    expect(isWorkCalendarWorkDay("2026-03-10", settings)).toBe(true);
    expect(isWorkCalendarWorkDay("2026-03-14", settings)).toBe(false);
    expect(
      isWorkCalendarWorkDay("2026-03-10", { ...settings, workDays: [1, 2, 3, 4, 5, 6] }),
    ).toBe(true);

    const holidays = indexWorkCalendarHolidays([
      { date: "2026-03-12", name: "Cuti Bersama Nyepi", isCutiBersama: true },
      { date: "2026-03-14", name: "Hari Raya Nyepi", isCutiBersama: false },
    ]);

    const workDay = getWorkCalendarDayMeta("2026-03-10", settings, holidays);
    expect(workDay.kind).toBe("work_day");
    expect(workDay.label).toBeNull();

    // Libur pada hari kerja tetap berlabel libur.
    const cuti = getWorkCalendarDayMeta("2026-03-12", settings, holidays);
    expect(cuti.kind).toBe("holiday");
    expect(cuti.isCutiBersama).toBe(true);
    expect(cuti.label).toBe("Cuti bersama: Cuti Bersama Nyepi");

    // Libur pada akhir pekan pun diklasifikasi libur, bukan nonkerja.
    const weekendHoliday = getWorkCalendarDayMeta("2026-03-14", settings, holidays);
    expect(weekendHoliday.kind).toBe("holiday");
    expect(weekendHoliday.label).toBe("Hari Raya Nyepi");

    const weekend = getWorkCalendarDayMeta("2026-03-15", settings, holidays);
    expect(weekend.kind).toBe("non_work_day");
    expect(weekend.label).toBe("Hari nonkerja");
  });

  it("peta klasifikasi memakai sumber kebenaran yang sama untuk seluruh tanggal", () => {
    const dates = ["2026-03-09", "2026-03-10", "2026-03-12", "2026-03-14"];
    const map = buildWorkCalendarDayMetaMap(dates, DEFAULT_WORK_CALENDAR_WORK_SETTINGS, [
      { date: "2026-03-12", name: "Cuti Bersama Nyepi", isCutiBersama: true },
    ]);

    expect([...map.keys()]).toEqual(dates);
    expect(map.get("2026-03-09")?.kind).toBe("work_day");
    expect(map.get("2026-03-12")?.kind).toBe("holiday");
    expect(map.get("2026-03-14")?.kind).toBe("non_work_day");
  });
});

describe("WorkCalendarHoliday mapper (CAL-03 F6)", () => {
  it("memetakan baris valid dan menandai cuti bersama", () => {
    expect(
      mapWorkCalendarHolidayRow({
        holiday_date: "2026-03-20",
        name: "  Cuti Bersama Idul Fitri  ",
        is_cuti_bersama: true,
      }),
    ).toEqual({ date: "2026-03-20", name: "Cuti Bersama Idul Fitri", isCutiBersama: true });
  });

  it("menolak tanggal tidak valid dan nama kosong", () => {
    expect(() =>
      mapWorkCalendarHolidayRow({
        holiday_date: "20-03-2026",
        name: "X",
        is_cuti_bersama: false,
      }),
    ).toThrow(/tanggal libur/i);
    expect(() =>
      mapWorkCalendarHolidayRow({
        holiday_date: "2026-03-20",
        name: "   ",
        is_cuti_bersama: false,
      }),
    ).toThrow(/nama libur kosong/i);
  });
});

describe("SupabaseWorkCalendarSettingsRepository (CAL-03 F6)", () => {
  it("memanggil RPC pengaturan dan menormalkan hasilnya", async () => {
    const { query, abortSignal } = createRpcQuery({
      data: {
        work_days: [1, 2, 3, 4, 5, 6],
        work_start: "07:30:00",
        work_end: "16:30:00",
        break_start: "11:30:00",
        break_end: "12:30:00",
        timezone: "Asia/Makassar",
      },
      error: null,
    });
    const client: SupabaseWorkCalendarSettingsClient = {
      from: vi.fn(),
      rpc: vi.fn().mockReturnValue(query),
    };

    const repository = createSupabaseWorkCalendarSettingsRepository(client);
    const controller = new AbortController();
    const settings = await repository.getWorkSettings(controller.signal);

    expect(client.rpc).toHaveBeenCalledWith("get_work_calendar_work_settings");
    expect(abortSignal).toHaveBeenCalledWith(controller.signal);
    expect(settings.workDays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(settings.workStart).toBe("07:30");
    expect(settings.timezone).toBe("Asia/Makassar");
  });

  it("tidak ada baris RPC berarti default Senin-Jumat, bukan error", async () => {
    const { query } = createRpcQuery({ data: null, error: null });
    const client: SupabaseWorkCalendarSettingsClient = {
      from: vi.fn(),
      rpc: vi.fn().mockReturnValue(query),
    };

    const repository = createSupabaseWorkCalendarSettingsRepository(client);
    await expect(repository.getWorkSettings()).resolves.toEqual(
      DEFAULT_WORK_CALENDAR_WORK_SETTINGS,
    );
  });

  it("error RPC menjadi error terkontrol", async () => {
    const { query } = createRpcQuery({ data: null, error: { message: "DB down" } });
    const client: SupabaseWorkCalendarSettingsClient = {
      from: vi.fn(),
      rpc: vi.fn().mockReturnValue(query),
    };

    const repository = createSupabaseWorkCalendarSettingsRepository(client);
    await expect(repository.getWorkSettings()).rejects.toThrow(
      "Gagal memuat pengaturan hari dan jam kerja.",
    );
  });

  it("signal yang sudah dibatalkan tidak memanggil RPC", async () => {
    const client: SupabaseWorkCalendarSettingsClient = { from: vi.fn(), rpc: vi.fn() };
    const repository = createSupabaseWorkCalendarSettingsRepository(client);
    const controller = new AbortController();
    controller.abort();

    await expect(repository.getWorkSettings(controller.signal)).rejects.toThrow(
      "Pencarian dibatalkan.",
    );
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("membaca hari libur pada rentang, memetakan baris, dan meneruskan abortSignal", async () => {
    const { client, abortSignal, gte, lte, order, select } = createHolidayClient({
      data: [
        { holiday_date: "2026-03-12", name: "Cuti Bersama Nyepi", is_cuti_bersama: true },
        { holiday_date: "2026-03-14", name: "Hari Raya Nyepi", is_cuti_bersama: null },
      ],
      error: null,
    });
    const repository = createSupabaseWorkCalendarSettingsRepository(client);
    const controller = new AbortController();

    const holidays = await repository.listHolidays({
      fromDate: "2026-03-09",
      toDate: "2026-03-15",
      signal: controller.signal,
    });

    expect(client.from).toHaveBeenCalledWith("holidays");
    expect(select).toHaveBeenCalledWith("holiday_date, name, is_cuti_bersama");
    expect(gte).toHaveBeenCalledWith("holiday_date", "2026-03-09");
    expect(lte).toHaveBeenCalledWith("holiday_date", "2026-03-15");
    expect(order).toHaveBeenCalledWith("holiday_date", { ascending: true });
    expect(abortSignal).toHaveBeenCalledWith(controller.signal);
    expect(holidays).toEqual([
      { date: "2026-03-12", name: "Cuti Bersama Nyepi", isCutiBersama: true },
      { date: "2026-03-14", name: "Hari Raya Nyepi", isCutiBersama: false },
    ]);
  });

  it("menolak rentang tidak valid sebelum menyentuh database", async () => {
    const { client } = createHolidayClient({ data: [], error: null });
    const repository = createSupabaseWorkCalendarSettingsRepository(client);

    await expect(
      repository.listHolidays({ fromDate: "2026-03-15", toDate: "2026-03-09" }),
    ).rejects.toThrow(/rentang hari libur tidak valid/i);
    await expect(
      repository.listHolidays({ fromDate: "bukan-tanggal", toDate: "2026-03-09" }),
    ).rejects.toThrow(/fromDate/);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("error kueri hari libur menjadi error terkontrol", async () => {
    const { client } = createHolidayClient({ data: null, error: { message: "permission denied" } });
    const repository = createSupabaseWorkCalendarSettingsRepository(client);

    await expect(
      repository.listHolidays({ fromDate: "2026-03-09", toDate: "2026-03-15" }),
    ).rejects.toThrow("Gagal memuat hari libur.");
  });

  it("batas rentang pengaman terdokumentasi", () => {
    expect(WORK_CALENDAR_HOLIDAY_MAX_RANGE_DAYS).toBe(366);
  });
});
