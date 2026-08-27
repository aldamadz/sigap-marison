import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { executeMarisonBranchSync } from "../../server/marison-employee-sync.mjs";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("head office hierarchy review", () => {
  it("creates a synced head office without a parent or hierarchy confirmation warning", async () => {
    let inserted: Record<string, unknown> | null = null;
    const supabase = {
      from: () => ({
        select: async () => ({ data: [], error: null }),
        insert: (payload: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              inserted = payload;
              return { data: { id: "office-pusat", ...payload }, error: null };
            },
          }),
        }),
      }),
    };

    const result = await executeMarisonBranchSync({
      supabase,
      environment: "staging",
      branches: [{ id: 1, code: "KP", name: "Kantor Pusat" }],
    });

    expect(result).toEqual(expect.objectContaining({ created: 1, failed: 0 }));
    expect(inserted).toEqual(expect.objectContaining({
      kedudukan: "Pusat",
      parent_id: null,
      marison_hierarchy_confirmed: true,
    }));
  });

  it("keeps database and admin UI rules aligned", () => {
    const migration = read("supabase/migrations/20260827164440_head_office_without_parent_review.sql");
    const page = read("src/pages/admin/OfficeManagementPage.tsx");

    expect(migration).toContain("if new.kedudukan = 'Pusat' then");
    expect(migration).toContain("new.parent_id := null");
    expect(migration).toContain("new.marison_hierarchy_confirmed := true");
    expect(migration).toContain("new.kedudukan <> 'Pusat'");
    expect(migration).toContain("new.kedudukan in ('KCP', 'Kost')");
    expect(page).toContain('parent_id: value === "Pusat" ? "none" : form.parent_id');
    expect(page).toContain('form.kedudukan !== "Pusat"');
    expect(page).toContain('isHeadOffice || form.parent_id === "none" ? null : form.parent_id');
  });
});
