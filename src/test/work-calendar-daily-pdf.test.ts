import { describe, expect, it, vi } from "vitest";
import { collectWorkCalendarPdfRows, formatWorkCalendarReportDate, type ExportWorkCalendarPdfInput } from "@/features/work-calendar/lib/work-calendar-pdf";
import { DEFAULT_WORK_CALENDAR_WORK_SETTINGS } from "@/features/work-calendar/lib/work-day-config";
import { createFixtureWorkEntry, WORK_CALENDAR_FIXTURE_CURRENT_USER } from "@/features/work-calendar/testing/work-calendar-fixtures";
import type { WorkEntry, WorkEntryEvent, WorkEntryStatus } from "@/features/work-calendar/types/work-calendar";

const at = (date: string, time: string) => `${date}T${time}:00+07:00`;
const owner = WORK_CALENDAR_FIXTURE_CURRENT_USER;
const makeEntry = (patch: Partial<WorkEntry> = {}) => createFixtureWorkEntry({
  id: "historical", workDate: "2026-10-08", createdAt: at("2026-10-08", "08:00"),
  status: "completed", completedAt: at("2026-10-09", "11:00"), realization: "Hasil terbaru Jumat", ...patch,
});
function event(entry: WorkEntry, id: string, date: string, time: string, from: WorkEntryStatus | null, to: WorkEntryStatus, detail: string | null = null): WorkEntryEvent {
  return { id, entryId: entry.id, ownerId: entry.ownerId, type: from === null ? "created" : "status_changed",
    fromStatus: from, toStatus: to, fromWorkDate: null, toWorkDate: null, fromDueDate: null, toDueDate: null,
    detail, actorId: entry.ownerId, createdAt: at(date, time) };
}
const history = (entry: WorkEntry) => [
  event(entry, "created", "2026-10-08", "08:00", null, "planned"),
  event(entry, "start", "2026-10-08", "09:00", "planned", "in_progress"),
  event(entry, "finish", "2026-10-09", "11:00", "in_progress", "completed", "Hasil Jumat"),
];
function input(entry: WorkEntry, events = history(entry), patch: Partial<ExportWorkCalendarPdfInput> = {}): ExportWorkCalendarPdfInput {
  return { entries: [entry], owner, repository: { listEntryEvents: vi.fn(async () => events) },
    settings: DEFAULT_WORK_CALENDAR_WORK_SETTINGS, holidays: [], fromDate: "2026-10-08", toDate: "2026-10-08",
    now: new Date(at("2026-10-12", "18:00")), ...patch };
}

