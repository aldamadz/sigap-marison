import { describe, expect, it, vi } from "vitest";
import { jsPDF } from "jspdf";
import type { WorkEntry, WorkEntryEvent, WorkEntryStatus } from "@/features/work-calendar/types/work-calendar";
import { createFixtureWorkEntry, WORK_CALENDAR_FIXTURE_CURRENT_USER } from "@/features/work-calendar/testing/work-calendar-fixtures";
import { DEFAULT_WORK_CALENDAR_WORK_SETTINGS } from "@/features/work-calendar/lib/work-day-config";
import { calculateWorkEntryTiming, formatWorkEntryDuration, type WorkEntryTimingInput } from "@/features/work-calendar/lib/work-entry-timing";
import { buildWorkCalendarPdf, collectWorkCalendarPdfRows, exportWorkCalendarPdf, type ExportWorkCalendarPdfInput } from "@/features/work-calendar/lib/work-calendar-pdf";

const owner = WORK_CALENDAR_FIXTURE_CURRENT_USER;
const settings = DEFAULT_WORK_CALENDAR_WORK_SETTINGS;
const at = (time: string, date = "2026-03-10") => `${date}T${time}:00+07:00`;
const makeEntry = (patch: Partial<WorkEntry> = {}) => createFixtureWorkEntry({ id: "entry", status: "completed", ...patch });

function event(entry: WorkEntry, id: string, time: string, fromStatus: WorkEntryStatus | null, toStatus: WorkEntryStatus, date = "2026-03-10"): WorkEntryEvent {
  return {
    id, entryId: entry.id, ownerId: entry.ownerId, type: fromStatus === null ? "created" : "status_changed",
    fromStatus, toStatus, fromWorkDate: null, toWorkDate: null, fromDueDate: null, toDueDate: null,
    detail: null, actorId: entry.ownerId, createdAt: at(time, date),
  };
}

function timing(entry: WorkEntry, events: readonly WorkEntryEvent[], patch: Partial<WorkEntryTimingInput> = {}) {
  return calculateWorkEntryTiming({
    entry, events, settings, holidays: [], fromDate: "2026-03-10", toDate: "2026-03-10",
    now: new Date(at("18:00")), ...patch,
  });
}

function exportInput(entries: readonly WorkEntry[], patch: Partial<ExportWorkCalendarPdfInput> = {}): ExportWorkCalendarPdfInput {
  return {
    entries, owner, settings, holidays: [], fromDate: "2026-03-10", toDate: "2026-03-10",
    now: new Date(at("18:00")), repository: { listEntryEvents: vi.fn(async () => []) }, ...patch,
  };
}

function pdfStrings(doc: jsPDF): { bytes: Buffer; text: string } {
  const bytes = Buffer.from(doc.output("arraybuffer"));
  const source = bytes.toString("latin1");
  const text = [...source.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)]
    .map(match => match[1].replace(/\\([\\()])/g, "$1")).join(" ");
  return { bytes, text };
}

