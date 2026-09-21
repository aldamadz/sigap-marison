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
  getWorkEntryEffectiveDueDate,
  isFinalWorkEntryStatus,
  isUnfinishedWorkEntryStatus,
  isWorkEntryCompletedLate,
  isWorkEntryOverdue,
} from "@/features/work-calendar/lib/work-entry-status";
import {
  buildBlockedPatch,
  buildCompletePatch,
  buildContinueTodayPatch,
  buildReschedulePatch,
  buildStatusPatch,
  buildWorkEntryEventDrafts,
  describeWorkEntryEvent,
  getWorkEntryColorMeta,
  isWorkEntryColorSwatch,
  WORK_ENTRY_COLOR_META,
} from "@/features/work-calendar/lib/work-entry-lifecycle";
import {
  buildWorkEntryOwnerGroups,
  buildWorkProgressStatusRows,
  computeWorkCompletionPercent,
  computeWorkProgress,
  computeWorkEntryOwnerGroupsProgress,
  createWorkCalendarPermissions,
  filterWorkEntriesByOwner,
  getWorkMonthCellPreview,
  getWorkWeekDayPreview,
  getWorkWeekEntryPriority,
  getWorkWeekPreviewLimit,
  isWorkCalendarTeamViewAvailable,
  resolveWorkEntryOwnerFilter,
  selectUnfinishedWorkEntries,
  WORK_MONTH_CELL_PREVIEW_LIMIT,
  WORK_WEEK_PREVIEW_LIMIT_DESKTOP,
  WORK_WEEK_PREVIEW_LIMIT_MOBILE,
} from "@/features/work-calendar/lib/work-progress";
import {
  getWorkCalendarAddAction,
  shouldShowToolbarAdd,
} from "@/features/work-calendar/lib/work-calendar-add-action";
import {
  canQuickCreateWorkEntry,
  normalizeWorkEntryTitle,
  validateWorkEntryInput,
} from "@/features/work-calendar/lib/work-entry-validation";
import {
  WORK_ENTRY_QUERY_ID_MAX_LENGTH,
  normalizeWorkEntryQueryId,
  resolveSelectedWorkEntry,
  shouldDiscardWorkEntryQueryId,
} from "@/features/work-calendar/lib/work-entry-selection";
import {
  WORK_CALENDAR_DETAIL_SHEET_MAX_WIDTH,
  WORK_CALENDAR_DETAIL_SHEET_MIN_WIDTH,
  WORK_CALENDAR_REDUCED_DURATION_SECONDS,
  getWorkCalendarMotionDurations,
} from "@/features/work-calendar/lib/work-calendar-motion";
import {
  DEFAULT_WORK_CALENDAR_STATUS_FILTER,
  WORK_CALENDAR_STATUS_FILTERS,
  countWorkEntriesByStatusFilter,
  filterWorkEntriesByStatus,
  getWorkCalendarStatusFilterLabel,
  matchesWorkCalendarStatusFilter,
  type WorkCalendarStatusFilter,
} from "@/features/work-calendar/lib/work-calendar-status-filter";
import {
  WORK_CALENDAR_FIXTURE_CURRENT_USER,
  WORK_CALENDAR_FIXTURE_TEAM_MEMBERS,
  WORK_CALENDAR_FIXTURE_TODAY,
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

  it("menyatakan hanya completed sebagai status final", () => {
    expect(isFinalWorkEntryStatus("completed")).toBe(true);
    expect(isFinalWorkEntryStatus("planned")).toBe(false);
    expect(isFinalWorkEntryStatus("in_progress")).toBe(false);
    // Blocked bukan final: pekerjaannya masih aktif dan belum selesai.
    expect(isFinalWorkEntryStatus("blocked")).toBe(false);
  });

  it("menyatakan blocked tetap belum selesai", () => {
    expect(isUnfinishedWorkEntryStatus("planned")).toBe(true);
    expect(isUnfinishedWorkEntryStatus("in_progress")).toBe(true);
    expect(isUnfinishedWorkEntryStatus("blocked")).toBe(true);
    expect(isUnfinishedWorkEntryStatus("completed")).toBe(false);
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
  });

  it("menandai blocked pada tanggal lampau sebagai overdue", () => {
    const today = "2026-03-10";
    // Blocked bukan final, jadi pekerjaan lampau yang terhambat tetap terlambat.
    expect(isWorkEntryOverdue({ status: "blocked", workDate: "2026-03-09" }, today)).toBe(true);
    expect(isWorkEntryOverdue({ status: "blocked", workDate: "2026-03-01" }, today)).toBe(true);
  });

  it("tidak menandai blocked hari ini sebagai overdue", () => {
    const today = "2026-03-10";
    expect(isWorkEntryOverdue({ status: "blocked", workDate: today }, today)).toBe(false);
    expect(isWorkEntryOverdue({ status: "blocked", workDate: "2026-03-11" }, today)).toBe(false);
  });

  it("mengurutkan entry secara stabil", () => {
    const first = createFixtureWorkEntry({ id: "b", workDate: "2026-03-10", startsAt: "2026-03-10T01:00:00.000Z", isAllDay: false });
    const second = createFixtureWorkEntry({ id: "a", workDate: "2026-03-10", startsAt: "2026-03-10T02:00:00.000Z", isAllDay: false });
    expect(compareWorkEntries(first, second)).toBeLessThan(0);
    expect(compareWorkEntries(second, first)).toBeGreaterThan(0);
    expect(compareWorkEntries(first, first)).toBe(0);
  });
});

