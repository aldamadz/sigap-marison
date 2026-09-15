import { describe, expect, it } from "vitest";

import {
  WORK_CALENDAR_TIME_ZONE,
  WORK_WEEKDAY_LABELS_ID,
  formatWorkDateFull,
  formatWorkDateHeading,
  formatWorkDateKey,
  formatWorkMonthLabel,
  formatWorkTimeLabelFromIso,
  formatWorkWeekRangeLabel,
  getWorkCalendarDateRange,
  getWorkDateWeekday,
  isWorkDateWithin,
  isValidWorkDate,
  parseWorkDateTimeInput,
  shiftWorkDate,
  startOfWorkMonth,
  startOfWorkWeek,
  todayWorkDate,
  workDateToUtcRange,
  workMonthDates,
  workWeekDates,
} from "@/features/work-calendar/lib/work-calendar-date";
import {
  compareWorkEntries,
  getWorkEntryStatusFollowUp,
  getWorkEntryStatusLabel,
  isFinalWorkEntryStatus,
  isWorkEntryOverdue,
} from "@/features/work-calendar/lib/work-entry-status";
import {
  buildWorkEntryOwnerGroups,
  computeWorkCompletionPercent,
  computeWorkProgress,
  createWorkCalendarPermissions,
  filterWorkEntriesByOwner,
  getWorkMonthCellPreview,
  isWorkCalendarTeamViewAvailable,
  WORK_MONTH_CELL_PREVIEW_LIMIT,
} from "@/features/work-calendar/lib/work-progress";
import {
  canQuickCreateWorkEntry,
  normalizeWorkEntryTitle,
  validateWorkEntryInput,
} from "@/features/work-calendar/lib/work-entry-validation";
import {
  WORK_CALENDAR_FIXTURE_CURRENT_USER,
  WORK_CALENDAR_FIXTURE_TEAM_MEMBERS,
  createFixtureWorkEntry,
} from "@/features/work-calendar/testing/work-calendar-fixtures";