describe("canonical work entry timing", () => {
  it("counts in_progress, blocked pause, resume and completion, excluding office break", () => {
    const entry = makeEntry();
    const events = [event(entry, "1", "08:00", null, "in_progress"), event(entry, "2", "10:00", "in_progress", "blocked"),
      event(entry, "3", "11:00", "blocked", "in_progress"), event(entry, "4", "15:00", "in_progress", "completed")];
    const result = timing(entry, events);
    expect(result.durationMinutes).toBe(300);
    expect(result.startsAt).toBe(new Date(at("08:00")).toISOString());
    expect(result.endsAt).toBe(new Date(at("15:00")).toISOString());
    expect(result.source).toBe("automatic");
    expect(result.reason).toBeNull();
  });

  it("uses configured office hours/break, not defaults, and ignores entry createdAt", () => {
    const entry = makeEntry({ createdAt: at("05:00") });
    const result = timing(entry, [event(entry, "1", "07:00", null, "in_progress"), event(entry, "2", "19:00", "in_progress", "completed")], {
      now: new Date(at("20:00")), settings: { ...settings, workStart: "09:00", workEnd: "16:00", breakStart: "11:30", breakEnd: "12:30" },
    });
    expect(result.durationMinutes).toBe(360);
    expect(result.startsAt).toBe(new Date(at("07:00")).toISOString());
  });

  it("does not start from created/planned until the recorded transition to in_progress", () => {
    const entry = makeEntry();
    const result = timing(entry, [event(entry, "1", "08:00", null, "planned"), event(entry, "2", "10:00", "planned", "in_progress"), event(entry, "3", "11:00", "in_progress", "completed")]);
    expect(result.durationMinutes).toBe(60);
    expect(result.startsAt).toBe(new Date(at("10:00")).toISOString());
  });

  it("treats return to planned as a pause and reopening as another active segment", () => {
    const entry = makeEntry();
    const events = [event(entry, "1", "08:00", null, "in_progress"), event(entry, "2", "09:00", "in_progress", "planned"),
      event(entry, "3", "10:00", "planned", "in_progress"), event(entry, "4", "11:00", "in_progress", "completed"),
      event(entry, "5", "14:00", "completed", "in_progress"), event(entry, "6", "16:00", "in_progress", "completed")];
    expect(timing(entry, events).durationMinutes).toBe(240);
    expect(timing(entry, [...events].reverse())).toEqual(timing(entry, events));
    expect(timing(entry, events).endsAt).toBe(new Date(at("16:00")).toISOString());
  });

  it("excludes configured nonwork days and national/cuti holidays over multiple days", () => {
    const entry = makeEntry();
    const result = timing(entry, [event(entry, "1", "16:00", null, "in_progress", "2026-03-06"), event(entry, "2", "10:00", "in_progress", "completed", "2026-03-10")], {
      fromDate: "2026-03-06", holidays: [{ date: "2026-03-09", name: "Cuti", isCutiBersama: true }],
    });
    expect(result.durationMinutes).toBe(180);
  });

  it("clips active carryover to inclusive Jakarta export dates, not workDate", () => {
    const entry = makeEntry({ workDate: "2026-03-09" });
    const events = [event(entry, "1", "08:00", null, "in_progress", "2026-03-09"), event(entry, "2", "17:00", "in_progress", "completed", "2026-03-11")];
    const result = timing(entry, events, { now: new Date(at("18:00", "2026-03-11")) });
    expect(result.durationMinutes).toBe(480);
    expect(result.startsAt).toBe(new Date(at("08:00", "2026-03-09")).toISOString());
    expect(result.endsAt).toBe(new Date(at("17:00", "2026-03-11")).toISOString());
    expect(result.segments).toEqual([
      { startsAt: new Date(at("08:00")).toISOString(), endsAt: new Date(at("12:00")).toISOString() },
      { startsAt: new Date(at("13:00")).toISOString(), endsAt: new Date(at("17:00")).toISOString() },
    ]);
  });

  it.each(["in_progress", "blocked", "planned"] as const)("never fabricates an end for %s", status => {
    const entry = makeEntry({ status });
    const events = [event(entry, "1", "08:00", null, "in_progress")];
    if (status !== "in_progress") events.push(event(entry, "2", "10:00", "in_progress", status));
    const result = timing(entry, events, { now: new Date(at("11:00")) });
    expect(result.durationMinutes).toBe(status === "in_progress" ? 180 : 120);
    expect(result.endsAt).toBeNull();
  });

  it("forgets prior completion when reopened, and ignores transitions after fixed now", () => {
    const entry = makeEntry({ status: "in_progress", completedAt: at("09:00") });
    const events = [event(entry, "1", "08:00", null, "in_progress"), event(entry, "2", "09:00", "in_progress", "completed"),
      event(entry, "3", "10:00", "completed", "in_progress"), event(entry, "4", "16:00", "in_progress", "completed")];
    const result = timing(entry, events, { now: new Date(at("11:00")) });
    expect(result.durationMinutes).toBe(120);
    expect(result.endsAt).toBeNull();
  });

  it.each([
    { name: "mixed start", startsAt: at("08:00"), endsAt: null, source: "mixed" },
    { name: "mixed end", startsAt: null, endsAt: at("11:00"), source: "mixed" },
    { name: "manual", startsAt: at("08:00"), endsAt: at("11:00"), source: "explicit" },
  ])("excludes completed/reopened gaps from $name intervals", ({ startsAt, endsAt, source }) => {
    const entry = makeEntry({ startsAt, endsAt });
    const events = [event(entry, "1", "08:00", null, "in_progress"), event(entry, "2", "09:00", "in_progress", "completed"),
      event(entry, "3", "10:00", "completed", "in_progress"), event(entry, "4", "11:00", "in_progress", "completed")];
    const result = timing(entry, events);
    expect(result.durationMinutes).toBe(120);
    expect(result.source).toBe(source);
    expect(result.segments).toEqual([
      { startsAt: new Date(at("08:00")).toISOString(), endsAt: new Date(at("09:00")).toISOString() },
      { startsAt: new Date(at("10:00")).toISOString(), endsAt: new Date(at("11:00")).toISOString() },
    ]);
  });

  it("clips completed pauses to explicit bounds without discarding manual intervals without history", () => {
    const entry = makeEntry({ startsAt: at("08:30"), endsAt: at("10:30") });
    const events = [event(entry, "1", "08:00", null, "in_progress"), event(entry, "2", "09:00", "in_progress", "completed"),
      event(entry, "3", "10:00", "completed", "in_progress"), event(entry, "4", "11:00", "in_progress", "completed")];
    expect(timing(entry, events).durationMinutes).toBe(60);
    expect(timing(entry, []).durationMinutes).toBe(120);
  });

  it("clips a completion gap spanning the export boundary and adjoining planned/blocked pauses", () => {
    const entry = makeEntry({ startsAt: at("09:00", "2026-03-09"), endsAt: at("11:00") });
    const events = [event(entry, "1", "09:00", null, "in_progress", "2026-03-09"),
      event(entry, "2", "16:00", "in_progress", "completed", "2026-03-09"),
      event(entry, "3", "08:00", "completed", "planned"), event(entry, "4", "09:00", "planned", "blocked"),
      event(entry, "5", "10:00", "blocked", "in_progress"), event(entry, "6", "11:00", "in_progress", "completed")];
    expect(timing(entry, events).durationMinutes).toBe(60);
    expect(timing(entry, [...events].reverse()).segments).toEqual([
      { startsAt: new Date(at("10:00")).toISOString(), endsAt: new Date(at("11:00")).toISOString() },
    ]);
  });

  it("orders equal-time transitions by their causal statuses, deterministically", () => {
    const entry = makeEntry();
    const events = [event(entry, "z", "08:00", null, "planned"), event(entry, "y", "08:00", "planned", "in_progress"),
      event(entry, "x", "08:00", "in_progress", "blocked"), event(entry, "w", "08:00", "blocked", "in_progress"), event(entry, "a", "09:00", "in_progress", "completed")];
    expect(timing(entry, events).durationMinutes).toBe(60);
    expect(timing(entry, events)).toEqual(timing(entry, [...events].reverse()));
  });

  it("explicit manual boundaries take precedence, subtract known block/planned pauses", () => {
    const entry = makeEntry({ startsAt: at("07:00"), endsAt: at("18:00"), isAllDay: false });
    const events = [event(entry, "1", "08:00", null, "in_progress"), event(entry, "2", "10:00", "in_progress", "blocked"),
      event(entry, "3", "11:00", "blocked", "in_progress"), event(entry, "4", "14:00", "in_progress", "planned"),
      event(entry, "5", "15:00", "planned", "in_progress"), event(entry, "6", "17:00", "in_progress", "completed")];
    const result = timing(entry, events);
    expect(result.startsAt).toBe(new Date(at("07:00")).toISOString());
    expect(result.endsAt).toBe(new Date(at("18:00")).toISOString());
    expect(result.durationMinutes).toBe(480);
    expect(result.source).toBe("explicit");
  });

  it("complete manual legacy interval remains usable without history and is range-clipped", () => {
    const entry = makeEntry({ startsAt: at("23:00", "2026-03-09"), endsAt: at("01:00") });
    const result = timing(entry, []);
    expect(result.durationMinutes).toBe(60);
    expect(result.reason).toBeNull();
    expect(result.source).toBe("explicit");
  });

  it("deducts configured break from manual 11:00-14:00 too", () => {
    expect(timing(makeEntry({ startsAt: at("11:00"), endsAt: at("14:00") }), []).durationMinutes).toBe(120);
  });

  it("preserves manual overtime and holiday/weekend work, but deducts each day's break", () => {
    const entry = makeEntry({ startsAt: at("11:00", "2026-03-07"), endsAt: at("19:00", "2026-03-08") });
    const result = timing(entry, [], {
      fromDate: "2026-03-07", toDate: "2026-03-08", now: new Date(at("20:00", "2026-03-08")),
      holidays: [{ date: "2026-03-08", name: "Libur", isCutiBersama: false }],
    });
    expect(result.durationMinutes).toBe(30 * 60);
    expect(result.source).toBe("explicit");
  });

  it.each(["planned", "in_progress", "completed", "blocked"] as const)("legacy %s without history stays unknown", status => {
    const result = timing(makeEntry({ status, completedAt: at("17:00") }), []);
    expect(result.durationMs).toBeNull();
    expect(result.startsAt).toBeNull();
    expect(result.endsAt).toBeNull();
    expect(result.source).toBe("unknown");
    expect(formatWorkEntryDuration(result.durationMs)).toBe("Tidak diketahui");
  });

  it("a partial explicit legacy interval does not fabricate its missing boundary", () => {
    const entry = makeEntry({ startsAt: at("09:00") });
    expect(timing(entry, [])).toMatchObject({ startsAt: new Date(at("09:00")).toISOString(), endsAt: null, durationMs: null });
  });

  it("fills one missing boundary from canonical history and applies office rules", () => {
    const entry = makeEntry({ startsAt: at("07:00") });
    const result = timing(entry, [event(entry, "1", "09:00", null, "in_progress"), event(entry, "2", "15:00", "in_progress", "completed")]);
    expect(result.durationMinutes).toBe(360);
    expect(result.source).toBe("mixed");
    expect(result.startsAt).toBe(new Date(at("07:00")).toISOString());
    expect(result.endsAt).toBe(new Date(at("15:00")).toISOString());
  });

  it("accepts a real legacy planned -> in_progress start, not entry createdAt", () => {
    const entry = makeEntry();
    expect(timing(entry, [event(entry, "1", "10:00", "planned", "in_progress"), event(entry, "2", "11:00", "in_progress", "completed")]).durationMinutes).toBe(60);
  });

  it("missing initial active history and inconsistent current status stay unknown", () => {
    const entry = makeEntry();
    expect(timing(entry, [event(entry, "1", "11:00", "in_progress", "completed")])).toMatchObject({ durationMs: null, reason: "incomplete_history" });
    expect(timing(entry, [event(entry, "1", "08:00", null, "in_progress")])).toMatchObject({ durationMs: null, endsAt: null, reason: "snapshot_mismatch" });
  });

  it("ignores other entries/owners and schedule-only changes as timing sources", () => {
    const entry = makeEntry();
    const start = event(entry, "1", "08:00", null, "in_progress");
    expect(timing(entry, [{ ...start, ownerId: "other" }, { ...start, entryId: "other" }, { ...start, type: "schedule_changed" }]).durationMs).toBeNull();
  });

  it("invalid timestamps, reversed manual intervals, bad scope/settings fail honestly", () => {
    expect(timing(makeEntry({ startsAt: "2026-03-10T09:00:00", endsAt: at("10:00") }), []).durationMs).toBeNull();
    expect(timing(makeEntry({ startsAt: at("11:00"), endsAt: at("10:00") }), []).durationMs).toBeNull();
    expect(() => timing(makeEntry(), [], { fromDate: "2026-03-11" })).toThrow();
    expect(() => timing(makeEntry(), [], { fromDate: "2026-02-30" })).toThrow();
    expect(() => timing(makeEntry(), [], { settings: { ...settings, workEnd: "07:00" } })).toThrow();
    expect(() => timing(makeEntry(), [], { now: new Date("invalid") })).toThrow();
  });

  it("keeps supplied histories immutable and supports zero/count formatting", () => {
    const entry = makeEntry({ status: "planned" });
    const events = Object.freeze([Object.freeze(event(entry, "1", "08:00", null, "planned"))]);
    expect(timing(entry, events)).toMatchObject({ durationMs: 0, startsAt: null, endsAt: null });
    expect(formatWorkEntryDuration(5 * 3600000)).toBe("5 j 0 m");
    expect(formatWorkEntryDuration(0)).toBe("0 j 0 m");
  });
});

