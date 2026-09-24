import { describe, expect, it } from "vitest";
import { resolveWorkCalendarAvailability } from "@/lib/feature-availability";

describe("resolveWorkCalendarAvailability", () => {
  it("defaults to enabled so local and staging builds retain the tested calendar", () => {
    expect(resolveWorkCalendarAvailability(undefined)).toBe("enabled");
    expect(resolveWorkCalendarAvailability("true")).toBe("enabled");
  });

  it("disables only an explicit false production build flag", () => {
    expect(resolveWorkCalendarAvailability("false")).toBe("disabled");
    expect(resolveWorkCalendarAvailability(" FALSE ")).toBe("disabled");
  });
});