describe("historical daily calendar PDF", () => {
  it("keeps Thursday in progress despite Friday completion, without Friday result or end", async () => {
    const entry = makeEntry();
    const [row] = await collectWorkCalendarPdfRows(input(entry));
    expect(row).toMatchObject({ reportDate: "2026-10-08", statusKnown: true,
      entry: { status: "in_progress", realization: null, completedAt: null },
      timing: { startsAt: new Date(at("2026-10-08", "09:00")).toISOString(), endsAt: null, durationMinutes: 420, reason: null } });
    expect(entry.status).toBe("completed");
  });
  it("shows Friday completion, only Friday active times and its recorded result", async () => {
    const entry = makeEntry();
    const [row] = await collectWorkCalendarPdfRows(input(entry, history(entry), { fromDate: "2026-10-09", toDate: "2026-10-09" }));
    expect(row).toMatchObject({ reportDate: "2026-10-09", entry: { status: "completed", realization: "Hasil Jumat" },
      timing: { startsAt: new Date(at("2026-10-09", "08:00")).toISOString(), endsAt: new Date(at("2026-10-09", "11:00")).toISOString(), durationMinutes: 180 } });
  });
  it("preserves the first day's actual early start while applying office hours to duration", async () => {
    const entry = makeEntry({ createdAt: at("2026-10-08", "06:00") });
    const events = [event(entry, "created", "2026-10-08", "06:00", null, "planned"),
      event(entry, "start", "2026-10-08", "07:00", "planned", "in_progress"), history(entry)[2]];
    const [row] = await collectWorkCalendarPdfRows(input(entry, events));
    expect(row.timing).toMatchObject({ startsAt: new Date(at("2026-10-08", "07:00")).toISOString(), durationMinutes: 480, endsAt: null });
  });
  it("splits week/month into daily rows and stops carrying after completion", async () => {
    const entry = makeEntry();
    const value = input(entry, history(entry), { toDate: "2026-10-12" });
    const rows = await collectWorkCalendarPdfRows(value);
    expect(rows.map(row => [row.reportDate, row.entry.status])).toEqual([["2026-10-08", "in_progress"], ["2026-10-09", "completed"]]);
    expect(value.repository.listEntryEvents).toHaveBeenCalledOnce();
  });
  it("preserves Friday's completed state even if it was reopened on Monday", async () => {
    const entry = makeEntry({ status: "in_progress", completedAt: null });
    const events = [...history(entry), event(entry, "reopen", "2026-10-12", "09:00", "completed", "in_progress")];
    const [row] = await collectWorkCalendarPdfRows(input(entry, events, { fromDate: "2026-10-09", toDate: "2026-10-09" }));
    expect(row.entry.status).toBe("completed");
    expect(row.timing.endsAt).toBe(new Date(at("2026-10-09", "11:00")).toISOString());
  });
  it("freezes blocked days and resumes after the block without reusing the original start", async () => {
    const entry = makeEntry();
    const events = [history(entry)[0], history(entry)[1], event(entry, "block", "2026-10-08", "10:00", "in_progress", "blocked", "Menunggu material"),
      event(entry, "resume", "2026-10-09", "10:00", "blocked", "in_progress"), history(entry)[2]];
    const rows = await collectWorkCalendarPdfRows(input(entry, events, { toDate: "2026-10-09" }));
    expect(rows[0]).toMatchObject({ entry: { status: "blocked", blockedReason: "Menunggu material" }, timing: { durationMinutes: 60, endsAt: null } });
    expect(rows[1].timing).toMatchObject({ startsAt: new Date(at("2026-10-09", "10:00")).toISOString(), durationMinutes: 60 });
  });
  it("does not show completion at exactly next-day midnight on the prior day", async () => {
    const entry = makeEntry({ completedAt: at("2026-10-09", "00:00") });
    const events = [history(entry)[0], history(entry)[1], event(entry, "midnight", "2026-10-09", "00:00", "in_progress", "completed")];
    const [row] = await collectWorkCalendarPdfRows(input(entry, events));
    expect(row.entry.status).toBe("in_progress");
    expect(row.timing.endsAt).toBeNull();
  });
  it("does not use current completed status when canonical history is absent or broken", async () => {
    const entry = makeEntry();
    for (const events of [[], [event(entry, "gap", "2026-10-08", "10:00", "blocked", "completed")]]) {
      const [row] = await collectWorkCalendarPdfRows(input(entry, events));
      expect(row.statusKnown).toBe(false);
      expect(row.entry.realization).toBeNull();
      expect(row.timing.endsAt).toBeNull();
      expect(row.timing.durationMs).toBeNull();
    }
  });
  it("does not invent a row before the task actually existed", async () => {
    const entry = makeEntry({ createdAt: at("2026-10-09", "08:00") });
    expect(await collectWorkCalendarPdfRows(input(entry))).toEqual([]);
  });
  it("retains a selected legacy carryover as unknown rather than silently dropping it", async () => {
    const entry = makeEntry();
    const [row] = await collectWorkCalendarPdfRows(input(entry, [], { fromDate: "2026-10-09", toDate: "2026-10-09" }));
    expect(row.statusKnown).toBe(false);
    expect(row.entry.realization).toBeNull();
    expect(row.timing.endsAt).toBeNull();
  });
  it("does not accept foreign history as historical status evidence", async () => {
    const entry = makeEntry();
    const [row] = await collectWorkCalendarPdfRows(input(entry, history(entry).map(value => ({ ...value, ownerId: "foreign" }))));
    expect(row.statusKnown).toBe(false);
    expect(row.timing.durationMs).toBeNull();
  });
  it("applies the status filter after historical projection, not to the latest state", async () => {
    const entry = makeEntry();
    expect(await collectWorkCalendarPdfRows(input(entry, history(entry), { statusFilter: "completed" }))).toEqual([]);
    expect(await collectWorkCalendarPdfRows(input(entry, history(entry), { statusFilter: "in_progress" }))).toHaveLength(1);
  });
  it("caps today's status and duration at download time", async () => {
    const entry = makeEntry();
    const [row] = await collectWorkCalendarPdfRows(input(entry, history(entry), {
      fromDate: "2026-10-09", toDate: "2026-10-09", now: new Date(at("2026-10-09", "10:00")),
    }));
    expect(row.entry.status).toBe("in_progress");
    expect(row.timing).toMatchObject({ durationMinutes: 120, endsAt: null });
  });
  it("keeps explicit times within the report date and deducts each day's break", async () => {
    const entry = makeEntry({ startsAt: at("2026-10-08", "11:00"), endsAt: at("2026-10-09", "14:00") });
    const events = [history(entry)[0], history(entry)[1], event(entry, "finish", "2026-10-09", "14:00", "in_progress", "completed")];
    const rows = await collectWorkCalendarPdfRows(input(entry, events, { toDate: "2026-10-09" }));
    expect(rows[0].timing).toMatchObject({ startsAt: new Date(at("2026-10-08", "11:00")).toISOString(), endsAt: null, durationMinutes: 720 });
    expect(rows[1].timing).toMatchObject({ startsAt: new Date(at("2026-10-09", "00:00")).toISOString(), endsAt: new Date(at("2026-10-09", "14:00")).toISOString(), durationMinutes: 780 });
  });
  it("formats Indonesian dates with zero-padded day numbers", () => {
    expect(formatWorkCalendarReportDate("2026-10-09")).toBe("Jumat, 09 Oktober 2026");
    expect(() => formatWorkCalendarReportDate("2026-02-30")).toThrow();
  });
});
