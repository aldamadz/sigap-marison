import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const migration = read(
  "supabase/migrations/20260813150000_surat_organizational_scope_and_auto_approval.sql",
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
    expect(suratService).toContain("if (!isPusat && !projectIdClean)");
  });
});