describe("work-calendar-date", () => {
  it("memakai zona waktu Asia/Jakarta dan bukan zona perangkat", () => {
    expect(WORK_CALENDAR_TIME_ZONE).toBe("Asia/Jakarta");
  });

  it("menghitung tanggal kerja dari instant memakai jam dinding WIB", () => {
    // 2026-03-09T18:30:00Z = 2026-03-10T01:30 WIB
    expect(formatWorkDateKey(new Date("2026-03-09T18:30:00.000Z"))).toBe("2026-03-10");
    // 2026-03-10T16:59:00Z = 2026-03-10T23:59 WIB
    expect(formatWorkDateKey(new Date("2026-03-10T16:59:00.000Z"))).toBe("2026-03-10");
    // 2026-03-10T17:00:00Z = 2026-03-11T00:00 WIB
    expect(formatWorkDateKey(new Date("2026-03-10T17:00:00.000Z"))).toBe("2026-03-11");
  });

  it("menghasilkan rentang UTC eksklusif per tanggal kerja", () => {
    expect(workDateToUtcRange("2026-03-10")).toEqual({
      startUtc: "2026-03-09T17:00:00.000Z",
      endUtc: "2026-03-10T17:00:00.000Z",
    });
  });

  it("menolak tanggal yang tidak valid", () => {
    expect(isValidWorkDate("2026-03-10")).toBe(true);
    expect(isValidWorkDate("2026-02-30")).toBe(false);
    expect(isValidWorkDate("2026-13-01")).toBe(false);
    expect(isValidWorkDate("10-03-2026")).toBe(false);
    expect(isValidWorkDate(null)).toBe(false);
  });

  it("menggeser tanggal kerja tanpa terpengaruh DST", () => {
    expect(shiftWorkDate("2026-03-10", 1)).toBe("2026-03-11");
    expect(shiftWorkDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftWorkDate("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("menjadikan Senin sebagai awal minggu kerja", () => {
    // 2026-03-10 adalah Selasa.
    expect(startOfWorkWeek("2026-03-10")).toBe("2026-03-09");
    expect(workWeekDates("2026-03-10")).toEqual([
      "2026-03-09",
      "2026-03-10",
      "2026-03-11",
      "2026-03-12",
      "2026-03-13",
      "2026-03-14",
      "2026-03-15",
    ]);
    expect(getWorkDateWeekday("2026-03-10")).toBe(2);
  });

  it("menghasilkan grid bulan yang selalu kelipatan tujuh hari", () => {
    const cells = workMonthDates("2026-03-10");
    expect(cells.length % 7).toBe(0);
    expect(cells).toContain("2026-03-01");
    expect(cells).toContain("2026-03-31");
    expect(startOfWorkMonth("2026-03-10")).toBe("2026-03-01");
  });

  it("menghitung rentang tanggal per mode tampilan", () => {
    expect(getWorkCalendarDateRange("day", "2026-03-10")).toEqual({
      fromDate: "2026-03-10",
      toDate: "2026-03-10",
    });
    expect(getWorkCalendarDateRange("week", "2026-03-10")).toEqual({
      fromDate: "2026-03-09",
      toDate: "2026-03-15",
    });
    const monthRange = getWorkCalendarDateRange("month", "2026-03-10");
    expect(monthRange.fromDate <= "2026-03-01").toBe(true);
    expect(monthRange.toDate >= "2026-03-31").toBe(true);
  });

  it("mengubah jam dinding WIB menjadi timestamp ISO", () => {
    expect(parseWorkDateTimeInput("2026-03-10", "07:00")).toBe("2026-03-10T00:00:00.000Z");
    expect(parseWorkDateTimeInput("2026-03-10", "16:30:00")).toBe("2026-03-10T09:30:00.000Z");
    expect(formatWorkTimeLabelFromIso("2026-03-10T09:30:00.000Z")).toBe("16:30");
  });

  it("mengembalikan null untuk waktu yang tidak valid", () => {
    expect(parseWorkDateTimeInput("2026-03-10", "24:00")).toBeNull();
    expect(parseWorkDateTimeInput("2026-03-10", "07:60")).toBeNull();
    expect(parseWorkDateTimeInput("2026-03-10", "")).toBeNull();
    expect(parseWorkDateTimeInput("bukan-tanggal", "07:00")).toBeNull();
    expect(formatWorkTimeLabelFromIso("bukan-timestamp")).toBeNull();
    expect(formatWorkTimeLabelFromIso(null)).toBeNull();
  });

  it("memformat label tanggal berbahasa Indonesia", () => {
    expect(formatWorkDateFull("2026-03-10")).toBe("Selasa, 10 Maret 2026");
    expect(formatWorkMonthLabel("2026-03-10")).toBe("Maret 2026");
    expect(formatWorkWeekRangeLabel("2026-03-10")).toBe("9 - 15 Mar 2026");
    expect(formatWorkDateHeading("2026-03-10", "2026-03-10")).toBe("Hari Ini, Selasa, 10 Maret 2026");
    expect(formatWorkDateHeading("2026-03-11", "2026-03-10")).toContain("Besok");
    expect(formatWorkDateHeading("2026-03-09", "2026-03-10")).toContain("Kemarin");
  });

  it("menyediakan label hari dan helper tanggal dasar", () => {
    expect(WORK_WEEKDAY_LABELS_ID[2]).toBe("Sel");
    expect(isWorkDateWithin("2026-03-10", "2026-03-09", "2026-03-15")).toBe(true);
    expect(isWorkDateWithin("2026-03-16", "2026-03-09", "2026-03-15")).toBe(false);
    expect(todayWorkDate(new Date("2026-03-09T18:30:00.000Z"))).toBe("2026-03-10");
  });
});

describe("work-entry-status", () => {
  it("hanya mengenal empat status tersimpan", () => {
    expect(getWorkEntryStatusLabel("planned")).toBe("Direncanakan");
    expect(getWorkEntryStatusLabel("in_progress")).toBe("Sedang Dikerjakan");
    expect(getWorkEntryStatusLabel("completed")).toBe("Selesai");
    expect(getWorkEntryStatusLabel("blocked")).toBe("Terhambat");
  });

  it("menandai status final dengan benar", () => {
    expect(isFinalWorkEntryStatus("completed")).toBe(true);
    expect(isFinalWorkEntryStatus("blocked")).toBe(true);
    expect(isFinalWorkEntryStatus("planned")).toBe(false);
    expect(isFinalWorkEntryStatus("in_progress")).toBe(false);
  });

  it("meminta input lanjutan hanya untuk completed dan blocked", () => {
    expect(getWorkEntryStatusFollowUp("completed")).toBe("realization");
    expect(getWorkEntryStatusFollowUp("blocked")).toBe("blocked_reason");
    expect(getWorkEntryStatusFollowUp("planned")).toBeNull();
    expect(getWorkEntryStatusFollowUp("in_progress")).toBeNull();
  });

  it("menurunkan overdue dari status dan tanggal, bukan menyimpannya", () => {
    const today = "2026-03-10";
    expect(isWorkEntryOverdue({ status: "planned", workDate: "2026-03-09" }, today)).toBe(true);
    expect(isWorkEntryOverdue({ status: "in_progress", workDate: "2026-03-09" }, today)).toBe(true);
    expect(isWorkEntryOverdue({ status: "planned", workDate: today }, today)).toBe(false);
    expect(isWorkEntryOverdue({ status: "planned", workDate: "2026-03-11" }, today)).toBe(false);
    // Status final tidak pernah overdue, meskipun tanggal sudah lewat.
    expect(isWorkEntryOverdue({ status: "completed", workDate: "2026-03-01" }, today)).toBe(false);
    expect(isWorkEntryOverdue({ status: "blocked", workDate: "2026-03-01" }, today)).toBe(false);
  });

  it("mengurutkan entry secara stabil", () => {
    const first = createFixtureWorkEntry({ id: "b", workDate: "2026-03-10", startsAt: "2026-03-10T01:00:00.000Z", isAllDay: false });
    const second = createFixtureWorkEntry({ id: "a", workDate: "2026-03-10", startsAt: "2026-03-10T02:00:00.000Z", isAllDay: false });
    expect(compareWorkEntries(first, second)).toBeLessThan(0);
    expect(compareWorkEntries(second, first)).toBeGreaterThan(0);
    expect(compareWorkEntries(first, first)).toBe(0);
  });
});

describe("work-progress", () => {
  const today = "2026-03-10";
  const entries = [
    createFixtureWorkEntry({ id: "p", status: "planned" }),
    createFixtureWorkEntry({ id: "i", status: "in_progress" }),
    createFixtureWorkEntry({ id: "c", status: "completed" }),
    createFixtureWorkEntry({ id: "b", status: "blocked" }),
    createFixtureWorkEntry({ id: "o", status: "planned", workDate: "2026-03-01" }),
  ];

  it("menghitung progres otomatis tanpa input persen", () => {
    expect(computeWorkProgress(entries, today)).toEqual({
      total: 5,
      planned: 2,
      inProgress: 1,
      completed: 1,
      blocked: 1,
      overdue: 1,
    });
  });

  it("menghitung persentase selesai dengan aman untuk daftar kosong", () => {
    expect(computeWorkCompletionPercent({ ...computeWorkProgress([], today) })).toBe(0);
    expect(computeWorkCompletionPercent(computeWorkProgress(entries, today))).toBe(20);
  });

  it("membatasi preview sel bulan dan menghitung sisa entry", () => {
    expect(WORK_MONTH_CELL_PREVIEW_LIMIT).toBe(2);
    const many = Array.from({ length: 5 }, (_, index) =>
      createFixtureWorkEntry({ id: `preview-${index}` }),
    );
    const { preview, hiddenCount } = getWorkMonthCellPreview(many);
    expect(preview).toHaveLength(2);
    expect(hiddenCount).toBe(3);
    expect(getWorkMonthCellPreview([]).hiddenCount).toBe(0);
  });

  it("memfilter entry menurut pemilik", () => {
    const own = createFixtureWorkEntry({ id: "own", ownerId: "me" });
    const other = createFixtureWorkEntry({ id: "other", ownerId: "them" });
    expect(filterWorkEntriesByOwner([own, other], "all")).toHaveLength(2);
    expect(filterWorkEntriesByOwner([own, other], "me").map((entry) => entry.id)).toEqual(["own"]);
  });

  it("selalu menampilkan anggota tim walau belum punya entry", () => {
    const groups = buildWorkEntryOwnerGroups(
      [createFixtureWorkEntry({ id: "t", ownerId: WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[0].id })],
      WORK_CALENDAR_FIXTURE_TEAM_MEMBERS,
      WORK_CALENDAR_FIXTURE_CURRENT_USER.id,
    );
    expect(groups).toHaveLength(WORK_CALENDAR_FIXTURE_TEAM_MEMBERS.length);
    expect(groups[0].entries).toHaveLength(1);
    expect(groups[0].isTeamMember).toBe(true);
    expect(groups[1].entries).toHaveLength(0);
  });

  it("menyembunyikan mode Tim saat tidak ada bawahan", () => {
    expect(isWorkCalendarTeamViewAvailable([])).toBe(false);
    expect(isWorkCalendarTeamViewAvailable(undefined)).toBe(false);
    expect(isWorkCalendarTeamViewAvailable(WORK_CALENDAR_FIXTURE_TEAM_MEMBERS)).toBe(true);
  });

  it("memberi izin tulis hanya pada entry sendiri", () => {
    const permissions = createWorkCalendarPermissions("me");
    expect(permissions.canEditEntry(createFixtureWorkEntry({ ownerId: "me" }))).toBe(true);
    expect(permissions.canEditEntry(createFixtureWorkEntry({ ownerId: "them" }))).toBe(false);
    expect(permissions.canDeleteEntry(createFixtureWorkEntry({ ownerId: "them" }))).toBe(false);
  });
});

describe("work-entry-validation", () => {
  it("menerima quick entry yang hanya memuat judul", () => {
    expect(canQuickCreateWorkEntry("Kirim laporan")).toBe(true);
    const result = validateWorkEntryInput({ title: "Kirim laporan", status: "planned", kind: "work" });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual({});
  });

  it("menolak judul kosong atau hanya spasi", () => {
    expect(canQuickCreateWorkEntry("   ")).toBe(false);
    expect(canQuickCreateWorkEntry("")).toBe(false);
    const result = validateWorkEntryInput({ title: "   ", status: "planned", kind: "work" });
    expect(result.ok).toBe(false);
    expect(result.errors.title).toBeTruthy();
  });

  it("merapikan spasi berlebih pada judul", () => {
    expect(normalizeWorkEntryTitle("  Kirim   laporan  ")).toBe("Kirim laporan");
  });

  it("mewajibkan realisasi saat status completed", () => {
    const result = validateWorkEntryInput({
      title: "Selesai",
      status: "completed",
      kind: "work",
      realization: "   ",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.realization).toBeTruthy();
    expect(
      validateWorkEntryInput({
        title: "Selesai",
        status: "completed",
        kind: "work",
        realization: "Sudah dikirim",
      }).ok,
    ).toBe(true);
  });

  it("mewajibkan alasan saat status blocked", () => {
    const result = validateWorkEntryInput({ title: "Terhambat", status: "blocked", kind: "work" });
    expect(result.ok).toBe(false);
    expect(result.errors.blockedReason).toBeTruthy();
    expect(
      validateWorkEntryInput({
        title: "Terhambat",
        status: "blocked",
        kind: "work",
        blockedReason: "Menunggu approval",
      }).ok,
    ).toBe(true);
  });

  it("menolak rentang waktu yang tidak lengkap atau terbalik", () => {
    expect(
      validateWorkEntryInput({
        title: "Rapat",
        status: "planned",
        kind: "event",
        startsAt: "2026-03-10T01:00:00.000Z",
      }).errors.timeRange,
    ).toBeTruthy();
    expect(
      validateWorkEntryInput({
        title: "Rapat",
        status: "planned",
        kind: "event",
        startsAt: "2026-03-10T02:00:00.000Z",
        endsAt: "2026-03-10T01:00:00.000Z",
      }).errors.timeRange,
    ).toBeTruthy();
    expect(
      validateWorkEntryInput({
        title: "Rapat",
        status: "planned",
        kind: "event",
        startsAt: "2026-03-10T01:00:00.000Z",
        endsAt: "2026-03-10T02:00:00.000Z",
      }).ok,
    ).toBe(true);
  });

  it("menolak status atau jenis yang tidak dikenal", () => {
    const invalidStatus = validateWorkEntryInput({
      title: "Uji",
      // Sengaja tidak valid untuk menguji batas runtime.
      status: "Scheduled" as never,
      kind: "work",
    });
    expect(invalidStatus.ok).toBe(false);
    const invalidKind = validateWorkEntryInput({
      title: "Uji",
      status: "planned",
      kind: "agenda" as never,
    });
    expect(invalidKind.ok).toBe(false);
  });
});
