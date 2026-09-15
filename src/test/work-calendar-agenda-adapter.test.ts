import { describe, expect, it } from "vitest";
import { toDatabaseAgenda, toUIAgenda } from "@/adapters/agenda.adapter";
import type { Agenda } from "@/types/agenda";

/**
 * Ownership and field mapping contract (CAL-03A).
 *
 * The legacy adapter file will be replaced, but the mapping contract must hold:
 * database snake_case `created_by` maps to UI `createdBy`, and every field
 * survives a round trip without leaking `undefined` into a write payload.
 */
describe("work calendar agenda mapping contract", () => {
  it("maps database ownership and snake_case fields to the UI shape", () => {
    const ui = toUIAgenda({
      id: 5,
      title: "Rapat tim",
      description: "Hasil",
      location: "Ruang rapat",
      status: "Ongoing",
      start_time: "2026-07-30T01:00:00.000Z",
      end_time: "2026-07-30T02:00:00.000Z",
      created_by: "user-1",
      completed_at: null,
      deleted_at: null,
      created_at: "2026-07-29T00:00:00.000Z",
    });

    expect(ui.id).toBe(5);
    expect(ui.createdBy).toBe("user-1");
    expect(ui.startTime).toBe("2026-07-30T01:00:00.000Z");
    expect(ui.endTime).toBe("2026-07-30T02:00:00.000Z");
    expect(ui.status).toBe("Ongoing");
    expect(ui.title).toBe("Rapat tim");
  });

  it("applies safe defaults for missing title and status", () => {
    const ui = toUIAgenda({ id: 6, created_by: "user-2" });

    expect(ui.title).toBe("Tanpa Judul");
    expect(ui.status).toBe("Scheduled");
  });

  it("keeps camelCase fallbacks when snake_case is absent", () => {
    const ui = toUIAgenda({
      id: 7,
      startTime: "2026-07-30T03:00:00.000Z",
      endTime: "2026-07-30T04:00:00.000Z",
      createdBy: "user-3",
    });

    expect(ui.startTime).toBe("2026-07-30T03:00:00.000Z");
    expect(ui.createdBy).toBe("user-3");
  });

  it("maps the UI shape back to database snake_case columns", () => {
    const partial: Partial<Agenda> = {
      title: "Rapat tim",
      description: null,
      status: "Completed",
      startTime: "2026-07-30T01:00:00.000Z",
      endTime: "2026-07-30T02:00:00.000Z",
      createdBy: "user-1",
      completedAt: "2026-07-30T02:05:00.000Z",
    };

    const db = toDatabaseAgenda(partial) as Record<string, unknown>;

    expect(db.title).toBe("Rapat tim");
    expect(db.created_by).toBe("user-1");
    expect(db.start_time).toBe("2026-07-30T01:00:00.000Z");
    expect(db.end_time).toBe("2026-07-30T02:00:00.000Z");
    expect(db.completed_at).toBe("2026-07-30T02:05:00.000Z");
    expect(db.status).toBe("Completed");
  });

  it("prunes undefined keys but keeps explicit nulls", () => {
    const db = toDatabaseAgenda({ title: "Hanya judul", description: null }) as Record<string, unknown>;

    expect(Object.prototype.hasOwnProperty.call(db, "location")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(db, "created_by")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(db, "description")).toBe(true);
    expect(db.description).toBeNull();
  });
});