describe("work-entry-status — tenggat (CAL-03 F5)", () => {
  it("memakai dueDate sebagai tenggat efektif dan workDate sebagai fallback", () => {
    expect(getWorkEntryEffectiveDueDate({ workDate: "2026-03-10", dueDate: "2026-03-15" })).toBe(
      "2026-03-15",
    );
    expect(getWorkEntryEffectiveDueDate({ workDate: "2026-03-10", dueDate: null })).toBe(
      "2026-03-10",
    );
    expect(getWorkEntryEffectiveDueDate({ workDate: "2026-03-10" })).toBe("2026-03-10");
  });

  it("menghitung overdue dari tenggat, bukan hanya tanggal kerja", () => {
    const today = "2026-03-10";
    // Tanggal kerja sudah lewat, tetapi tenggat masih jauh: belum terlambat.
    expect(
      isWorkEntryOverdue({ status: "planned", workDate: "2026-03-01", dueDate: "2026-03-20" }, today),
    ).toBe(false);
    // Tanggal kerja hari ini, tetapi tenggat kemarin: terlambat.
    expect(
      isWorkEntryOverdue({ status: "planned", workDate: today, dueDate: "2026-03-09" }, today),
    ).toBe(true);
    // Tepat pada tenggat belum terhitung terlambat.
    expect(
      isWorkEntryOverdue({ status: "in_progress", workDate: today, dueDate: today }, today),
    ).toBe(false);
    // Final tidak pernah overdue meski tenggat sudah lewat.
    expect(
      isWorkEntryOverdue({ status: "completed", workDate: "2026-03-01", dueDate: "2026-03-02" }, today),
    ).toBe(false);
  });

  it("menandai selesai terlambat hanya bila completedAt melewati due_date", () => {
    expect(
      isWorkEntryCompletedLate({
        status: "completed",
        completedAt: "2026-03-12T02:00:00.000Z",
        dueDate: "2026-03-11",
      }),
    ).toBe(true);
    expect(
      isWorkEntryCompletedLate({
        status: "completed",
        completedAt: "2026-03-11T02:00:00.000Z",
        dueDate: "2026-03-11",
      }),
    ).toBe(false);
    // Tanpa tenggat eksplisit tidak ada penilaian terlambat.
    expect(
      isWorkEntryCompletedLate({
        status: "completed",
        completedAt: "2026-03-20T02:00:00.000Z",
        dueDate: null,
      }),
    ).toBe(false);
    // Belum selesai tidak pernah "selesai terlambat".
    expect(
      isWorkEntryCompletedLate({
        status: "blocked",
        completedAt: null,
        dueDate: "2026-03-01",
      }),
    ).toBe(false);
  });
});

