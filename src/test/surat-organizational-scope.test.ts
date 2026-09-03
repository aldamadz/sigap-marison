import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const migration = read(
  "supabase/migrations/20260814103000_surat_organizational_scope_and_auto_approval.sql",
);
const suratService = read("src/services/surat.service.ts");
const monitoringService = read("src/services/surat-monitoring.service.ts");
const monitoringPage = read("src/pages/surat/MonitoringPage.tsx");

describe("SUR-13 organizational status, numbering, and requester approval", () => {
  it("auto-approves through the canonical application approval path", () => {
    expect(suratService).toContain("autoApproveRequesterFirstStep");
    expect(suratService).toContain("canAutoApproveRequesterFirstStep");
    expect(suratService).toContain("await this.approveSurat(");
    expect(migration).not.toContain("update public.surat_signatures");
  });

  it("keeps special first-step work manual and falls back safely on auto-approval errors", () => {
    expect(suratService).toContain("requesterAutoApproved = await this.autoApproveRequesterFirstStep");
    expect(suratService).toContain("Auto-approval pemohon gagal; tahap pertama tetap tersedia secara manual");
    expect(suratService).toContain("if (!requesterAutoApproved)");
    expect(suratService).toContain("await this.notifyInboxStepTasks(");
  });

  it("uses isolated organization-scoped monitoring without broadening document RLS", () => {
    expect(migration).toContain("can_monitor_surat_scope");
    expect(migration).toContain("security definer");
    expect(migration).toContain("actor_office.kedudukan = 'Pusat'");
    expect(migration).toContain("coalesce(surat.represented_department_id, surat.dept_id) = actor_profile.department_id");
    expect(migration).toContain("surat.office_id = actor_profile.office_id");
    expect(migration).not.toContain("create or replace function public.can_read_surat");
    expect(monitoringService).toContain('rpc("get_surat_monitoring_page"');
    expect(monitoringService).toContain('rpc("get_surat_monitoring_detail"');
    expect(monitoringPage).not.toContain("createdBy: user.id");
  });

  it("requires a branch project and partitions counters by year and scope", () => {
    expect(migration).toContain("Penomoran kantor cabang wajib per proyek tanpa scope departemen");
    expect(migration).toContain("project.office_id = new.office_id");
    expect(migration).toContain("Penomoran kantor pusat wajib per departemen tanpa scope proyek");
    expect(migration).toContain("Penomoran kantor cabang wajib per proyek tanpa scope departemen");
    // MRN-22: branch-asset virtual fallback adds an exception clause; the
    // service guard now also accepts the fallback path explicitly.
    expect(suratService).toContain("if (!isPusat && !projectIdClean");
    expect(suratService).toContain("fallbackEligible");
  });

  it("MRN-22: branch-asset virtual fallback is server-validated, not client-asserted", () => {
    const branchAssetMigration = read(
      "supabase/migrations/20260903120000_branch_asset_without_project.sql",
    );
    // The migration must expose authoritative helpers used by both
    // triggers and the new 8-parameter RPC.
    expect(branchAssetMigration).toContain("branch_has_active_projects");
    expect(branchAssetMigration).toContain("assert_branch_asset_fallback_eligible");
    expect(branchAssetMigration).toContain("resolve_form_usage_category");
    expect(branchAssetMigration).toContain("number_scope_type");
    // The reservation trigger must consult the helper (single source of truth).
    expect(
      branchAssetMigration.match(/branch_has_active_projects/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(3);
    // The legacy 6-parameter RPC must NOT be the fallback path.
    expect(branchAssetMigration).toContain("Legacy 6-parameter signature");
    // The 8-parameter RPC must enforce auth.uid() = p_user_id, profile active,
    // and the branch fallback eligibility assertion.
    expect(branchAssetMigration).toContain("p_user_id is distinct from v_actor");
    expect(branchAssetMigration).toContain("Profil aktor tidak aktif atau telah dihapus.");
    expect(branchAssetMigration).toContain("assert_branch_asset_fallback_eligible");
    // SECURITY DEFINER hygiene
    expect(branchAssetMigration.match(/search_path\s*=\s*''/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(branchAssetMigration).toContain("revoke all on function");
    // Reservation rows must carry an immutable scope marker.
    expect(branchAssetMigration).toContain("number_scope_type in ('pusat', 'cabang', 'branch_asset_000')");
    // No synthetic project row is created in master_projects.
    expect(branchAssetMigration).not.toMatch(/insert\s+into\s+public\.master_projects/i);
    // The service must forward the authoritative form usage id (NOT a flag).
    expect(suratService).toContain("p_form_usage_id");
    expect(suratService).toContain("p_legacy_workflow_id");
    expect(suratService).not.toContain("p_is_asset_fallback");
    // The service must query real master data instead of hardcoding "false".
    expect(suratService).toContain("master_projects");
  });
});
