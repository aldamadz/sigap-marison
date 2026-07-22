import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMarisonStagingEmail,
  deduplicateMarisonEmployees,
  marisonNikKey,
  normalizeMarisonNik,
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

  it("blocks missing and conflicting NIK instead of creating ambiguous accounts", () => {
    const result = deduplicateMarisonEmployees([
      { id: 1, nik: null, name: "Tanpa NIK" },
      { id: 2, nik: "T 020", name: "Tengku" },
      { id: 3, nik: "T020", name: "Tokotest" },
    ]);
    expect(result.employees).toHaveLength(0);
    expect(result.missingNik).toHaveLength(1);
    expect(result.conflictingNik).toEqual([
      expect.objectContaining({ nik: "T 020", names: ["tengku", "tokotest"] }),
    ]);
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

  it("keeps execution staging-only, admin-only, and server-side", () => {
    const server = read("server.mjs");
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
  });

  it("uses the synced office branch mapping for asset dispatch", () => {
    const server = read("server.mjs");

    expect(server).toContain("const resolveMarisonBranchId = async");
    expect(server).toContain('.select("marison_branch_id")');
    expect(server).toContain(
      "await resolveMarisonBranchId(surat, requestedProject, input, surat.location_snapshot)"
    );
  });

  it("recovers an orphan Auth user and always supplies a required job title", () => {
    const syncService = read("server/marison-employee-sync.mjs");

    expect(syncService).toContain("!profileIds.has(occupied.id)");
    expect(syncService).toContain("item.profile?.id || item.currentAuth?.id || null");
    expect(syncService).toContain('item.derivedJobTitle || "Karyawan"');
  });
});
