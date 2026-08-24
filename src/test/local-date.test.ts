import { describe, expect, it } from "vitest";
import { parseLocalDateInput } from "@/lib/local-date";

describe("parseLocalDateInput", () => {
  it("parses a stored date as a local calendar date", () => {
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
