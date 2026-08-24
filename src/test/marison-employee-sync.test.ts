import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMarisonStagingEmail,
  canUseMarisonNameFallback,
  chooseProjectLocalCode,
  deduplicateMarisonEmployees,
  deriveMarisonOfficeType,
  executeMarisonBranchSync,
  marisonNikKey,
  normalizeMarisonNik,
  previewMarisonBranchSync,
} from "../../server/marison-employee-sync.mjs";

describe("Marison employee sync", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("normalizes NIK without changing its canonical display", () => {
    expect(normalizeMarisonNik("  a   114 ")).toBe("A 114");
    expect(marisonNikKey("A 114")).toBe("A114");
    expect(marisonNikKey("a114")).toBe("A114");
  });

  it("uses a readable staging email and a NIK suffix only for duplicate names", () => {
    const employee = { name: "Bima Arya Kurniawan", nik: "B 005" };
    expect(buildMarisonStagingEmail(employee)).toBe("bima.arya.kurniawan@staging.test");
    expect(buildMarisonStagingEmail(employee, true)).toBe("bima.arya.kurniawan.b005@staging.test");
  });

  it("does not merge employees who share a name but have different NIK", () => {
    expect(canUseMarisonNameFallback(
      { name: "Bima Arya Kurniawan", nik: "B 010" },
      { full_name: "Bima Arya Kurniawan", nik: "B 009" }
    )).toBe(false);
    expect(canUseMarisonNameFallback(
      { name: "Bima Arya Kurniawan", nik: "B 010" },
      { full_name: "Bima Arya Kurniawan", nik: null }
    )).toBe(true);
  });

  it("merges duplicate rows for the same person by choosing the richer record", () => {
    const result = deduplicateMarisonEmployees([
      { id: 1, nik: "Z 015", name: "Musthafa" },
      { id: 2, nik: "Z015", name: "Musthafa", division: "HRD & GA", branch: { id: 2, name: "Magelang" } },
    ]);
    expect(result.employees).toHaveLength(1);
    expect(result.employees[0].id).toBe(2);
    expect(result.mergedDuplicates).toHaveLength(1);
    expect(result.conflictingNik).toHaveLength(0);
  });

  it("keeps missing NIK for admin completion but blocks conflicting NIK", () => {
    const result = deduplicateMarisonEmployees([
      { id: 1, nik: null, name: "Tanpa NIK" },
      { id: 2, nik: "T 020", name: "Tengku" },
      { id: 3, nik: "T020", name: "Tokotest" },
    ]);
    expect(result.employees).toEqual([expect.objectContaining({ id: 1, name: "Tanpa NIK" })]);
    expect(result.missingNik).toHaveLength(1);
    expect(result.conflictingNik).toEqual([
      expect.objectContaining({ nik: "T 020", names: ["tengku", "tokotest"] }),
    ]);
  });

  it("derives office hierarchy conservatively from branch names", () => {
    expect(deriveMarisonOfficeType({ name: "Kantor Pusat" })).toBe("Pusat");
    expect(deriveMarisonOfficeType({ name: "KCP Magelang Selatan" })).toBe("KCP");
    expect(deriveMarisonOfficeType({ name: "Kantor Site Cibubur" })).toBe("Kost");
    expect(deriveMarisonOfficeType({ name: "Magelang" })).toBe("KC");
  });

  it("keeps projects with duplicate external codes as separate identities", () => {
    const projects = [{ id: "project-16", code: "MLO", marison_project_id: 16 }];
    expect(chooseProjectLocalCode("MLO", 16, projects, "project-16")).toBe("MLO");
    expect(chooseProjectLocalCode("MLO", 11, projects)).toBe("MLO-11");
    expect(chooseProjectLocalCode(null, 25, projects)).toBe("EXT-PROJECT-25");
  });

  it("resolves a conflicting staging row only when one name matches an existing profile", () => {
    const result = deduplicateMarisonEmployees([
      { id: 1, nik: "T 020", name: "Tengku Syaharani Nabila" },
      { id: 2, nik: "T020", name: "Tokotest" },
    ], { knownNames: ["Tengku Syaharani Nabila"] });
    expect(result.employees).toEqual([
      expect.objectContaining({ id: 1, name: "Tengku Syaharani Nabila" }),
    ]);
    expect(result.conflictingNik).toHaveLength(0);
    expect(result.resolvedConflicts).toHaveLength(1);
  });

  it("previews external branches as the canonical office source", async () => {
    const supabase = {
      from: (table: string) => {
        expect(table).toBe("master_offices");
        return {
          select: async () => ({
            data: [{
              id: "office-1",
              code: "LAMA",
              name: "Nama Lama",
              kedudukan: "KC",
              marison_branch_id: 10,
              marison_branch_code: "LAMA",
            }],
            error: null,
          }),
        };
      },
    };
    const result = await previewMarisonBranchSync({
      supabase,
      environment: "staging",
      branches: [
        { id: 10, code: "BARU", name: "Nama External" },
        { id: 11, code: "CBG", name: "Cabang Baru" },
      ],
    });

    expect(result).toEqual(expect.objectContaining({
      environment: "staging",
      source: 2,
      matched: 1,
      toCreate: 1,
      toUpdate: 1,
      blocked: 0,
    }));
  });

  it("applies external branch identity while preserving the SIGAP office UUID", async () => {
    const existing = {
      id: "office-1",
      code: "LAMA",
      name: "Nama Lama",
      kedudukan: "KCP",
      marison_branch_id: 10,
      marison_branch_code: "LAMA",
    };
    let applied: Record<string, unknown> | null = null;
    const supabase = {
      from: () => ({
        select: async () => ({ data: [existing], error: null }),
        update: (payload: Record<string, unknown>) => ({
          eq: () => ({
            select: () => ({
              single: async () => {
                applied = payload;
                return { data: { ...existing, ...payload }, error: null };
              },
            }),
          }),
        }),
      }),
    };

    const result = await executeMarisonBranchSync({
      supabase,
      environment: "staging",
      branches: [{ id: 10, code: "EXT", name: "Cabang External" }],
    });

    expect(result).toEqual(expect.objectContaining({ updated: 1, failed: 0 }));
    expect(applied).toEqual(expect.objectContaining({
      code: "EXT",
      name: "Cabang External",
      marison_branch_id: 10,
      marison_branch_code: "EXT",
    }));
    expect(applied).not.toHaveProperty("kedudukan");
    expect(applied).not.toHaveProperty("id");
  });

  it("keeps Master Kantor editable while syncing mapping through the server", () => {
    const server = read("backend/src/domain-runtime.ts");
    const page = read("src/pages/admin/OfficeManagementPage.tsx");
    const migration = read("supabase/migrations/20260725190000_hybrid_marison_master_sync.sql");

    expect(server).toContain("/api/integrations/marison/branches/preview");
    expect(server).toContain("/api/integrations/marison/branches/sync");
    expect(server).toContain('getAllMarisonCollection(marisonDeploymentEnvironment, "/branches")');
    expect(page).toContain("Sinkronkan External");
    expect(page).toContain("Tambah Kantor");
    expect(page).toContain('.from("master_offices").insert');
    expect(migration).toContain("create policy master_offices_admin_insert");
    expect(migration).toContain("create policy master_offices_admin_update");
    expect(migration).not.toContain("create policy master_offices_admin_delete");
  });

  it("keeps execution staging-only, admin-only, and server-side", () => {
    const server = read("backend/src/domain-runtime.ts");
    const client = read("src/services/marison-integration.service.ts");
    const dockerfile = read("dockerfile");

    expect(server).toContain("assertMarisonEmployeeSyncAvailable");
    expect(server).toContain("await requireAdminUser(getBearerToken(req))");
    expect(server).toContain("STAGING_DEFAULT_USER_PASSWORD");
    expect(server).toContain("marisonEmployeeSyncInFlight");
    expect(client).not.toContain("STAGING_DEFAULT_USER_PASSWORD");
    expect(client).not.toContain("marison123");
    expect(dockerfile).toContain(
      "COPY server/marison-employee-sync.mjs ./server/marison-employee-sync.mjs"
    );
    expect(dockerfile).toContain("COPY server/marison-asset-items.mjs ./server/marison-asset-items.mjs");
    expect(dockerfile).toContain("COPY server/file-view-token.mjs ./server/file-view-token.mjs");
    expect(dockerfile).toContain("COPY server/storage-coordinate.mjs ./server/storage-coordinate.mjs");
  });

  it("uses the synced office branch mapping for asset dispatch", () => {
    const server = read("backend/src/domain-runtime.ts");

    expect(server).toContain("const resolveMarisonBranchId = async");
    expect(server).not.toContain("supabaseAdmin");
    expect(server).toContain('.select("marison_branch_id, marison_synced_at")');
    expect(server).toContain("const resolveMarisonOfficeBranch = async");
    expect(server).toContain('entity_type", "office"');
  });

  it("recovers an orphan Auth user and always supplies a required job title", () => {
    const syncService = read("server/marison-employee-sync.mjs");

    expect(syncService).toContain("!profileIds.has(occupied.id)");
    expect(syncService).toContain("item.profile?.id || item.currentAuth?.id || null");
    expect(syncService).toContain('item.derivedJobTitle || existing.job_title || "Karyawan"');
    const existingAuthUpdate = syncService.slice(
      syncService.indexOf("const authUpdates = {"),
      syncService.indexOf("} else {", syncService.indexOf("const authUpdates = {")),
    );
    expect(existingAuthUpdate).not.toContain("password:");
  });
});