describe("work-entry-lifecycle (CAL-03 F5)", () => {
  it("mengenali palet warna statis dan menyediakan label aksesibel", () => {
    expect(WORK_ENTRY_COLOR_META).toHaveLength(6);
    for (const color of WORK_ENTRY_COLOR_META) {
      expect(color.label.length).toBeGreaterThan(0);
      expect(color.hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(isWorkEntryColorSwatch(color.swatch)).toBe(true);
    }
    expect(isWorkEntryColorSwatch("magenta")).toBe(false);
    expect(getWorkEntryColorMeta("blue").label).toBe("Biru");
  });

  it("tidak menghasilkan patch jadwal bila tanggal tidak berubah", () => {
    expect(buildContinueTodayPatch({ workDate: "2026-03-10" }, "2026-03-10")).toBeNull();
    expect(buildContinueTodayPatch({ workDate: "2026-03-09" }, "2026-03-10")).toEqual({
      workDate: "2026-03-10",
    });
    expect(buildReschedulePatch({ workDate: "2026-03-10" }, "2026-03-10")).toBeNull();
    expect(buildReschedulePatch({ workDate: "2026-03-10" }, "2026-03-12")).toEqual({
      workDate: "2026-03-12",
    });
  });

  it("membangun patch status tanpa pernah membuat entri baru", () => {
    expect(buildStatusPatch("in_progress")).toEqual({ status: "in_progress" });
    expect(buildCompletePatch("Selesai")).toEqual({
      status: "completed",
      realization: "Selesai",
      blockedReason: null,
    });
    expect(buildBlockedPatch("Menunggu")).toEqual({
      status: "blocked",
      blockedReason: "Menunggu",
    });
  });

  it("menurunkan peristiwa created saat pembuatan", () => {
    const drafts = buildWorkEntryEventDrafts(null, {
      status: "planned",
      workDate: "2026-03-10",
      dueDate: "2026-03-15",
      realization: null,
      blockedReason: null,
      deletedAt: null,
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      type: "created",
      fromStatus: null,
      toStatus: "planned",
      toWorkDate: "2026-03-10",
      fromWorkDate: null,
    });
  });

  it("mencatat status, jadwal, dan tenggat pada baris yang sama", () => {
    const drafts = buildWorkEntryEventDrafts(
      {
        status: "planned",
        workDate: "2026-03-10",
        dueDate: "2026-03-11",
        realization: null,
        blockedReason: null,
        deletedAt: null,
      },
      {
        status: "blocked",
        workDate: "2026-03-12",
        dueDate: "2026-03-20",
        realization: null,
        blockedReason: "Menunggu data",
        deletedAt: null,
      },
    );

    expect(drafts.map((draft) => draft.type)).toEqual([
      "status_changed",
      "schedule_changed",
      "due_date_changed",
    ]);
    expect(drafts[0]).toMatchObject({ fromStatus: "planned", toStatus: "blocked", detail: "Menunggu data" });
    expect(drafts[1]).toMatchObject({ fromWorkDate: "2026-03-10", toWorkDate: "2026-03-12" });
    expect(drafts[2]).toMatchObject({ fromDueDate: "2026-03-11", toDueDate: "2026-03-20" });
  });

  it("tidak mencatat peristiwa untuk update non-siklus hidup dan soft delete", () => {
    const base = {
      status: "planned" as const,
      workDate: "2026-03-10",
      dueDate: null,
      realization: null,
      blockedReason: null,
      deletedAt: null,
    };

    expect(buildWorkEntryEventDrafts(base, { ...base })).toEqual([]);
    expect(
      buildWorkEntryEventDrafts(base, { ...base, deletedAt: "2026-03-10T09:00:00.000Z" }),
    ).toEqual([]);
  });

  it("mendeskripsikan peristiwa dengan kalimat siap tampil", () => {
    expect(
      describeWorkEntryEvent({
        id: "e1",
        entryId: "w1",
        ownerId: "u1",
        type: "created",
        fromStatus: null,
        toStatus: "planned",
        fromWorkDate: null,
        toWorkDate: "2026-03-10",
        fromDueDate: null,
        toDueDate: null,
        detail: null,
        actorId: null,
        createdAt: "2026-03-10T01:00:00.000Z",
      }).title,
    ).toBe("Pekerjaan dibuat");

    const statusEvent = describeWorkEntryEvent({
      id: "e2",
      entryId: "w1",
      ownerId: "u1",
      type: "status_changed",
      fromStatus: "planned",
      toStatus: "completed",
      fromWorkDate: null,
      toWorkDate: null,
      fromDueDate: null,
      toDueDate: null,
      detail: "Selesai",
      actorId: null,
      createdAt: "2026-03-10T01:00:00.000Z",
    });
    expect(statusEvent.title).toContain("Selesai");
    expect(statusEvent.detail).toBe("Selesai");
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

  it("menjaga planned + inProgress + completed + blocked selalu sama dengan total", () => {
    for (const sample of [
      computeWorkProgress(entries, today),
      computeWorkProgress([], today),
      computeWorkProgress(
        [
          createFixtureWorkEntry({ id: "all-blocked", status: "blocked", workDate: today }),
          createFixtureWorkEntry({ id: "all-completed", status: "completed", workDate: today }),
        ],
        today,
      ),
    ]) {
      expect(sample.planned + sample.inProgress + sample.completed + sample.blocked).toBe(
        sample.total,
      );
    }
  });

  it("menghitung overdue lintas status tanpa mengubah penjumlahan status", () => {
    const mixed = [
      createFixtureWorkEntry({ id: "late-planned", status: "planned", workDate: "2026-03-01" }),
      createFixtureWorkEntry({ id: "late-blocked", status: "blocked", workDate: "2026-03-01" }),
      createFixtureWorkEntry({ id: "done-late", status: "completed", workDate: "2026-03-01" }),
    ];
    const counts = computeWorkProgress(mixed, today);
    expect(counts.overdue).toBe(2);
    expect(counts.planned + counts.inProgress + counts.completed + counts.blocked).toBe(
      counts.total,
    );
    // Persentase tetap hanya completed / total.
    expect(computeWorkCompletionPercent(counts)).toBe(33);
  });

  it("membangun baris ringkasan dengan seluruh status dan overdue terpisah", () => {
    const rows = buildWorkProgressStatusRows(computeWorkProgress(entries, today));
    expect(rows.map((row) => row.key)).toEqual([
      "planned",
      "inProgress",
      "completed",
      "blocked",
      "overdue",
    ]);
    const statusOnly = rows.filter((row) => row.key !== "overdue");
    expect(statusOnly.reduce((sum, row) => sum + row.value, 0)).toBe(5);
  });

  it("menyertakan blocked sebagai pekerjaan yang belum selesai", () => {
    const unfinished = selectUnfinishedWorkEntries([
      createFixtureWorkEntry({ id: "u-planned", status: "planned" }),
      createFixtureWorkEntry({ id: "u-progress", status: "in_progress" }),
      createFixtureWorkEntry({ id: "u-blocked", status: "blocked" }),
      createFixtureWorkEntry({ id: "u-completed", status: "completed" }),
    ]);
    expect(unfinished.map((entry) => entry.id)).toEqual(["u-planned", "u-progress", "u-blocked"]);
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

  it("CAL-03 F4A: filter pemilik menyaring kelompok, metrik, dan daftar pada sumbernya", () => {
    const entries = [
      createFixtureWorkEntry({ id: "own", ownerId: WORK_CALENDAR_FIXTURE_CURRENT_USER.id }),
      createFixtureWorkEntry({
        id: "a1",
        ownerId: WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[0].id,
        status: "completed",
      }),
      createFixtureWorkEntry({ id: "a2", ownerId: WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[0].id }),
      createFixtureWorkEntry({
        id: "b1",
        ownerId: WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[1].id,
        status: "blocked",
      }),
    ];

    const all = buildWorkEntryOwnerGroups(
      entries,
      WORK_CALENDAR_FIXTURE_TEAM_MEMBERS,
      WORK_CALENDAR_FIXTURE_CURRENT_USER.id,
      "all",
    );
    expect(all).toHaveLength(WORK_CALENDAR_FIXTURE_TEAM_MEMBERS.length);
    expect(all.map((group) => group.entries.length)).toEqual([2, 1, 0]);

    const filtered = buildWorkEntryOwnerGroups(
      entries,
      WORK_CALENDAR_FIXTURE_TEAM_MEMBERS,
      WORK_CALENDAR_FIXTURE_CURRENT_USER.id,
      WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[0].id,
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].owner.id).toBe(WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[0].id);
    expect(filtered[0].entries.map((entry) => entry.id)).toEqual(["a1", "a2"]);
    // Metrik dihitung dari daftar yang sudah tersaring, bukan dari seluruh tim.
    expect(computeWorkEntryOwnerGroupsProgress(filtered, WORK_CALENDAR_FIXTURE_TODAY)).toMatchObject({
      total: 2,
      completed: 1,
      blocked: 0,
    });
    expect(
      computeWorkEntryOwnerGroupsProgress(all, WORK_CALENDAR_FIXTURE_TODAY),
    ).toMatchObject({ total: 3, completed: 1, blocked: 1 });
  });

  it("CAL-03 F4A: anggota tanpa entry tetap tampil dengan progres nol", () => {
    const groups = buildWorkEntryOwnerGroups(
      [],
      WORK_CALENDAR_FIXTURE_TEAM_MEMBERS,
      WORK_CALENDAR_FIXTURE_CURRENT_USER.id,
      WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[2].id,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(0);
    expect(computeWorkEntryOwnerGroupsProgress(groups, WORK_CALENDAR_FIXTURE_TODAY)).toMatchObject({
      total: 0,
      completed: 0,
    });
    expect(computeWorkCompletionPercent(computeWorkProgress([], WORK_CALENDAR_FIXTURE_TODAY))).toBe(0);
  });

  it("CAL-03 F4A: filter yang tidak tersedia jatuh kembali ke semua anggota", () => {
    const groups = buildWorkEntryOwnerGroups(
      [createFixtureWorkEntry({ id: "a1", ownerId: WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[0].id })],
      WORK_CALENDAR_FIXTURE_TEAM_MEMBERS,
      WORK_CALENDAR_FIXTURE_CURRENT_USER.id,
      "user-yang-sudah-tidak-ada",
    );
    expect(groups).toHaveLength(WORK_CALENDAR_FIXTURE_TEAM_MEMBERS.length);
    expect(groups[0].entries).toHaveLength(1);
  });

  it("CAL-03 F4A: id pemilik tanpa nama tidak pernah menjadi baris tim", () => {
    // Entry milik id yang tidak ada pada daftar anggota tidak boleh membuat
    // kelompok baru; UUID mentah tidak pernah muncul sebagai nama.
    const groups = buildWorkEntryOwnerGroups(
      [createFixtureWorkEntry({ id: "ghost", ownerId: "11111111-2222-3333-4444-555555555555" })],
      WORK_CALENDAR_FIXTURE_TEAM_MEMBERS,
      WORK_CALENDAR_FIXTURE_CURRENT_USER.id,
      "all",
    );
    expect(groups).toHaveLength(WORK_CALENDAR_FIXTURE_TEAM_MEMBERS.length);
    expect(groups.every((group) => group.entries.length === 0)).toBe(true);
    expect(groups.map((group) => group.owner.name)).not.toContain("11111111-2222-3333-4444-555555555555");
  });

  it("CAL-03 F4A koreksi: satu bawahan pada 'Semua anggota' bukan filter aktif", () => {
    const singleSubordinate = [WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[0]];

    // Atasan dengan tepat satu bawahan tetap "Semua anggota".
    const allState = resolveWorkEntryOwnerFilter("all", singleSubordinate);
    expect(allState.isOwnerFiltered).toBe(false);
    expect(allState.effectiveOwnerFilterId).toBe("all");
    expect(allState.selectedOwner).toBeNull();

    // Filter eksplisit pada satu bawahan barulah dianggap aktif.
    const filteredState = resolveWorkEntryOwnerFilter(
      WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[0].id,
      singleSubordinate,
    );
    expect(filteredState.isOwnerFiltered).toBe(true);
    expect(filteredState.effectiveOwnerFilterId).toBe(WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[0].id);
    expect(filteredState.selectedOwner?.name).toBe("Sinta Maharani");
  });

  it("CAL-03 F4A koreksi: anggota hilang mengembalikan filter ke 'Semua anggota'", () => {
    const withoutBimo = [WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[0], WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[2]];
    const state = resolveWorkEntryOwnerFilter(WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[1].id, withoutBimo);
    expect(state.effectiveOwnerFilterId).toBe("all");
    expect(state.isOwnerFiltered).toBe(false);
    expect(state.selectedOwner).toBeNull();
  });

  it("CAL-03 F4A koreksi: filter aktif tanpa entry tetap punya kelompok kosong", () => {
    const state = resolveWorkEntryOwnerFilter(
      WORK_CALENDAR_FIXTURE_TEAM_MEMBERS[2].id,
      WORK_CALENDAR_FIXTURE_TEAM_MEMBERS,
    );
    const groups = buildWorkEntryOwnerGroups(
      [],
      WORK_CALENDAR_FIXTURE_TEAM_MEMBERS,
      WORK_CALENDAR_FIXTURE_CURRENT_USER.id,
      state.effectiveOwnerFilterId,
    );
    expect(state.isOwnerFiltered).toBe(true);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(0);
  });

  it("CAL-03 F4A: batas preview Minggu 4 desktop/tablet dan 3 mobile", () => {
    expect(WORK_WEEK_PREVIEW_LIMIT_DESKTOP).toBe(4);
    expect(WORK_WEEK_PREVIEW_LIMIT_MOBILE).toBe(3);
    expect(getWorkWeekPreviewLimit(false)).toBe(4);
    expect(getWorkWeekPreviewLimit(true)).toBe(3);
  });

  it("CAL-03 F4A: preview Minggu menghitung +N dan menjaga total seluruh entry", () => {
    const many = Array.from({ length: 6 }, (_, index) =>
      createFixtureWorkEntry({ id: `week-${index}`, title: `Pekerjaan ${index}` }),
    );

    const desktop = getWorkWeekDayPreview(many, WORK_CALENDAR_FIXTURE_TODAY, 4);
    expect(desktop.preview).toHaveLength(4);
    expect(desktop.hiddenCount).toBe(2);
    expect(desktop.total).toBe(6);

    const mobile = getWorkWeekDayPreview(many, WORK_CALENDAR_FIXTURE_TODAY, 3);
    expect(mobile.preview).toHaveLength(3);
    expect(mobile.hiddenCount).toBe(3);
    expect(mobile.total).toBe(6);

    // Seluruh entry tetap masuk agregat progres meski preview dibatasi.
    expect(computeWorkProgress(many, WORK_CALENDAR_FIXTURE_TODAY).total).toBe(6);
    expect(getWorkWeekDayPreview([], WORK_CALENDAR_FIXTURE_TODAY, 4).hiddenCount).toBe(0);
  });

  it("CAL-03 F4A: prioritas preview Minggu terhambat/terlambat lalu berjalan/rencana/selesai", () => {
    const today = WORK_CALENDAR_FIXTURE_TODAY;
    const planned = createFixtureWorkEntry({ id: "p", status: "planned" });
    const inProgress = createFixtureWorkEntry({ id: "i", status: "in_progress" });
    const completed = createFixtureWorkEntry({ id: "c", status: "completed" });
    const blocked = createFixtureWorkEntry({ id: "b", status: "blocked" });
    const overdue = createFixtureWorkEntry({
      id: "o",
      status: "planned",
      workDate: shiftWorkDate(today, -3),
    });

    expect(getWorkWeekEntryPriority(blocked, today)).toBe(0);
    expect(getWorkWeekEntryPriority(overdue, today)).toBe(0);
    expect(getWorkWeekEntryPriority(inProgress, today)).toBe(1);
    expect(getWorkWeekEntryPriority(planned, today)).toBe(2);
    expect(getWorkWeekEntryPriority(completed, today)).toBe(3);

    const { preview } = getWorkWeekDayPreview(
      [completed, planned, inProgress, blocked, overdue],
      today,
      5,
    );
    expect(preview.slice(0, 2).map((entry) => entry.id).sort()).toEqual(["b", "o"]);
    expect(preview[2].id).toBe("i");
    expect(preview[3].id).toBe("p");
    expect(preview[4].id).toBe("c");
  });

  it("CAL-03 F4A: urutan preview Minggu stabil untuk input yang sama", () => {
    const today = WORK_CALENDAR_FIXTURE_TODAY;
    const entries = [
      createFixtureWorkEntry({ id: "x1", status: "planned", createdAt: "2026-03-10T01:00:00.000Z" }),
      createFixtureWorkEntry({ id: "x2", status: "planned", createdAt: "2026-03-10T00:30:00.000Z" }),
      createFixtureWorkEntry({ id: "x3", status: "blocked" }),
    ];
    const first = getWorkWeekDayPreview(entries, today, 3).preview.map((entry) => entry.id);
    const second = getWorkWeekDayPreview(entries.slice().reverse(), today, 3).preview.map((e) => e.id);
    expect(first).toEqual(["x3", "x2", "x1"]);
    expect(second).toEqual(first);
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

describe("work-calendar-add-action (CAL-03 F4A scope C)", () => {
  const anchor = "2026-03-05";
  const today = WORK_CALENDAR_FIXTURE_TODAY;

  it("menyembunyikan aksi toolbar pada tampilan Hari agar tidak duplikat", () => {
    // Tampilan Hari sudah punya tombol Tambah pada quick entry.
    expect(shouldShowToolbarAdd("day")).toBe(false);
    expect(shouldShowToolbarAdd("week")).toBe(true);
    expect(shouldShowToolbarAdd("month")).toBe(true);
    expect(shouldShowToolbarAdd("team")).toBe(true);
  });

  it("memberi label eksplisit dan tanggal target yang benar per tampilan", () => {
    expect(getWorkCalendarAddAction({ view: "week", anchorDate: anchor, today })).toEqual({
      label: "Tambah hari ini",
      targetDate: today,
      targetView: "day",
    });
    expect(getWorkCalendarAddAction({ view: "month", anchorDate: anchor, today })).toEqual({
      label: "Tambah hari ini",
      targetDate: today,
      targetView: "day",
    });
    // Label Tim menegaskan ini pekerjaan milik pengguna, bukan bawahan.
    expect(getWorkCalendarAddAction({ view: "team", anchorDate: anchor, today })).toEqual({
      label: "Tambah pekerjaan saya",
      targetDate: today,
      targetView: "day",
    });
  });

  it("pada tampilan Hari memakai tanggal yang sedang dilihat", () => {
    expect(getWorkCalendarAddAction({ view: "day", anchorDate: anchor, today })).toEqual({
      label: "Tambah pekerjaan",
      targetDate: anchor,
      targetView: "day",
    });
  });
});

describe("work-entry-selection (CAL-03 F4B)", () => {
  const entries = [
    createFixtureWorkEntry({ id: "milik-saya", title: "Pekerjaan saya" }),
    createFixtureWorkEntry({ id: "milik-tim", ownerId: "user-bawahan-1", title: "Pekerjaan tim" }),
  ];

  it("menormalkan id dari URL dan menolak bentuk yang tidak masuk akal", () => {
    expect(normalizeWorkEntryQueryId("abc-123")).toBe("abc-123");
    expect(normalizeWorkEntryQueryId(null)).toBeNull();
    expect(normalizeWorkEntryQueryId("")).toBeNull();
    // Spasi di tepi, whitespace internal, dan kontrol ditolak.
    expect(normalizeWorkEntryQueryId(" abc")).toBeNull();
    expect(normalizeWorkEntryQueryId("abc ")).toBeNull();
    expect(normalizeWorkEntryQueryId("a b")).toBeNull();
    expect(normalizeWorkEntryQueryId("a\tb")).toBeNull();
    // Id yang terlalu panjang ditolak.
    expect(
      normalizeWorkEntryQueryId("x".repeat(WORK_ENTRY_QUERY_ID_MAX_LENGTH + 1)),
    ).toBeNull();
    expect(
      normalizeWorkEntryQueryId("x".repeat(WORK_ENTRY_QUERY_ID_MAX_LENGTH)),
    ).toHaveLength(WORK_ENTRY_QUERY_ID_MAX_LENGTH);
  });

  it("mencari entry hanya pada data yang boleh dilihat", () => {
    expect(
      resolveSelectedWorkEntry({ requestedId: "milik-saya", entries })?.title,
    ).toBe("Pekerjaan saya");
    // Id milik orang lain tidak ada di `entries` pengguna sehingga null.
    expect(resolveSelectedWorkEntry({ requestedId: "tidak-ada", entries })).toBeNull();
    expect(resolveSelectedWorkEntry({ requestedId: null, entries })).toBeNull();
    // Entry tambahan (mis. anggota tim yang sedang dibuka) ikut dicari.
    expect(
      resolveSelectedWorkEntry({
        requestedId: "milik-tim",
        entries: [entries[0]],
        extraEntries: [entries[1]],
      })?.ownerId,
    ).toBe("user-bawahan-1");
  });

  it("hanya membuang id setelah data selesai dimuat", () => {
    expect(
      shouldDiscardWorkEntryQueryId({
        requestedId: "tidak-ada",
        resolvedEntry: null,
        dataReady: false,
      }),
    ).toBe(false);
    expect(
      shouldDiscardWorkEntryQueryId({
        requestedId: "tidak-ada",
        resolvedEntry: null,
        dataReady: true,
      }),
    ).toBe(true);
    // Id valid tidak pernah dibuang.
    expect(
      shouldDiscardWorkEntryQueryId({
        requestedId: "milik-saya",
        resolvedEntry: entries[0],
        dataReady: true,
      }),
    ).toBe(false);
  });
});

describe("work-calendar-motion (CAL-03 F4B)", () => {
  it("menjaga durasi overlay 150-180 ms dan sheet 220-260 ms", () => {
    const normal = getWorkCalendarMotionDurations(false);
    expect(normal.overlay).toBeGreaterThanOrEqual(0.15);
    expect(normal.overlay).toBeLessThanOrEqual(0.18);
    expect(normal.sheet).toBeGreaterThanOrEqual(0.22);
    expect(normal.sheet).toBeLessThanOrEqual(0.26);
    // Crossfade detail/editor harus ringan.
    expect(normal.crossfade).toBeLessThan(0.2);
  });

  it("memangkas durasi saat reduced motion tanpa perpindahan", () => {
    const reduced = getWorkCalendarMotionDurations(true);
    expect(reduced.overlay).toBe(WORK_CALENDAR_REDUCED_DURATION_SECONDS);
    expect(reduced.sheet).toBe(WORK_CALENDAR_REDUCED_DURATION_SECONDS);
    expect(reduced.crossfade).toBe(WORK_CALENDAR_REDUCED_DURATION_SECONDS);
    expect(reduced.overlay).toBeLessThan(
      getWorkCalendarMotionDurations(false).overlay,
    );
  });

  it("menetapkan lebar sheet detail desktop pada rentang 480-560 px", () => {
    expect(WORK_CALENDAR_DETAIL_SHEET_MIN_WIDTH).toBe(480);
    expect(WORK_CALENDAR_DETAIL_SHEET_MAX_WIDTH).toBe(560);
  });
});

describe("work-calendar-status-filter", () => {
  const today = WORK_CALENDAR_FIXTURE_TODAY;

  const planned = createFixtureWorkEntry({ id: "f-planned", status: "planned" });
  const running = createFixtureWorkEntry({ id: "f-running", status: "in_progress" });
  const done = createFixtureWorkEntry({ id: "f-done", status: "completed" });
  const blocked = createFixtureWorkEntry({ id: "f-blocked", status: "blocked" });
  const overdue = createFixtureWorkEntry({
    id: "f-overdue",
    status: "planned",
    workDate: "2026-03-09",
  });
  const blockedOverdue = createFixtureWorkEntry({
    id: "f-blocked-overdue",
    status: "blocked",
    workDate: "2026-03-09",
  });

  it("menyediakan opsi sesuai urutan pemindaian operasional", () => {
    expect(WORK_CALENDAR_STATUS_FILTERS.map((option) => option.value)).toEqual([
      "all",
      "attention",
      "in_progress",
      "blocked",
      "completed",
    ]);
    expect(DEFAULT_WORK_CALENDAR_STATUS_FILTER).toBe("all");
  });

  it("menerjemahkan nilai filter menjadi label yang stabil", () => {
    expect(getWorkCalendarStatusFilterLabel("all")).toBe("Semua");
    expect(getWorkCalendarStatusFilterLabel("attention")).toBe("Perlu perhatian");
    expect(getWorkCalendarStatusFilterLabel("in_progress")).toBe("Berjalan");
    expect(getWorkCalendarStatusFilterLabel("blocked")).toBe("Terhambat");
    expect(getWorkCalendarStatusFilterLabel("completed")).toBe("Selesai");
  });

  it("mengembalikan seluruh entry tanpa mengubah urutan pada filter Semua", () => {
    const entries = [planned, running, done];
    expect(filterWorkEntriesByStatus(entries, "all", today)).toBe(entries);
  });

  it("menyaring per status tunggal", () => {
    const entries = [planned, running, done, blocked];
    expect(filterWorkEntriesByStatus(entries, "in_progress", today)).toEqual([running]);
    expect(filterWorkEntriesByStatus(entries, "blocked", today)).toEqual([blocked]);
    expect(filterWorkEntriesByStatus(entries, "completed", today)).toEqual([done]);
  });

  it("menggabungkan overdue dan blocked pada filter Perlu perhatian", () => {
    const entries = [planned, running, done, blocked, overdue, blockedOverdue];
    // `planned` hari ini bukan attention; `running`/`done` juga bukan.
    expect(filterWorkEntriesByStatus(entries, "attention", today)).toEqual([
      blocked,
      overdue,
      blockedOverdue,
    ]);
  });

  it("tidak mengurutkan ulang: urutan relatif tetap setelah disaring", () => {
    // Urutan waktu kerja (entry berjam sebelum sepanjang hari) dipegang
    // repository; filter hanya membuang, tidak mengubah urutan.
    const timed = createFixtureWorkEntry({
      id: "f-timed",
      status: "in_progress",
      isAllDay: false,
      startsAt: "2026-03-10T01:00:00.000Z",
    });
    const entries = [timed, planned, running];
    expect(filterWorkEntriesByStatus(entries, "in_progress", today)).toEqual([timed, running]);
  });

  it("menghitung jumlah yang cocok tanpa mengubah daftar", () => {
    const entries = [planned, running, done, blocked, overdue];
    expect(countWorkEntriesByStatusFilter(entries, "all", today)).toBe(5);
    expect(countWorkEntriesByStatusFilter(entries, "attention", today)).toBe(2);
    expect(countWorkEntriesByStatusFilter(entries, "in_progress", today)).toBe(1);
  });

  it("menerima input sebagian untuk kompatibilitas predikat overdue", () => {
    expect(
      matchesWorkCalendarStatusFilter(
        { status: "planned", workDate: "2026-03-09", dueDate: null },
        "attention",
        today,
      ),
    ).toBe(true);
    expect(
      matchesWorkCalendarStatusFilter(
        { status: "planned", workDate: "2026-03-10", dueDate: null },
        "attention",
        today,
      ),
    ).toBe(false);
  });

  it("mengembalikan label default untuk nilai tak dikenal", () => {
    expect(
      getWorkCalendarStatusFilterLabel("unknown" as WorkCalendarStatusFilter),
    ).toBe("Semua");
  });
});
