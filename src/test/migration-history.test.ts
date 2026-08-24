import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const migrationNamePattern = /^(\d{14})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;

const validateMigrationNames = (filenames: string[]) => {
  const invalidNames: string[] = [];
  const invalidTimestamps: string[] = [];
  const namesByTimestamp = new Map<string, string[]>();

  for (const filename of filenames) {
    const match = migrationNamePattern.exec(filename);
    if (!match) {
      invalidNames.push(filename);
      continue;
    }

    const timestamp = match[1];
    const year = Number(timestamp.slice(0, 4));
    const month = Number(timestamp.slice(4, 6));
    const day = Number(timestamp.slice(6, 8));
    const hour = Number(timestamp.slice(8, 10));
    const minute = Number(timestamp.slice(10, 12));
    const second = Number(timestamp.slice(12, 14));
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    const roundTrip = [
      date.getUTCFullYear().toString().padStart(4, "0"),
      (date.getUTCMonth() + 1).toString().padStart(2, "0"),
      date.getUTCDate().toString().padStart(2, "0"),
      date.getUTCHours().toString().padStart(2, "0"),
      date.getUTCMinutes().toString().padStart(2, "0"),
      date.getUTCSeconds().toString().padStart(2, "0"),
    ].join("");

    if (roundTrip !== timestamp) invalidTimestamps.push(filename);
    namesByTimestamp.set(timestamp, [...(namesByTimestamp.get(timestamp) || []), filename]);
  }

  const collisions = [...namesByTimestamp.values()].filter((names) => names.length > 1);
  return { invalidNames, invalidTimestamps, collisions };
};

describe("Supabase migration history", () => {
  it("uses valid filenames and one unique timestamp for every migration", () => {
    const migrations = readdirSync(join(process.cwd(), "supabase/migrations"))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();

    expect(validateMigrationNames(migrations)).toEqual({
      invalidNames: [],
      invalidTimestamps: [],
      collisions: [],
    });
  });

  it("reports malformed names, invalid dates, and all colliding filenames", () => {
    expect(validateMigrationNames([
      "20260707113000_first.sql",
      "20260707113000_second.sql",
      "20261301120000_invalid_month.sql",
      "2026070712000_short_timestamp.sql",
      "20260707120000_Uppercase.sql",
    ])).toEqual({
      invalidNames: ["2026070712000_short_timestamp.sql", "20260707120000_Uppercase.sql"],
      invalidTimestamps: ["20261301120000_invalid_month.sql"],
      collisions: [["20260707113000_first.sql", "20260707113000_second.sql"]],
    });
  });
});
