import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useWorkCalendarView } from "@/features/work-calendar/hooks/use-work-calendar-view";
import { createWorkTeamOverviewFilters } from "@/features/work-calendar/lib/work-team-overview";
import {
  isWorkEntryVisibleInRange,
  isWorkEntryVisibleOnDate,
  selectWorkEntriesForDate,
} from "@/features/work-calendar/lib/work-entry-carryover";
import { buildWorkCalendarDayCells, buildWorkCalendarDaySummaries } from "@/features/work-calendar/lib/work-progress";
import { isWorkEntryOverdue } from "@/features/work-calendar/lib/work-entry-status";
import {
  createFixtureWorkEntry,
  createFixtureWorkEntryRepository,
  createFixtureWorkTeamOverviewRepository,
} from "@/features/work-calendar/testing/work-calendar-fixtures";

const today = "2026-03-10";
const dates = ["2026-03-08", "2026-03-09", today, "2026-03-11"];

describe("work calendar carry-forward", () => {
  it.each(["planned", "in_progress", "blocked"] as const)("projects %s through today without mutating identity or schedule", (status) => {
    const entry = createFixtureWorkEntry({ status, workDate: dates[0] });
    const before = { ...entry };
    const summaries = buildWorkCalendarDaySummaries([entry, entry], dates, today);
    expect(summaries.map((day) => day.progress.total)).toEqual([1, 1, 1, 0]);
    for (const day of summaries.slice(0, 3)) {
      expect(day.entries[0]).toBe(entry);
      expect(day.progress.overdue).toBe(0);
    }
    expect(entry).toEqual(before);
    expect(isWorkEntryVisibleOnDate(entry, "2026-03-07", today)).toBe(false);
  });

  it("keeps completed work on its original day and every day through completion (WIB)", () => {
    const entry = createFixtureWorkEntry({
      status: "completed", workDate: dates[0], completedAt: "2026-03-08T17:00:00.000Z",
    });
    expect(buildWorkCalendarDayCells([entry], dates, today, 3).map((day) => day.progress.completed))
      .toEqual([1, 1, 0, 0]);
    expect(isWorkEntryVisibleOnDate(entry, dates[0], "2026-03-20")).toBe(true);
    expect(isWorkEntryVisibleInRange(entry, "2026-03-09", today, today)).toBe(true);
    expect(isWorkEntryVisibleInRange(entry, today, "2026-03-11", today)).toBe(false);
  });

  it("includes completion day, but never projects past today even with a future completion timestamp", () => {
    const completed = createFixtureWorkEntry({ status: "completed", workDate: dates[0], completedAt: "2026-03-10T01:00:00.000Z" });
    expect(selectWorkEntriesForDate([completed], today, today)).toEqual([completed]);
    expect(selectWorkEntriesForDate([completed], "2026-03-11", today)).toEqual([]);
    const futureCompletion = { ...completed, completedAt: "2026-03-12T01:00:00.000Z" };
    expect(isWorkEntryVisibleOnDate(futureCompletion, "2026-03-11", today)).toBe(false);
  });

  it.each([null, "invalid"])("does not invent completion history for completedAt=%s", (completedAt) => {
    const entry = createFixtureWorkEntry({ status: "completed", workDate: dates[0], completedAt });
    expect(selectWorkEntriesForDate([entry], dates[0], today)).toEqual([entry]);
    expect(selectWorkEntriesForDate([entry], today, today)).toEqual([]);
  });

  it.each(["event", "availability"] as const)("never carries %s", (kind) => {
    const entry = createFixtureWorkEntry({ kind, workDate: dates[0] });
    expect(buildWorkCalendarDaySummaries([entry], dates, today).map((day) => day.progress.total)).toEqual([1, 0, 0, 0]);
  });

  it("preserves a future original date but hides deleted work and does not backfill before workDate", () => {
    const future = createFixtureWorkEntry({ workDate: "2026-03-11" });
    expect(selectWorkEntriesForDate([future], "2026-03-11", today)).toEqual([future]);
    expect(selectWorkEntriesForDate([future], today, today)).toEqual([]);
    const deleted = createFixtureWorkEntry({ workDate: dates[0], deletedAt: "2026-03-09T00:00:00Z" });
    expect(dates.some((date) => isWorkEntryVisibleOnDate(deleted, date, today))).toBe(false);
  });

  it("carries across month/year boundaries and weekends without expanding overdue semantics", () => {
    const entry = createFixtureWorkEntry({ workDate: "2025-12-31", dueDate: null });
    expect(isWorkEntryVisibleInRange(entry, "2026-03-01", today, today)).toBe(true);
    expect(isWorkEntryVisibleOnDate(entry, "2026-03-08", today)).toBe(true);
    expect(isWorkEntryOverdue(entry, today)).toBe(false);
    expect(isWorkEntryOverdue({ ...entry, dueDate: today }, today)).toBe(false);
    expect(isWorkEntryOverdue({ ...entry, dueDate: "2026-03-09" }, today)).toBe(true);
  });

  it("uses the same projection for fixture queries, scoped to the owner and authorized rows", async () => {
    const unfinished = createFixtureWorkEntry({ id: "old", workDate: "2025-12-31", ownerId: "me" });
    const completed = createFixtureWorkEntry({ id: "done", workDate: dates[0], ownerId: "me", status: "completed", completedAt: "2026-03-09T18:00:00Z" });
    const repository = createFixtureWorkEntryRepository([
      unfinished, completed,
      createFixtureWorkEntry({ id: "other", ownerId: "other", workDate: dates[0] }),
      createFixtureWorkEntry({ id: "event", kind: "event", ownerId: "me", workDate: dates[0] }),
    ], { authorizedOwnerIds: ["me"] });
    const result = await repository.listEntries({ ownerId: "me", fromDate: today, toDate: today, today });
    expect(result.map((entry) => entry.id)).toEqual(["old", "done"]);
    expect(result[0]).toBe(unfinished);
    expect(await repository.listEntries({ ownerId: "other", fromDate: today, toDate: today, today })).toEqual([]);
    expect(await repository.listEntries({ ownerId: "me", fromDate: "2026-03-11", toDate: "2026-03-11", today })).toEqual([]);
    expect(await repository.listEntryEvents({ entryId: "old" })).toHaveLength(1);
  });

  it("fixture completion/reopening mirrors server completion metadata without rescheduling", async () => {
    const entry = createFixtureWorkEntry({ id: "task", workDate: dates[0] });
    const repository = createFixtureWorkEntryRepository([entry]);
    const completed = await repository.updateEntry({ entryId: entry.id, expectedUpdatedAt: entry.updatedAt, patch: { status: "completed", realization: "Done" } });
    expect(completed.completedAt).not.toBeNull();
    expect(completed.workDate).toBe(dates[0]);
    const reopened = await repository.updateEntry({ entryId: entry.id, expectedUpdatedAt: completed.updatedAt, patch: { status: "planned" } });
    expect(reopened.completedAt).toBeNull();
    expect(reopened.realization).toBeNull();
    expect((await repository.listEntryEvents({ entryId: entry.id })).map((event) => event.type))
      .toEqual(["created", "status_changed", "status_changed"]);
  });

  it("keeps team fixture overview, lazy detail and explicit-deadline filtering consistent", async () => {
    const ownerId = "user-bawahan-1";
    const seed = [
      createFixtureWorkEntry({ id: "no-deadline", ownerId, workDate: dates[0] }),
      createFixtureWorkEntry({ id: "deadline", ownerId, workDate: dates[0], dueDate: dates[0] }),
      createFixtureWorkEntry({ id: "done", ownerId, workDate: dates[0], status: "completed", completedAt: "2026-03-10T01:00:00Z" }),
    ];
    const repository = createFixtureWorkTeamOverviewRepository(seed, { today });
    const input = { filters: createWorkTeamOverviewFilters(today), page: 1, pageSize: 25, sort: "priority" as const };
    expect((await repository.listTeamOverview(input)).aggregate).toMatchObject({ total: 3, completed: 1, overdue: 1 });
    expect((await repository.listTeamMemberEntries({ memberId: ownerId, date: today })).map((entry) => entry.id).sort()).toEqual(["deadline", "done", "no-deadline"]);
    const overdueOnly = await repository.listTeamOverview({ ...input, filters: { ...input.filters, status: "overdue" } });
    expect(overdueOnly.aggregate).toMatchObject({ total: 1, completed: 0, overdue: 1 });
    expect(overdueOnly.members).toHaveLength(1);
    expect(await repository.listTeamMemberEntries({ memberId: ownerId, date: "2026-03-11" })).toEqual([]);
  });

  it("passes the reference day to the repository and reloads at WIB midnight and tab focus", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-09T16:59:59.900Z"));
    const repository = createFixtureWorkEntryRepository([createFixtureWorkEntry({ workDate: dates[0] })]);
    const list = vi.spyOn(repository, "listEntries");
    const hook = renderHook(() => useWorkCalendarView({ repository, currentUserId: "user-current", initialAnchorDate: today }));
    try {
      await act(async () => {});
      expect(hook.result.current.today).toBe("2026-03-09");
      expect(hook.result.current.entries).toEqual([]);
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ today: "2026-03-09" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      expect(hook.result.current.today).toBe(today);
      expect(hook.result.current.entries).toHaveLength(1);
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ today }));
      vi.setSystemTime(new Date("2026-03-11T01:00:00Z"));
      await act(async () => { window.dispatchEvent(new Event("focus")); });
      expect(hook.result.current.today).toBe("2026-03-11");
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ today: "2026-03-11" }));
    } finally {
      hook.unmount();
      vi.useRealTimers();
    }
  });
});
