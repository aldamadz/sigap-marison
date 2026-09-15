import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAutomaticStatus } from "@/lib/utils";
import type { Agenda, AgendaStatus } from "@/types/agenda";

/**
 * Frozen behavior contract for automatic status calculation (CAL-03A).
 *
 * This behavior must survive the Unified Work Calendar redesign even though the
 * implementation currently lives in `src/lib/utils.ts` and will move to the
 * work-calendar domain in CAL-03B/C. This test is pure: no network, no DB.
 */
const makeAgenda = (overrides: Partial<Agenda> & { status?: AgendaStatus }): Agenda => ({
  id: 1,
  title: "Rapat tim",
  description: null,
  location: null,
  status: "Scheduled",
  startTime: "2026-07-30T09:00:00.000Z",
  endTime: "2026-07-30T10:00:00.000Z",
  createdBy: "user-1",
  ...overrides,
});

describe("work calendar automatic status contract", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps final statuses untouched", () => {
    expect(
      getAutomaticStatus(
        makeAgenda({
          status: "Completed",
          startTime: "2026-07-30T01:00:00.000Z",
          endTime: "2026-07-30T02:00:00.000Z",
        }),
      ),
    ).toBe("Completed");
    expect(getAutomaticStatus(makeAgenda({ status: "Deleted" }))).toBe("Deleted");
  });

  it("maps future, in-window, and past entries", () => {
    expect(
      getAutomaticStatus(
        makeAgenda({
          startTime: "2026-07-30T11:00:00.000Z",
          endTime: "2026-07-30T12:00:00.000Z",
        }),
      ),
    ).toBe("Scheduled");

    expect(
      getAutomaticStatus(
        makeAgenda({
          startTime: "2026-07-30T09:00:00.000Z",
          endTime: "2026-07-30T11:00:00.000Z",
        }),
      ),
    ).toBe("Ongoing");

    expect(
      getAutomaticStatus(
        makeAgenda({
          startTime: "2026-07-30T07:00:00.000Z",
          endTime: "2026-07-30T08:00:00.000Z",
        }),
      ),
    ).toBe("Overdue");
  });

  it("assumes a one hour duration when end time is absent", () => {
    // start 09:30Z + 60m => 10:30Z, "now" 10:00Z is inside the window.
    expect(
      getAutomaticStatus(makeAgenda({ startTime: "2026-07-30T09:30:00.000Z", endTime: undefined })),
    ).toBe("Ongoing");

    // start 08:00Z + 60m => 09:00Z, "now" 10:00Z is past the window.
    expect(
      getAutomaticStatus(makeAgenda({ startTime: "2026-07-30T08:00:00.000Z", endTime: undefined })),
    ).toBe("Overdue");
  });
});
