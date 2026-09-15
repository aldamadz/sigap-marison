import { describe, expect, it } from "vitest";
import { agendaSchema } from "@/types/agenda";
import type { AgendaStatus } from "@/types/agenda";

/**
 * Frozen validation contract for work entry forms (CAL-03A).
 *
 * The target CAL-03 entry form keeps title, start, and end validation while the
 * schema file moves to the work-calendar domain. Pure: no network, no DB.
 */
const validEntry = {
  title: "Rapat tim",
  description: "",
  location: "",
  startTime: "2026-07-30T08:00",
  endTime: "2026-07-30T09:00",
  status: "Scheduled" as AgendaStatus,
};

describe("work calendar form schema contract", () => {
  it("accepts a valid entry and defaults status to Scheduled", () => {
    const parsed = agendaSchema.safeParse({
      title: "Rapat tim",
      startTime: "2026-07-30T08:00",
      endTime: "2026-07-30T09:00",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe("Scheduled");
    }
  });

  it("rejects titles shorter than three characters", () => {
    expect(agendaSchema.safeParse({ ...validEntry, title: "ab" }).success).toBe(false);
  });

  it("requires end time to be after start time", () => {
    const parsed = agendaSchema.safeParse({
      ...validEntry,
      startTime: "2026-07-30T10:00",
      endTime: "2026-07-30T09:00",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path[0] === "endTime")).toBe(true);
    }
  });

  it("rejects a status outside the agenda enum", () => {
    expect(
      agendaSchema.safeParse({ ...validEntry, status: "Unknown" as AgendaStatus }).success,
    ).toBe(false);
  });
});
