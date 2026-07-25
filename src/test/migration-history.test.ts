import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";

describe("Supabase migration history", () => {
  it("uses one unique timestamp for every migration", () => {
    const migrations = readdirSync(join(process.cwd(), "supabase/migrations"))
      .filter((filename) => filename.endsWith(".sql"));
    const timestamps = migrations.map((filename) => filename.slice(0, 14));
    const duplicates = timestamps.filter((timestamp, index) => timestamps.indexOf(timestamp) !== index);

    expect([...new Set(duplicates)]).toEqual([]);
  });
});
