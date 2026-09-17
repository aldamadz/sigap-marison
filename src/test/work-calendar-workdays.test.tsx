import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkCalendarWorkspace } from "@/features/work-calendar/components/WorkCalendarWorkspace";
import type {
  WorkCalendarHoliday,
  WorkCalendarSettingsRepository,
  WorkCalendarViewMode,
  WorkCalendarWorkSettings,
  WorkDate,
} from "@/features/work-calendar/types/work-calendar";
import {
  WORK_CALENDAR_FIXTURE_CURRENT_USER,
  WORK_CALENDAR_FIXTURE_HOLIDAYS,
  WORK_CALENDAR_FIXTURE_TEAM_MEMBERS,
  WORK_CALENDAR_FIXTURE_TODAY,
  WORK_CALENDAR_FIXTURE_WORK_SETTINGS,
  createFixtureWorkEntryRepository,
  workCalendarFixtureNow,
} from "@/features/work-calendar/testing/work-calendar-fixtures";
import { DEFAULT_WORK_CALENDAR_WORK_SETTINGS } from "@/features/work-calendar/lib/work-day-config";

/**
 * Radix merender konten Select lewat Portal dan butuh API browser yang tidak
 * disediakan jsdom. Polyfill ini hanya untuk test.
 */
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

function renderWorkspace(
  options: {
    view?: WorkCalendarViewMode;
    initialAnchorDate?: string;
    settingsRepository?: WorkCalendarSettingsRepository;
    workSettings?: WorkCalendarWorkSettings;
    holidays?: readonly WorkCalendarHoliday[];
  } = {},
) {
  return render(
    <WorkCalendarWorkspace
      currentUser={WORK_CALENDAR_FIXTURE_CURRENT_USER}
      repository={createFixtureWorkEntryRepository()}
      teamMembers={WORK_CALENDAR_FIXTURE_TEAM_MEMBERS}
      initialView={options.view ?? "day"}
      initialAnchorDate={options.initialAnchorDate ?? WORK_CALENDAR_FIXTURE_TODAY}
      now={workCalendarFixtureNow}
      settingsRepository={options.settingsRepository}
      workSettings={options.workSettings}
      holidays={options.holidays}
    />,
  );
}

function createSettingsRepository(options: {
  settings?: WorkCalendarWorkSettings;
  holidays?: readonly WorkCalendarHoliday[];
  failOnSettings?: boolean;
  failOnHolidays?: boolean;
  onSettings?: (signal?: AbortSignal) => void;
  onHolidays?: (input: { fromDate: WorkDate; toDate: WorkDate; signal?: AbortSignal }) => void;
} = {}): WorkCalendarSettingsRepository {
  return {
    async getWorkSettings(signal) {
      options.onSettings?.(signal);
      if (options.failOnSettings) throw new Error("Gagal memuat pengaturan (test).");
      return options.settings ?? WORK_CALENDAR_FIXTURE_WORK_SETTINGS;
    },
    async listHolidays(input) {
      options.onHolidays?.(input);
      if (options.failOnHolidays) throw new Error("Gagal memuat hari libur (test).");
      return options.holidays ?? WORK_CALENDAR_FIXTURE_HOLIDAYS;
    },
  };
}

describe("Work Calendar workdays: tampilan Minggu (CAL-03 F6)", () => {
  it("menandai hari kerja, hari nonkerja, dan libur dengan label teks", async () => {
    renderWorkspace({
      view: "week",
      holidays: WORK_CALENDAR_FIXTURE_HOLIDAYS,
    });

    const holidayColumn = await screen.findByTestId("work-week-column-2026-03-12");
    expect(holidayColumn).toHaveAttribute("data-day-kind", "holiday");
    // Label nama libur harus tampil sebagai teks, bukan hanya warna.
    expect(within(holidayColumn).getByTestId("work-day-badge-2026-03-12")).toHaveTextContent(
      "Cuti bersama: Cuti Bersama Nyepi",
    );

    const saturdayColumn = await screen.findByTestId("work-week-column-2026-03-14");
    expect(saturdayColumn).toHaveAttribute("data-day-kind", "holiday");
    expect(within(saturdayColumn).getByTestId("work-day-badge-2026-03-14")).toHaveTextContent(
      "Hari Raya Nyepi",
    );

    const sundayColumn = await screen.findByTestId("work-week-column-2026-03-15");
    expect(sundayColumn).toHaveAttribute("data-day-kind", "non_work_day");
    expect(within(sundayColumn).getByTestId("work-day-badge-2026-03-15")).toHaveTextContent(
      "Hari nonkerja",
    );

    // Hari kerja biasa tidak menampilkan badge.
    const tuesdayColumn = await screen.findByTestId(
      `work-week-column-${WORK_CALENDAR_FIXTURE_TODAY}`,
    );
    expect(tuesdayColumn).toHaveAttribute("data-day-kind", "work_day");
    expect(
      within(tuesdayColumn).queryByTestId(
        `work-day-badge-${WORK_CALENDAR_FIXTURE_TODAY}`,
      ),
    ).toBeNull();
  });

  it("akan tetap menampilkan hari nonkerja walaupun tanpa daftar libur", async () => {
    renderWorkspace({ view: "week", holidays: [] });

    const sundayColumn = await screen.findByTestId("work-week-column-2026-03-15");
    expect(sundayColumn).toHaveAttribute("data-day-kind", "non_work_day");
  });
});

