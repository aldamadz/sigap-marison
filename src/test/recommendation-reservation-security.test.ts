import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260721183000_fix_recommendation_reservation_actor.sql"),
  "utf8",
);

describe("recommendation number reservation", () => {
  it("reserves the child document number with the authenticated parent requester", () => {
    expect(migration).toContain("v_actor uuid := auth.uid()");
    expect(migration).toMatch(
      /generate_new_letter_number\([\s\S]*?v_entity_id,[\s\S]*?v_letter_type_id,[\s\S]*?v_office_id,[\s\S]*?null,[\s\S]*?v_actor,[\s\S]*?v_department_id[\s\S]*?\)/,
    );
    expect(migration).not.toMatch(
      /generate_new_letter_number\([\s\S]*?v_office_id,[\s\S]*?null,[\s\S]*?null,[\s\S]*?v_department_id[\s\S]*?\)/,
    );
  });

  it("selects only the reservation created for the current actor", () => {
    expect(migration).toContain("and reservation.reserved_by = v_actor");
  });
});
