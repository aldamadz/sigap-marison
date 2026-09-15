import { describe, expect, it } from "vitest";
import { parseLocalDateInput } from "@/lib/local-date";

/**
 * Timezone contract for work calendar entries (CAL-03A).
 *
 * The work calendar must preserve the user's local wall-clock time. The legacy
 * implementation emits a local-offset ISO string (for example
 * `2026-07-30T08:30:00+07:00`) instead of UTC, so that a stored value reads back
 * as the same wall-clock time. CAL-03B must extract that helper into the
 * work-calendar domain and keep this contract; the local reference below mirrors
 * the current inline implementation in `CalendarPage.tsx` and
 * `AgendaDetailModal.tsx`.
 *
 * The contract is timezone independent: it only asserts that the emitted
 * wall-clock components match the local Date and that the epoch round-trips.
 */
const toLocalIso = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, "0");
  const tz = -date.getTimezoneOffset();
  const sign = tz >= 0 ? "+" : "-";
  const hh = pad(Math.floor(Math.abs(tz) / 60));
  const mm = pad(Math.abs(tz) % 60);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${hh}:${mm}`
  );
};

describe("work calendar timezone contract", () => {
  it("emits the local wall-clock components with an explicit offset", () => {
    const local = new Date(2026, 6, 30, 8, 30, 15);

    expect(toLocalIso(local)).toBe("2026-07-30T08:30:15" + toLocalIso(local).slice(19));
    expect(toLocalIso(local).slice(0, 19)).toBe("2026-07-30T08:30:15");
    expect(toLocalIso(local).slice(19)).toMatch(/^[+-]\d{2}:\d{2}$/);
  });

  it("round-trips to the same instant", () => {
    const samples = [
      new Date(2026, 0, 1, 0, 0, 0),
      new Date(2026, 6, 30, 8, 30, 15),
      new Date(2026, 11, 31, 23, 59, 59),
    ];

    for (const sample of samples) {
      expect(new Date(toLocalIso(sample)).getTime()).toBe(sample.getTime());
    }
  });

  it("parses stored dates as local calendar dates", () => {
    const date = parseLocalDateInput("2026-07-30");
    const legacyTimestamp = parseLocalDateInput("2026-07-30T00:00:00.000Z");

    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(6);
    expect(date?.getDate()).toBe(30);
    expect(legacyTimestamp?.getDate()).toBe(30);
  });

  it("keeps empty and invalid values unselected", () => {
    expect(parseLocalDateInput("")).toBeUndefined();
    expect(parseLocalDateInput("2026-02-31")).toBeUndefined();
    expect(parseLocalDateInput("30/07/2026")).toBeUndefined();
  });
});
