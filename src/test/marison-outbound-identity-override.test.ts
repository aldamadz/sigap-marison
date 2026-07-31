import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Marison outbound identity overrides", () => {
  it("uses a new idempotent migration with admin-only, staging-only configuration", () => {
    const migration = read("supabase/migrations/20260730120000_marison_outbound_identity_overrides.sql");
    expect(migration).toContain("add column if not exists override_nik");
    expect(migration).toContain("environment = 'staging'");
    expect(migration).toContain("public.is_current_user_admin()");
    expect(migration).toContain("configure_marison_outbound_identity_overrides");
    expect(migration).toContain("before_overrides");
    expect(migration).toContain("after_overrides");
    expect(migration).toContain("mask_marison_override_nik");
  });

  it("resolves override values before source values and validates synchronized mappings", () => {
    const server = read("backend/src/domain-runtime.ts");
    expect(server).toContain("getMarisonOutboundMappings");
    expect(server).toContain("mappedBranchId");
    expect(server).toContain("mappedProjectId");
    expect(server).toContain("effectiveProjectBranchId !== effectiveBranchId");
    expect(server).toContain("isValidSourceProjectId");
  });

  it("keeps override controls admin-only and excludes credentials from browser service", () => {
    const panel = read("src/components/admin/MarisonIntegrationPanel.tsx");
    const service = read("src/services/marison-integration.service.ts");
    expect(panel).not.toContain("Override identitas outbound staging");
    expect(service).toContain("/api/integrations/marison/outbound-overrides");
    expect(service).not.toContain("CLIENT_SECRET");
  });
});
