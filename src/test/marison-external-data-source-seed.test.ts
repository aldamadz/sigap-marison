import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260826100000_seed_marison_external_data_sources.sql",
), "utf8");

describe("Marison external data source seed", () => {
  it.each([
    "marison_projects",
    "marison_units_by_project",
    "marison_non_units_by_project",
    "marison_branches",
    "marison_employees",
  ])("seeds the canonical %s source", (sourceKey) => {
    expect(migration).toContain(`'${sourceKey}'`);
  });

  it("is idempotent and preserves environment-specific base URLs", () => {
    expect(migration).toContain("on conflict (source_key) do update");
    expect(migration).not.toMatch(/set[\s\S]*base_url\s*=\s*excluded\.base_url/i);
  });

  it("keeps project-dependent endpoint placeholders canonical", () => {
    expect(migration).toContain("/unit?project_id={project_id}&per_page=100");
    expect(migration).toContain("/non-unit?project_id={project_id}&per_page=100");
  });
});