describe("Work Calendar workdays: tampilan Bulan (CAL-03 F6)", () => {
  it("menampilkan badge libur pada grid bulan", async () => {
    renderWorkspace({ view: "month", holidays: WORK_CALENDAR_FIXTURE_HOLIDAYS });

    const cell = await screen.findByTestId("work-month-cell-2026-03-12");
    expect(cell).toHaveAttribute("data-day-kind", "holiday");
    expect(within(cell).getByTestId("work-day-badge-2026-03-12")).toHaveTextContent(
      "Cuti bersama: Cuti Bersama Nyepi",
    );
  });
});

describe("Work Calendar workdays: tampilan Hari (CAL-03 F6)", () => {
  it("menampilkan catatan libur namun pekerjaan tetap dapat ditambahkan", async () => {
    renderWorkspace({ initialAnchorDate: "2026-03-12", holidays: WORK_CALENDAR_FIXTURE_HOLIDAYS });

    const note = await screen.findByTestId("work-day-note-2026-03-12");
    expect(note).toHaveAttribute("data-day-kind", "holiday");
    expect(note).toHaveTextContent("Cuti bersama: Cuti Bersama Nyepi");

    expect(screen.getByLabelText("Apa yang akan dikerjakan?")).toBeInTheDocument();
  });

  it("menampilkan catatan hari nonkerja pada akhir pekan", async () => {
    renderWorkspace({ initialAnchorDate: "2026-03-15", holidays: [] });

    const note = await screen.findByTestId("work-day-note-2026-03-15");
    expect(note).toHaveAttribute("data-day-kind", "non_work_day");
    expect(note).toHaveTextContent("Hari nonkerja");
    expect(screen.getByLabelText("Apa yang akan dikerjakan?")).toBeInTheDocument();
  });

  it("tidak menampilkan catatan pada hari kerja biasa", async () => {
    renderWorkspace({ initialAnchorDate: "2026-03-10", holidays: [] });

    await waitFor(() =>
      expect(screen.queryByTestId("work-day-note-2026-03-10")).not.toBeInTheDocument(),
    );
  });
});

describe("Work Calendar workdays: pemuatan pengaturan (CAL-03 F6)", () => {
  it("memuat pengaturan dan libur dari repository lalu memakainya", async () => {
    const holidays = [
      { date: "2026-03-11" as WorkDate, name: "Libur Khusus Uji", isCutiBersama: false },
    ];
    const onHolidays = vi.fn();
    // Hari kerja diperluas sampai Minggu dari konfigurasi KPI.
    const settings: WorkCalendarWorkSettings = {
      workDays: [1, 2, 3, 4, 5, 6, 7],
      workStart: "07:00",
      workEnd: "16:00",
      breakStart: "11:30",
      breakEnd: "12:30",
      timezone: "Asia/Makassar",
    };
    const repository = createSettingsRepository({ settings, holidays, onHolidays });

    renderWorkspace({ view: "week", settingsRepository: repository });

    // Minggu menjadi hari kerja karena pengaturan KPI memuat 7 hari.
    const sundayColumn = await screen.findByTestId("work-week-column-2026-03-15");
    await waitFor(() => expect(sundayColumn).toHaveAttribute("data-day-kind", "work_day"));

    const wednesdayColumn = await screen.findByTestId("work-week-column-2026-03-11");
    await waitFor(() => expect(wednesdayColumn).toHaveAttribute("data-day-kind", "holiday"));
    expect(within(wednesdayColumn).getByTestId("work-day-badge-2026-03-11")).toHaveTextContent(
      "Libur Khusus Uji",
    );

    // Rentang yang diminta mencakup seluruh pekan yang terlihat.
    expect(onHolidays).toHaveBeenCalled();
    const requested = onHolidays.mock.calls[0][0];
    expect(requested.fromDate <= "2026-03-09").toBe(true);
    expect(requested.toDate >= "2026-03-15").toBe(true);
  });

  it("kegagalan memuat pengaturan tidak memblokir kalender (fallback default)", async () => {
    const repository = createSettingsRepository({
      failOnSettings: true,
      failOnHolidays: true,
    });

    renderWorkspace({ view: "day", settingsRepository: repository });

    // Tampilan tetap dirender dan input tetap tersedia.
    await waitFor(() =>
      expect(screen.getByLabelText("Apa yang akan dikerjakan?")).toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("work-day-note-2026-03-10"),
    ).not.toBeInTheDocument();
  });

  it("override test menang atas repository", async () => {
    const repository = createSettingsRepository({
      settings: { ...DEFAULT_WORK_CALENDAR_WORK_SETTINGS, workDays: [7] },
      holidays: [],
    });

    renderWorkspace({
      view: "week",
      settingsRepository: repository,
      holidays: WORK_CALENDAR_FIXTURE_HOLIDAYS,
    });

    const thursdayColumn = await screen.findByTestId("work-week-column-2026-03-12");
    await waitFor(() => expect(thursdayColumn).toHaveAttribute("data-day-kind", "holiday"));
  });
});