describe("work calendar PDF and history collection", () => {
  it("writes real PDF bytes with title, date, status, result and timing columns", () => {
    const entry = makeEntry({ title: "Audit operasional", realization: "Laporan terkirim", startsAt: at("09:00"), endsAt: at("10:00") });
    const doc = buildWorkCalendarPdf({ rows: [{ entry, timing: timing(entry, []), reportDate: "2026-03-10", statusKnown: true }], owner, fromDate: "2026-03-10", toDate: "2026-03-10", now: new Date(at("18:00")) });
    const { bytes, text } = pdfStrings(doc);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.toString("latin1")).toContain("%%EOF");
    for (const value of ["No", "Mulai", "Selesai", "Durasi", "Pekerjaan", "Tanggal", "Status", "Hasil", "Audit operasional", "Laporan terkirim", "09:00", "10:00", "1 j 0 m", "Selasa, 10 Maret 2026", "istirahat kantor", "waktu/riwayat belum memadai", owner.jobTitle]) expect(text).toContain(value);
    expect(text).not.toContain("Asia/Jakarta");
  });

  it("preserves every row across pages and wraps/splits a title and result longer than a page", () => {
    const entries = Array.from({ length: 65 }, (_, index) => makeEntry({ id: `row-${index}`, title: `ROW${index}BEGIN ${"Long title text ".repeat(index === 0 ? 600 : 12)} ROW${index}END`, realization: `RESULT${index}BEGIN ${"Result text ".repeat(index === 0 ? 600 : 1)} RESULT${index}END` }));
    const doc = buildWorkCalendarPdf({ rows: entries.map(entry => ({ entry, timing: timing(entry, []), reportDate: "2026-03-10", statusKnown: true })), owner, fromDate: "2026-03-10", toDate: "2026-03-10", now: new Date(at("18:00")) });
    expect(doc.getNumberOfPages()).toBeGreaterThan(2);
    const { text } = pdfStrings(doc);
    for (let index = 0; index < entries.length; index++) {
      for (const token of [`ROW${index}BEGIN`, `ROW${index}END`, `RESULT${index}BEGIN`, `RESULT${index}END`]) expect(text).toContain(token);
    }
    expect(text.match(/Halaman \d+ \/ \d+/g)).toHaveLength(doc.getNumberOfPages());
    expect(text.match(/Kalender Kerja/g)).toHaveLength(doc.getNumberOfPages());
    expect(text.match(/\bMulai\b/g)).toHaveLength(doc.getNumberOfPages());
  });

  it("bounds reads to four, preserves row order, and freezes entry/settings/now snapshot", async () => {
    const entries = Array.from({ length: 9 }, (_, index) => makeEntry({ id: `row-${index}`, status: "in_progress" }));
    const mutableSettings = { ...settings, workDays: [...settings.workDays] };
    const now = new Date(at("11:00"));
    const pending: Array<() => void> = [];
    let active = 0;
    let peak = 0;
    const listEntryEvents = vi.fn(({ entryId }: { entryId: string; signal?: AbortSignal }) => new Promise<readonly WorkEntryEvent[]>(resolve => {
      active++;
      peak = Math.max(peak, active);
      const entry = entries.find(value => value.id === entryId);
      if (!entry) throw new Error("Missing fixture");
      pending.push(() => { active--; resolve([event(entry, "created", "08:00", null, "in_progress")]); });
    }));
    const result = collectWorkCalendarPdfRows(exportInput(entries, { settings: mutableSettings, now, repository: { listEntryEvents } }));
    expect(listEntryEvents).toHaveBeenCalledTimes(4);
    entries[0].title = "Changed after click";
    entries[0].status = "completed";
    mutableSettings.workStart = "10:00";
    now.setTime(new Date(at("17:00")).getTime());
    while (pending.length) {
      pending.shift()?.();
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    const rows = await result;
    expect(peak).toBe(4);
    expect(rows.map(row => row.entry.id)).toEqual(entries.map(entry => entry.id));
    expect(rows[0].entry.title).not.toBe("Changed after click");
    expect(rows.every(row => row.timing.durationMinutes === 180)).toBe(true);
  });

  it("rejects mixed subordinate ownership before reads, even deleted foreign entries", async () => {
    const input = exportInput([makeEntry(), makeEntry({ id: "foreign", ownerId: "subordinate", deletedAt: at("10:00") })]);
    await expect(collectWorkCalendarPdfRows(input)).rejects.toThrow("Pemilik");
    expect(input.repository.listEntryEvents).not.toHaveBeenCalled();
    expect(() => buildWorkCalendarPdf({ rows: [{ entry: makeEntry({ ownerId: "subordinate" }), timing: timing(makeEntry(), []), reportDate: input.fromDate, statusKnown: true }], owner, fromDate: input.fromDate, toDate: input.toDate, now: input.now })).toThrow("Pemilik");
  });

  it("rejects pre-abort with no reads or saves", async () => {
    const controller = new AbortController();
    controller.abort();
    const input = exportInput([makeEntry()], { signal: controller.signal });
    await expect(exportWorkCalendarPdf(input)).rejects.toMatchObject({ name: "AbortError" });
    expect(input.repository.listEntryEvents).not.toHaveBeenCalled();
  });

  it("cancels promptly even when the repository ignores its abort signal", async () => {
    const controller = new AbortController();
    const listEntryEvents = vi.fn(() => new Promise<readonly WorkEntryEvent[]>(() => {}));
    const result = collectWorkCalendarPdfRows(exportInput([makeEntry()], { signal: controller.signal, repository: { listEntryEvents } }));
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(listEntryEvents.mock.calls).toHaveLength(1);
  });

  it("one failed read aborts siblings, starts no extra reads and produces no partial file", async () => {
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click");
    let calls = 0;
    const signals: AbortSignal[] = [];
    const readError = new Error("History failed");
    const listEntryEvents = vi.fn(({ signal }: { entryId: string; signal?: AbortSignal }) => {
      if (signal) signals.push(signal);
      calls++;
      return calls === 2 ? Promise.reject(readError) : new Promise<readonly WorkEntryEvent[]>(() => {});
    });
    await expect(exportWorkCalendarPdf(exportInput(Array.from({ length: 8 }, (_, index) => makeEntry({ id: `entry-${index}` })), { repository: { listEntryEvents } }))).rejects.toBe(readError);
    expect(calls).toBe(4);
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(download).not.toHaveBeenCalled();
    download.mockRestore();
  });

  it("does not replace absent history with estimates; convenience exporter returns unsaved PDF", async () => {
    const doc = await exportWorkCalendarPdf(exportInput([makeEntry()]));
    expect(pdfStrings(doc).bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdfStrings(doc).text).toContain("Tidak diketahui");
  });

  it("rejects duplicate entries and invalid scope before repository work", async () => {
    const entry = makeEntry();
    const input = exportInput([entry, entry]);
    await expect(collectWorkCalendarPdfRows(input)).rejects.toThrow("duplikat");
    expect(input.repository.listEntryEvents).not.toHaveBeenCalled();
    await expect(collectWorkCalendarPdfRows(exportInput([entry], { settings: { ...settings, breakStart: "invalid" } }))).rejects.toThrow();
  });
});
